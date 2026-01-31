'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import SubtleCircuitBackground from '@/components/SubtleCircuitBackground'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/utils/supabase/client'
import { getRegulatoryRequirements, getCompanyUserRoles, getUserRole, getComplianceTemplates, createComplianceTemplate, updateComplianceTemplate, deleteComplianceTemplate, getTemplateDetails, applyAllTemplates, type ComplianceTemplate } from '@/app/data-room/actions'
import { useUserRole } from '@/hooks/useUserRole'
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

interface Company {
  id: string
  name: string
  type: string
  incorporation_date: string
  user_id: string
}

interface Requirement {
  id: string
  company_id: string
  category: string
  requirement: string
  status: string
  due_date: string
  company_name?: string
}

export default function AdminPage() {
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  
  const [isLoading, setIsLoading] = useState(true)
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  const [companies, setCompanies] = useState<Company[]>([])
  const [allRequirements, setAllRequirements] = useState<Requirement[]>([])
  const [selectedCompany, setSelectedCompany] = useState<string>('all')
  const [activeTab, setActiveTab] = useState<'overview' | 'companies' | 'compliances' | 'users' | 'templates' | 'financials'>('overview')
  const [templates, setTemplates] = useState<ComplianceTemplate[]>([])
  const [selectedTemplates, setSelectedTemplates] = useState<string[]>([])
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false)
  const [isApplyingTemplates, setIsApplyingTemplates] = useState(false)
  const [isDeletingTemplates, setIsDeletingTemplates] = useState(false)
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ComplianceTemplate | null>(null)
  const [templateForm, setTemplateForm] = useState({
    category: '',
    requirement: '',
    description: '',
    compliance_type: 'one-time' as 'one-time' | 'monthly' | 'quarterly' | 'annual',
    entity_types: [] as string[],
    industries: [] as string[],
    industry_categories: [] as string[],
    penalty: '',
    is_critical: false,
    financial_year: '',
    due_date_offset: undefined as number | undefined,
    due_month: undefined as number | undefined,
    due_day: undefined as number | undefined,
    due_date: '',
    is_active: true,
    // New fields for V2
    required_documents: [] as string[],
    possible_legal_action: '',
    required_documents_input: '' // Temporary input for adding documents
  })

  // Check if user is superadmin
  useEffect(() => {
    async function checkSuperadmin() {
      if (!user) {
        router.push('/')
        return
      }

      setIsLoading(true)
      let retryCount = 0
      const maxRetries = 3
      const retryDelay = 1000

      const attemptCheck = async (attempt: number): Promise<void> => {
        try {
          console.log(`[AdminPage] Checking superadmin status (attempt ${attempt + 1}/${maxRetries + 1}) for user:`, user.id)
          
          // Try RPC function first
          const { data: rpcData, error: rpcError } = await supabase.rpc('is_superadmin', {
            p_user_id: user.id
          })

          if (!rpcError && rpcData !== null) {
            console.log('[AdminPage] RPC result:', rpcData)
            if (rpcData) {
              console.log('[AdminPage] User is superadmin, setting state and loading data')
              setIsSuperadmin(true)
              setIsLoading(false)
              await loadData()
            } else {
              console.log('[AdminPage] User is not superadmin (RPC returned false), redirecting to data-room')
              setIsLoading(false)
              router.push('/data-room')
            }
            return
          }

          // Fallback: Direct query
          console.log('[AdminPage] RPC failed, falling back to direct query. Error:', rpcError)
          const { data, error } = await supabase
            .from('user_roles')
            .select('role, company_id')
            .eq('user_id', user.id)
            .eq('role', 'superadmin')

          if (error) {
            console.error(`[AdminPage] Query error (attempt ${attempt + 1}):`, error)
            throw error
          }

          console.log('[AdminPage] Query result:', data)
          const isPlatformSuperadmin = data && data.some(role => role.company_id === null)
          console.log('[AdminPage] Is platform superadmin:', isPlatformSuperadmin)

          if (isPlatformSuperadmin) {
            console.log('[AdminPage] User is superadmin (direct query), setting state and loading data')
            setIsSuperadmin(true)
            setIsLoading(false)
            await loadData()
          } else {
            console.log('[AdminPage] User is not superadmin (no platform superadmin role found), redirecting to data-room')
            setIsLoading(false)
            router.push('/data-room')
          }
        } catch (error: any) {
          console.error(`[AdminPage] Error checking superadmin (attempt ${attempt + 1}):`, error)
          
          if (attempt < maxRetries) {
            console.log(`[AdminPage] Retrying in ${retryDelay}ms...`)
            await new Promise(resolve => setTimeout(resolve, retryDelay))
            return attemptCheck(attempt + 1)
          } else {
            console.error('[AdminPage] Max retries reached, redirecting to data-room')
            setIsLoading(false)
            router.push('/data-room')
          }
        }
      }

      await attemptCheck(0)
    }

    if (user) {
      checkSuperadmin()
    }
  }, [user, router, supabase])

  const loadData = async () => {
    try {
      // Load all companies
      const { data: companiesData, error: companiesError } = await supabase
        .from('companies')
        .select('*')
        .order('created_at', { ascending: false })

      if (companiesError) throw companiesError
      setCompanies(companiesData || [])

      // Load all requirements
      const result = await getRegulatoryRequirements(null) // null = all companies for superadmin
      if (result.success && result.requirements) {
        // Enrich with company names
        const enriched = result.requirements.map(req => ({
          ...req,
          company_name: companiesData?.find(c => c.id === req.company_id)?.name || 'Unknown'
        }))
        setAllRequirements(enriched)
      }
    } catch (error) {
      console.error('Error loading data:', error)
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

  // Load templates when templates tab is active
  useEffect(() => {
    if (activeTab === 'templates' && isSuperadmin) {
      loadTemplates()
    }
  }, [activeTab, isSuperadmin])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary-dark relative overflow-hidden">
        <SubtleCircuitBackground />
        <div className="relative z-10 container mx-auto px-4 py-8 flex items-center justify-center min-h-screen">
          <div className="text-center">
            <div className="w-10 h-10 border-4 border-primary-orange border-t-transparent rounded-full animate-spin mb-4 mx-auto"></div>
            <p className="text-gray-400">Loading...</p>
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
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      <SubtleCircuitBackground />
      <Header />

      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-4xl font-light text-white mb-2">Superadmin Dashboard</h1>
          <p className="text-gray-400">Manage all companies, compliances, and users across the platform</p>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-2 mb-8">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-primary-orange bg-primary-orange/20 text-white'
                : 'border-gray-700 bg-primary-dark-card text-gray-400 hover:text-white hover:border-gray-600'
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
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${
              activeTab === 'companies'
                ? 'border-primary-orange bg-primary-orange/20 text-white'
                : 'border-gray-700 bg-primary-dark-card text-gray-400 hover:text-white hover:border-gray-600'
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
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${
              activeTab === 'compliances'
                ? 'border-primary-orange bg-primary-orange/20 text-white'
                : 'border-gray-700 bg-primary-dark-card text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span>All Compliances</span>
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${
              activeTab === 'templates'
                ? 'border-primary-orange bg-primary-orange/20 text-white'
                : 'border-gray-700 bg-primary-dark-card text-gray-400 hover:text-white hover:border-gray-600'
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
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${
              activeTab === 'users'
                ? 'border-primary-orange bg-primary-orange/20 text-white'
                : 'border-gray-700 bg-primary-dark-card text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span>Users</span>
          </button>
          <button
            onClick={() => setActiveTab('financials')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg border-2 transition-colors ${
              activeTab === 'financials'
                ? 'border-primary-orange bg-primary-orange/20 text-white'
                : 'border-gray-700 bg-primary-dark-card text-gray-400 hover:text-white hover:border-gray-600'
            }`}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span>Financials</span>
          </button>
        </div>

        {/* Content */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-400 text-sm font-medium">Total Companies</h3>
                <div className="w-10 h-10 bg-primary-orange/20 rounded-lg flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary-orange">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-light text-white">{stats.totalCompanies}</p>
            </div>

            <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-400 text-sm font-medium">Total Compliances</h3>
                <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-blue-500">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-light text-white">{stats.totalRequirements}</p>
            </div>

            <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-400 text-sm font-medium">Overdue</h3>
                <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-red-500">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </div>
              </div>
              <p className="text-3xl font-light text-red-400">{stats.overdueRequirements}</p>
            </div>

            <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-gray-400 text-sm font-medium">Pending</h3>
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
          <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-gray-800">
              <h2 className="text-2xl font-light text-white">All Companies</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-900 border-b border-gray-800">
                  <tr>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Company Name</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Type</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Incorporation Date</th>
                    <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company.id} className="hover:bg-gray-900/50 transition-colors border-t border-gray-800">
                      <td className="px-6 py-4 text-white font-medium">{company.name}</td>
                      <td className="px-6 py-4 text-gray-300">{company.type}</td>
                      <td className="px-6 py-4 text-gray-300">
                        {new Date(company.incorporation_date).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => router.push(`/data-room?company=${company.id}`)}
                          className="px-4 py-2 bg-primary-orange/20 border border-primary-orange text-primary-orange rounded-lg hover:bg-primary-orange/30 transition-colors text-sm"
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
              <label className="text-sm font-medium text-gray-300">Filter by Company:</label>
              <select
                value={selectedCompany}
                onChange={(e) => setSelectedCompany(e.target.value)}
                className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
              >
                <option value="all">All Companies</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>{company.name}</option>
                ))}
              </select>
            </div>

            {/* Requirements Table */}
            <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
              <div className="p-6 border-b border-gray-800">
                <h2 className="text-2xl font-light text-white">All Compliance Requirements</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-900 border-b border-gray-800">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Company</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Category</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Requirement</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Due Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRequirements.map((req) => (
                      <tr key={req.id} className="hover:bg-gray-900/50 transition-colors border-t border-gray-800">
                        <td className="px-6 py-4 text-white font-medium">{req.company_name}</td>
                        <td className="px-6 py-4 text-gray-300">{req.category}</td>
                        <td className="px-6 py-4 text-white">{req.requirement}</td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            req.status === 'completed' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                            req.status === 'overdue' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                            req.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                            'bg-gray-800 text-gray-400 border border-gray-700'
                          }`}>
                            {req.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-300">
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
              <div>
                <h2 className="text-2xl font-light text-white mb-2">Compliance Templates</h2>
                <p className="text-gray-400">Create templates that automatically apply to matching companies</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={async () => {
                    setIsApplyingTemplates(true)
                    try {
                      const result = await applyAllTemplates()
                      if (result.success) {
                        alert(`Successfully applied ${result.template_count} templates! Created/updated ${result.applied_count} requirements.`)
                      } else {
                        alert(`Error: ${result.error || 'Failed to apply templates'}`)
                      }
                    } catch (err) {
                      console.error('Error applying templates:', err)
                      alert('Error applying templates')
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
                  setTemplateForm({
                    category: '',
                    requirement: '',
                    description: '',
                    compliance_type: 'one-time',
                    entity_types: [],
                    industries: [],
                    industry_categories: [],
                    penalty: '',
                    is_critical: false,
                    financial_year: '',
                    due_date_offset: undefined,
                    due_month: undefined,
                    due_day: undefined,
                    due_date: '',
                    is_active: true,
                    required_documents: [],
                    possible_legal_action: '',
                    required_documents_input: ''
                  })
                  setEditingTemplate(null)
                  setIsTemplateModalOpen(true)
                }}
                className="bg-primary-orange text-white px-6 py-3 rounded-lg hover:bg-primary-orange/90 transition-colors flex items-center gap-2 font-medium"
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
                    if (!confirm(`Are you sure you want to delete ${selectedTemplates.length} template(s) and their associated compliance requirements? This action cannot be undone.`)) {
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
                    alert(`Deleted ${deletedCount} template(s)${errorCount > 0 ? `. ${errorCount} failed.` : ''}`)
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
              <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-12 flex flex-col items-center justify-center">
                <div className="w-10 h-10 border-4 border-primary-orange border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-gray-400">Loading templates...</p>
              </div>
            ) : (
              <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
                <div className="p-6 border-b border-gray-800">
                  <h3 className="text-xl font-light text-white">All Templates</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-900 border-b border-gray-800">
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
                            className="w-4 h-4 text-primary-orange bg-gray-900 border-gray-700 rounded focus:ring-primary-orange"
                          />
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Requirement</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Compliance Type</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Required Docs</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Entity Types</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Industries</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Matching</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                        <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {templates.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="px-6 py-12 text-center text-gray-400">
                            No templates found. Create your first template to get started.
                          </td>
                        </tr>
                      ) : (
                        templates.map((template) => (
                          <tr key={template.id} className={`hover:bg-gray-900/50 transition-colors border-t border-gray-800 ${selectedTemplates.includes(template.id) ? 'bg-primary-orange/10' : ''}`}>
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
                                className="w-4 h-4 text-primary-orange bg-gray-900 border-gray-700 rounded focus:ring-primary-orange"
                              />
                            </td>
                            <td className="px-6 py-4 text-white font-medium">{template.requirement}</td>
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
                                    <span className="text-gray-400 text-xs">+{template.required_documents.length - 2}</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-gray-500 text-sm">-</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-gray-300 text-sm">
                              {template.entity_types && template.entity_types.length > 0 ? (
                                <>
                              {template.entity_types.slice(0, 2).join(', ')}
                              {template.entity_types.length > 2 && ` +${template.entity_types.length - 2}`}
                                </>
                              ) : (
                                <span className="text-gray-500">All entities</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-gray-300 text-sm">
                              {template.industries && template.industries.length > 0 ? (
                                <>
                              {template.industries.slice(0, 2).join(', ')}
                              {template.industries.length > 2 && ` +${template.industries.length - 2}`}
                                </>
                              ) : (
                                <span className="text-gray-500">All industries</span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-gray-300 text-center">{template.matching_companies_count || 0}</td>
                            <td className="px-6 py-4">
                              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                template.is_active 
                                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                  : 'bg-gray-800 text-gray-400 border border-gray-700'
                              }`}>
                                {template.is_active ? 'Active' : 'Inactive'}
                              </span>
                            </td>
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setEditingTemplate(template)
                                    setTemplateForm({
                                      category: template.category,
                                      requirement: template.requirement,
                                      description: template.description || '',
                                      compliance_type: template.compliance_type,
                                      entity_types: template.entity_types,
                                      industries: template.industries,
                                      industry_categories: template.industry_categories,
                                      penalty: template.penalty || '',
                                      is_critical: template.is_critical,
                                      financial_year: template.financial_year || '',
                                      due_date_offset: template.due_date_offset || undefined,
                                      due_month: template.due_month || undefined,
                                      due_day: template.due_day || undefined,
                                      due_date: template.due_date || '',
                                      is_active: template.is_active,
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
                                    if (!confirm('Re-apply this template to matching companies? This will create/update requirements.')) return
                                    const result = await updateComplianceTemplate(template.id, {})
                                    if (result.success) {
                                      await loadTemplates()
                                      alert(`Template re-applied successfully. Created/updated ${result.applied_count || 0} compliance requirements.`)
                                    } else {
                                      alert(`Failed to re-apply: ${result.error}`)
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
                                    if (!confirm('Are you sure you want to delete this template? This will also delete all associated compliance requirements.')) return
                                    const result = await deleteComplianceTemplate(template.id, true)
                                    if (result.success) {
                                      await loadTemplates()
                                      alert('Template deleted successfully')
                                    } else {
                                      alert(`Failed to delete: ${result.error}`)
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

        {activeTab === 'users' && (
          <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-6">
            <h2 className="text-2xl font-light text-white mb-4">User Management</h2>
            <p className="text-gray-400">User management features coming soon...</p>
          </div>
        )}

        {activeTab === 'financials' && (
          <div className="space-y-6">
            {/* Cost Breakdown */}
            <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-6">
              <h2 className="text-2xl font-light text-white mb-6">Cost Structure</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-300 mb-4">Operational Costs</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-400">
                      <span>APIs</span>
                      <span>{formatCurrency(FIXED_COSTS.apis)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Salaries (Current Team)</span>
                      <span>{formatCurrency(FIXED_COSTS.salaries)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>New Hires (5 × ₹20k/month)</span>
                      <span>{formatCurrency(FIXED_COSTS.newHires)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Subscriptions</span>
                      <span>{formatCurrency(FIXED_COSTS.subscriptions)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Workplace</span>
                      <span>{formatCurrency(FIXED_COSTS.workplace)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-300 mb-4">Marketing & Sales</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-400">
                      <span>Marketing</span>
                      <span>{formatCurrency(FIXED_COSTS.marketing)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Branding</span>
                      <span>{formatCurrency(FIXED_COSTS.branding)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Outreach Programs</span>
                      <span>{formatCurrency(FIXED_COSTS.outreachPrograms)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Printing Costs</span>
                      <span>{formatCurrency(FIXED_COSTS.printingCosts)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Travelling Costs</span>
                      <span>{formatCurrency(FIXED_COSTS.travellingCosts)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Gifts</span>
                      <span>{formatCurrency(FIXED_COSTS.gifts)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-300 mb-4">Operations & Admin</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between text-gray-400">
                      <span>Staff Welfare</span>
                      <span>{formatCurrency(FIXED_COSTS.staffWelfare)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Office Expenses</span>
                      <span>{formatCurrency(FIXED_COSTS.officeExpenses)}</span>
                    </div>
                    <div className="flex justify-between text-gray-400">
                      <span>Misc Expenses</span>
                      <span>{formatCurrency(FIXED_COSTS.miscExpenses)}</span>
                    </div>
                  </div>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-300 mb-4">Summary</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center pt-2 border-t border-gray-700">
                      <span className="text-white font-medium">Total Annual Fixed Costs</span>
                      <span className="text-xl font-bold text-primary-orange">{formatCurrency(FIXED_COSTS.total)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-400">CapEx (Year 1 Only)</span>
                      <span className="text-white font-medium">{formatCurrency(CAPEX_YEAR_1)}</span>
                    </div>
                    <div className="flex justify-between items-center pt-2 border-t border-gray-700">
                      <span className="text-white font-medium">Year 1 Total Costs</span>
                      <span className="text-xl font-bold text-red-400">{formatCurrency(FIXED_COSTS.total + CAPEX_YEAR_1)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Break-Even Analysis */}
            <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-6">
              <h2 className="text-2xl font-light text-white mb-6">Break-Even Analysis (3-4 Year Timeline)</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-300 mb-4">Year 1 (with CapEx)</h3>
                  {(() => {
                    const year1Analysis = calculateBreakEven(60000, FIXED_COSTS.total, CAPEX_YEAR_1)
                    return (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between text-gray-400">
                          <span>Fixed Costs</span>
                          <span>{formatCurrency(year1Analysis.fixedCosts)}</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span>CapEx</span>
                          <span>{formatCurrency(CAPEX_YEAR_1)}</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span>Required Revenue</span>
                          <span className="text-white font-medium">{formatCurrency(year1Analysis.requiredRevenue)}</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span>Break-Even Customers</span>
                          <span className="text-primary-orange font-medium">{year1Analysis.breakEvenCustomers}</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span>Contribution Margin</span>
                          <span>{formatPercent(year1Analysis.contributionMargin)}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
                <div>
                  <h3 className="text-lg font-medium text-gray-300 mb-4">Year 2+ (without CapEx)</h3>
                  {(() => {
                    const year2Analysis = calculateBreakEven(60000, FIXED_COSTS.total, 0)
                    return (
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between text-gray-400">
                          <span>Fixed Costs</span>
                          <span>{formatCurrency(year2Analysis.fixedCosts)}</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span>Required Revenue</span>
                          <span className="text-white font-medium">{formatCurrency(year2Analysis.requiredRevenue)}</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
                          <span>Break-Even Customers</span>
                          <span className="text-primary-orange font-medium">{year2Analysis.breakEvenCustomers}</span>
                        </div>
                        <div className="flex justify-between text-gray-400">
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
            <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-6">
              <h2 className="text-2xl font-light text-white mb-6">Financial Metrics</h2>
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
                      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                        <div className="text-xs text-gray-400 mb-1">MRR</div>
                        <div className="text-2xl font-bold text-white">{formatCurrency(metrics.mrr)}</div>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                        <div className="text-xs text-gray-400 mb-1">ARR</div>
                        <div className="text-2xl font-bold text-white">{formatCurrency(metrics.arr)}</div>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                        <div className="text-xs text-gray-400 mb-1">CAC</div>
                        <div className="text-2xl font-bold text-primary-orange">{formatCurrency(metrics.cac)}</div>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                        <div className="text-xs text-gray-400 mb-1">LTV</div>
                        <div className="text-2xl font-bold text-green-400">{formatCurrency(metrics.ltv)}</div>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                        <div className="text-xs text-gray-400 mb-1">LTV:CAC Ratio</div>
                        <div className="text-2xl font-bold text-white">{metrics.ltvCacRatio}x</div>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                        <div className="text-xs text-gray-400 mb-1">CAC Payback</div>
                        <div className="text-2xl font-bold text-white">{metrics.cacPaybackMonths} months</div>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                        <div className="text-xs text-gray-400 mb-1">Churn Rate</div>
                        <div className="text-2xl font-bold text-yellow-400">{formatPercent(metrics.churnRate)}</div>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700">
                        <div className="text-xs text-gray-400 mb-1">Contribution Margin</div>
                        <div className="text-2xl font-bold text-green-400">{formatPercent(metrics.contributionMargin)}</div>
                      </div>
                    </>
                  )
                })()}
              </div>
              <p className="text-xs text-gray-500 mt-4">
                * Metrics calculated with example customer mix: 20 Starter, 15 Professional, 8 Enterprise (annual plans)
              </p>
            </div>

            {/* Profitability Projection */}
            <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-6">
              <h2 className="text-2xl font-light text-white mb-6">Profitability Projection</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-900 border-b border-gray-800">
                    <tr>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Year</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Revenue</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Variable Costs</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Gross Profit</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Fixed Costs</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">CapEx</th>
                      <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Net Profit/Loss</th>
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
                        <tr key={scenario.year} className="hover:bg-gray-900/50 transition-colors border-t border-gray-800">
                          <td className="px-6 py-4 text-white font-medium">Year {scenario.year}</td>
                          <td className="px-6 py-4 text-gray-300">{formatCurrency(profitability.revenue)}</td>
                          <td className="px-6 py-4 text-gray-300">{formatCurrency(profitability.variableCosts)}</td>
                          <td className="px-6 py-4 text-green-400">{formatCurrency(profitability.grossProfit)}</td>
                          <td className="px-6 py-4 text-gray-300">{formatCurrency(profitability.fixedCosts)}</td>
                          <td className="px-6 py-4 text-gray-300">{scenario.year === 1 ? formatCurrency(CAPEX_YEAR_1) : '-'}</td>
                          <td className={`px-6 py-4 font-medium ${profitability.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {formatCurrency(profitability.netProfit)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-500 mt-4">
                * Projections based on moderate growth scenario with current pricing
              </p>
            </div>
          </div>
        )}

        {/* Template Form Modal */}
        {isTemplateModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-800">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-light text-white">
                    {editingTemplate ? 'Edit Compliance Template' : 'Create Compliance Template'}
                  </h3>
                  <button
                    onClick={() => {
                      setIsTemplateModalOpen(false)
                      setEditingTemplate(null)
                      setTemplateForm({
                        category: '',
                        requirement: '',
                        description: '',
                        compliance_type: 'one-time',
                        entity_types: [],
                        industries: [],
                        industry_categories: [],
                        penalty: '',
                        is_critical: false,
                        financial_year: '',
                        due_date_offset: undefined,
                        due_month: undefined,
                        due_day: undefined,
                        due_date: '',
                        is_active: true,
                        required_documents: [],
                        possible_legal_action: '',
                        required_documents_input: ''
                      })
                    }}
                    className="text-gray-400 hover:text-white transition-colors"
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
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Category *
                  </label>
                  <select
                    value={templateForm.category}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, category: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                  >
                    <option value="">Select Category</option>
                    <option value="Income Tax">Income Tax</option>
                    <option value="GST">GST</option>
                    <option value="Payroll">Payroll</option>
                    <option value="RoC">RoC</option>
                    <option value="Renewals">Renewals</option>
                    <option value="Others">Others</option>
                  </select>
                </div>

                {/* Requirement Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Requirement *
                  </label>
                  <input
                    type="text"
                    value={templateForm.requirement}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, requirement: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                    placeholder="e.g., TDS Payment - Monthly"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description
                  </label>
                  <textarea
                    value={templateForm.description}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, description: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                    rows={3}
                    placeholder="Brief description of the requirement"
                  />
                </div>

                {/* Compliance Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Compliance Type *
                  </label>
                  <select
                    value={templateForm.compliance_type}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, compliance_type: e.target.value as any }))}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                  >
                    <option value="one-time">One-time</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                    <option value="annual">Annual</option>
                  </select>
                </div>

                {/* Entity Types - Multi-select */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Entity Types * (Select at least one)
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {['Private Limited', 'Public Limited', 'LLP', 'NGO / Section 8', 'Other'].map((type) => (
                      <label key={type} className="flex items-center gap-2 p-3 bg-gray-900 border border-gray-700 rounded-lg hover:border-primary-orange/50 transition-colors cursor-pointer">
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
                          className="w-4 h-4 text-primary-orange bg-gray-900 border-gray-700 rounded focus:ring-primary-orange"
                        />
                        <span className="text-white text-sm">{type}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Industries - Multi-select */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-300">
                      Industries * (Select at least one)
                    </label>
                    <label className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg hover:border-primary-orange/50 transition-colors cursor-pointer">
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
                        className="w-4 h-4 text-primary-orange bg-gray-900 border-gray-700 rounded focus:ring-primary-orange"
                      />
                      <span className="text-white text-sm font-medium">Select All</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
                    {['IT & Technology Services', 'Healthcare', 'Education', 'Finance', 'Food Manufacturing', 'Food & Hospitality', 'Construction', 'Real Estate', 'Manufacturing', 'Retail & Trading', 'Professional Services', 'Ecommerce', 'Other'].map((industry) => (
                      <label key={industry} className="flex items-center gap-2 p-3 bg-gray-900 border border-gray-700 rounded-lg hover:border-primary-orange/50 transition-colors cursor-pointer">
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
                          className="w-4 h-4 text-primary-orange bg-gray-900 border-gray-700 rounded focus:ring-primary-orange"
                        />
                        <span className="text-white text-sm">{industry}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Industry Categories - Multi-select */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-300">
                      Industry Categories * (Select at least one)
                    </label>
                    <label className="flex items-center gap-2 px-3 py-1.5 bg-gray-900 border border-gray-700 rounded-lg hover:border-primary-orange/50 transition-colors cursor-pointer">
                      <input
                        type="checkbox"
                        checked={['Startups & MSMEs', 'Large Enterprises', 'NGOs & Section 8 Companies', 'Healthcare & Education', 'Real Estate & Construction', 'IT & Technology Services', 'Retail & Manufacturing', 'Ecommerce & D2C', 'Other'].every(category => templateForm.industry_categories.includes(category))}
                        onChange={(e) => {
                          const allCategories = ['Startups & MSMEs', 'Large Enterprises', 'NGOs & Section 8 Companies', 'Healthcare & Education', 'Real Estate & Construction', 'IT & Technology Services', 'Retail & Manufacturing', 'Ecommerce & D2C', 'Other']
                          if (e.target.checked) {
                            setTemplateForm(prev => ({ ...prev, industry_categories: allCategories }))
                          } else {
                            setTemplateForm(prev => ({ ...prev, industry_categories: [] }))
                          }
                        }}
                        className="w-4 h-4 text-primary-orange bg-gray-900 border-gray-700 rounded focus:ring-primary-orange"
                      />
                      <span className="text-white text-sm font-medium">Select All</span>
                    </label>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {['Startups & MSMEs', 'Large Enterprises', 'NGOs & Section 8 Companies', 'Healthcare & Education', 'Real Estate & Construction', 'IT & Technology Services', 'Retail & Manufacturing', 'Ecommerce & D2C', 'Other'].map((category) => (
                      <label key={category} className="flex items-center gap-2 p-3 bg-gray-900 border border-gray-700 rounded-lg hover:border-primary-orange/50 transition-colors cursor-pointer">
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
                          className="w-4 h-4 text-primary-orange bg-gray-900 border-gray-700 rounded focus:ring-primary-orange"
                        />
                        <span className="text-white text-sm">{category}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Due Date Fields - Conditional based on compliance type */}
                {templateForm.compliance_type === 'one-time' && (
                  <>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Due Date *
                      </label>
                      <input
                        type="date"
                        value={templateForm.due_date}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, due_date: e.target.value }))}
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Financial Year (Optional)
                      </label>
                      <input
                        type="text"
                        value={templateForm.financial_year}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, financial_year: e.target.value }))}
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                        placeholder="e.g., FY 2025-26"
                      />
                    </div>
                  </>
                )}

                {templateForm.compliance_type === 'monthly' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Due Date Offset * (Day of month, e.g., 15 for 15th of each month)
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={templateForm.due_date_offset || ''}
                      onChange={(e) => setTemplateForm(prev => ({ ...prev, due_date_offset: e.target.value ? parseInt(e.target.value) : undefined }))}
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
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
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Month in Quarter * (1st, 2nd, or 3rd)
                        </label>
                        <select
                          value={templateForm.due_month || ''}
                          onChange={(e) => {
                            const monthInQuarter = e.target.value ? parseInt(e.target.value) : undefined
                            setTemplateForm(prev => ({ ...prev, due_month: monthInQuarter }))
                          }}
                          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                        >
                          <option value="">Select Month</option>
                          <option value="1">1st Month of Quarter</option>
                          <option value="2">2nd Month of Quarter</option>
                          <option value="3">3rd Month of Quarter</option>
                        </select>
                        <p className="text-xs text-gray-400 mt-1">
                          Which month within each quarter (Q1: Jan, Q2: Apr, Q3: Jul, Q4: Oct)
                        </p>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Day of Month * (1-31)
                        </label>
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={templateForm.due_day || ''}
                          onChange={(e) => setTemplateForm(prev => ({ ...prev, due_day: e.target.value ? parseInt(e.target.value) : undefined }))}
                          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                          placeholder="15"
                        />
                        <p className="text-xs text-gray-400 mt-1">
                          The day of the selected month
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {templateForm.compliance_type === 'annual' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Due Month * (1-12)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        value={templateForm.due_month || ''}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, due_month: e.target.value ? parseInt(e.target.value) : undefined }))}
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                        placeholder="3"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Due Day * (1-31)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={templateForm.due_day || ''}
                        onChange={(e) => setTemplateForm(prev => ({ ...prev, due_day: e.target.value ? parseInt(e.target.value) : undefined }))}
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                        placeholder="31"
                      />
                    </div>
                  </div>
                )}

                {/* Penalty */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Penalty
                  </label>
                  <input
                    type="text"
                    value={templateForm.penalty}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, penalty: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                    placeholder="e.g., Late fee ₹200/day"
                  />
                </div>

                {/* Possible Legal Action */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Possible Legal Action
                  </label>
                  <input
                    type="text"
                    value={templateForm.possible_legal_action}
                    onChange={(e) => setTemplateForm(prev => ({ ...prev, possible_legal_action: e.target.value }))}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                    placeholder="e.g., Prosecution under Section 276B"
                  />
                </div>

                {/* Required Documents */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
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
                      className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
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
                      className="px-4 py-2 bg-primary-orange text-white rounded-lg hover:bg-orange-600 transition-colors"
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
                    className="w-4 h-4 text-primary-orange bg-gray-900 border-gray-700 rounded focus:ring-primary-orange"
                  />
                  <label htmlFor="is_critical_template" className="text-sm font-medium text-gray-300">
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
                      className="w-4 h-4 text-primary-orange bg-gray-900 border-gray-700 rounded focus:ring-primary-orange"
                    />
                    <label htmlFor="is_active_template" className="text-sm font-medium text-gray-300">
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
                        alert('Please fill all required fields')
                        return
                      }
                      if (templateForm.entity_types.length === 0) {
                        alert('Please select at least one entity type')
                        return
                      }
                      if (templateForm.industries.length === 0) {
                        alert('Please select at least one industry')
                        return
                      }
                      if (templateForm.industry_categories.length === 0) {
                        alert('Please select at least one industry category')
                        return
                      }
                      if (templateForm.compliance_type === 'one-time' && !templateForm.due_date) {
                        alert('Due date is required for one-time compliances')
                        return
                      }
                      if (templateForm.compliance_type === 'monthly' && templateForm.due_date_offset === undefined) {
                        alert('Due date offset is required for monthly compliances')
                        return
                      }
                      if (templateForm.compliance_type === 'quarterly' && (templateForm.due_month === undefined || templateForm.due_day === undefined)) {
                        alert('Month in quarter and day are required for quarterly compliances')
                        return
                      }
                      if (templateForm.compliance_type === 'annual' && (templateForm.due_month === undefined || templateForm.due_day === undefined)) {
                        alert('Due month and day are required for annual compliances')
                        return
                      }

                      try {
                        let result
                        if (editingTemplate) {
                          result = await updateComplianceTemplate(editingTemplate.id, templateForm)
                        } else {
                          result = await createComplianceTemplate(templateForm)
                        }

                        if (result.success) {
                          await loadTemplates()
                          setIsTemplateModalOpen(false)
                          setEditingTemplate(null)
                          setTemplateForm({
                            category: '',
                            requirement: '',
                            description: '',
                            compliance_type: 'one-time',
                            entity_types: [],
                            industries: [],
                            industry_categories: [],
                            penalty: '',
                            is_critical: false,
                            financial_year: '',
                            due_date_offset: undefined,
                            due_month: undefined,
                            due_day: undefined,
                            due_date: '',
                            is_active: true,
                            required_documents: [],
                            possible_legal_action: '',
                            required_documents_input: ''
                          })
                          alert(editingTemplate 
                            ? `Template updated successfully. Applied to ${result.applied_count || 0} companies.`
                            : `Template created successfully. Applied to ${result.applied_count || 0} companies.`
                          )
                        } else {
                          alert(`Failed: ${result.error}`)
                        }
                      } catch (error: any) {
                        console.error('Error saving template:', error)
                        alert(`Error: ${error.message}`)
                      }
                    }}
                    className="flex-1 bg-primary-orange text-white px-6 py-3 rounded-lg hover:bg-primary-orange/90 transition-colors font-medium"
                  >
                    {editingTemplate ? 'Update Template' : 'Create Template'}
                  </button>
                  <button
                    onClick={() => {
                      setIsTemplateModalOpen(false)
                      setEditingTemplate(null)
                      setTemplateForm({
                        category: '',
                        requirement: '',
                        description: '',
                        compliance_type: 'one-time',
                        entity_types: [],
                        industries: [],
                        industry_categories: [],
                        penalty: '',
                        is_critical: false,
                        financial_year: '',
                        due_date_offset: undefined,
                        due_month: undefined,
                        due_day: undefined,
                        due_date: '',
                        is_active: true,
                        required_documents: [],
                        possible_legal_action: '',
                        required_documents_input: ''
                      })
                    }}
                    className="px-6 py-3 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
