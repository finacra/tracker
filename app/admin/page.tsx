'use client'

import { useState, useEffect, useMemo, useRef, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Header from '@/components/layout/Header'
import SubtleCircuitBackground from '@/components/ui/SubtleCircuitBackground'
import { showToast } from '@/components/ui/Toast'
import { useConfirmDialog } from '@/components/ui/ConfirmDialog'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/utils/supabase/client'
import { getRegulatoryRequirements, getCompanyUserRoles, getUserRole, getComplianceTemplates, createComplianceTemplate, updateComplianceTemplate, deleteComplianceTemplate, getTemplateDetails, applyAllTemplates, type ComplianceTemplate } from '@/app/data-room/actions'
import { useUserRole } from '@/hooks/useUserRole'
import { useComplianceCategories } from '@/hooks/useComplianceCategories'
import UsersManagement from '@/components/admin/UsersManagement'
import AllUsersManagement from '@/components/admin/AllUsersManagement'
import TransactionHistory from '@/components/admin/TransactionHistory'
import { explainKPIData, chatWithKPIData, getKPIAggregations, getKPIMetrics, type KPIAggregation, type KPIMetric } from '@/app/admin/tracking/actions'
import { checkSuperadminStatus, getAllCompaniesForAdmin, type AdminCompanyInput as Company } from '@/app/admin/actions'
import { InlineMath, BlockMath } from 'react-katex'
import 'katex/dist/katex.min.css'
import {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  getDocumentTemplates,
  createDocumentTemplate,
  updateDocumentTemplate,
  deleteDocumentTemplate,
  type FolderInfo,
  type DocumentTemplate,
} from '@/app/admin/vault/actions'
import CountrySelector from '@/components/features/CountrySelector'
import {
  parseFolderPath,
  buildBreadcrumb,
  getFolderName,
  getParentPath,
} from '@/lib/vault/folder-utils'
import {
  FIXED_COSTS,
  CAPEX_YEAR_1,
  calculateBreakEven,
  calculateFinancialMetrics,
  calculateProfitability,
  formatCurrency,
  formatPercent,
  type CustomerMix
} from '@/lib/pricing/calculator'

interface Requirement {
  id: string
  company_id: string
  category: string
  requirement: string
  status: string
  due_date: string
  company_name?: string
}

const superadminStatusCache = new Map<string, boolean>()
const superadminStatusPromiseCache = new Map<string, Promise<boolean>>()

async function resolveSuperadminStatus(userId: string): Promise<boolean> {
  if (superadminStatusCache.has(userId)) {
    return superadminStatusCache.get(userId) ?? false
  }

  const inFlight = superadminStatusPromiseCache.get(userId)
  if (inFlight) {
    return inFlight
  }

  const request = (async () => {
    try {
      const result = await checkSuperadminStatus()
      if (!result.success) {
        console.error(`[AdminPage] Error checking superadmin:`, 'error' in result ? result.error : 'unknown')
        return false
      }

      const isPlatformSuperadmin = result.isSuperadmin
      superadminStatusCache.set(userId, isPlatformSuperadmin)
      return isPlatformSuperadmin
    } catch (error) {
      console.error(`[AdminPage] Error checking superadmin:`, error)
      return false
    }
  })().finally(() => {
    superadminStatusPromiseCache.delete(userId)
  })

  superadminStatusPromiseCache.set(userId, request)
  return request
}

const EMPTY_TEMPLATE_FORM = {
  category: '',
  requirement: '',
  description: '',
  compliance_type: 'one-time' as 'one-time' | 'monthly' | 'quarterly' | 'annual',
  entity_types: [] as string[],
  industries: [] as string[],
  industry_categories: [] as string[],
  penalty: '',
  penalty_config_type: 'none' as 'none' | 'flat' | 'daily' | 'interest' | 'percentage',
  penalty_config_rate: '',
  penalty_config_amount: '',
  penalty_config_period: 'month' as 'day' | 'month' | 'year',
  penalty_config_base: 'tax_due' as string,
  penalty_config_cap: '',
  is_critical: false,
  financial_year: '',
  due_date_offset: undefined as number | undefined,
  due_month: undefined as number | undefined,
  due_day: undefined as number | undefined,
  due_date: '',
  year_type: 'FY' as 'FY' | 'CY',
  is_active: true,
  country_code: 'IN' as string,
  applicable_regions: [] as string[],
  required_documents: [] as string[],
  possible_legal_action: '',
  required_documents_input: '',
}

function AdminPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { openConfirm, confirmDialog } = useConfirmDialog()
  const checkedSuperadminUserRef = useRef<string | null>(null)
  const checkingSuperadminUserRef = useRef<string | null>(null)
  const dataFetchedRef = useRef<string | null>(null)
  const dataFetchingRef = useRef<string | null>(null)

  const [isLoading, setIsLoading] = useState(true)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [companies, setCompanies] = useState<Company[]>([])
  const [allRequirements, setAllRequirements] = useState<Requirement[]>([])
  const [selectedCompany, setSelectedCompany] = useState<string>('all')
  type AdminTab = 'overview' | 'companies' | 'compliances' | 'subscriptions' | 'allusers' | 'templates' | 'financials' | 'transactions' | 'vault' | 'kpis' | 'tracking'
  const urlTab = searchParams?.get('tab') as AdminTab | null
  const [activeTab, setActiveTabRaw] = useState<AdminTab>(urlTab ?? 'overview')
  const setActiveTab = useCallback((tab: AdminTab | string) => {
    const validated = tab as AdminTab
    setActiveTabRaw(validated)
    const params = new URLSearchParams(window.location.search)
    params.set('tab', validated)
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [router])
  const [templates, setTemplates] = useState<ComplianceTemplate[]>([])
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([])
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [isApplyingTemplates, setIsApplyingTemplates] = useState(false)
  const [isDeletingTemplates, setIsDeletingTemplates] = useState(false)
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ComplianceTemplate | null>(null)

  // Fetch compliance categories from database
  const { categories: complianceCategories, isLoading: categoriesLoading } = useComplianceCategories('IN')

  const [templateForm, setTemplateForm] = useState({ ...EMPTY_TEMPLATE_FORM })

  // Vault management state
  const [vaultFolders, setVaultFolders] = useState<FolderInfo[]>([])
  const [vaultTemplates, setVaultTemplates] = useState<DocumentTemplate[]>([])
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null)
  const [isLoadingVaultFolders, setIsLoadingVaultFolders] = useState(false)
  const [isLoadingVaultTemplates, setIsLoadingVaultTemplates] = useState(false)
  const [isCreatingVaultFolder, setIsCreatingVaultFolder] = useState(false)
  const [isCreatingVaultTemplate, setIsCreatingVaultTemplate] = useState(false)
  const [showCreateVaultFolderModal, setShowCreateVaultFolderModal] = useState(false)
  const [showCreateVaultTemplateModal, setShowCreateVaultTemplateModal] = useState(false)
  const [editingVaultFolder, setEditingVaultFolder] = useState<FolderInfo | null>(null)
  const [editingVaultTemplate, setEditingVaultTemplate] = useState<DocumentTemplate | null>(null)
  const [expandedVaultFolders, setExpandedVaultFolders] = useState<Set<string>>(new Set())

  // Vault form states
  const [vaultFolderForm, setVaultFolderForm] = useState({ name: '', description: '' })
  const [vaultTemplateForm, setVaultTemplateForm] = useState({
    name: '',
    frequency: 'monthly' as 'one-time' | 'monthly' | 'quarterly' | 'yearly',
    category: '',
    description: '',
    isMandatory: false,
  })

  // Check if user is superadmin
  useEffect(() => {
    async function checkSuperadmin() {
      if (!user) {
        router.push('/')
        return
      }

      if (checkedSuperadminUserRef.current === user.id) {
        return
      }

      if (checkingSuperadminUserRef.current === user.id) {
        return
      }

      setIsLoading(true)
      checkingSuperadminUserRef.current = user.id

      try {
        const isPlatformSuperadmin = await resolveSuperadminStatus(user.id)

        if (isPlatformSuperadmin) {
          console.log('[AdminPage] User is superadmin, setting state and loading data')
          checkedSuperadminUserRef.current = user.id
          setIsSuperadmin(true)
          setIsLoading(false)
          await loadData()
        } else {
          console.log('[AdminPage] User is not superadmin, redirecting to data-room')
          setIsLoading(false)
          router.push('/data-room')
        }
      } finally {
        if (checkingSuperadminUserRef.current === user.id) {
          checkingSuperadminUserRef.current = null
        }
      }
    }

    if (user) {
      checkSuperadmin()
    } else if (!isLoading) {
      setIsLoading(true) // Ensure we show loading if auth is lost
    }
  }, [user, router, isLoading])

  const loadData = async () => {
    if (!user) return
    if (dataFetchedRef.current === user.id) return
    if (dataFetchingRef.current === user.id) return

    dataFetchingRef.current = user.id
    try {
      // Load all companies via server action (works for both Supabase and Passport users)
      const result = await getAllCompaniesForAdmin()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to load companies')
      }
      
      setCompanies(result.companies || [])
      const companiesData = result.companies || []

      // Load all requirements
      const requirementsResult = await getRegulatoryRequirements(null) // null = all companies for superadmin
      if (requirementsResult.success && requirementsResult.requirements) {
        // Enrich with company names
        const enriched = requirementsResult.requirements.map(req => ({
          ...req,
          company_name: companiesData?.find(c => c.id === req.company_id)?.name || 'Unknown'
        }))
        setAllRequirements(enriched)
      }
      dataFetchedRef.current = user.id
    } catch (error) {
      console.error('Error loading data:', error)
    } finally {
      dataFetchingRef.current = null
    }
  }

  const loadTemplates = async () => {
    setIsLoadingTemplates(true)
    try {
      const result = await getComplianceTemplates()
      if (result.success && result.templates) {
        setTemplates(result.templates)
      }
    } catch (error) {
      console.error('Error loading templates:', error)
    } finally {
      setIsLoadingTemplates(false)
    }
  }

  // Vault management functions
  const loadVaultFolders = async () => {
    setIsLoadingVaultFolders(true)
    try {
      console.log('[ADMIN VAULT] Loading vault folders')

      const foldersResult = await getFolders()

      console.log('[ADMIN VAULT] Folders result:', {
        success: foldersResult.success,
        foldersCount: foldersResult.folders?.length || 0,
        error: foldersResult.error,
      })

      if (foldersResult.success && foldersResult.folders) {
        setVaultFolders(foldersResult.folders)
      } else if (foldersResult.error) {
        console.error('[ADMIN VAULT] Failed to load folders:', foldersResult.error)
        showToast(`Failed to load folders: ${foldersResult.error}`, 'error')
      }
    } catch (error) {
      console.error('[ADMIN VAULT] Error loading vault folders:', error)
      showToast(`Error loading vault folders: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error')
    } finally {
      setIsLoadingVaultFolders(false)
    }
  }

  const loadVaultTemplates = async (folderPath: string | null) => {
    setIsLoadingVaultTemplates(true)
    try {
      console.log('[ADMIN VAULT] Loading vault templates for folder:', folderPath)

      const templatesResult = await getDocumentTemplates(folderPath)

      console.log('[ADMIN VAULT] Templates result:', {
        success: templatesResult.success,
        templatesCount: templatesResult.templates?.length || 0,
        error: templatesResult.error,
      })

      if (templatesResult.success && templatesResult.templates) {
        setVaultTemplates(templatesResult.templates)
      } else if (templatesResult.error) {
        console.error('[ADMIN VAULT] Failed to load templates:', templatesResult.error)
        // Don't alert for template errors, just log
      }
    } catch (error) {
      console.error('[ADMIN VAULT] Error loading vault templates:', error)
      // Don't alert for template loading errors, just log
    } finally {
      setIsLoadingVaultTemplates(false)
    }
  }

  // Load all vault data (folders + templates)
  const loadVaultData = async () => {
    await loadVaultFolders()
    await loadVaultTemplates(selectedFolderPath)
  }

  const handleCreateVaultFolder = async () => {
    if (!vaultFolderForm.name.trim()) {
      showToast('Please enter a folder name', 'warning')
      return
    }

    setIsCreatingVaultFolder(true)
    try {
      const result = await createFolder(
        vaultFolderForm.name.trim(),
        selectedFolderPath,
        vaultFolderForm.description.trim() || null
      )

      if (result.success) {
        setShowCreateVaultFolderModal(false)
        setVaultFolderForm({ name: '', description: '' })
        await loadVaultFolders()
      } else {
        showToast(result.error || 'Failed to create folder', 'error')
      }
    } catch (error) {
      console.error('Error creating folder:', error)
      showToast('Failed to create folder', 'error')
    } finally {
      setIsCreatingVaultFolder(false)
    }
  }

  const handleUpdateVaultFolder = async () => {
    if (!editingVaultFolder || !vaultFolderForm.name.trim()) {
      return
    }

    setIsCreatingVaultFolder(true)
    try {
      const parentPath = getParentPath(editingVaultFolder.path)
      const newPath = parentPath
        ? `${parentPath}/${vaultFolderForm.name.trim()}`
        : vaultFolderForm.name.trim()

      const result = await updateFolder(
        editingVaultFolder.path,
        newPath,
        vaultFolderForm.description.trim() || null
      )

      if (result.success) {
        setEditingVaultFolder(null)
        setVaultFolderForm({ name: '', description: '' })
        if (selectedFolderPath === editingVaultFolder.path) {
          setSelectedFolderPath(newPath)
        }
        await loadVaultFolders()
      } else {
        showToast(result.error || 'Failed to update folder', 'error')
      }
    } catch (error) {
      console.error('Error updating folder:', error)
      showToast('Failed to update folder', 'error')
    } finally {
      setIsCreatingVaultFolder(false)
    }
  }

  const handleDeleteVaultFolder = async (folderPath: string) => {
    if (!await openConfirm('This will delete all document templates in this folder and subfolders. This action cannot be undone.', { title: 'Delete folder?' })) {
      return
    }

    try {
      const result = await deleteFolder(folderPath)

      if (result.success) {
        if (selectedFolderPath === folderPath) {
          setSelectedFolderPath(null)
        }
        await loadVaultFolders()
      } else {
        showToast(result.error || 'Failed to delete folder', 'error')
      }
    } catch (error) {
      console.error('Error deleting folder:', error)
      showToast('Failed to delete folder', 'error')
    }
  }

  const handleCreateVaultTemplate = async () => {
    if (!vaultTemplateForm.name.trim()) {
      showToast('Please enter a document name', 'warning')
      return
    }

    setIsCreatingVaultTemplate(true)
    try {
      const result = await createDocumentTemplate(
        vaultTemplateForm.name.trim(),
        selectedFolderPath,
        vaultTemplateForm.frequency,
        vaultTemplateForm.category.trim() || null,
        vaultTemplateForm.description.trim() || null,
        vaultTemplateForm.isMandatory
      )

      if (result.success) {
        setShowCreateVaultTemplateModal(false)
        setVaultTemplateForm({
          name: '',
          frequency: 'monthly',
          category: '',
          description: '',
          isMandatory: false,
        })
        await loadVaultTemplates(selectedFolderPath)
      } else {
        showToast(result.error || 'Failed to create document template', 'error')
      }
    } catch (error) {
      console.error('Error creating document template:', error)
      showToast('Failed to create document template', 'error')
    } finally {
      setIsCreatingVaultTemplate(false)
    }
  }

  const handleUpdateVaultTemplate = async () => {
    if (!editingVaultTemplate || !vaultTemplateForm.name.trim()) {
      return
    }

    setIsCreatingVaultTemplate(true)
    try {
      const result = await updateDocumentTemplate(
        editingVaultTemplate.id!,
        vaultTemplateForm.name.trim(),
        selectedFolderPath,
        vaultTemplateForm.frequency,
        vaultTemplateForm.category.trim() || null,
        vaultTemplateForm.description.trim() || null,
        vaultTemplateForm.isMandatory
      )

      if (result.success) {
        setEditingVaultTemplate(null)
        setVaultTemplateForm({
          name: '',
          frequency: 'monthly',
          category: '',
          description: '',
          isMandatory: false,
        })
        await loadVaultTemplates(selectedFolderPath)
      } else {
        showToast(result.error || 'Failed to update document template', 'error')
      }
    } catch (error) {
      console.error('Error updating document template:', error)
      showToast('Failed to update document template', 'error')
    } finally {
      setIsCreatingVaultTemplate(false)
    }
  }

  const handleDeleteVaultTemplate = async (templateId: string) => {
    if (!await openConfirm('Are you sure you want to delete this document template? This action cannot be undone.', { title: 'Delete document template?' })) {
      return
    }

    try {
      const result = await deleteDocumentTemplate(templateId)

      if (result.success) {
        await loadVaultTemplates(selectedFolderPath)
      } else {
        showToast(result.error || 'Failed to delete document template', 'error')
      }
    } catch (error) {
      console.error('Error deleting document template:', error)
      showToast('Failed to delete document template', 'error')
    }
  }

  const toggleVaultFolderExpansion = (folderPath: string) => {
    const newExpanded = new Set(expandedVaultFolders)
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath)
    } else {
      newExpanded.add(folderPath)
    }
    setExpandedVaultFolders(newExpanded)
  }

  const renderVaultFolderTree = (folderList: FolderInfo[], level: number = 0) => {
    return folderList.map(folder => {
      const isExpanded = expandedVaultFolders.has(folder.path)
      const isSelected = selectedFolderPath === folder.path
      const hasChildren = folder.children && folder.children.length > 0

      return (
        <div key={folder.path}>
          <div
            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-bg-elevated transition-colors ${isSelected ? 'bg-accent-brand/20 border border-accent-brand/50' : ''
              }`}
            style={{ paddingLeft: `${level * 20 + 8}px` }}
            onClick={() => setSelectedFolderPath(folder.path)}
          >
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleVaultFolderExpansion(folder.path)
                }}
                className="w-4 h-4 flex items-center justify-center text-fg-muted hover:text-fg-primary"
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            )}
            {!hasChildren && <div className="w-4" />}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-accent-brand"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span className="flex-1 text-sm text-fg-primary">{folder.name}</span>
            <span className="text-xs text-fg-muted">({folder.documentCount})</span>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingVaultFolder(folder)
                  setVaultFolderForm({ name: folder.name, description: '' })
                }}
                className="p-1 text-fg-muted hover:text-accent-brand transition-colors"
                title="Edit folder"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteVaultFolder(folder.path)
                }}
                className="p-1 text-fg-muted hover:text-red-400 transition-colors"
                title="Delete folder"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>
          {isExpanded && hasChildren && folder.children && (
            <div>{renderVaultFolderTree(folder.children, level + 1)}</div>
          )}
        </div>
      )
    })
  }

  const getVaultFrequencyBadgeColor = (frequency: string) => {
    switch (frequency) {
      case 'one-time':
        return 'bg-bg-hover'
      case 'monthly':
        return 'bg-blue-600'
      case 'quarterly':
        return 'bg-purple-600'
      case 'yearly':
      case 'annually':
        return 'bg-green-600'
      default:
        return 'bg-bg-hover'
    }
  }

  const getVaultFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'one-time':
        return 'One-Time'
      case 'monthly':
        return 'Monthly'
      case 'quarterly':
        return 'Quarterly'
      case 'yearly':
      case 'annually':
        return 'Yearly'
      default:
        return frequency
    }
  }

  // Load templates when templates tab is active
  useEffect(() => {
    if (activeTab === 'templates' && isSuperadmin) {
      loadTemplates()
    }
  }, [activeTab, isSuperadmin])

  // Load folders only when vault tab is first opened
  useEffect(() => {
    if (activeTab === 'vault' && isSuperadmin) {
      loadVaultFolders()
    }
  }, [activeTab, isSuperadmin])

  // Load templates when folder selection changes
  useEffect(() => {
    if (activeTab === 'vault' && isSuperadmin) {
      loadVaultTemplates(selectedFolderPath)
    }
  }, [selectedFolderPath, activeTab, isSuperadmin])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg-base relative overflow-hidden">
        <SubtleCircuitBackground />
        <div className="relative z-10 container mx-auto px-4 py-8 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-accent-brand border-t-transparent rounded-full animate-spin mb-4 mx-auto"></div>
            <p className="text-fg-muted">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!isSuperadmin) {
    return null // Will redirect
  }

  const filteredRequirements = selectedCompany === 'all'
    ? allRequirements
    : allRequirements.filter(r => r.company_id === selectedCompany)

  const stats = {
    totalCompanies: companies.length,
    totalRequirements: allRequirements.length,
    overdueRequirements: allRequirements.filter(r => r.status === 'overdue').length,
    pendingRequirements: allRequirements.filter(r => r.status === 'pending').length,
  }

  return (
    <div className="min-h-screen bg-bg-base relative overflow-hidden">
      {confirmDialog}
      <SubtleCircuitBackground />
      <Header />

      <div className="relative z-10 container mx-auto px-4 py-8 animate-fadeIn">
        <div className="mb-6">
          <h1 className="text-4xl font-light text-fg-primary mb-2">Superadmin Dashboard</h1>
          <p className="text-fg-muted">Manage all companies, compliances, and users across the platform</p>
        </div>

        {/* Tabs — Mobile select */}
        <div className="md:hidden mb-6">
          <select
            value={activeTab}
            onChange={(e) => setActiveTab(e.target.value as typeof activeTab)}
            className="w-full bg-bg-card border border-line/15 text-fg-primary rounded-lg px-4 py-3 font-light text-sm focus:outline-none focus:border-line/40"
          >
            <option value="overview">Overview</option>
            <option value="companies">Companies</option>
            <option value="compliances">All Compliances</option>
            <option value="templates">Compliance Templates</option>
            <option value="subscriptions">Subscriptions</option>
            <option value="allusers">All Users</option>
            <option value="financials">Financials</option>
            <option value="transactions">Transaction History</option>
            <option value="vault">Vault</option>
            <option value="kpis">KPIs</option>
            <option value="tracking">Tracking System</option>
          </select>
        </div>

        {/* Tabs — Desktop scrollable strip */}
        <div className="hidden md:flex items-center gap-2 mb-8 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${activeTab === 'overview'
              ? 'border-accent-brand bg-accent-brand/20 text-white'
              : 'border-line/15 bg-bg-card text-fg-muted hover:text-fg-primary hover:border-line/30'
              }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span>Overview</span>
          </button>
          <button
            onClick={() => setActiveTab('companies')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${activeTab === 'companies'
              ? 'border-accent-brand bg-accent-brand/20 text-white'
              : 'border-line/15 bg-bg-card text-fg-muted hover:text-fg-primary hover:border-line/30'
              }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <span>Companies</span>
          </button>
          <button
            onClick={() => setActiveTab('compliances')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${activeTab === 'compliances'
              ? 'border-accent-brand bg-accent-brand/20 text-white'
              : 'border-line/15 bg-bg-card text-fg-muted hover:text-fg-primary hover:border-line/30'
              }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>All Compliances</span>
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${activeTab === 'templates'
              ? 'border-accent-brand bg-accent-brand/20 text-white'
              : 'border-line/15 bg-bg-card text-fg-muted hover:text-fg-primary hover:border-line/30'
              }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span>Compliance Templates</span>
          </button>
          <button
            onClick={() => setActiveTab('subscriptions')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${activeTab === 'subscriptions'
              ? 'border-accent-brand bg-accent-brand/20 text-white'
              : 'border-line/15 bg-bg-card text-fg-muted hover:text-fg-primary hover:border-line/30'
              }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            <span>Subscriptions</span>
          </button>
          <button
            onClick={() => setActiveTab('allusers')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${activeTab === 'allusers'
              ? 'border-accent-brand bg-accent-brand/20 text-white'
              : 'border-line/15 bg-bg-card text-fg-muted hover:text-fg-primary hover:border-line/30'
              }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>All Users</span>
          </button>
          <button
            onClick={() => setActiveTab('financials')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${activeTab === 'financials'
              ? 'border-accent-brand bg-accent-brand/20 text-white'
              : 'border-line/15 bg-bg-card text-fg-muted hover:text-fg-primary hover:border-line/30'
              }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span>Financials</span>
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${activeTab === 'transactions'
              ? 'border-accent-brand bg-accent-brand/20 text-white'
              : 'border-line/15 bg-bg-card text-fg-muted hover:text-fg-primary hover:border-line/30'
              }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span>Transaction History</span>
          </button>
          <button
            onClick={() => setActiveTab('vault')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${activeTab === 'vault'
              ? 'border-accent-brand bg-accent-brand/20 text-white'
              : 'border-line/15 bg-bg-card text-fg-muted hover:text-fg-primary hover:border-line/30'
              }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="9" y1="21" x2="9" y2="9" />
            </svg>
            <span>Vault</span>
          </button>
          <button
            onClick={() => setActiveTab('kpis')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${activeTab === 'kpis'
              ? 'border-accent-brand bg-accent-brand/20 text-white'
              : 'border-line/15 bg-bg-card text-fg-muted hover:text-fg-primary hover:border-line/30'
              }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="20" x2="12" y2="10" />
              <line x1="18" y1="20" x2="18" y2="4" />
              <line x1="6" y1="20" x2="6" y2="16" />
            </svg>
            <span>KPIs</span>
          </button>
          <button
            onClick={() => setActiveTab('tracking')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${activeTab === 'tracking'
              ? 'border-accent-brand bg-accent-brand/20 text-white'
              : 'border-line/15 bg-bg-card text-fg-muted hover:text-fg-primary hover:border-line/30'
              }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            <span>Tracking System</span>
          </button>
        </div>

        {/* Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-fg-muted text-sm font-medium">Total Companies</h3>
                <div className="w-10 h-10 bg-accent-brand/20 rounded-lg flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent-brand">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-light text-fg-primary">{stats.totalCompanies}</p>
            </div>

            <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-fg-muted text-sm font-medium">Total Compliances</h3>
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-light text-fg-primary">{stats.totalRequirements}</p>
            </div>

            <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-fg-muted text-sm font-medium">Overdue</h3>
                <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-light text-red-400">{stats.overdueRequirements}</p>
            </div>

            <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-fg-muted text-sm font-medium">Pending</h3>
                <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-500">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-light text-yellow-400">{stats.pendingRequirements}</p>
            </div>
          </div>
        )}

        {activeTab === 'companies' && (
          <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-line/10">
              <h2 className="text-2xl font-light text-fg-primary">All Companies</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-bg-card border-b border-line/10">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Company Name</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Type</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Country</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Owner Email</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company.id} className="hover:bg-bg-card/50 transition-colors border-t border-line/10">
                      <td className="px-6 py-4 text-fg-primary font-medium">{company.name}</td>
                      <td className="px-6 py-4 text-fg-secondary">{company.type}</td>
                      <td className="px-6 py-4 text-fg-secondary">
                        {company.country_code || 'IN'}
                      </td>
                      <td className="px-6 py-4 text-fg-secondary truncate max-w-[200px]" title={company.owner_email}>
                        {company.owner_email || 'Unknown'}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => router.push(`/data-room?company=${company.id}`)}
                          className="px-4 py-2 bg-accent-brand/20 border border-accent-brand text-accent-brand rounded-lg hover:bg-accent-brand/30 transition-colors text-sm"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'compliances' && (
          <div className="space-y-6">
            {/* Company Filter */}
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-fg-secondary">Filter by Company:</label>
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="px-4 py-2 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
              >
                <option value="all">All Companies</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>

            {/* Requirements Table */}
            <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-line/10">
                <h2 className="text-2xl font-light text-fg-primary">All Compliance Requirements</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-bg-card border-b border-line/10">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Company</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Category</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Requirement</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequirements.map((req) => (
                      <tr key={req.id} className="hover:bg-bg-card/50 transition-colors border-t border-line/10">
                        <td className="px-6 py-4 text-fg-primary font-medium">{req.company_name}</td>
                        <td className="px-6 py-4 text-fg-secondary">{req.category}</td>
                        <td className="px-6 py-4 text-fg-primary">{req.requirement}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${req.status === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                            req.status === 'overdue' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                              req.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                'bg-bg-elevated text-fg-muted border border-line/15'
                            }`}>
                            {req.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-fg-secondary">
                          {new Date(req.due_date).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'templates' && (
          <div className="space-y-6">
            {/* Header with Add Button */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="text-2xl font-light text-fg-primary mb-2">
                    Compliance Templates
                    {templates.length > 0 && (
                      <span className="ml-3 text-sm font-normal text-fg-muted">
                        ({templates.length} template{templates.length !== 1 ? 's' : ''})
                      </span>
                    )}
                  </h2>
                  <p className="text-fg-muted">Create templates that automatically apply to matching companies</p>
                </div>
                <button
                  onClick={loadTemplates}
                  disabled={isLoadingTemplates}
                  className="px-3 py-1.5 text-sm bg-bg-elevated hover:bg-bg-hover text-fg-secondary rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                  title="Refresh templates list"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={isLoadingTemplates ? 'animate-spin' : ''}
                  >
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                    <path d="M3 21v-5h5" />
                  </svg>
                  Refresh
                </button>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    setIsApplyingTemplates(true)
                    try {
                      const result = await applyAllTemplates()
                      if (result.success) {
                        showToast(`Successfully applied ${result.template_count} templates! Created/updated ${result.applied_count} requirements.`, 'success')
                      } else {
                        showToast(`Error: ${result.error || 'Failed to apply templates'}`, 'error')
                      }
                    } catch (err) {
                      console.error('Error applying templates:', err)
                      showToast('Error applying templates', 'error')
                    } finally {
                      setIsApplyingTemplates(false)
                    }
                  }}
                  disabled={isApplyingTemplates}
                  className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isApplyingTemplates ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Applying...
                    </>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      Apply All Templates
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setTemplateForm({ ...EMPTY_TEMPLATE_FORM })
                    setEditingTemplate(null)
                    setIsTemplateModalOpen(true)
                  }}
                  className="bg-accent-brand text-white px-6 py-3 rounded-lg hover:bg-accent-brand/90 transition-colors flex items-center gap-2 font-medium"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add Template
                </button>
                <button
                  onClick={() => window.open('/admin/bulk-upload', '_blank')}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  Bulk Upload
                </button>
                {selectedTemplates.length > 0 && (
                  <button
                    onClick={async () => {
                      if (!await openConfirm(`Delete ${selectedTemplates.length} template(s) and all associated compliance requirements? This action cannot be undone.`, { title: 'Delete selected templates?' })) {
                        return
                      }
                      setIsDeletingTemplates(true)
                      let deletedCount = 0
                      let errorCount = 0
                      for (const templateId of selectedTemplates) {
                        const result = await deleteComplianceTemplate(templateId, true) // true = also delete requirements
                        if (result.success) {
                          deletedCount++
                        } else {
                          errorCount++
                          console.error('Failed to delete template:', templateId, result.error)
                        }
                      }
                      // Refresh templates
                      const fetchedTemplates = await getComplianceTemplates()
                      if (fetchedTemplates.success && fetchedTemplates.templates) {
                        setTemplates(fetchedTemplates.templates)
                      }
                      setSelectedTemplates([])
                      setIsDeletingTemplates(false)
                      showToast(`Deleted ${deletedCount} template(s)${errorCount > 0 ? `. ${errorCount} failed.` : ''}`, errorCount > 0 ? 'warning' : 'success')
                    }}
                    disabled={isDeletingTemplates}
                    className="bg-red-600 text-white px-6 py-3 rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 font-medium disabled:opacity-50"
                  >
                    {isDeletingTemplates ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Deleting...
                      </>
                    ) : (
                      <>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                        Delete {selectedTemplates.length} Selected
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Templates List */}
            {isLoadingTemplates ? (
              <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl p-12 flex flex-col items-center justify-center">
                <div className="w-10 h-10 border-4 border-accent-brand border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-fg-muted">Loading templates...</p>
              </div>
            ) : (
              <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-line/10">
                  <h3 className="text-xl font-light text-fg-primary">All Templates</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-bg-card border-b border-line/10">
                      <tr>
                        <th className="px-4 py-4 text-left">
                          <input
                            type="checkbox"
                            checked={selectedTemplates.length === templates.length && templates.length > 0}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedTemplates(templates.map(t => t.id))
                              } else {
                                setSelectedTemplates([])
                              }
                            }}
                            className="w-4 h-4 text-accent-brand bg-bg-card border-line/15 rounded focus:ring-accent-brand"
                          />
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Requirement</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Compliance Type</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Required Docs</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Entity Types</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Industries</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Matching</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Status</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templates.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-6 py-12 text-center text-fg-muted">
                            No templates found. Create your first template to get started.
                          </td>
                        </tr>
                      ) : (
                        templates.map((template) => (
                          <tr key={template.id} className={`hover:bg-bg-card/50 transition-colors border-t border-line/10 ${selectedTemplates.includes(template.id) ? 'bg-accent-brand/10' : ''}`}>
                            <td className="px-4 py-4">
                              <input
                                type="checkbox"
                                checked={selectedTemplates.includes(template.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedTemplates(prev => [...prev, template.id])
                                  } else {
                                    setSelectedTemplates(prev => prev.filter(id => id !== template.id))
                                  }
                                }}
                                className="w-4 h-4 text-accent-brand bg-bg-card border-line/15 rounded focus:ring-accent-brand"
                              />
                            </td>
                            <td className="px-6 py-4 text-fg-primary font-medium">{template.requirement}</td>
                            <td className="px-6 py-4">
                              <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                {template.compliance_type.toUpperCase()}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              {template.required_documents && template.required_documents.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {template.required_documents.slice(0, 2).map((doc, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/30"
                                      title={doc}
                                    >
                                      {doc.length > 15 ? doc.substring(0, 15) + '...' : doc}
                                    </span>
                                  ))}
                                  {template.required_documents.length > 2 && (
                                    <span className="text-fg-muted text-xs">+{template.required_documents.length - 2}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-fg-muted text-sm">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-fg-secondary text-sm">
                              {template.entity_types && template.entity_types.length > 0 ? (
                                <>
                                  {template.entity_types.slice(0, 2).join(', ')}
                                  {template.entity_types.length > 2 && ` +${template.entity_types.length - 2}`}
                                </>
                              ) : (
                                <span className="text-fg-muted">All entities</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-fg-secondary text-sm">
                              {template.industries && template.industries.length > 0 ? (
                                <>
                                  {template.industries.slice(0, 2).join(', ')}
                                  {template.industries.length > 2 && ` +${template.industries.length - 2}`}
                                </>
                              ) : (
                                <span className="text-fg-muted">All industries</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-fg-secondary text-center">{template.matching_companies_count || 0}</td>
                            <td className="px-6 py-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${template.is_active
                                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                : 'bg-bg-elevated text-fg-muted border border-line/15'
                                }`}>
                                {template.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setEditingTemplate(template)
                                    const existingPenaltyConfig = template.penalty_config as any
                                    setTemplateForm({
                                      category: template.category,
                                      requirement: template.requirement,
                                      description: template.description || '',
                                      compliance_type: template.compliance_type,
                                      entity_types: template.entity_types,
                                      industries: template.industries,
                                      industry_categories: template.industry_categories,
                                      penalty: template.penalty || '',
                                      penalty_config_type: existingPenaltyConfig?.type || 'none',
                                      penalty_config_rate: existingPenaltyConfig?.rate?.toString() || '',
                                      penalty_config_amount: existingPenaltyConfig?.amount?.toString() || '',
                                      penalty_config_period: existingPenaltyConfig?.period || 'month',
                                      penalty_config_base: existingPenaltyConfig?.base || 'tax_due',
                                      penalty_config_cap: existingPenaltyConfig?.cap?.toString() || '',
                                      is_critical: template.is_critical,
                                      financial_year: template.financial_year || '',
                                      due_date_offset: template.due_date_offset || undefined,
                                      due_month: template.due_month || undefined,
                                      due_day: template.due_day || undefined,
                                      due_date: template.due_date || '',
                                      year_type: (template as any).year_type || 'FY',
                                      is_active: template.is_active,
                                      country_code: (template as any).country_code || 'IN',
                                      applicable_regions: (template as any).applicable_regions || [],
                                      required_documents: (template as any).required_documents || [],
                                      possible_legal_action: (template as any).possible_legal_action || '',
                                      required_documents_input: ''
                                    })
                                    setIsTemplateModalOpen(true)
                                  }}
                                  className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 rounded-lg transition-colors"
                                  title="Edit"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                  </svg>
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!await openConfirm('Re-apply this template to matching companies? This will create/update compliance requirements.', { title: 'Re-apply template?', confirmLabel: 'Re-apply', variant: 'default' })) return
                                    const result = await updateComplianceTemplate(template.id, {})
                                    if (result.success) {
                                      await loadTemplates()
                                      showToast(`Template re-applied successfully. Created/updated ${result.applied_count || 0} compliance requirements.`, 'success')
                                    } else {
                                      showToast(`Failed to re-apply: ${result.error}`, 'error')
                                    }
                                  }}
                                  className="p-2 text-green-400 hover:text-green-300 hover:bg-green-500/20 rounded-lg transition-colors"
                                  title="Re-apply Template"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                                    <path d="M21 3v5h-5" />
                                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                                    <path d="M3 21v-5h5" />
                                  </svg>
                                </button>
                                <button
                                  onClick={async () => {
                                    if (!await openConfirm('This will also delete all associated compliance requirements. This action cannot be undone.', { title: 'Delete template?' })) return
                                    const result = await deleteComplianceTemplate(template.id, true)
                                    if (result.success) {
                                      await loadTemplates()
                                      showToast('Template deleted successfully', 'success')
                                    } else {
                                      showToast(`Failed to delete: ${result.error}`, 'error')
                                    }
                                  }}
                                  className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                                  title="Delete"
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <polyline points="3 6 5 6 21 6" />
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                  </svg>
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'subscriptions' && (
          <UsersManagement companies={companies} />
        )}

        {activeTab === 'allusers' && (
          <AllUsersManagement companies={companies} />
        )}

        {activeTab === 'transactions' && (
          <TransactionHistory />
        )}

        {activeTab === 'financials' && (
          <div className="space-y-6">
            {/* Cost Breakdown */}
            <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl p-6">
              <h2 className="text-2xl font-light text-fg-primary mb-6">Cost Structure</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-fg-secondary mb-4">Operational Costs</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-fg-muted">
                      <span>APIs</span>
                      <span>{formatCurrency(FIXED_COSTS.apis)}</span>
                    </div>
                    <div className="flex justify-between text-fg-muted">
                      <span>Salaries (Current Team)</span>
                      <span>{formatCurrency(FIXED_COSTS.salaries)}</span>
                    </div>
                    <div className="flex justify-between text-fg-muted">
                      <span>New Hires (5 × ₹20k/month)</span>
                      <span>{formatCurrency(FIXED_COSTS.newHires)}</span>
                    </div>
                    <div className="flex justify-between text-fg-muted">
                      <span>Subscriptions</span>
                      <span>{formatCurrency(FIXED_COSTS.subscriptions)}</span>
                    </div>
                    <div className="flex justify-between text-fg-muted">
                      <span>Workplace</span>
                      <span>{formatCurrency(FIXED_COSTS.workplace)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-fg-secondary mb-4">Marketing & Sales</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-fg-muted">
                      <span>Marketing</span>
                      <span>{formatCurrency(FIXED_COSTS.marketing)}</span>
                    </div>
                    <div className="flex justify-between text-fg-muted">
                      <span>Branding</span>
                      <span>{formatCurrency(FIXED_COSTS.branding)}</span>
                    </div>
                    <div className="flex justify-between text-fg-muted">
                      <span>Outreach Programs</span>
                      <span>{formatCurrency(FIXED_COSTS.outreachPrograms)}</span>
                    </div>
                    <div className="flex justify-between text-fg-muted">
                      <span>Printing Costs</span>
                      <span>{formatCurrency(FIXED_COSTS.printingCosts)}</span>
                    </div>
                    <div className="flex justify-between text-fg-muted">
                      <span>Travelling Costs</span>
                      <span>{formatCurrency(FIXED_COSTS.travellingCosts)}</span>
                    </div>
                    <div className="flex justify-between text-fg-muted">
                      <span>Gifts</span>
                      <span>{formatCurrency(FIXED_COSTS.gifts)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-fg-secondary mb-4">Operations & Admin</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-fg-muted">
                      <span>Staff Welfare</span>
                      <span>{formatCurrency(FIXED_COSTS.staffWelfare)}</span>
                    </div>
                    <div className="flex justify-between text-fg-muted">
                      <span>Office Expenses</span>
                      <span>{formatCurrency(FIXED_COSTS.officeExpenses)}</span>
                    </div>
                    <div className="flex justify-between text-fg-muted">
                      <span>Misc Expenses</span>
                      <span>{formatCurrency(FIXED_COSTS.miscExpenses)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-fg-secondary mb-4">Summary</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center pt-2 border-t border-line/15">
                      <span className="text-fg-primary font-medium">Total Annual Fixed Costs</span>
                      <span className="text-xl font-bold text-accent-brand">{formatCurrency(FIXED_COSTS.total)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-fg-muted">CapEx (Year 1 Only)</span>
                      <span className="text-fg-primary font-medium">{formatCurrency(CAPEX_YEAR_1)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-line/15">
                      <span className="text-fg-primary font-medium">Year 1 Total Costs</span>
                      <span className="text-xl font-bold text-red-400">{formatCurrency(FIXED_COSTS.total + CAPEX_YEAR_1)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Break-Even Analysis */}
            <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl p-6">
              <h2 className="text-2xl font-light text-fg-primary mb-6">Break-Even Analysis (3-4 Year Timeline)</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-fg-secondary mb-4">Year 1 (with CapEx)</h3>
                  {(() => {
                    const year1Analysis = calculateBreakEven(60000, FIXED_COSTS.total, CAPEX_YEAR_1)
                    return (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between text-fg-muted">
                          <span>Fixed Costs</span>
                          <span>{formatCurrency(year1Analysis.fixedCosts)}</span>
                        </div>
                        <div className="flex justify-between text-fg-muted">
                          <span>CapEx</span>
                          <span>{formatCurrency(CAPEX_YEAR_1)}</span>
                        </div>
                        <div className="flex justify-between text-fg-muted">
                          <span>Required Revenue</span>
                          <span className="text-fg-primary font-medium">{formatCurrency(year1Analysis.requiredRevenue)}</span>
                        </div>
                        <div className="flex justify-between text-fg-muted">
                          <span>Break-Even Customers</span>
                          <span className="text-accent-brand font-medium">{year1Analysis.breakEvenCustomers}</span>
                        </div>
                        <div className="flex justify-between text-fg-muted">
                          <span>Contribution Margin</span>
                          <span>{formatPercent(year1Analysis.contributionMargin)}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
                <div>
                  <h3 className="text-lg font-medium text-fg-secondary mb-4">Year 2+ (without CapEx)</h3>
                  {(() => {
                    const year2Analysis = calculateBreakEven(60000, FIXED_COSTS.total, 0)
                    return (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between text-fg-muted">
                          <span>Fixed Costs</span>
                          <span>{formatCurrency(year2Analysis.fixedCosts)}</span>
                        </div>
                        <div className="flex justify-between text-fg-muted">
                          <span>Required Revenue</span>
                          <span className="text-fg-primary font-medium">{formatCurrency(year2Analysis.requiredRevenue)}</span>
                        </div>
                        <div className="flex justify-between text-fg-muted">
                          <span>Break-Even Customers</span>
                          <span className="text-accent-brand font-medium">{year2Analysis.breakEvenCustomers}</span>
                        </div>
                        <div className="flex justify-between text-fg-muted">
                          <span>Contribution Margin</span>
                          <span>{formatPercent(year2Analysis.contributionMargin)}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
              <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <p className="text-sm text-blue-300">
                  <strong>4-Year Breakeven Target:</strong> ₹5,58,75,000 total revenue required
                  <br />
                  <strong>Average Annual Revenue Target:</strong> ₹1,39,68,750
                  <br />
                  <strong>Monthly Revenue Target:</strong> ₹11,64,063
                </p>
              </div>
            </div>

            {/* Financial Metrics */}
            <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl p-6">
              <h2 className="text-2xl font-light text-fg-primary mb-6">Financial Metrics</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {(() => {
                  // Example customer mix for demonstration
                  const exampleMix: CustomerMix[] = [
                    { tier: 'starter', billingCycle: 'annual', count: 20 },
                    { tier: 'professional', billingCycle: 'annual', count: 15 },
                    { tier: 'enterprise', billingCycle: 'annual', count: 8 }
                  ]
                  const metrics = calculateFinancialMetrics(exampleMix, 20000, 0.05, 36)
                  return (
                    <>
                      <div className="bg-bg-card/50 rounded-lg p-4 border border-line/15">
                        <div className="text-xs text-fg-muted mb-1">MRR</div>
                        <div className="text-2xl font-bold text-fg-primary">{formatCurrency(metrics.mrr)}</div>
                      </div>
                      <div className="bg-bg-card/50 rounded-lg p-4 border border-line/15">
                        <div className="text-xs text-fg-muted mb-1">ARR</div>
                        <div className="text-2xl font-bold text-fg-primary">{formatCurrency(metrics.arr)}</div>
                      </div>
                      <div className="bg-bg-card/50 rounded-lg p-4 border border-line/15">
                        <div className="text-xs text-fg-muted mb-1">CAC</div>
                        <div className="text-2xl font-bold text-accent-brand">{formatCurrency(metrics.cac)}</div>
                      </div>
                      <div className="bg-bg-card/50 rounded-lg p-4 border border-line/15">
                        <div className="text-xs text-fg-muted mb-1">LTV</div>
                        <div className="text-2xl font-bold text-green-400">{formatCurrency(metrics.ltv)}</div>
                      </div>
                      <div className="bg-bg-card/50 rounded-lg p-4 border border-line/15">
                        <div className="text-xs text-fg-muted mb-1">LTV:CAC Ratio</div>
                        <div className="text-2xl font-bold text-fg-primary">{metrics.ltvCacRatio}x</div>
                      </div>
                      <div className="bg-bg-card/50 rounded-lg p-4 border border-line/15">
                        <div className="text-xs text-fg-muted mb-1">CAC Payback</div>
                        <div className="text-2xl font-bold text-fg-primary">{metrics.cacPaybackMonths} months</div>
                      </div>
                      <div className="bg-bg-card/50 rounded-lg p-4 border border-line/15">
                        <div className="text-xs text-fg-muted mb-1">Churn Rate</div>
                        <div className="text-2xl font-bold text-yellow-400">{formatPercent(metrics.churnRate)}</div>
                      </div>
                      <div className="bg-bg-card/50 rounded-lg p-4 border border-line/15">
                        <div className="text-xs text-fg-muted mb-1">Contribution Margin</div>
                        <div className="text-2xl font-bold text-green-400">{formatPercent(metrics.contributionMargin)}</div>
                      </div>
                    </>
                  )
                })()}
              </div>
              <p className="text-xs text-fg-muted mt-4">
                * Metrics calculated with example customer mix: 20 Starter, 15 Professional, 8 Enterprise (annual plans)
              </p>
            </div>

            {/* Profitability Projection */}
            <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl p-6">
              <h2 className="text-2xl font-light text-fg-primary mb-6">Profitability Projection</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-bg-card border-b border-line/10">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Year</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Revenue</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Variable Costs</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Gross Profit</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Fixed Costs</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">CapEx</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Net Profit/Loss</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { year: 1, customers: 50, revenue: 3000000 },
                      { year: 2, customers: 100, revenue: 6000000 },
                      { year: 3, customers: 150, revenue: 9000000 },
                      { year: 4, customers: 200, revenue: 12000000 }
                    ].map((scenario) => {
                      const mix: CustomerMix[] = [
                        { tier: 'starter', billingCycle: 'annual', count: Math.floor(scenario.customers * 0.4) },
                        { tier: 'professional', billingCycle: 'annual', count: Math.floor(scenario.customers * 0.4) },
                        { tier: 'enterprise', billingCycle: 'annual', count: Math.floor(scenario.customers * 0.2) }
                      ]
                      const profitability = calculateProfitability(mix, FIXED_COSTS.total, scenario.year === 1 ? CAPEX_YEAR_1 : 0)
                      return (
                        <tr key={scenario.year} className="hover:bg-bg-card/50 transition-colors border-t border-line/10">
                          <td className="px-6 py-4 text-fg-primary font-medium">Year {scenario.year}</td>
                          <td className="px-6 py-4 text-fg-secondary">{formatCurrency(profitability.revenue)}</td>
                          <td className="px-6 py-4 text-fg-secondary">{formatCurrency(profitability.variableCosts)}</td>
                          <td className="px-6 py-4 text-green-400">{formatCurrency(profitability.grossProfit)}</td>
                          <td className="px-6 py-4 text-fg-secondary">{formatCurrency(profitability.fixedCosts)}</td>
                          <td className="px-6 py-4 text-fg-secondary">{scenario.year === 1 ? formatCurrency(CAPEX_YEAR_1) : '-'}</td>
                          <td className={`px-6 py-4 font-medium ${profitability.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatCurrency(profitability.netProfit)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-fg-muted mt-4">
                * Projections based on moderate growth scenario with current pricing
              </p>
            </div>
          </div>
        )}

        {/* Template Form Modal */}
        {isTemplateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-line/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-light text-fg-primary">
                    {editingTemplate ? 'Edit Compliance Template' : 'Create Compliance Template'}
                  </h3>
                  <button
                    onClick={() => {
                      setIsTemplateModalOpen(false)
                      setEditingTemplate(null)
                      setTemplateForm({ ...EMPTY_TEMPLATE_FORM })
                    }}
                    className="text-fg-muted hover:text-fg-primary transition-colors"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4">
                {/* Category */}
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-2">
                    Category *
                  </label>
                  <select
                    value={templateForm.category}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                    disabled={categoriesLoading}
                  >
                    <option value="">Select Category</option>
                    {complianceCategories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>

                {/* Requirement Name */}
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-2">
                    Requirement *
                  </label>
                  <input
                    type="text"
                    value={templateForm.requirement}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, requirement: e.target.value }))}
                    className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                    placeholder="e.g., TDS Payment - Monthly"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-2">
                    Description
                  </label>
                  <textarea
                    value={templateForm.description}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                    rows={3}
                    placeholder="Brief description of the requirement"
                  />
                </div>

                {/* Compliance Type */}
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-2">
                    Compliance Type *
                  </label>
                  <select
                    value={templateForm.compliance_type}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, compliance_type: e.target.value as any }))}
                    className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                  >
                    <option value="one-time">One-time</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>

                {/* Country Code */}
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-2">
                    Country *
                  </label>
                  <CountrySelector
                    value={templateForm.country_code}
                    onChange={(countryCode) => setTemplateForm(prev => ({ ...prev, country_code: countryCode }))}
                    className="w-full"
                  />
                  <p className="mt-1 text-xs text-fg-muted">
                    Select the country where this compliance template applies. Defaults to India (IN).
                  </p>
                </div>

                {/* Year Type - Show for quarterly, annual, and monthly compliance */}
                {(templateForm.compliance_type === 'quarterly' || templateForm.compliance_type === 'annual' || templateForm.compliance_type === 'monthly') && (
                  <div>
                    <label className="block text-sm font-medium text-fg-secondary mb-2">
                      Year Type *
                    </label>
                    <select
                      value={templateForm.year_type}
                      onChange={(e) => setTemplateForm(prev => ({ ...prev, year_type: e.target.value as 'FY' | 'CY' }))}
                      className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                    >
                      <option value="FY">Financial Year (India) - FY starts from April</option>
                      <option value="CY">Calendar Year (Gulf/USA) - CY starts from January</option>
                    </select>
                    <p className="mt-1 text-xs text-fg-muted">
                      {templateForm.compliance_type === 'quarterly' && 'For quarterly: FY Q1: Apr-Jun, Q2: Jul-Sep, Q3: Oct-Dec, Q4: Jan-Mar | CY Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec'}
                      {templateForm.compliance_type === 'annual' && 'Select the year type for annual compliance calculations. Indian companies use Financial Year (FY).'}
                      {templateForm.compliance_type === 'monthly' && 'Select the year type for monthly compliance calculations. Indian companies use Financial Year (FY).'}
                    </p>
                  </div>
                )}

                {/* Entity Types - Multi-select */}
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-2">
                    Entity Types * (Select at least one)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Private Limited', 'Public Limited', 'LLP', 'NGO / Section 8', 'Other'].map((type) => (
                      <label key={type} className="flex items-center gap-2 p-3 bg-bg-card border border-line/15 rounded-lg hover:border-accent-brand/50 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={templateForm.entity_types.includes(type)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTemplateForm(prev => ({ ...prev, entity_types: [...prev.entity_types, type] }))
                            } else {
                              setTemplateForm(prev => ({ ...prev, entity_types: prev.entity_types.filter(t => t !== type) }))
                            }
                          }}
                          className="w-4 h-4 text-accent-brand bg-bg-card border-line/15 rounded focus:ring-accent-brand"
                        />
                        <span className="text-fg-primary text-sm">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Industries - Multi-select */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-fg-secondary">
                      Industries * (Select at least one)
                    </label>
                    <label className="flex items-center gap-2 px-3 py-1.5 bg-bg-card border border-line/15 rounded-lg hover:border-accent-brand/50 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={['IT & Technology Services', 'Healthcare', 'Education', 'Finance', 'Food Manufacturing', 'Food & Hospitality', 'Construction', 'Real Estate', 'Manufacturing', 'Retail & Trading', 'Professional Services', 'Ecommerce', 'Other'].every(industry => templateForm.industries.includes(industry))}
                        onChange={(e) => {
                          const allIndustries = ['IT & Technology Services', 'Healthcare', 'Education', 'Finance', 'Food Manufacturing', 'Food & Hospitality', 'Construction', 'Real Estate', 'Manufacturing', 'Retail & Trading', 'Professional Services', 'Ecommerce', 'Other']
                          if (e.target.checked) {
                            setTemplateForm(prev => ({ ...prev, industries: allIndustries }))
                          } else {
                            setTemplateForm(prev => ({ ...prev, industries: [] }))
                          }
                        }}
                        className="w-4 h-4 text-accent-brand bg-bg-card border-line/15 rounded focus:ring-accent-brand"
                      />
                      <span className="text-fg-primary text-sm font-medium">Select All</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {['IT & Technology Services', 'Healthcare', 'Education', 'Finance', 'Food Manufacturing', 'Food & Hospitality', 'Construction', 'Real Estate', 'Manufacturing', 'Retail & Trading', 'Professional Services', 'Ecommerce', 'Other'].map((industry) => (
                      <label key={industry} className="flex items-center gap-2 p-3 bg-bg-card border border-line/15 rounded-lg hover:border-accent-brand/50 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={templateForm.industries.includes(industry)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTemplateForm(prev => ({ ...prev, industries: [...prev.industries, industry] }))
                            } else {
                              setTemplateForm(prev => ({ ...prev, industries: prev.industries.filter(i => i !== industry) }))
                            }
                          }}
                          className="w-4 h-4 text-accent-brand bg-bg-card border-line/15 rounded focus:ring-accent-brand"
                        />
                        <span className="text-fg-primary text-sm">{industry}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Industry Categories - Multi-select */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-fg-secondary">
                      Industry Categories * (Select at least one)
                    </label>
                    <label className="flex items-center gap-2 px-3 py-1.5 bg-bg-card border border-line/15 rounded-lg hover:border-accent-brand/50 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={['Startups & MSMEs', 'Large Enterprises', 'NGOs & Section 8 Companies', 'Healthcare & Education', 'Real Estate & Construction', 'IT & Technology Services', 'Retail & Manufacturing', 'Food & Hospitality', 'Ecommerce & D2C', 'Other'].every(category => templateForm.industry_categories.includes(category))}
                        onChange={(e) => {
                          const allCategories = ['Startups & MSMEs', 'Large Enterprises', 'NGOs & Section 8 Companies', 'Healthcare & Education', 'Real Estate & Construction', 'IT & Technology Services', 'Retail & Manufacturing', 'Food & Hospitality', 'Ecommerce & D2C', 'Other']
                          if (e.target.checked) {
                            setTemplateForm(prev => ({ ...prev, industry_categories: allCategories }))
                          } else {
                            setTemplateForm(prev => ({ ...prev, industry_categories: [] }))
                          }
                        }}
                        className="w-4 h-4 text-accent-brand bg-bg-card border-line/15 rounded focus:ring-accent-brand"
                      />
                      <span className="text-fg-primary text-sm font-medium">Select All</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {['Startups & MSMEs', 'Large Enterprises', 'NGOs & Section 8 Companies', 'Healthcare & Education', 'Real Estate & Construction', 'IT & Technology Services', 'Retail & Manufacturing', 'Food & Hospitality', 'Ecommerce & D2C', 'Other'].map((category) => (
                      <label key={category} className="flex items-center gap-2 p-3 bg-bg-card border border-line/15 rounded-lg hover:border-accent-brand/50 transition-colors cursor-pointer">
                        <input
                          type="checkbox"
                          checked={templateForm.industry_categories.includes(category)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setTemplateForm(prev => ({ ...prev, industry_categories: [...prev.industry_categories, category] }))
                            } else {
                              setTemplateForm(prev => ({ ...prev, industry_categories: prev.industry_categories.filter(c => c !== category) }))
                            }
                          }}
                          className="w-4 h-4 text-accent-brand bg-bg-card border-line/15 rounded focus:ring-accent-brand"
                        />
                        <span className="text-fg-primary text-sm">{category}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Due Date Fields - Conditional based on compliance type */}
                {templateForm.compliance_type === 'one-time' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-fg-secondary mb-2">
                        Due Date *
                      </label>
                      <input
                        type="date"
                        value={templateForm.due_date}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, due_date: e.target.value }))}
                        className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-fg-secondary mb-2">
                        Financial Year (Optional)
                      </label>
                      <input
                        type="text"
                        value={templateForm.financial_year}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, financial_year: e.target.value }))}
                        className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                        placeholder="e.g., FY 2025-26"
                      />
                    </div>
                  </>
                )}

                {templateForm.compliance_type === 'monthly' && (
                  <div>
                    <label className="block text-sm font-medium text-fg-secondary mb-2">
                      Due Date Offset * (Day of month, e.g., 15 for 15th of each month)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={templateForm.due_date_offset || ''}
                      onChange={(e) => setTemplateForm(prev => ({ ...prev, due_date_offset: e.target.value ? parseInt(e.target.value) : undefined }))}
                      className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                      placeholder="15"
                    />
                  </div>
                )}

                {templateForm.compliance_type === 'quarterly' && (
                  <div className="space-y-4">
                    <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                      <p className="text-sm text-blue-300 mb-2">
                        <strong>How Quarterly Compliance Works:</strong>
                      </p>
                      <p className="text-xs text-blue-200/80 mb-2">
                        Quarterly compliance is due <strong>ONCE per quarter</strong> (every 3 months), not every month.
                      </p>
                      <p className="text-xs text-blue-200/80 mb-2">
                        Specify which month within the quarter (1st, 2nd, or 3rd month) and the day of that month.
                      </p>
                      <div className="text-xs text-blue-200/80 space-y-1 mt-3">
                        <p><strong>Quarter Structure:</strong></p>
                        <ul className="list-disc list-inside ml-2 space-y-1">
                          <li><strong>Q1 (Jan-Mar):</strong> 1st month = Jan, 2nd month = Feb, 3rd month = Mar</li>
                          <li><strong>Q2 (Apr-Jun):</strong> 1st month = Apr, 2nd month = May, 3rd month = Jun</li>
                          <li><strong>Q3 (Jul-Sep):</strong> 1st month = Jul, 2nd month = Aug, 3rd month = Sep</li>
                          <li><strong>Q4 (Oct-Dec):</strong> 1st month = Oct, 2nd month = Nov, 3rd month = Dec</li>
                        </ul>
                      </div>
                      <p className="text-xs text-blue-200/80 mt-3 font-semibold">
                        <strong>Example:</strong> If you select "1st Month, Day 15", the compliance will be due:
                        <br />• Q1: January 15 (only once, not Jan/Feb/Mar)
                        <br />• Q2: April 15 (only once)
                        <br />• Q3: July 15 (only once)
                        <br />• Q4: October 15 (only once)
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-fg-secondary mb-2">
                          Month in Quarter * (1st, 2nd, or 3rd)
                        </label>
                        <select
                          value={templateForm.due_month || ''}
                          onChange={(e) => {
                            const monthInQuarter = e.target.value ? parseInt(e.target.value) : undefined
                            setTemplateForm(prev => ({ ...prev, due_month: monthInQuarter }))
                          }}
                          className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                        >
                          <option value="">Select Month</option>
                          <option value="1">1st Month of Quarter</option>
                          <option value="2">2nd Month of Quarter</option>
                          <option value="3">3rd Month of Quarter</option>
                        </select>
                        <p className="text-xs text-fg-muted mt-1">
                          Which month within each quarter (Q1: Jan, Q2: Apr, Q3: Jul, Q4: Oct)
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg-secondary mb-2">
                          Day of Month * (1-31)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={templateForm.due_day || ''}
                          onChange={(e) => setTemplateForm(prev => ({ ...prev, due_day: e.target.value ? parseInt(e.target.value) : undefined }))}
                          className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                          placeholder="15"
                        />
                        <p className="text-xs text-fg-muted mt-1">
                          The day of the selected month
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {templateForm.compliance_type === 'annual' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-fg-secondary mb-2">
                        Due Month * (1-12)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        value={templateForm.due_month || ''}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, due_month: e.target.value ? parseInt(e.target.value) : undefined }))}
                        className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                        placeholder="3"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-fg-secondary mb-2">
                        Due Day * (1-31)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={templateForm.due_day || ''}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, due_day: e.target.value ? parseInt(e.target.value) : undefined }))}
                        className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                        placeholder="31"
                      />
                    </div>
                  </div>
                )}

                {/* Penalty */}
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-2">
                    Penalty
                  </label>
                  <input
                    type="text"
                    value={templateForm.penalty}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, penalty: e.target.value }))}
                    className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                    placeholder="e.g., Late fee ₹200/day"
                  />
                </div>

                {/* Penalty Calculator (structured penalty_config) */}
                <div className="border border-line/15 rounded-xl p-4 space-y-4 bg-bg-card/30">
                  <div className="flex items-center gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-yellow-400">
                      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                    </svg>
                    <span className="text-sm font-medium text-fg-primary">Penalty Calculator</span>
                    <span className="text-xs text-fg-muted">(enables automatic penalty calculation when applied to companies)</span>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-fg-secondary mb-2">Penalty Type</label>
                    <select
                      value={templateForm.penalty_config_type}
                      onChange={(e) => setTemplateForm(prev => ({ ...prev, penalty_config_type: e.target.value as any }))}
                      className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                    >
                      <option value="none">None / Text only</option>
                      <option value="flat">Flat amount (fixed penalty)</option>
                      <option value="daily">Daily rate (per day late)</option>
                      <option value="interest">Interest (% on base amount per period)</option>
                      <option value="percentage">Percentage of base amount</option>
                    </select>
                  </div>

                  {templateForm.penalty_config_type === 'flat' && (
                    <div>
                      <label className="block text-sm font-medium text-fg-secondary mb-2">Fixed Penalty Amount (₹)</label>
                      <input type="number" value={templateForm.penalty_config_amount}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, penalty_config_amount: e.target.value }))}
                        className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                        placeholder="e.g., 5000" min="0" />
                    </div>
                  )}

                  {templateForm.penalty_config_type === 'daily' && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-fg-secondary mb-2">Rate per Day (₹)</label>
                        <input type="number" value={templateForm.penalty_config_rate}
                          onChange={(e) => setTemplateForm(prev => ({ ...prev, penalty_config_rate: e.target.value }))}
                          className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                          placeholder="e.g., 200" min="0" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-fg-secondary mb-2">Maximum Cap (₹, optional)</label>
                        <input type="number" value={templateForm.penalty_config_cap}
                          onChange={(e) => setTemplateForm(prev => ({ ...prev, penalty_config_cap: e.target.value }))}
                          className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                          placeholder="e.g., 10000" min="0" />
                      </div>
                    </div>
                  )}

                  {(templateForm.penalty_config_type === 'interest' || templateForm.penalty_config_type === 'percentage') && (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-fg-secondary mb-2">Rate (%)</label>
                        <input type="number" value={templateForm.penalty_config_rate}
                          onChange={(e) => setTemplateForm(prev => ({ ...prev, penalty_config_rate: e.target.value }))}
                          className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                          placeholder="e.g., 1.5" min="0" step="0.01" />
                      </div>
                      {templateForm.penalty_config_type === 'interest' && (
                        <div>
                          <label className="block text-sm font-medium text-fg-secondary mb-2">Per</label>
                          <select value={templateForm.penalty_config_period}
                            onChange={(e) => setTemplateForm(prev => ({ ...prev, penalty_config_period: e.target.value as any }))}
                            className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors">
                            <option value="month">Month</option>
                            <option value="day">Day</option>
                            <option value="year">Year</option>
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-sm font-medium text-fg-secondary mb-2">Base Amount Type</label>
                        <select value={templateForm.penalty_config_base}
                          onChange={(e) => setTemplateForm(prev => ({ ...prev, penalty_config_base: e.target.value }))}
                          className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors">
                          <option value="tax_due">Tax Due</option>
                          <option value="turnover">Turnover</option>
                          <option value="income">Income</option>
                          <option value="contribution">Contribution (PF/ESI)</option>
                        </select>
                      </div>
                      {templateForm.penalty_config_type === 'percentage' && (
                        <div>
                          <label className="block text-sm font-medium text-fg-secondary mb-2">Cap (₹, optional)</label>
                          <input type="number" value={templateForm.penalty_config_cap}
                            onChange={(e) => setTemplateForm(prev => ({ ...prev, penalty_config_cap: e.target.value }))}
                            className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                            placeholder="Maximum penalty cap" min="0" />
                        </div>
                      )}
                    </div>
                  )}

                  {templateForm.penalty_config_type !== 'none' && (
                    <p className="text-xs text-yellow-400/80">
                      {templateForm.penalty_config_type === 'interest' || templateForm.penalty_config_type === 'percentage'
                        ? 'Users will be prompted to enter the base amount when this template is applied to their company.'
                        : 'Penalty will be calculated automatically based on days delayed.'}
                    </p>
                  )}
                </div>

                {/* Possible Legal Action */}
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-2">
                    Possible Legal Action
                  </label>
                  <input
                    type="text"
                    value={templateForm.possible_legal_action}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, possible_legal_action: e.target.value }))}
                    className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                    placeholder="e.g., Prosecution under Section 276B"
                  />
                </div>

                {/* Required Documents */}
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-2">
                    Required Documents
                  </label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={templateForm.required_documents_input}
                      onChange={(e) => setTemplateForm(prev => ({ ...prev, required_documents_input: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && templateForm.required_documents_input.trim()) {
                          e.preventDefault()
                          setTemplateForm(prev => ({
                            ...prev,
                            required_documents: [...prev.required_documents, prev.required_documents_input.trim()],
                            required_documents_input: ''
                          }))
                        }
                      }}
                      className="flex-1 px-4 py-2 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand focus:ring-1 focus:ring-accent-brand transition-colors"
                      placeholder="Type document name and press Enter"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (templateForm.required_documents_input.trim()) {
                          setTemplateForm(prev => ({
                            ...prev,
                            required_documents: [...prev.required_documents, prev.required_documents_input.trim()],
                            required_documents_input: ''
                          }))
                        }
                      }}
                      className="px-4 py-2 bg-accent-brand text-white rounded-lg hover:bg-orange-600 transition-colors"
                    >
                      Add
                    </button>
                  </div>
                  {/* Document chips */}
                  {templateForm.required_documents.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {templateForm.required_documents.map((doc, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full text-sm"
                        >
                          {doc}
                          <button
                            type="button"
                            onClick={() => {
                              setTemplateForm(prev => ({
                                ...prev,
                                required_documents: prev.required_documents.filter((_, i) => i !== idx)
                              }))
                            }}
                            className="ml-1 hover:text-red-400"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Is Critical */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="is_critical_template"
                    checked={templateForm.is_critical}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, is_critical: e.target.checked }))}
                    className="w-4 h-4 text-accent-brand bg-bg-card border-line/15 rounded focus:ring-accent-brand"
                  />
                  <label htmlFor="is_critical_template" className="text-sm font-medium text-fg-secondary">
                    Mark as Critical
                  </label>
                </div>

                {/* Is Active (only for edit) */}
                {editingTemplate && (
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      id="is_active_template"
                      checked={templateForm.is_active}
                      onChange={(e) => setTemplateForm(prev => ({ ...prev, is_active: e.target.checked }))}
                      className="w-4 h-4 text-accent-brand bg-bg-card border-line/15 rounded focus:ring-accent-brand"
                    />
                    <label htmlFor="is_active_template" className="text-sm font-medium text-fg-secondary">
                      Template is Active
                    </label>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-3 pt-4">
                  <button
                    onClick={async () => {
                      // Validation
                      if (!templateForm.category || !templateForm.requirement) {
                        showToast('Please fill all required fields', 'warning')
                        return
                      }
                      if (templateForm.entity_types.length === 0) {
                        showToast('Please select at least one entity type', 'warning')
                        return
                      }
                      if (templateForm.industries.length === 0) {
                        showToast('Please select at least one industry', 'warning')
                        return
                      }
                      if (templateForm.industry_categories.length === 0) {
                        showToast('Please select at least one industry category', 'warning')
                        return
                      }
                      if (templateForm.compliance_type === 'one-time' && !templateForm.due_date) {
                        showToast('Due date is required for one-time compliances', 'warning')
                        return
                      }
                      if (templateForm.compliance_type === 'monthly' && templateForm.due_date_offset === undefined) {
                        showToast('Due date offset is required for monthly compliances', 'warning')
                        return
                      }
                      if (templateForm.compliance_type === 'quarterly' && (templateForm.due_month === undefined || templateForm.due_day === undefined)) {
                        showToast('Month in quarter and day are required for quarterly compliances', 'warning')
                        return
                      }
                      if (templateForm.compliance_type === 'annual' && (templateForm.due_month === undefined || templateForm.due_day === undefined)) {
                        showToast('Due month and day are required for annual compliances', 'warning')
                        return
                      }

                      try {
                        // Build structured penalty_config from builder fields
                        let builtPenaltyConfig: Record<string, unknown> | null = null
                        const pct = templateForm.penalty_config_type
                        if (pct === 'flat' && templateForm.penalty_config_amount) {
                          builtPenaltyConfig = { type: 'flat', amount: parseFloat(templateForm.penalty_config_amount) }
                        } else if (pct === 'daily' && templateForm.penalty_config_rate) {
                          builtPenaltyConfig = { type: 'daily', rate: parseFloat(templateForm.penalty_config_rate) }
                          if (templateForm.penalty_config_cap) builtPenaltyConfig.cap = parseFloat(templateForm.penalty_config_cap)
                        } else if (pct === 'interest' && templateForm.penalty_config_rate) {
                          builtPenaltyConfig = { type: 'interest', rate: parseFloat(templateForm.penalty_config_rate), period: templateForm.penalty_config_period, base: templateForm.penalty_config_base }
                        } else if (pct === 'percentage' && templateForm.penalty_config_rate) {
                          builtPenaltyConfig = { type: 'percentage', rate: parseFloat(templateForm.penalty_config_rate), base: templateForm.penalty_config_base }
                          if (templateForm.penalty_config_cap) builtPenaltyConfig.cap = parseFloat(templateForm.penalty_config_cap)
                        }
                        const submissionForm = { ...templateForm, penalty_config: builtPenaltyConfig }

                        let result
                        if (editingTemplate) {
                          result = await updateComplianceTemplate(editingTemplate.id, submissionForm)
                        } else {
                          result = await createComplianceTemplate(submissionForm)
                        }

                        if (result.success) {
                          await loadTemplates()
                          setIsTemplateModalOpen(false)
                          setEditingTemplate(null)
                          setTemplateForm({ ...EMPTY_TEMPLATE_FORM })
                          showToast(
                            editingTemplate
                              ? `Template updated successfully. Applied to ${result.applied_count || 0} companies.`
                              : `Template created successfully. Applied to ${result.applied_count || 0} companies.`,
                            'success'
                          )
                        } else {
                          showToast(`Failed: ${result.error}`, 'error')
                        }
                      } catch (error) {
                        console.error('Error saving template:', error)
                        showToast(`Error: ${error instanceof Error ? error.message : 'Something went wrong'}`, 'error')
                      }
                    }}
                    className="flex-1 bg-accent-brand text-white px-6 py-3 rounded-lg hover:bg-accent-brand/90 transition-colors font-medium"
                  >
                    {editingTemplate ? 'Update Template' : 'Create Template'}
                  </button>
                  <button
                    onClick={() => {
                      setIsTemplateModalOpen(false)
                      setEditingTemplate(null)
                      setTemplateForm({ ...EMPTY_TEMPLATE_FORM })
                    }}
                    className="px-6 py-3 bg-bg-elevated text-fg-secondary rounded-lg hover:bg-bg-hover transition-colors font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'vault' && (
          <div className="space-y-6">
            <div className="mb-6">
              <h2 className="text-2xl font-light text-fg-primary mb-2">Compliance Vault</h2>
              <p className="text-fg-muted">Manage global folder structure and document templates for all companies</p>
            </div>

            {isLoadingVaultFolders ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-2 border-accent-brand border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Folder Tree Sidebar */}
                <div className="lg:col-span-1">
                  <div className="bg-bg-card border border-line/10 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-fg-primary">Folders</h3>
                      <button
                        onClick={() => {
                          setEditingVaultFolder(null)
                          setVaultFolderForm({ name: '', description: '' })
                          setShowCreateVaultFolderModal(true)
                        }}
                        className="px-3 py-1.5 bg-accent-brand text-white rounded-lg hover:bg-accent-brand/90 transition-colors text-sm font-medium"
                      >
                        + New Folder
                      </button>
                    </div>

                    {/* Root level button */}
                    <button
                      onClick={() => setSelectedFolderPath(null)}
                      className={`w-full flex items-center gap-2 p-2 rounded-lg hover:bg-bg-elevated transition-colors mb-2 ${selectedFolderPath === null ? 'bg-accent-brand/20 border border-accent-brand/50' : ''
                        }`}
                    >
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        className="text-accent-brand"
                      >
                        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                        <polyline points="9 22 9 12 15 12 15 22" />
                      </svg>
                      <span className="text-sm text-fg-primary">Root</span>
                    </button>

                    <div className="space-y-1 max-h-[600px] overflow-y-auto">
                      {renderVaultFolderTree(vaultFolders)}
                    </div>
                  </div>
                </div>

                {/* Document Templates List */}
                <div className="lg:col-span-2">
                  <div className="bg-bg-card border border-line/10 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-fg-primary">
                          {selectedFolderPath ? getFolderName(selectedFolderPath) : 'Root'} Documents
                        </h3>
                        {selectedFolderPath && (
                          <div className="flex items-center gap-2 mt-2 text-sm text-fg-muted">
                            {buildBreadcrumb(selectedFolderPath).map((crumb, idx) => (
                              <span key={crumb.path}>
                                {idx > 0 && <span className="mx-1">/</span>}
                                <button
                                  onClick={() => setSelectedFolderPath(crumb.path)}
                                  className="hover:text-accent-brand transition-colors"
                                >
                                  {crumb.name}
                                </button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setEditingVaultTemplate(null)
                          setVaultTemplateForm({
                            name: '',
                            frequency: 'monthly',
                            category: '',
                            description: '',
                            isMandatory: false,
                          })
                          setShowCreateVaultTemplateModal(true)
                        }}
                        className="px-4 py-2 bg-accent-brand text-white rounded-lg hover:bg-accent-brand/90 transition-colors text-sm font-medium"
                      >
                        + New Document
                      </button>
                    </div>

                    {isLoadingVaultTemplates ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="flex items-center gap-3 text-fg-muted">
                          <div className="w-5 h-5 border-2 border-accent-brand border-t-transparent rounded-full animate-spin" />
                          <span className="text-sm">Loading templates...</span>
                        </div>
                      </div>
                    ) : vaultTemplates.length === 0 ? (
                      <div className="text-center py-12">
                        <svg
                          width="48"
                          height="48"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          className="text-fg-muted/60 mx-auto mb-4"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                        <p className="text-fg-muted">No document templates in this folder</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {vaultTemplates.map(template => (
                          <div
                            key={template.id || template.document_name}
                            className="flex items-center gap-4 p-4 bg-bg-card/50 rounded-lg border border-line/10 hover:border-line/15 transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-3 mb-2">
                                <h4 className="text-fg-primary font-medium truncate">{template.document_name}</h4>
                                <span className={`px-2 py-0.5 rounded text-xs font-medium text-fg-primary ${getVaultFrequencyBadgeColor(template.default_frequency)}`}>
                                  {getVaultFrequencyLabel(template.default_frequency)}
                                </span>
                                {template.is_mandatory && (
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-600 text-white">
                                    Mandatory
                                  </span>
                                )}
                              </div>
                              {template.description && (
                                <p className="text-sm text-fg-muted truncate mb-2">{template.description}</p>
                              )}
                              <div className="flex items-center gap-4 text-xs text-fg-muted">
                                {template.category && (
                                  <span className="px-2 py-0.5 bg-accent-brand/20 text-accent-brand rounded">
                                    {template.category}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setEditingVaultTemplate(template)
                                  setVaultTemplateForm({
                                    name: template.document_name,
                                    frequency: (template.default_frequency === 'annually' ? 'yearly' : template.default_frequency) as 'one-time' | 'monthly' | 'quarterly' | 'yearly',
                                    category: template.category || '',
                                    description: template.description || '',
                                    isMandatory: template.is_mandatory,
                                  })
                                }}
                                className="p-2 text-fg-muted hover:text-accent-brand transition-colors"
                                title="Edit"
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </button>
                              <button
                                onClick={() => template.id && handleDeleteVaultTemplate(template.id)}
                                className="p-2 text-fg-muted hover:text-red-400 transition-colors"
                                title="Delete"
                              >
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="3 6 5 6 21 6" />
                                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Create/Edit Folder Modal */}
            {(showCreateVaultFolderModal || editingVaultFolder) && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-bg-card border border-line/10 rounded-xl p-6 w-full max-w-md">
                  <h2 className="text-xl font-semibold text-fg-primary mb-4">
                    {editingVaultFolder ? 'Edit Folder' : 'Create New Folder'}
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-fg-secondary mb-2">Folder Name</label>
                      <input
                        type="text"
                        value={vaultFolderForm.name}
                        onChange={(e) => setVaultFolderForm({ ...vaultFolderForm, name: e.target.value })}
                        className="w-full px-4 py-2 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand"
                        placeholder="Enter folder name"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-fg-secondary mb-2">Description (Optional)</label>
                      <textarea
                        value={vaultFolderForm.description}
                        onChange={(e) => setVaultFolderForm({ ...vaultFolderForm, description: e.target.value })}
                        className="w-full px-4 py-2 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand"
                        placeholder="Enter folder description"
                        rows={3}
                      />
                    </div>
                    {selectedFolderPath && !editingVaultFolder && (
                      <div className="text-sm text-fg-muted">
                        Creating in: <span className="text-accent-brand">{selectedFolderPath}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={editingVaultFolder ? handleUpdateVaultFolder : handleCreateVaultFolder}
                        disabled={isCreatingVaultFolder || !vaultFolderForm.name.trim()}
                        className="flex-1 px-4 py-2 bg-accent-brand text-white rounded-lg hover:bg-accent-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCreatingVaultFolder ? 'Saving...' : editingVaultFolder ? 'Update' : 'Create'}
                      </button>
                      <button
                        onClick={() => {
                          setShowCreateVaultFolderModal(false)
                          setEditingVaultFolder(null)
                          setVaultFolderForm({ name: '', description: '' })
                        }}
                        className="px-4 py-2 bg-bg-hover text-fg-primary rounded-lg hover:bg-bg-hover transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Create/Edit Document Template Modal */}
            {(showCreateVaultTemplateModal || editingVaultTemplate) && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-bg-card border border-line/10 rounded-xl p-6 w-full max-w-md">
                  <h2 className="text-xl font-semibold text-fg-primary mb-4">
                    {editingVaultTemplate ? 'Edit Document Template' : 'Create New Document Template'}
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-fg-secondary mb-2">Document Name</label>
                      <input
                        type="text"
                        value={vaultTemplateForm.name}
                        onChange={(e) => setVaultTemplateForm({ ...vaultTemplateForm, name: e.target.value })}
                        className="w-full px-4 py-2 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand"
                        placeholder="e.g., GSTR-3B Filed Copy"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-fg-secondary mb-2">Frequency</label>
                      <select
                        value={vaultTemplateForm.frequency}
                        onChange={(e) => {
                          const value = e.target.value as 'one-time' | 'monthly' | 'quarterly' | 'yearly'
                          setVaultTemplateForm({ ...vaultTemplateForm, frequency: value })
                        }}
                        className="w-full px-4 py-2 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand"
                      >
                        <option value="one-time">One-Time</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-fg-secondary mb-2">Category (Optional)</label>
                      <input
                        type="text"
                        value={vaultTemplateForm.category}
                        onChange={(e) => setVaultTemplateForm({ ...vaultTemplateForm, category: e.target.value })}
                        className="w-full px-4 py-2 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand"
                        placeholder="e.g., GST, Income Tax"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-fg-secondary mb-2">Description (Optional)</label>
                      <textarea
                        value={vaultTemplateForm.description}
                        onChange={(e) => setVaultTemplateForm({ ...vaultTemplateForm, description: e.target.value })}
                        className="w-full px-4 py-2 bg-bg-card border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand"
                        placeholder="Enter document description"
                        rows={3}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="isMandatoryVault"
                        checked={vaultTemplateForm.isMandatory}
                        onChange={(e) => setVaultTemplateForm({ ...vaultTemplateForm, isMandatory: e.target.checked })}
                        className="w-4 h-4 text-accent-brand bg-bg-card border-line/15 rounded focus:ring-accent-brand"
                      />
                      <label htmlFor="isMandatoryVault" className="text-sm text-fg-secondary">
                        Mandatory Document
                      </label>
                    </div>
                    {selectedFolderPath && (
                      <div className="text-sm text-fg-muted">
                        Creating in: <span className="text-accent-brand">{selectedFolderPath}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-3">
                      <button
                        onClick={editingVaultTemplate ? handleUpdateVaultTemplate : handleCreateVaultTemplate}
                        disabled={isCreatingVaultTemplate || !vaultTemplateForm.name.trim()}
                        className="flex-1 px-4 py-2 bg-accent-brand text-white rounded-lg hover:bg-accent-brand/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isCreatingVaultTemplate ? 'Saving...' : editingVaultTemplate ? 'Update' : 'Create'}
                      </button>
                      <button
                        onClick={() => {
                          setShowCreateVaultTemplateModal(false)
                          setEditingVaultTemplate(null)
                          setVaultTemplateForm({
                            name: '',
                            frequency: 'monthly',
                            category: '',
                            description: '',
                            isMandatory: false,
                          })
                        }}
                        className="px-4 py-2 bg-bg-hover text-fg-primary rounded-lg hover:bg-bg-hover transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* KPIs Tab */}
        {activeTab === 'kpis' && (
          <KPIsTab />
        )}

        {/* Tracking System Tab */}
        {activeTab === 'tracking' && (
          <TrackingSystemTab />
        )}

      </div>
    </div>
  )
}

// KPI Data Structure
interface KPI {
  category: string
  kpi: string
  formula: string
  description: string
}

// KPI Data from CSV
const KPI_DATA: KPI[] = [
  { category: 'General', kpi: 'Value', formula: 'Money value could be saved', description: 'How much money do we say per customer per notification' },
  { category: 'General', kpi: 'Addictiveness', formula: 'Number of times logged into per week', description: '' },
  { category: 'General', kpi: 'CIN Retrieval Accuracy', formula: 'API Failure Rate; Interview: was all the data correct?', description: '' },
  { category: 'General', kpi: 'Happiness', formula: 'Would they recommend it?', description: 'NPS (Net Promoter Score): "How likely are you to recommend Finnovate to a peer?"' },
  { category: 'General', kpi: 'Reliability', formula: 'MTBF (Mean Time Between Failures): Average time between system crashes or critical bugs.; Number of system crashes or critical bugs per week/month', description: '> 300 Hours' },
  { category: 'General', kpi: 'Churn (Ghosting)', formula: '< 15% of Beta users stop logging in after week 1, then week 2, week 3,; Number of active users after every week? (logs in more than 2 times than week)', description: '> 40% of users stop logging in after Week 1' },
  { category: 'General', kpi: 'Time', formula: 'Average time spent per user per login?', description: '' },
  { category: 'General', kpi: 'Onboarding', formula: 'How many people are they onboarding?', description: '' },
  { category: 'Company Overview', kpi: 'Accuracy of Data', formula: 'Interview', description: '' },
  { category: 'Company Overview', kpi: 'Numbers of times "Edit Company"', formula: '', description: '' },
  { category: 'Compliance Tracker', kpi: 'Tracker Accuracy', formula: 'Cross check tracker calculated penalties with 3rd party CA (Muneer & Associates)', description: '' },
  { category: 'Compliance Tracker', kpi: 'Tracker Usage', formula: 'Number of times tracker tab opened in a week; Number of times status is changed per notification/week', description: '' },
  { category: 'Compliance Tracker', kpi: 'Calendar Usage', formula: 'Number of times the user is pressing sync calendar.', description: '' },
  { category: 'Compliance Tracker', kpi: 'Document Upload', formula: 'Frequency of documents uploaded onto the tracker page.', description: '' },
  { category: 'DSC Management', kpi: 'Function', formula: 'How many times are they exporting DSC?', description: '' },
  { category: 'DSC Management', kpi: 'Notifications', formula: 'Number of notifications clicked on', description: '' },
  { category: 'DSC Management', kpi: 'Dependency', formula: 'Number of times are they viewing their platform credentials?', description: '' },
  { category: 'Reports', kpi: 'Report Generation Efficiency', formula: 'Time taken for report to be generated', description: '' },
  { category: 'Reports', kpi: 'Retention', formula: 'Number of Reports downloaded per client', description: '' },
  { category: 'Reports', kpi: 'Coming soon interest', formula: 'Number of times people have clicked on notices and GST?', description: '' },
  { category: 'Reports', kpi: 'Export Format', formula: 'Type of export', description: '' },
  { category: 'Team Access', kpi: 'Team Adoption', formula: 'Number of users added per company', description: '' },
  { category: 'Team Access', kpi: 'Team Adoption', formula: 'Number of unique logins per company per week', description: '' },
  { category: 'Team Access', kpi: 'Team Adoption', formula: 'Number of changes in team access', description: '' },
  { category: 'Team Access', kpi: 'Team Adoption', formula: "Number of CA's added per company", description: '' },
  { category: 'Team Access', kpi: 'Cont', formula: 'Number of unique email addresses email is sent to', description: '' },
  { category: 'Document Vault', kpi: 'Usage', formula: 'Frequency and number of files uploaded, exported, and shared?', description: '' },
  { category: 'Document Vault', kpi: 'Password Usage', formula: 'Number of "Notes" used per customer?', description: '' },
  { category: 'Document Vault', kpi: 'Password Usage', formula: '"Note" to document upload ratio', description: '' },
  { category: 'Document Vault', kpi: 'Password Usage', formula: 'How many times are they looking at Notes?', description: '' },
  { category: 'Reminders', kpi: 'Email Responsiveness', formula: 'Click Rate on Notification', description: 'Have they opened the email/notification; Use Pixel Tracker' },
]

// KPIs Tab Component
function KPIsTab() {
  const { user } = useAuth()
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [searchQuery, setSearchQuery] = useState('')

  // Get unique categories
  const categories = ['All', ...Array.from(new Set(KPI_DATA.map(kpi => kpi.category)))]

  // Filter KPIs
  const filteredKPIs = KPI_DATA.filter(kpi => {
    const matchesCategory = selectedCategory === 'All' || kpi.category === selectedCategory
    const matchesSearch = searchQuery === '' ||
      kpi.kpi.toLowerCase().includes(searchQuery.toLowerCase()) ||
      kpi.formula.toLowerCase().includes(searchQuery.toLowerCase()) ||
      kpi.description.toLowerCase().includes(searchQuery.toLowerCase())
    return matchesCategory && matchesSearch
  })

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-bg-card border border-line/10 rounded-2xl p-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Category Filter */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-fg-muted mb-2">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-2 bg-bg-base border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          {/* Search */}
          <div className="flex-1">
            <label className="block text-sm font-medium text-fg-muted mb-2">Search</label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search KPIs, formulas, descriptions..."
              className="w-full px-4 py-2 bg-bg-base border border-line/15 rounded-lg text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-accent-brand"
            />
          </div>
        </div>
      </div>

      {/* KPI Table */}
      <div className="bg-bg-card border border-line/10 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-line/10">
                <th className="px-6 py-4 text-left text-sm font-medium text-fg-muted">Category</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-fg-muted">KPI</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-fg-muted">Formula</th>
                <th className="px-6 py-4 text-left text-sm font-medium text-fg-muted">Description</th>
              </tr>
            </thead>
            <tbody>
              {filteredKPIs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-fg-muted">
                    No KPIs found matching your filters.
                  </td>
                </tr>
              ) : (
                filteredKPIs.map((kpi, index) => (
                  <tr
                    key={index}
                    className="border-b border-line/10/50 hover:bg-bg-card/30 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm text-fg-secondary">{kpi.category}</td>
                    <td className="px-6 py-4 text-sm text-fg-primary font-medium">{kpi.kpi}</td>
                    <td className="px-6 py-4 text-sm text-fg-muted">{kpi.formula || '-'}</td>
                    <td className="px-6 py-4 text-sm text-fg-muted">{kpi.description || '-'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-4 border-t border-line/10 bg-bg-card/20">
          <p className="text-sm text-fg-muted">
            Showing {filteredKPIs.length} of {KPI_DATA.length} KPIs
          </p>
        </div>
      </div>
    </div>
  )
}

// Tracking System Tab Component
function TrackingSystemTab() {
  const { user } = useAuth()
  const supabase = createClient()
  const [selectedCategory, setSelectedCategory] = useState<string>('All')
  const [selectedKPI, setSelectedKPI] = useState<string>('All')
  const [selectedCompany, setSelectedCompany] = useState<string>('All')
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d')
  const [aggregations, setAggregations] = useState<any[]>([])
  const [metrics, setMetrics] = useState<any[]>([])
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false)
  const [selectedKPIDetail, setSelectedKPIDetail] = useState<string | null>(null)
  const [aiExplanation, setAiExplanation] = useState<string | null>(null)
  const [isGeneratingExplanation, setIsGeneratingExplanation] = useState(false)
  const [explanationError, setExplanationError] = useState<string | null>(null)
  const [chatMode, setChatMode] = useState(false)
  const [chatInput, setChatInput] = useState('')
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [isGeneratingChat, setIsGeneratingChat] = useState(false)

  // Get unique categories and KPIs
  const categories = ['All', ...Array.from(new Set(KPI_DATA.map(kpi => kpi.category)))]
  const kpis = ['All', ...Array.from(new Set(KPI_DATA.map(kpi => kpi.kpi)))]

  // Helper function to render text with LaTeX
  const renderWithLaTeX = (text: string) => {
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    const inlineMathRegex = /\$([^$]+)\$/g
    const blockMathRegex = /\$\$([^$]+)\$\$/g

    // First handle block math ($$...$$)
    const blockMatches = Array.from(text.matchAll(blockMathRegex))
    blockMatches.forEach((match) => {
      if (match.index !== undefined) {
        // Add text before match
        if (match.index > lastIndex) {
          const beforeText = text.substring(lastIndex, match.index)
          parts.push(renderInlineMath(beforeText))
        }
        // Add block math
        try {
          parts.push(<BlockMath key={`block-${match.index}`} math={match[1]} />)
        } catch (e) {
          parts.push(<span key={`block-${match.index}`} className="text-red-400">[LaTeX Error]</span>)
        }
        lastIndex = match.index + match[0].length
      }
    })

    // Add remaining text
    if (lastIndex < text.length) {
      const remainingText = text.substring(lastIndex)
      parts.push(renderInlineMath(remainingText))
    }

    return parts.length > 0 ? parts : [text]
  }

  // Helper to render inline math
  const renderInlineMath = (text: string) => {
    const parts: React.ReactNode[] = []
    let lastIndex = 0
    const inlineMathRegex = /\$([^$]+)\$/g
    const matches = Array.from(text.matchAll(inlineMathRegex))

    matches.forEach((match) => {
      if (match.index !== undefined) {
        // Add text before match
        if (match.index > lastIndex) {
          parts.push(text.substring(lastIndex, match.index))
        }
        // Add inline math
        try {
          parts.push(<InlineMath key={`inline-${match.index}`} math={match[1]} />)
        } catch (e) {
          parts.push(<span key={`inline-${match.index}`} className="text-red-400">[LaTeX Error]</span>)
        }
        lastIndex = match.index + match[0].length
      }
    })

    // Add remaining text
    if (lastIndex < text.length) {
      parts.push(text.substring(lastIndex))
    }

    return parts.length > 0 ? parts : [text]
  }

  // Load companies via server action (works for both Supabase and Passport users)
  useEffect(() => {
    async function loadCompanies() {
      if (!user) return
      
      try {
        const result = await getAllCompaniesForAdmin()
        
        if (result.success && result.companies) {
          // Set companies for KPI filters (only need id and name)
          setCompanies(result.companies.map(c => ({ id: c.id, name: c.name })))
        }
      } catch (error) {
        console.error('Error loading companies:', error)
      }
    }
    loadCompanies()
  }, [user])

  // Load aggregations
  useEffect(() => {
    async function loadAggregations() {
      setIsLoading(true)
      try {
        const endDate = new Date().toISOString()
        const startDate = dateRange === 'all'
          ? undefined
          : new Date(Date.now() - (dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90) * 24 * 60 * 60 * 1000).toISOString()

        // Use server action instead of direct Supabase query (works for both Supabase and Passport users)
        const result = await getKPIAggregations(
          selectedCategory !== 'All' ? selectedCategory : undefined,
          selectedKPI !== 'All' ? selectedKPI : undefined,
          startDate,
          endDate,
          selectedCompany !== 'All' ? selectedCompany : undefined
        )

        if (!result.success || !result.data) {
          console.error('Error loading aggregations:', result.error)
          setAggregations([])
        } else {
          // Server action already returns aggregated data
          setAggregations(result.data)
        }
      } catch (error) {
        console.error('Error loading aggregations:', error)
        setAggregations([])
      } finally {
        setIsLoading(false)
      }
    }
    loadAggregations()
  }, [selectedCategory, selectedKPI, selectedCompany, dateRange])

  // Handle chat submission
  const handleChatSubmit = async () => {
    if (!chatInput.trim() || aggregations.length === 0) return

    const userQuestion = chatInput.trim()
    setChatInput('')
    setIsGeneratingChat(true)

    // Add user message to history
    const newHistory = [...chatHistory, { role: 'user' as const, content: userQuestion }]
    setChatHistory(newHistory)

    try {
      // Get sample metrics for context
      const endDate = new Date().toISOString()
      const startDate = dateRange === 'all'
        ? undefined
        : new Date(Date.now() - (dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90) * 24 * 60 * 60 * 1000).toISOString()

      // Use server action instead of direct Supabase query (works for both Supabase and Passport users)
      const metricsResult = await getKPIMetrics(
        selectedKPI !== 'All' ? selectedKPI : 'all',
        startDate,
        endDate,
        selectedCompany !== 'All' ? selectedCompany : undefined
      )

      const sampleMetrics = metricsResult.success ? (metricsResult.data || []) : []

      const result = await chatWithKPIData(
        userQuestion,
        aggregations as KPIAggregation[],
        (sampleMetrics || []) as KPIMetric[],
        dateRange === '7d' ? 'Last 7 days' : dateRange === '30d' ? 'Last 30 days' : dateRange === '90d' ? 'Last 90 days' : 'All time',
        selectedCategory !== 'All' ? selectedCategory : undefined,
        selectedKPI !== 'All' ? selectedKPI : undefined,
        selectedCompany !== 'All' ? selectedCompany : undefined,
        newHistory.slice(0, -1) // Pass history without the current question
      )

      if (result.success && result.answer) {
        setChatHistory([...newHistory, { role: 'assistant', content: result.answer }])
      } else {
        setChatHistory([...newHistory, { role: 'assistant', content: `Error: ${result.error || 'Failed to generate answer'}` }])
      }
    } catch (error) {
      console.error('Error in chat:', error)
      setChatHistory([...newHistory, { role: 'assistant', content: `Error: ${error instanceof Error ? error.message : 'Failed to generate answer'}` }])
    } finally {
      setIsGeneratingChat(false)
    }
  }

  // Load detailed metrics for a specific KPI
  const loadKPIDetails = async (kpiName: string, category: string) => {
    setIsLoadingMetrics(true)
    setSelectedKPIDetail(kpiName)
    try {
      const endDate = new Date().toISOString()
      const startDate = dateRange === 'all'
        ? undefined
        : new Date(Date.now() - (dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90) * 24 * 60 * 60 * 1000).toISOString()

      // Use server action instead of direct Supabase query (works for both Supabase and Passport users)
      const result = await getKPIMetrics(
        kpiName,
        startDate,
        endDate,
        selectedCompany !== 'All' ? selectedCompany : undefined
      )

      if (!result.success) {
        console.error('Error loading metrics:', result.error)
        setMetrics([])
      } else {
        // Map to include company name if needed (server action doesn't return joined data)
        setMetrics((result.data || []).map(m => ({
          ...m,
          companies: undefined // Company name would need separate lookup if needed
        })))
      }
    } catch (error) {
      console.error('Error loading metrics:', error)
      setMetrics([])
    } finally {
      setIsLoadingMetrics(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-bg-card border border-line/10 rounded-2xl p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Category Filter */}
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-2">Category</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-4 py-2 bg-bg-base border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          {/* KPI Filter */}
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-2">KPI</label>
            <select
              value={selectedKPI}
              onChange={(e) => setSelectedKPI(e.target.value)}
              className="w-full px-4 py-2 bg-bg-base border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand"
            >
              {kpis.map(kpi => (
                <option key={kpi} value={kpi}>{kpi}</option>
              ))}
            </select>
          </div>
          {/* Company Filter */}
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-2">Company</label>
            <select
              value={selectedCompany}
              onChange={(e) => setSelectedCompany(e.target.value)}
              className="w-full px-4 py-2 bg-bg-base border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand"
            >
              <option value="All">All Companies</option>
              {companies.map(company => (
                <option key={company.id} value={company.id}>{company.name}</option>
              ))}
            </select>
          </div>
          {/* Date Range */}
          <div>
            <label className="block text-sm font-medium text-fg-muted mb-2">Date Range</label>
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as '7d' | '30d' | '90d' | 'all')}
              className="w-full px-4 py-2 bg-bg-base border border-line/15 rounded-lg text-fg-primary focus:outline-none focus:border-accent-brand"
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </div>
          {/* Refresh Button */}
          <div className="flex items-end gap-2">
            <button
              onClick={() => window.location.reload()}
              className="flex-1 px-4 py-2 bg-accent-brand text-white rounded-lg hover:bg-accent-brand/90 transition-colors"
            >
              Refresh
            </button>
            <button
              onClick={() => setChatMode(!chatMode)}
              className={`px-4 py-2 text-sm rounded-lg transition-colors ${chatMode
                ? 'bg-blue-600 text-white'
                : 'bg-bg-hover text-fg-secondary hover:bg-bg-hover'
                }`}
            >
              {chatMode ? '📊 Summary' : '💬 Chat'}
            </button>
            {!chatMode && (
              <button
                onClick={async () => {
                  if (aggregations.length === 0) {
                    setExplanationError('No data available to explain. Please load tracking data first.')
                    return
                  }
                  setIsGeneratingExplanation(true)
                  setExplanationError(null)
                  setAiExplanation(null)

                  try {
                    // Get sample metrics for context
                    const endDate = new Date().toISOString()
                    const startDate = dateRange === 'all'
                      ? undefined
                      : new Date(Date.now() - (dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : 90) * 24 * 60 * 60 * 1000).toISOString()

                    let metricsQuery = supabase
                      .from('kpi_metrics')
                      .select('*')
                      .order('recorded_at', { ascending: false })
                      .limit(50)

                    if (startDate) {
                      metricsQuery = metricsQuery.gte('recorded_at', startDate)
                    }
                    if (selectedCategory !== 'All') {
                      metricsQuery = metricsQuery.eq('category', selectedCategory)
                    }
                    if (selectedKPI !== 'All') {
                      metricsQuery = metricsQuery.eq('kpi_name', selectedKPI)
                    }
                    if (selectedCompany !== 'All') {
                      metricsQuery = metricsQuery.eq('company_id', selectedCompany)
                    }

                    const { data: sampleMetrics } = await metricsQuery

                    const result = await explainKPIData(
                      aggregations as KPIAggregation[],
                      (sampleMetrics || []) as KPIMetric[],
                      dateRange === '7d' ? 'Last 7 days' : dateRange === '30d' ? 'Last 30 days' : dateRange === '90d' ? 'Last 90 days' : 'All time',
                      selectedCategory !== 'All' ? selectedCategory : undefined,
                      selectedKPI !== 'All' ? selectedKPI : undefined,
                      selectedCompany !== 'All' ? selectedCompany : undefined
                    )

                    if (result.success && result.explanation) {
                      setAiExplanation(result.explanation)
                    } else {
                      setExplanationError(result.error || 'Failed to generate explanation')
                    }
                  } catch (error) {
                    console.error('Error generating explanation:', error)
                    setExplanationError(error instanceof Error ? error.message : 'Failed to generate explanation')
                  } finally {
                    setIsGeneratingExplanation(false)
                  }
                }}
                disabled={isGeneratingExplanation || aggregations.length === 0}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isGeneratingExplanation ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                    <span>Explain with AI</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Aggregations Table */}
      <div className="bg-bg-card border border-line/10 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-line/10">
          <h2 className="text-xl font-light text-fg-primary">KPI Tracking Summary</h2>
          <p className="text-sm text-fg-muted mt-1">Aggregated metrics across all tracked KPIs</p>
        </div>
        {isLoading ? (
          <div className="p-8 text-center">
            <div className="w-8 h-8 border-4 border-accent-brand border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-fg-muted">Loading tracking data...</p>
          </div>
        ) : aggregations.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-fg-muted">No tracking data found for the selected filters.</p>
            <p className="text-sm text-fg-muted mt-2">Tracking data will appear here as users interact with the system.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line/10">
                    <th className="px-6 py-4 text-left text-sm font-medium text-fg-muted">Category</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-fg-muted">KPI</th>
                    <th className="px-6 py-4 text-right text-sm font-medium text-fg-muted">Total Records</th>
                    <th className="px-6 py-4 text-right text-sm font-medium text-fg-muted">Avg Value</th>
                    <th className="px-6 py-4 text-right text-sm font-medium text-fg-muted">Min</th>
                    <th className="px-6 py-4 text-right text-sm font-medium text-fg-muted">Max</th>
                    <th className="px-6 py-4 text-right text-sm font-medium text-fg-muted">Users</th>
                    <th className="px-6 py-4 text-right text-sm font-medium text-fg-muted">Companies</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-fg-muted">Last Recorded</th>
                    <th className="px-6 py-4 text-center text-sm font-medium text-fg-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {aggregations.map((agg, index) => (
                    <tr
                      key={index}
                      className="border-b border-line/10/50 hover:bg-bg-card/30 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm text-fg-secondary">{agg.category}</td>
                      <td className="px-6 py-4 text-sm text-fg-primary font-medium">{agg.kpi_name}</td>
                      <td className="px-6 py-4 text-sm text-fg-muted text-right">{agg.total_count}</td>
                      <td className="px-6 py-4 text-sm text-fg-muted text-right">{agg.average_value.toFixed(2)}</td>
                      <td className="px-6 py-4 text-sm text-fg-muted text-right">{agg.min_value}</td>
                      <td className="px-6 py-4 text-sm text-fg-muted text-right">{agg.max_value}</td>
                      <td className="px-6 py-4 text-sm text-fg-muted text-right">{agg.user_count || 0}</td>
                      <td className="px-6 py-4 text-sm text-fg-muted text-right">{agg.company_count || 0}</td>
                      <td className="px-6 py-4 text-sm text-fg-muted">
                        {new Date(agg.last_recorded).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          onClick={() => loadKPIDetails(agg.kpi_name, agg.category)}
                          className="px-3 py-1 text-xs bg-accent-brand/20 text-accent-brand rounded hover:bg-accent-brand/30 transition-colors"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-4 border-t border-line/10 bg-bg-card/20">
              <p className="text-sm text-fg-muted">
                Showing {aggregations.length} tracked KPI{aggregations.length !== 1 ? 's' : ''}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Detailed Metrics Modal */}
      {selectedKPIDetail && (
        <div className="bg-bg-card border border-line/10 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-line/10 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-light text-fg-primary">Detailed Metrics: {selectedKPIDetail}</h2>
              <p className="text-sm text-fg-muted mt-1">Individual tracking records</p>
            </div>
            <button
              onClick={() => {
                setSelectedKPIDetail(null)
                setMetrics([])
              }}
              className="text-fg-muted hover:text-fg-primary transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          {isLoadingMetrics ? (
            <div className="p-8 text-center">
              <div className="w-8 h-8 border-4 border-accent-brand border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-fg-muted">Loading metrics...</p>
            </div>
          ) : metrics.length === 0 ? (
            <div className="p-8 text-center">
              <p className="text-fg-muted">No detailed metrics found.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line/10">
                    <th className="px-6 py-4 text-left text-sm font-medium text-fg-muted">Date</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-fg-muted">Company</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-fg-muted">User</th>
                    <th className="px-6 py-4 text-right text-sm font-medium text-fg-muted">Value</th>
                    <th className="px-6 py-4 text-left text-sm font-medium text-fg-muted">Data</th>
                  </tr>
                </thead>
                <tbody>
                  {metrics.map((metric, index) => (
                    <tr
                      key={index}
                      className="border-b border-line/10/50 hover:bg-bg-card/30 transition-colors"
                    >
                      <td className="px-6 py-4 text-sm text-fg-muted">
                        {new Date(metric.recorded_at).toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-sm text-fg-secondary">
                        {metric.companies?.name || (metric.company_id ? metric.company_id.substring(0, 8) + '...' : 'N/A')}
                      </td>
                      <td className="px-6 py-4 text-sm text-fg-secondary">
                        {metric.user_id ? metric.user_id.substring(0, 8) + '...' : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-sm text-fg-primary font-medium text-right">
                        {metric.metric_value}
                      </td>
                      <td className="px-6 py-4 text-sm text-fg-muted">
                        {metric.metric_data ? JSON.stringify(metric.metric_data).substring(0, 50) + '...' : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* AI Explanation / Chat Section */}
      {((!chatMode && (aiExplanation || explanationError || isGeneratingExplanation)) || chatMode) && (
        <div className="bg-bg-card border border-line/10 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-line/10 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-light text-fg-primary flex items-center gap-2">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
                {chatMode ? 'Chat with KPI Data' : 'AI Explanation'}
              </h2>
              <p className="text-sm text-fg-muted mt-1">
                {chatMode ? 'Ask questions about your KPI tracking data' : 'Simple analysis of your KPI tracking data'}
              </p>
            </div>
            <button
              onClick={() => {
                if (chatMode) {
                  setChatHistory([])
                  setChatInput('')
                } else {
                  setAiExplanation(null)
                  setExplanationError(null)
                }
              }}
              className="text-fg-muted hover:text-fg-primary transition-colors"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="p-6">
            {chatMode ? (
              <div className="space-y-4">
                {/* Chat History */}
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {chatHistory.length === 0 ? (
                    <div className="text-center py-8 text-fg-muted">
                      <p>Start a conversation about your KPI data</p>
                      <p className="text-sm text-fg-muted mt-2">Try asking: "What does the Addictiveness KPI mean?" or "Show me trends in Tracker Usage"</p>
                    </div>
                  ) : (
                    chatHistory.map((msg, index) => (
                      <div
                        key={index}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-lg p-4 ${msg.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-bg-elevated text-fg-secondary'
                            }`}
                        >
                          <div className="whitespace-pre-wrap">
                            {renderWithLaTeX(msg.content)}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                  {isGeneratingChat && (
                    <div className="flex justify-start">
                      <div className="bg-bg-elevated text-fg-secondary rounded-lg p-4">
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-line/30 border-t-transparent rounded-full animate-spin"></div>
                          <span>Thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Chat Input */}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey && chatInput.trim() && !isGeneratingChat) {
                        e.preventDefault()
                        handleChatSubmit()
                      }
                    }}
                    placeholder="Ask a question about your KPI data..."
                    className="flex-1 px-4 py-2 bg-bg-base border border-line/15 rounded-lg text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-blue-500"
                    disabled={isGeneratingChat || aggregations.length === 0}
                  />
                  <button
                    onClick={handleChatSubmit}
                    disabled={!chatInput.trim() || isGeneratingChat || aggregations.length === 0}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Send
                  </button>
                </div>
              </div>
            ) : isGeneratingExplanation ? (
              <div className="text-center py-8">
                <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                <p className="text-fg-muted">AI is analyzing your KPI data...</p>
                <p className="text-sm text-fg-muted mt-2">This may take a few moments</p>
              </div>
            ) : explanationError ? (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-400 flex-shrink-0 mt-0.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <div>
                    <h3 className="text-red-400 font-medium mb-1">Error Generating Explanation</h3>
                    <p className="text-fg-secondary text-sm">{explanationError}</p>
                  </div>
                </div>
              </div>
            ) : aiExplanation ? (
              <div className="prose prose-invert max-w-none">
                <div className="text-fg-secondary whitespace-pre-wrap leading-relaxed">
                  {aiExplanation.split('\n').map((paragraph, index) => {
                    // Check if this is a header (starts with # or is all caps)
                    if (paragraph.trim().startsWith('#') || (paragraph.trim().length > 0 && paragraph.trim().length < 50 && paragraph === paragraph.toUpperCase())) {
                      return (
                        <h3 key={index} className="text-fg-primary font-semibold text-lg mt-6 mb-3 first:mt-0">
                          {renderWithLaTeX(paragraph.replace(/^#+\s*/, '').trim())}
                        </h3>
                      )
                    }
                    // Check if this is a bullet point or numbered list
                    if (paragraph.trim().startsWith('-') || paragraph.trim().match(/^\d+\./)) {
                      return (
                        <div key={index} className="ml-4 mb-2 text-fg-secondary">
                          {renderWithLaTeX(paragraph.trim())}
                        </div>
                      )
                    }
                    // Regular paragraph
                    if (paragraph.trim().length > 0) {
                      return (
                        <p key={index} className="mb-4 text-fg-secondary">
                          {renderWithLaTeX(paragraph.trim())}
                        </p>
                      )
                    }
                    return null
                  })}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

export default function AdminPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0a0a0a]" />}>
      <AdminPageInner />
    </Suspense>
  )
}
