'use client'

import React, { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/client'
import {
  uploadDocument,
  getCompanyDocuments,
  getDocumentTemplates,
  getDownloadUrl,
  deleteDocument,
  uploadFileToStorage
} from '@/app/data-room/document-actions'
import {
  sendDocumentsEmail,
  hideDocumentTemplateForCompany,
  getHiddenDocumentTemplates
} from '@/app/data-room/actions'
import { trackVaultFileExport, trackVaultFileUpload, trackDocumentUpload } from '@/lib/tracking/kpi-tracker'
import { showToast } from '@/components/ui/Toast'
import AgentAssistedUploadModal from './AgentAssistedUploadModal'
import AgentAssistedBulkUploadModal from './AgentAssistedBulkUploadModal'

import CIAOverviewSection from './cia/CIAOverviewSection'
import CIAFullscreen from './cia/CIAFullscreen'
import VaultTreeView from './vault/VaultTreeView'

// Interface for version groups
interface VersionGroup {
  documentType: string
  latestVersion: any
  yearlyVersions: Map<string, any[]> // Key: financial year, Value: array of versions
  totalVersions: number
  folderName: string
}

interface DocumentsTabProps {
  // State from parent
  vaultDocuments: any[]
  setVaultDocuments: (docs: any[]) => void
  isLoadingVaultDocuments: boolean
  setIsLoadingVaultDocuments: (loading: boolean) => void
  documentTemplates: any[]
  setDocumentTemplates: (templates: any[]) => void
  hiddenTemplates: Set<string>
  setHiddenTemplates: (updater: (prev: Set<string>) => Set<string>) => void
  
  // Computed values from parent
  documentFolders: string[]
  predefinedDocuments: Record<string, string[]>
  
  // Functions from parent
  fetchVaultDocuments: () => Promise<void>
  
  // Props from parent
  currentCompany: any
  canEdit: boolean
  canManage: boolean
  user: any
  financialYears: string[]
  countryCode: string
  countryConfig: any
  
  // Helper functions from parent (will be moved to component)
  normalizeDate: (dateStr: string | Date | null | undefined) => Date | null
  formatDateForDisplay: (dateStr: string) => string
  formatDateForStorage: (dateStr: string | Date | null) => string | null
  getFormFrequency: (requirement: string) => string | null
  getRelevantLegalSections: (requirement: string, category: string) => Array<{
    act: string
    section: string
    description: string
    relevance: string
  }>
  getAuthorityForCategory: (category: string) => string | null
  
  // Document upload modal props from tracker
  documentUploadModal?: {
    isOpen: boolean
    requirementId: string
    requirement: string
    category: string
    documentName: string
    complianceType: string
    dueDate: string
    financialYear: string | null
    allRequiredDocs: string[]
  } | null
  uploadingDocument?: boolean
  setUploadingDocument?: (uploading: boolean) => void
  uploadFile?: File | null
  setUploadFile?: (file: File | null) => void
  uploadProgress?: number
  setUploadProgress?: (progress: number) => void
  uploadStage?: string
  setUploadStage?: (stage: string) => void
  previewFileUrl?: string | null
  setPreviewFileUrl?: (url: string | null) => void
  showToast?: (message: string, type: 'success' | 'error' | 'warning' | 'info') => void
  handleTrackerDocumentUpload?: () => Promise<void>
  setDocumentUploadModal?: (modal: any) => void
}

export default function DocumentsTab({
  vaultDocuments,
  setVaultDocuments,
  isLoadingVaultDocuments,
  setIsLoadingVaultDocuments,
  documentTemplates,
  setDocumentTemplates,
  hiddenTemplates,
  setHiddenTemplates,
  documentFolders,
  predefinedDocuments,
  fetchVaultDocuments,
  currentCompany,
  canEdit,
  canManage,
  user,
  financialYears,
  countryCode,
  countryConfig,
  normalizeDate,
  formatDateForDisplay,
  formatDateForStorage,
  getFormFrequency,
  getRelevantLegalSections,
  getAuthorityForCategory,
  documentUploadModal,
  uploadingDocument = false,
  setUploadingDocument,
  uploadFile,
  setUploadFile,
  uploadProgress = 0,
  setUploadProgress,
  uploadStage = '',
  setUploadStage,
  previewFileUrl,
  setPreviewFileUrl,
  showToast,
  handleTrackerDocumentUpload,
  setDocumentUploadModal,
}: DocumentsTabProps) {
  const router = useRouter()
  const supabase = createClient()

  // Local state for filters/search (not shared with other tabs)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedFY, setSelectedFY] = useState<string>('')
  const [sortOption, setSortOption] = useState<'name-asc' | 'name-desc' | 'date-newest' | 'date-oldest' | 'expiry' | 'folder'>('date-newest')
  const [expiringSoonFilter, setExpiringSoonFilter] = useState<'all' | 'expiring' | 'expired'>('all')
  const [isCIAOpen, setIsCIAOpen] = useState(false)
  const [ciaInitialQuestion, setCIAInitialQuestion] = useState<string | undefined>(undefined)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [expandedDocumentVersions, setExpandedDocumentVersions] = useState<Set<string>>(new Set())
  const [expandedYearGroups, setExpandedYearGroups] = useState<Record<string, Set<string>>>({})
  
  // Modal states
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isSendModalOpen, setIsSendModalOpen] = useState(false)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [isAgentUploadOpen, setIsAgentUploadOpen] = useState(false)
  const [isAgentBulkOpen, setIsAgentBulkOpen] = useState(false)
  const [agentUploadDefaultFolderId, setAgentUploadDefaultFolderId] = useState<string | null>(null)
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false)
  const [isEmailTemplateOpen, setIsEmailTemplateOpen] = useState(false)
  const [isAdvancedOptionsOpen, setIsAdvancedOptionsOpen] = useState(false)
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false)
  const [showComplianceContext, setShowComplianceContext] = useState(true)
  const [previewDocument, setPreviewDocument] = useState<any | null>(null)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [previewModalTab, setPreviewModalTab] = useState<'preview' | 'compliance'>('preview')
  const [isStorageBreakdownOpen, setIsStorageBreakdownOpen] = useState(false)
  
  // Selection states
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set())
  const [selectedDocumentsToSend, setSelectedDocumentsToSend] = useState<Set<string>>(new Set())
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [emailData, setEmailData] = useState({
    recipients: '',
    subject: '',
    body: '',
    includeLinks: true,
    includeAttachments: false,
  })
  
  // Upload states
  const [uploadFormData, setUploadFormData] = useState({
    folder: '',
    documentName: '',
    registrationDate: '',
    expiryDate: '',
    hasNote: false,
    externalEmail: '',
    externalPassword: '',
    frequency: 'annually' as 'one-time' | 'monthly' | 'quarterly' | 'annually',
    file: null as File | null,
    periodType: '',
    periodFinancialYear: '',
    periodKey: '',
    requirementId: '',
  })
  const [isUploading, setIsUploading] = useState(false)
  
  // Bulk upload states
  const [bulkUploadFiles, setBulkUploadFiles] = useState<File[]>([])
  const [bulkUploadProgress, setBulkUploadProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 })
  const [bulkUploadFileOptions, setBulkUploadFileOptions] = useState<Record<string, {
    folder: string
    documentName: string
    registrationDate: string
    expiryDate: string
    hasNote: boolean
    externalEmail: string
    externalPassword?: string
    frequency: 'one-time' | 'monthly' | 'quarterly' | 'annually'
    periodType?: string
    periodFinancialYear?: string
    periodKey?: string
    requirementId?: string
  }>>({})
  const [expandedBulkFileOptions, setExpandedBulkFileOptions] = useState<Set<string>>(new Set())
  const [openDocumentNameDropdown, setOpenDocumentNameDropdown] = useState<string | null>(null)

  // Helper function to get file type icon
  const getFileTypeIcon = (fileName: string) => {
    const ext = fileName?.split('.').pop()?.toLowerCase() || ''
    switch (ext) {
      case 'pdf':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
          </svg>
        )
      case 'doc':
      case 'docx':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
          </svg>
        )
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8.5,13.5L11,16.5L14.5,12L19,18H5M21,19V5C21,3.89 20.1,3 19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19Z" />
          </svg>
        )
      default:
        return (
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z" />
          </svg>
        )
    }
  }

  const getFinancialYear = (dateStr: string) => {
    if (!dateStr) return null
    const date = new Date(dateStr)
    const month = date.getMonth() // 0-11
    const year = date.getFullYear()

    // In India, FY starts in April (month 3)
    if (month >= 3) {
      return `FY ${year}-${(year + 1).toString().slice(-2)}`
    } else {
      return `FY ${year - 1}-${year.toString().slice(-2)}`
    }
  }

  // Helper function to format period information for display
  const formatPeriodInfo = (doc: any): string | null => {
    if (!doc.period_key && !doc.period_financial_year) return null

    if (doc.period_type === 'monthly' && doc.period_key) {
      // Format: "2025-03" -> "March 2025"
      const [year, month] = doc.period_key.split('-')
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December']
      const monthName = monthNames[parseInt(month) - 1]
      return `${monthName} ${year}`
    } else if (doc.period_type === 'quarterly' && doc.period_key) {
      // Format: "Q1-2025" -> "Q1 2025"
      return doc.period_key.replace('-', ' ')
    } else if (doc.period_type === 'annual' && doc.period_financial_year) {
      // Format: "FY 2024-25"
      return doc.period_financial_year
    } else if (doc.period_financial_year) {
      return doc.period_financial_year
    }

    return null
  }

  // Helper function to get period badge color
  const getPeriodBadgeColor = (periodType: string | null): string => {
    if (!periodType) return 'bg-gray-700'
    // Color coding aligned with compliance types:
    // one-time (purple, no recurring), annual (green, recurs annually)
    switch (periodType) {
      case 'one-time': return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      case 'annual': return 'bg-green-500/20 text-green-400 border-green-500/30'
      case 'monthly': return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'quarterly': return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
      default: return 'bg-gray-700'
    }
  }

  // Helper function to extract financial year from document
  const getFinancialYearFromDoc = (doc: any): string | null => {
    // Prefer period_financial_year if available
    if (doc.period_financial_year) {
      return doc.period_financial_year
    }
    // Fallback to created_at
    if (doc.created_at) {
      return getFinancialYear(doc.created_at)
    }
    // Fallback to registration_date
    if (doc.registration_date) {
      return getFinancialYear(doc.registration_date)
    }
    return null
  }

  // Helper function to format relative time
  const formatRelativeTime = (dateStr: string): string => {
    if (!dateStr) return 'Unknown'
    const date = new Date(dateStr)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffMonths = Math.floor(diffDays / 30)
    const diffYears = Math.floor(diffDays / 365)

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays} days ago`
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`
    if (diffMonths < 12) return `${diffMonths} months ago`
    return `${diffYears} years ago`
  }

  // Helper function to format file size
  const formatFileSize = (bytes: number | null | undefined): string => {
    if (!bytes) return 'Unknown size'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  // Function to group documents by type, then by financial year
  const groupDocumentsByVersion = (documents: any[]): VersionGroup[] => {
    const groups = new Map<string, VersionGroup>()

    documents.forEach(doc => {
      const docType = doc.document_type
      if (!docType) return

      // Get or create group for this document type
      if (!groups.has(docType)) {
        groups.set(docType, {
          documentType: docType,
          latestVersion: doc,
          yearlyVersions: new Map(),
          totalVersions: 0,
          folderName: doc.folder_name || ''
        })
      }

      const group = groups.get(docType)!
      group.totalVersions++

      // Get financial year for this document
      const fy = getFinancialYearFromDoc(doc)
      if (fy) {
        if (!group.yearlyVersions.has(fy)) {
          group.yearlyVersions.set(fy, [])
        }
        group.yearlyVersions.get(fy)!.push(doc)
      } else {
        // If no FY, put in "Other" category
        if (!group.yearlyVersions.has('Other')) {
          group.yearlyVersions.set('Other', [])
        }
        group.yearlyVersions.get('Other')!.push(doc)
      }

      // Update latest version if this is newer
      const docDate = doc.created_at || doc.period_key || ''
      const latestDate = group.latestVersion.created_at || group.latestVersion.period_key || ''
      if (docDate > latestDate) {
        group.latestVersion = doc
      }
    })

    // Sort versions within each year (newest first)
    groups.forEach(group => {
      group.yearlyVersions.forEach((versions, fy) => {
        versions.sort((a, b) => {
          const dateA = a.created_at || a.period_key || ''
          const dateB = b.created_at || b.period_key || ''
          if (!dateA && !dateB) return 0
          if (!dateA) return 1
          if (!dateB) return -1
          return dateB.localeCompare(dateA)
        })
      })
    })

    return Array.from(groups.values())
  }

  // Helper function to check if document matches search query
  const matchesSearch = (doc: any, query: string): boolean => {
    if (!query.trim()) return true
    const lowerQuery = query.toLowerCase()
    const docType = (doc.document_type || '').toLowerCase()
    const folderName = (doc.folder_name || '').toLowerCase()
    const periodInfo = formatPeriodInfo(doc)?.toLowerCase() || ''
    const expiryDate = doc.expiry_date ? formatDateForDisplay(doc.expiry_date).toLowerCase() : ''

    return docType.includes(lowerQuery) ||
      folderName.includes(lowerQuery) ||
      periodInfo.includes(lowerQuery) ||
      expiryDate.includes(lowerQuery)
  }

  // Helper function to get document status (valid, expiring, expired)
  const getDocumentStatus = (doc: any): 'valid' | 'expiring' | 'expired' | 'no-expiry' => {
    if (!doc.expiry_date) return 'no-expiry'
    const expiryDate = new Date(doc.expiry_date)
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntilExpiry < 0) return 'expired'
    if (daysUntilExpiry <= 30) return 'expiring'
    return 'valid'
  }

  // Helper function to get status badge color
  const getStatusBadgeColor = (status: 'valid' | 'expiring' | 'expired' | 'no-expiry'): string => {
    switch (status) {
      case 'valid':
        return 'bg-green-500/20 text-green-400 border-green-500/30'
      case 'expiring':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      case 'expired':
        return 'bg-red-500/20 text-red-400 border-red-500/30'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
  }

  // Helper function to sort documents
  const sortDocuments = (docs: any[], sortBy: typeof sortOption): any[] => {
    const sorted = [...docs]
    switch (sortBy) {
      case 'name-asc':
        return sorted.sort((a, b) => {
          const nameA = (a.document_type || '').toLowerCase()
          const nameB = (b.document_type || '').toLowerCase()
          return nameA.localeCompare(nameB)
        })
      case 'name-desc':
        return sorted.sort((a, b) => {
          const nameA = (a.document_type || '').toLowerCase()
          const nameB = (b.document_type || '').toLowerCase()
          return nameB.localeCompare(nameA)
        })
      case 'date-newest':
        return sorted.sort((a, b) => {
          const dateA = a.period_key || a.created_at || ''
          const dateB = b.period_key || b.created_at || ''
          if (!dateA && !dateB) return 0
          if (!dateA) return 1
          if (!dateB) return -1
          return dateB.localeCompare(dateA)
        })
      case 'date-oldest':
        return sorted.sort((a, b) => {
          const dateA = a.period_key || a.created_at || ''
          const dateB = b.period_key || b.created_at || ''
          if (!dateA && !dateB) return 0
          if (!dateA) return 1
          if (!dateB) return -1
          return dateA.localeCompare(dateB)
        })
      case 'expiry':
        return sorted.sort((a, b) => {
          const expiryA = a.expiry_date || ''
          const expiryB = b.expiry_date || ''
          if (!expiryA && !expiryB) return 0
          if (!expiryA) return 1
          if (!expiryB) return -1
          return expiryA.localeCompare(expiryB)
        })
      case 'folder':
        return sorted.sort((a, b) => {
          const folderA = (a.folder_name || '').toLowerCase()
          const folderB = (b.folder_name || '').toLowerCase()
          return folderA.localeCompare(folderB)
        })
      default:
        return sorted
    }
  }

  // Computed: Filter and sort documents
  const allDocuments = useMemo(() => {
    return (vaultDocuments || [])
      .filter(doc => {
        // If no FY selected, show all documents
        if (!selectedFY) return true

        // Prefer period_financial_year if available (for tracker-uploaded docs)
        if (doc.period_financial_year) {
          return doc.period_financial_year === selectedFY
        }

        // Fallback to registration_date for older documents
        if (doc.registration_date) {
          const docFY = getFinancialYear(doc.registration_date)
          return docFY === selectedFY
        }

        // If no period or registration date, don't show when FY is selected
        return false
      })
      .filter(doc => matchesSearch(doc, searchQuery))
      .filter(doc => {
        if (expiringSoonFilter === 'all') return true
        const status = getDocumentStatus(doc)
        if (expiringSoonFilter === 'expiring') return status === 'expiring'
        if (expiringSoonFilter === 'expired') return status === 'expired'
        return true
      })
      .map(doc => ({
        id: doc.id,
        name: doc.document_type,
        category: doc.folder_name,
        status: 'uploaded',
        period: formatPeriodInfo(doc) || null
      }))
  }, [vaultDocuments, selectedFY, searchQuery, expiringSoonFilter])

  // Handler functions
  const handleView = async (filePath: string) => {
    try {
      const result = await getDownloadUrl(filePath)
      if (result.success && result.url) {
        window.open(result.url, '_blank')
      } else {
        showToast?.('Failed to get document view URL', 'error')
      }
    } catch (err) {
      console.error('View error:', err)
      showToast?.('Error opening document', 'error')
    }
  }

  const handlePreview = async (doc: any) => {
    try {
      console.log('[handlePreview] Attempting to preview document:', doc.file_path)
      const result = await getDownloadUrl(doc.file_path)
      console.log('[handlePreview] getDownloadUrl result:', result)
      if (result.success && result.url) {
        setPreviewDocument({ ...doc, previewUrl: result.url })
        setIsPreviewModalOpen(true)
      } else {
        console.error('[handlePreview] Failed to get preview URL:', result.error)
        showToast?.(`Failed to get document preview URL: ${result.error || 'Unknown error'}`, 'error')
      }
    } catch (err) {
      console.error('[handlePreview] Preview error:', err)
      showToast?.(`Error loading document preview: ${err instanceof Error ? err.message : 'Unknown error'}`, 'error')
    }
  }

  const handleExport = async (filePath: string, fileName: string) => {
    try {
      const result = await getDownloadUrl(filePath)
      if (result.success && result.url) {
        const link = document.createElement('a')
        link.href = result.url
        link.download = fileName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)

        // Track vault file export
        if (user?.id && currentCompany?.id) {
          trackVaultFileExport(user.id, currentCompany.id, 1)
        }
        showToast?.('Document downloaded successfully', 'success')
      } else {
        showToast?.('Failed to download document', 'error')
      }
    } catch (err) {
      console.error('Export error:', err)
      showToast?.('Error downloading document', 'error')
    }
  }

  const handleRemove = async (docId: string, filePath: string) => {
    if (!confirm('Are you sure you want to remove this document? This action cannot be undone.')) return

    try {
      const result = await deleteDocument(docId, filePath)
      if (result.success) {
        await fetchVaultDocuments()
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vault:data-changed'))
        showToast?.('Document removed successfully', 'success')
      } else {
        showToast?.('Failed to remove document: ' + result.error, 'error')
      }
    } catch (err) {
      console.error('Remove error:', err)
      showToast?.('Error removing document', 'error')
    }
  }

  const handleUpload = async () => {
    if (!uploadFormData.file || !uploadFormData.folder || !uploadFormData.documentName || !currentCompany) {
      showToast?.('Please fill all required fields and select a file.', 'warning')
      return
    }

    setIsUploading(true)
    try {
      const fileExt = uploadFormData.file.name.split('.').pop()
      const fileName = `${uploadFormData.documentName.replace(/\s+/g, '_')}_${Date.now()}.${fileExt}`
      const filePath = `${user?.id}/${currentCompany.id}/${fileName}`

      // 1. Upload to Storage via server action (works for both Supabase and Passport users)
      const fileArrayBuffer = await uploadFormData.file.arrayBuffer()
      const uploadResult = await uploadFileToStorage(filePath, fileArrayBuffer, uploadFormData.file.type)

      if (!uploadResult.success) {
        throw new Error(uploadResult.error || 'Upload failed')
      }

      // 2. Save metadata via Server Action
      const result = await uploadDocument(currentCompany.id, {
        folderName: uploadFormData.folder,
        documentName: uploadFormData.documentName,
        registrationDate: uploadFormData.registrationDate,
        expiryDate: uploadFormData.expiryDate,
        isPortalRequired: uploadFormData.hasNote,
        portalEmail: uploadFormData.externalEmail,
        portalPassword: uploadFormData.externalPassword,
        frequency: uploadFormData.frequency,
        filePath: filePath,
        fileName: uploadFormData.file.name,
        // Period metadata for tracker integration
        periodType: (uploadFormData.periodType as 'one-time' | 'monthly' | 'quarterly' | 'annual' | undefined) || undefined,
        periodFinancialYear: uploadFormData.periodFinancialYear || undefined,
        periodKey: uploadFormData.periodKey || undefined,
        requirementId: uploadFormData.requirementId || undefined,
      })

      if (result.success) {
        // Track document upload (vault)
        if (user?.id && currentCompany?.id) {
          await trackDocumentUpload(user.id, currentCompany.id, uploadFormData.documentName).catch(err => {
            console.error('Failed to track document upload:', err)
          })
          // Also track as vault file upload
          await trackVaultFileUpload(user.id, currentCompany.id, uploadFormData.file?.type || 'unknown').catch(err => {
            console.error('Failed to track vault file upload:', err)
          })
        }

        setIsUploadModalOpen(false)
        setUploadFormData({
          folder: '',
          documentName: '',
          registrationDate: '',
          expiryDate: '',
          hasNote: false,
          externalEmail: '',
          externalPassword: '',
          frequency: 'annually',
          file: null,
          periodType: '',
          periodFinancialYear: '',
          periodKey: '',
          requirementId: '',
        })
        // Refresh documents list
        await fetchVaultDocuments()
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vault:data-changed'))
        showToast?.('Document uploaded successfully!', 'success')
      } else {
        showToast?.('Upload failed: Unknown error', 'error')
      }
    } catch (error) {
      console.error('Upload failed:', error)
      showToast?.('Upload failed: ' + (error instanceof Error ? error.message : 'Something went wrong'), 'error')
    } finally {
      setIsUploading(false)
    }
  }

  const toggleDocumentSelection = (docId: string) => {
    setSelectedDocuments((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(docId)) {
        newSet.delete(docId)
      } else {
        newSet.add(docId)
      }
      return newSet
    })
  }

  const toggleDocumentSelectionForSend = (docId: string) => {
    setSelectedDocumentsToSend((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(docId)) {
        newSet.delete(docId)
      } else {
        newSet.add(docId)
      }
      return newSet
    })
  }

  const handleSelectAll = () => {
    if (allDocuments.length === 0) return
    if (selectedDocuments.size === allDocuments.length && allDocuments.length > 0) {
      setSelectedDocuments(new Set())
    } else {
      setSelectedDocuments(new Set(allDocuments.map((doc) => doc.id)))
    }
  }

  const handleSelectAllForSend = () => {
    if (selectedDocumentsToSend.size === allDocuments.length) {
      setSelectedDocumentsToSend(new Set())
    } else {
      setSelectedDocumentsToSend(new Set(allDocuments.map((doc) => doc.id)))
    }
  }

  const handleSendNext = () => {
    if (selectedDocumentsToSend.size > 0) {
      setIsSendModalOpen(false)
      setIsEmailTemplateOpen(true)
    }
  }

  // Helper functions for folder/document mapping (country-aware)
  const getCategoryFromFolder = (folderName: string): string | null => {
    if (!countryConfig) return null

    // Country-specific folder mappings
    if (countryCode === 'IN') {
      const folderMap: Record<string, string> = {
        'GST Returns': 'GST',
        'Income Tax Returns': 'Income Tax',
        'ROC Filings': 'RoC',
        'Labour Law Compliance': 'Payroll',
        'Renewals': 'Renewals',
        'Other Compliance Documents': 'Other',
        'Professional Tax': 'Prof. Tax',
        'Constitutional Documents': 'Other',
        'Financials': 'Other',
        'Statutory Compliances': 'GST',
        'MCA Filings': 'RoC'
      }
      return folderMap[folderName] || null
    } else if (['AE', 'SA', 'OM', 'QA', 'BH'].includes(countryCode || '')) {
      // GCC countries
      const folderMap: Record<string, string> = {
        'VAT & Tax Compliance': 'VAT',
        'Corporate & Regulatory Filings': 'Corporate Tax',
        'Constitutional Documents': 'Other',
        'Financials': 'Other'
      }
      return folderMap[folderName] || null
    } else if (countryCode === 'US') {
      // USA
      const folderMap: Record<string, string> = {
        'Federal Tax Returns': 'Federal Tax',
        'State Tax Returns': 'State Tax',
        'Business License & Registration': 'Business License',
        'Constitutional Documents': 'Other',
        'Financials': 'Other'
      }
      return folderMap[folderName] || null
    }

    // Fallback
    return null
  }

  const getRelevantFormsForFolder = (folderName: string): string[] => {
    const category = getCategoryFromFolder(folderName)
    if (!category || !countryConfig?.regulatory?.commonForms) return []

    const categoryLower = category.toLowerCase()
    const forms = countryConfig.regulatory.commonForms.filter((form: string) => {
      const formLower = form.toLowerCase()

      // India-specific patterns
      if (countryCode === 'IN') {
        if (categoryLower === 'gst' && (formLower.includes('gstr') || formLower.includes('gst') || formLower.includes('cmp') || formLower.includes('itc') || formLower.includes('iff'))) return true
        if (categoryLower === 'income tax' && (formLower.includes('itr') || formLower.includes('form 24') || formLower.includes('form 26') || formLower.includes('form 27'))) return true
        if ((categoryLower === 'roc' || categoryLower === 'mca') && (formLower.includes('mgt') || formLower.includes('aoc') || formLower.includes('dir') || formLower.includes('pas') || formLower.includes('ben') || formLower.includes('inc') || formLower.includes('adt') || formLower.includes('cra') || formLower.includes('llp'))) return true
        if ((categoryLower === 'payroll' || categoryLower === 'labour law') && (formLower.includes('ecr') || formLower.includes('form 5a') || formLower.includes('form 2') || formLower.includes('form 10') || formLower.includes('form 19'))) return true
      }
      // GCC countries
      else if (['AE', 'SA', 'OM', 'QA', 'BH'].includes(countryCode || '')) {
        if ((categoryLower === 'vat' || categoryLower === 'tax') && (formLower.includes('vat') || formLower.includes('tax return') || formLower.includes('corporate tax'))) return true
        if (categoryLower === 'corporate' && (formLower.includes('trade license') || formLower.includes('commercial registration') || formLower.includes('cr'))) return true
      }
      // USA
      else if (countryCode === 'US') {
        if ((categoryLower === 'federal tax' || categoryLower === 'state tax') && (formLower.includes('tax') || formLower.includes('return') || formLower.includes('ein'))) return true
        if (categoryLower === 'business license' && (formLower.includes('license') || formLower.includes('registration') || formLower.includes('report'))) return true
      }

      return false
    })

    return forms
  }

  const getAuthorityForFolder = (folderName: string): string | null => {
    const category = getCategoryFromFolder(folderName)
    return category ? getAuthorityForCategory(category) : null
  }

  const suggestFoldersForDocument = (documentName: string): string[] => {
    const docLower = documentName.toLowerCase()
    const suggestions: string[] = []

    if (countryCode === 'IN') {
      // India-specific patterns
      if (docLower.includes('gstr') || docLower.includes('gst') || docLower.includes('cmp-') || docLower.includes('itc-') || docLower.includes('iff')) {
        suggestions.push('Statutory Compliances')
      }
      if (docLower.includes('itr') || docLower.includes('form 24') || docLower.includes('form 26') || docLower.includes('form 27') || docLower.includes('tds') || docLower.includes('tcs')) {
        suggestions.push('Statutory Compliances')
      }
      if (docLower.includes('mgt') || docLower.includes('aoc') || docLower.includes('roc') || docLower.includes('dir-') || docLower.includes('pas-') || docLower.includes('ben-') || docLower.includes('inc-') || docLower.includes('adt-') || docLower.includes('cra-') || docLower.includes('llp form')) {
        suggestions.push('MCA Filings')
      }
      if (docLower.includes('epf') || docLower.includes('esi') || docLower.includes('ecr') || docLower.includes('form 5a') || docLower.includes('form 2') || docLower.includes('form 10') || docLower.includes('form 19')) {
        suggestions.push('Labour Law Compliance')
      }
    } else if (['AE', 'SA', 'OM', 'QA', 'BH'].includes(countryCode || '')) {
      // GCC countries
      if (docLower.includes('vat') || docLower.includes('tax return') || docLower.includes('corporate tax') || docLower.includes('zakat')) {
        suggestions.push('VAT & Tax Compliance')
      }
      if (docLower.includes('trade license') || docLower.includes('commercial registration') || docLower.includes('cr') || docLower.includes('ded') || docLower.includes('moci')) {
        suggestions.push('Corporate & Regulatory Filings')
      }
    } else if (countryCode === 'US') {
      // USA
      if (docLower.includes('federal') || docLower.includes('irs') || docLower.includes('form 1120') || docLower.includes('form 1065')) {
        suggestions.push('Federal Tax Returns')
      }
      if (docLower.includes('state') || docLower.includes('sales tax')) {
        suggestions.push('State Tax Returns')
      }
      if (docLower.includes('license') || docLower.includes('registration') || docLower.includes('ein') || docLower.includes('annual report')) {
        suggestions.push('Business License & Registration')
      }
    }

    return suggestions
  }

  const getFolderDescription = (folderName: string): { authority: string | null, formCount: number } => {
    const authority = getAuthorityForFolder(folderName)
    const forms = getRelevantFormsForFolder(folderName)
    return {
      authority,
      formCount: forms.length
    }
  }

  const getLegalSectionsForDocument = (documentName: string, folderName: string): Array<{
    act: string
    section: string
    description: string
    relevance: string
  }> => {
    const category = getCategoryFromFolder(folderName)
    if (!category) return []

    return getRelevantLegalSections(documentName, category)
  }

  const getFolderForDocument = (documentName: string, category: string): string => {
    // Check if document template exists
    const template = documentTemplates.find(t =>
      t.document_name.toLowerCase() === documentName.toLowerCase() ||
      documentName.toLowerCase().includes(t.document_name.toLowerCase())
    )
    if (template) return template.folder_name

    const docLower = documentName.toLowerCase()

    // Use country config patterns if available, with fallback to hardcoded patterns
    const patterns = countryConfig?.regulatory?.documentPatterns

    // Country-specific document pattern matching
    if (countryCode === 'IN') {
      // India-specific patterns
      const categoryMap: Record<string, string> = {
        'GST': 'GST Returns',
        'Income Tax': 'Income Tax Returns',
        'RoC': 'ROC Filings',
        'Labour Law': 'Labour Law Compliance',
        'LLP Act': 'ROC Filings',
        'Prof. Tax': 'Professional Tax',
        'Payroll': 'Labour Law Compliance',
        'Others': 'Other Compliance Documents',
        'Renewals': 'Renewals'
      }

      // Enhanced pattern matching using country config (with fallback)
      if (patterns) {
        // Check tax patterns (GST, Income Tax, TDS, ITR, notices) - all map to Income Tax or GST
        if (patterns.tax && patterns.tax.some((pattern: string) => docLower.includes(pattern.toLowerCase()))) {
          // GST patterns
          if (patterns.tax.some((p: string) => ['gstr', 'gst', 'cmp-', 'itc-', 'iff'].some((gst: string) => p.toLowerCase().includes(gst)) && docLower.includes(p.toLowerCase()))) {
            return 'GST Returns'
          }
          // Income Tax patterns (TDS, ITR, notices)
          if (patterns.tax.some((p: string) => ['itr', 'form 24q', 'form 26q', 'form 27q', 'form 27eq', 'tds', 'tcs', 'drc-', 'asmt-', 'section 142', 'section 143', 'section 156'].some((it: string) => p.toLowerCase().includes(it)) && docLower.includes(p.toLowerCase()))) {
            return 'Income Tax Returns'
          }
          // Default tax pattern match
          return 'Income Tax Returns'
        }

        // Check corporate patterns (MCA/RoC) - map to RoC
        if (patterns.corporate && patterns.corporate.some((pattern: string) => docLower.includes(pattern.toLowerCase()))) {
          return 'ROC Filings'
        }

        // Check labor patterns (EPFO/ESIC) - map to Payroll category
        if (patterns.labor && patterns.labor.some((pattern: string) => docLower.includes(pattern.toLowerCase()))) {
          return 'Labour Law Compliance'
        }

        // Check notice patterns - map to Others/Renewals
        if (patterns.notices && patterns.notices.some((pattern: string) => docLower.includes(pattern.toLowerCase()))) {
          // Registration-related notices go to Renewals, others to Other Compliance Documents
          if (docLower.includes('reg-17') || docLower.includes('reg-19')) {
            return 'Renewals'
          }
          return 'Other Compliance Documents'
        }
      }

      // Fallback to hardcoded patterns for backward compatibility
      if (docLower.includes('gstr') || docLower.includes('gst')) {
        return 'GST Returns'
      }
      if (docLower.includes('form 24q') || docLower.includes('form 26q') ||
        docLower.includes('form 27q') || docLower.includes('form 27eq') ||
        docLower.includes('tds') || docLower.includes('tcs') || docLower.includes('itr') ||
        docLower.includes('drc-') || docLower.includes('asmt-') ||
        docLower.includes('section 142') || docLower.includes('section 143') || docLower.includes('section 156')) {
        return 'Income Tax Returns'
      }
      if (docLower.includes('pf') || docLower.includes('esi') ||
        docLower.includes('epf') || docLower.includes('epfo') || docLower.includes('labour') ||
        docLower.includes('ecr') || docLower.includes('form 5a') || docLower.includes('form 2') ||
        docLower.includes('form 10c') || docLower.includes('form 10d') || docLower.includes('form 19')) {
        return 'Labour Law Compliance'
      }
      if (docLower.includes('mgt') || docLower.includes('aoc') ||
        docLower.includes('roc') || docLower.includes('form 11') || docLower.includes('form 8') ||
        docLower.includes('dir-') || docLower.includes('pas-') || docLower.includes('ben-') ||
        docLower.includes('inc-22a') || docLower.includes('adt-01') || docLower.includes('cra-2') ||
        docLower.includes('llp form')) {
        return 'ROC Filings'
      }
      if (docLower.includes('reg-17') || docLower.includes('reg-19') || docLower.includes('cmp-05')) {
        return 'Renewals'
      }

      // Default to category-based folder for India
      return categoryMap[category] || 'Compliance Documents'
    } else {
      // For other countries, use generic category-based mapping
      // Map compliance categories to folder names
      const genericCategoryMap: Record<string, string> = {
        'VAT': 'VAT Returns',
        'Corporate Tax': 'Corporate Tax Returns',
        'Income Tax': 'Income Tax Returns',
        'Payroll': 'Payroll Compliance',
        'Trade License Renewal': 'License Renewals',
        'Commercial Registration Renewal': 'License Renewals',
        'Federal Tax': 'Federal Tax Returns',
        'State Tax': 'State Tax Returns',
        'Business License': 'License Renewals',
        'Others': 'Other Compliance Documents'
      }

      // Try to match category first
      if (genericCategoryMap[category]) {
        return genericCategoryMap[category]
      }

      // Fallback: check for common patterns across countries
      const docLower = documentName.toLowerCase()
      if (docLower.includes('vat') || docLower.includes('value added tax')) {
        return 'VAT Returns'
      }
      if (docLower.includes('tax return') || docLower.includes('tax filing')) {
        return 'Tax Returns'
      }
      if (docLower.includes('license') || docLower.includes('registration')) {
        return 'License Renewals'
      }
      if (docLower.includes('payroll') || docLower.includes('salary')) {
        return 'Payroll Compliance'
      }

      // Default fallback
      return 'Compliance Documents'
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-light text-white mb-1 sm:mb-2">Compliance Vault</h2>
          <p className="text-gray-400 text-sm sm:text-base">Manage document categories and specific compliance folders.</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
          <button
            onClick={() => setIsExportModalOpen(true)}
            className="bg-black border border-white/20 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg hover:border-white/40/50 transition-colors flex items-center justify-center gap-2 font-medium text-sm sm:text-base"
          >
            <svg
              width="16"
              height="16"
              className="sm:w-[18px] sm:h-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span className="hidden sm:inline">Export Files</span>
            <span className="sm:hidden">Export</span>
          </button>
          <button
            onClick={() => setIsSendModalOpen(true)}
            className="bg-black border border-white/20 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg hover:border-white/40/50 transition-colors flex items-center justify-center gap-2 font-medium text-sm sm:text-base"
          >
            <svg
              width="16"
              height="16"
              className="sm:w-[18px] sm:h-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
              <polyline points="22,6 12,13 2,6" />
            </svg>
            <span className="hidden sm:inline">Send Documents</span>
            <span className="sm:hidden">Send</span>
          </button>
          <button
            onClick={() => {
              setAgentUploadDefaultFolderId(null)
              setIsAgentBulkOpen(true)
            }}
            className="bg-black border border-white/20 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg hover:border-white/40/50 transition-colors flex items-center justify-center gap-2 font-medium text-sm sm:text-base"
          >
            <svg
              width="16"
              height="16"
              className="sm:w-[18px] sm:h-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="hidden sm:inline">Bulk Upload</span>
            <span className="sm:hidden">Bulk</span>
            <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] bg-emerald-900/50 text-emerald-300 uppercase tracking-wider">AI</span>
          </button>
          <button
            onClick={() => {
              setAgentUploadDefaultFolderId(null)
              setIsAgentUploadOpen(true)
            }}
            className="bg-white text-black px-4 sm:px-6 py-2 sm:py-3 rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 font-medium text-sm sm:text-base"
          >
            <svg
              width="16"
              height="16"
              className="sm:w-[18px] sm:h-[18px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="hidden sm:inline">Upload Documents</span>
            <span className="sm:hidden">Upload</span>
            <span className="ml-1 px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/20 text-emerald-700 uppercase tracking-wider">AI</span>
          </button>
        </div>
      </div>
    
      {/* Search and Filters */}
      <div className="space-y-3 sm:space-y-4">
        {/* Search Bar */}
        <div className="relative">
          <svg
            className="absolute left-3 sm:left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 sm:w-5 sm:h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents by name, type, folder, or period..."
            className="w-full pl-9 sm:pl-12 pr-4 py-2.5 sm:py-3 bg-black border border-white/20 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 sm:right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
    
        {/* Filters Row */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <label className="text-sm font-medium text-gray-300">Financial Year:</label>
          <select
            value={selectedFY}
            onChange={(e) => setSelectedFY(e.target.value)}
            className="px-3 sm:px-4 py-2 bg-black border border-white/20 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors appearance-none cursor-pointer"
          >
            <option value="">All Financial Years</option>
            {financialYears.map((fy) => (
              <option key={fy} value={fy}>
                {fy}
              </option>
            ))}
          </select>
    
          <label className="text-sm font-medium text-gray-300 sm:ml-auto">Sort by:</label>
          <select
            value={sortOption}
            onChange={(e) => setSortOption(e.target.value as typeof sortOption)}
            className="px-3 sm:px-4 py-2 bg-black border border-white/20 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors appearance-none cursor-pointer"
          >
            <option value="date-newest">Date (Newest)</option>
            <option value="date-oldest">Date (Oldest)</option>
            <option value="name-asc">Name (A-Z)</option>
            <option value="name-desc">Name (Z-A)</option>
            <option value="expiry">Expiry Date</option>
            <option value="folder">Folder</option>
          </select>
    
          <label className="text-sm font-medium text-gray-300">Expiry:</label>
          <select
            value={expiringSoonFilter}
            onChange={(e) => setExpiringSoonFilter(e.target.value as typeof expiringSoonFilter)}
            className="px-3 sm:px-4 py-2 bg-black border border-white/20 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors appearance-none cursor-pointer"
          >
            <option value="all">All Documents</option>
            <option value="expiring">Expiring Soon (â‰¤30 days)</option>
            <option value="expired">Expired</option>
          </select>
        </div>
    
        {/* Search Results Count */}
        {searchQuery && (
          <div className="text-sm text-gray-400">
            Searching for: <span className="text-white font-medium">"{searchQuery}"</span>
          </div>
        )}
      </div>

      {/* AI Overview Section */}
      {currentCompany && (
        <CIAOverviewSection
          companyId={currentCompany.id}
          documentCount={vaultDocuments?.length || 0}
          onDeepDive={() => setIsCIAOpen(true)}
          recentDocuments={(vaultDocuments || []).slice(0, 5).map((d: any) => ({
            name: d.file_name || d.document_name || 'Document',
            folder: d.folder_name || d.document_type || 'Other',
            type: d.document_type,
            date: d.created_at,
          }))}
        />
      )}

      {/* Expand/Collapse All Controls */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="text-sm text-gray-400">
          {documentFolders.length} folders · {expandedFolders.size} expanded
          {expandedDocumentVersions.size > 0 && ` · ${expandedDocumentVersions.size} document versions shown`}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => {
              setExpandedFolders(new Set(documentFolders))
            }}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-800 transition-colors"
          >
            Expand All Folders
          </button>
          <button
            onClick={() => {
              setExpandedFolders(new Set())
              setExpandedDocumentVersions(new Set())
              setExpandedYearGroups({})
            }}
            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-800 transition-colors"
          >
            Collapse All
          </button>
        </div>
      </div>
    
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4">
        {/* Left Side - Document Categories */}
        <div className="lg:col-span-2 space-y-2 sm:space-y-3">
          <VaultTreeView
            companyId={currentCompany?.id || ""}
            canEdit={canEdit}
            onUploadToFolder={(_folderId, folderName) => {
              setUploadFormData(prev => ({ ...prev, folder: folderName }))
              setIsUploadModalOpen(true)
            }}
          />
        </div>
    
        {/* Right Sidebar */}
        <div className="lg:col-span-1 space-y-4 sm:space-y-6">
          {/* Storage Stats */}
          <button
            onClick={() => setIsStorageBreakdownOpen(true)}
            className="w-full bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6 text-left hover:border-white/20 transition-colors"
          >
            <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
              <svg
                width="16"
                height="16"
                className="sm:w-5 sm:h-5 text-gray-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="9" y1="3" x2="9" y2="21" />
              </svg>
              <h3 className="text-base sm:text-lg font-light text-white">Storage Stats</h3>
              <svg className="w-4 h-4 text-gray-400 ml-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
            <div className="space-y-2 sm:space-y-3">
              <div className="w-full bg-gray-900 rounded-full h-2 sm:h-2.5">
                <div
                  className="bg-white h-2 sm:h-2.5 rounded-full"
                  style={{ width: '42%' }}
                ></div>
              </div>
              <div className="text-gray-400 text-xs sm:text-sm">4.2 GB / 10 GB</div>
              <div className="text-gray-500 text-xs mt-2">Click to view breakdown</div>
            </div>
          </button>
    
          {/* Recent Activity */}
          <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
            <h3 className="text-base sm:text-lg font-light text-white mb-3 sm:mb-4">Recent Activity</h3>
            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                <span className="text-gray-400 text-xs sm:text-sm">Encrypted vault synced</span>
              </div>
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-white rounded-full flex-shrink-0"></div>
                <span className="text-gray-400 text-xs sm:text-sm">Audit logs updated</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    
      {/* Upload Document Modal */}
      {isUploadModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => {
              setIsUploadModalOpen(false)
              setIsAdvancedOptionsOpen(false)
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            <div
              className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto opacity-100"
              onClick={(e) => e.stopPropagation()}
              style={{ backgroundColor: '#151515' }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-800">
                <h2 className="text-xl sm:text-2xl font-light text-white">Upload Document</h2>
                <button
                  onClick={() => {
                    setIsUploadModalOpen(false)
                    setIsAdvancedOptionsOpen(false)
                  }}
                  className="text-gray-400 hover:text-white transition-colors p-1"
                >
                  <svg
                    width="20"
                    height="20"
                    className="sm:w-6 sm:h-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
    
              {/* Modal Content */}
              <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                {/* Adding To Section */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                    Adding to:
                  </label>
                  <div className="relative">
                    <button
                      onClick={() => setIsFolderDropdownOpen(!isFolderDropdownOpen)}
                      className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white text-black rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-between font-medium text-sm sm:text-base"
                    >
                      <span className="truncate">{uploadFormData.folder || 'Select folder'}</span>
                      <svg
                        width="14"
                        height="14"
                        className={`sm:w-4 sm:h-4 flex-shrink-0 ml-2 transition-transform ${isFolderDropdownOpen ? 'rotate-180' : ''}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {isFolderDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setIsFolderDropdownOpen(false)}
                        />
                        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-800 rounded-lg shadow-2xl z-20 max-h-64 overflow-y-auto">
                          {(() => {
                            const suggestions = uploadFormData.documentName
                              ? suggestFoldersForDocument(uploadFormData.documentName)
                              : []
    
                            return documentFolders.map((folder) => {
                              const isRecommended = suggestions.includes(folder)
                              const { authority, formCount } = getFolderDescription(folder)
    
                              return (
                                <button
                                  key={folder}
                                  onClick={() => {
                                    setUploadFormData((prev) => ({ ...prev, folder, documentName: prev.documentName }))
                                    setIsFolderDropdownOpen(false)
                                  }}
                                  className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-gray-800 transition-colors text-white text-sm sm:text-base ${isRecommended ? 'bg-blue-500/10 border-l-2 border-blue-500' : ''
                                    }`}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      {isRecommended && (
                                        <span className="text-[10px] sm:text-xs text-blue-400 font-medium flex-shrink-0">Recommended</span>
                                      )}
                                      <span className="truncate">{folder}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-[10px] sm:text-xs text-gray-400 flex-shrink-0 ml-2">
                                      {formCount > 0 && <span>{formCount} forms</span>}
                                      {authority && (
                                        <span className="text-gray-500 hidden sm:inline">
                                          · {authority.split('(')[0].trim()}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              )
                            })
                          })()}
                        </div>
                      </>
                    )}
                  </div>
                </div>
    
                {/* Compliance Context Panel */}
                {uploadFormData.folder && (() => {
                  const relevantForms = getRelevantFormsForFolder(uploadFormData.folder)
                  const authority = getAuthorityForFolder(uploadFormData.folder)
                  const formFrequency = countryConfig?.regulatory?.formFrequencies
    
                  if (relevantForms.length === 0 && !authority) return null
    
                  return (
                    <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-3 sm:p-4">
                      <div className="flex items-center justify-between mb-2 sm:mb-3">
                        <h4 className="text-xs sm:text-sm font-medium text-white">Compliance Information</h4>
                        <button
                          onClick={() => setShowComplianceContext(!showComplianceContext)}
                          className="text-gray-400 hover:text-white transition-colors"
                          type="button"
                        >
                          <svg
                            width="14"
                            height="14"
                            className={`transition-transform ${showComplianceContext ? '' : '-rotate-90'}`}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      </div>
    
                      {showComplianceContext && (
                        <div className="space-y-2 sm:space-y-3">
                          {authority && (
                            <div>
                              <span className="text-[10px] sm:text-xs text-gray-400">Authority:</span>
                              <span className="text-[10px] sm:text-xs text-white ml-2">{authority}</span>
                            </div>
                          )}
    
                          {relevantForms.length > 0 && (
                            <div>
                              <span className="text-[10px] sm:text-xs text-gray-400 mb-1.5 sm:mb-2 block">Relevant Forms:</span>
                              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                {relevantForms.map((form) => (
                                  <button
                                    key={form}
                                    type="button"
                                    onClick={() => {
                                      setUploadFormData(prev => ({ ...prev, documentName: form }))
                                    }}
                                    className="px-2 py-1 bg-gray-800 hover:bg-gray-700 rounded text-[10px] sm:text-xs text-white flex items-center gap-1 transition-colors"
                                  >
                                    {form}
                                    {formFrequency?.[form] && (
                                      <span className={`text-[8px] ${formFrequency[form] === 'monthly' ? 'text-blue-400' :
                                          formFrequency[form] === 'quarterly' ? 'text-purple-400' :
                                            formFrequency[form] === 'annual' ? 'text-green-400' :
                                              'text-gray-400'
                                        }`}>
                                        ({formFrequency[form][0].toUpperCase()})
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}
    
                {/* Document Name — combo box: select from predefined or type custom */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                    Document Name <span className="text-red-500">*</span>
                  </label>
                  {(() => {
                    const folderDocNames = uploadFormData.folder ? (predefinedDocuments[uploadFormData.folder] || []) : []
                    return (
                      <div className="space-y-2">
                        {folderDocNames.length > 0 && (
                          <select
                            value={folderDocNames.includes(uploadFormData.documentName) ? uploadFormData.documentName : ''}
                            onChange={(e) => {
                              if (e.target.value) {
                                setUploadFormData((prev) => ({ ...prev, documentName: e.target.value }))
                              }
                            }}
                            className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors appearance-none cursor-pointer"
                          >
                            <option value="">Select from predefined documents</option>
                            {folderDocNames.map((name: string) => (
                              <option key={name} value={name}>{name}</option>
                            ))}
                          </select>
                        )}
                        <input
                          type="text"
                          value={uploadFormData.documentName}
                          onChange={(e) => {
                            setUploadFormData((prev) => ({ ...prev, documentName: e.target.value }))
                          }}
                          placeholder={folderDocNames.length > 0 ? "Or type a custom document name" : "Enter document name"}
                          className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                        />
                      </div>
                    )
                  })()}
                  <div className="relative">
                    {/* Folder Suggestion Badge */}
                    {uploadFormData.documentName && !uploadFormData.folder && (() => {
                      const suggestions = suggestFoldersForDocument(uploadFormData.documentName)
                      if (suggestions.length > 0) {
                        return (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-blue-500/10 border border-blue-500/20 rounded p-2 text-[10px] sm:text-xs text-blue-400 z-10">
                            Suggested folder: <span className="font-medium">{suggestions[0]}</span>
                            <button
                              type="button"
                              onClick={() => setUploadFormData(prev => ({ ...prev, folder: suggestions[0] }))}
                              className="ml-2 text-blue-300 hover:text-blue-200 underline"
                            >
                              Use this folder
                            </button>
                          </div>
                        )
                      }
                      return null
                    })()}
                  </div>
                </div>
    
                {/* Advanced Options Collapsible */}
                <div className="border-t border-gray-800 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsAdvancedOptionsOpen(!isAdvancedOptionsOpen)}
                    className="w-full flex items-center justify-between text-left text-sm sm:text-base font-medium text-gray-300 hover:text-white transition-colors"
                  >
                    <span>Advanced Options</span>
                    <svg
                      className={`w-4 h-4 sm:w-5 sm:h-5 transition-transform ${isAdvancedOptionsOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
    
                  {isAdvancedOptionsOpen && (
                    <div className="mt-4 space-y-4 sm:space-y-6">
                      {/* Frequency Selection */}
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                          Frequency
                        </label>
                        <select
                          value={uploadFormData.frequency}
                          onChange={(e) =>
                            setUploadFormData((prev) => ({ ...prev, frequency: e.target.value as 'one-time' | 'monthly' | 'quarterly' | 'annually' }))
                          }
                          className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors cursor-pointer"
                        >
                          <option value="one-time">One-time</option>
                          <option value="monthly">Monthly</option>
                          <option value="quarterly">Quarterly</option>
                          <option value="annually">Annually</option>
                          <option value="yearly">Yearly</option>
                        </select>
                      </div>
    
                      {/* Dates */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                            Date of Registration (Optional)
                          </label>
                          <input
                            type="date"
                            value={uploadFormData.registrationDate}
                            onChange={(e) =>
                              setUploadFormData((prev) => ({
                                ...prev,
                                registrationDate: e.target.value,
                              }))
                            }
                            className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                            Expiry Date (Optional)
                          </label>
                          <input
                            type="date"
                            value={uploadFormData.expiryDate}
                            onChange={(e) =>
                              setUploadFormData((prev) => ({
                                ...prev,
                                expiryDate: e.target.value,
                              }))
                            }
                            className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                          />
                        </div>
                      </div>
    
                      {/* Note Checkbox */}
                      <div>
                        <label className="flex items-start gap-2 sm:gap-3 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={uploadFormData.hasNote}
                            onChange={(e) =>
                              setUploadFormData((prev) => ({ ...prev, hasNote: e.target.checked }))
                            }
                            className="w-4 h-4 sm:w-5 sm:h-5 text-white bg-gray-800 border-gray-600 rounded focus:ring-white/40 focus:ring-2 mt-0.5 flex-shrink-0"
                          />
                          <div>
                            <div className="text-white font-medium text-sm sm:text-base">Note</div>
                            <div className="text-gray-400 text-xs sm:text-sm mt-1">
                              Check this if you need to add external portal credentials
                            </div>
                          </div>
                        </label>
                      </div>
    
                      {/* External Portal Credentials */}
                      {uploadFormData.hasNote && (
                        <div className="bg-white/5 border border-white/40/30 rounded-lg p-3 sm:p-4 space-y-3 sm:space-y-4">
                          <h3 className="text-white font-medium text-sm sm:text-base">External Portal Credentials</h3>
                          <div>
                            <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                              External Portal Email
                            </label>
                            <input
                              type="email"
                              value={uploadFormData.externalEmail}
                              onChange={(e) =>
                                setUploadFormData((prev) => ({
                                  ...prev,
                                  externalEmail: e.target.value,
                                }))
                              }
                              placeholder="portal@example.com"
                              className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                            />
                          </div>
                          <div>
                            <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                              External Portal Password
                            </label>
                            <input
                              type="password"
                              value={uploadFormData.externalPassword}
                              onChange={(e) =>
                                setUploadFormData((prev) => ({
                                  ...prev,
                                  externalPassword: e.target.value,
                                }))
                              }
                              placeholder="Enter password"
                              className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
    
                {/* File Upload Area */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                    Upload File
                  </label>
                  <label className="flex flex-col items-center justify-center w-full h-32 sm:h-48 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-white/40 transition-colors bg-gray-900/50">
                    <div className="flex flex-col items-center justify-center pt-4 sm:pt-5 pb-4 sm:pb-6 px-4">
                      {isUploading ? (
                        <div className="w-8 h-8 sm:w-12 sm:h-12 border-4 border-white/40 border-t-transparent rounded-full animate-spin mb-3 sm:mb-4"></div>
                      ) : (
                        <svg
                          width="32"
                          height="32"
                          className="sm:w-12 sm:h-12 text-gray-400 mb-2 sm:mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                      )}
                      <p className="mb-1 sm:mb-2 text-xs sm:text-sm text-white font-medium text-center">
                        {isUploading ? 'Uploading...' : 'Click to upload or drag and drop'}
                      </p>
                      <p className="text-[10px] sm:text-xs text-gray-400 text-center">
                        PDF, DOC, DOCX, or images (max. 10MB)
                      </p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      disabled={isUploading}
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) =>
                        setUploadFormData((prev) => ({
                          ...prev,
                          file: e.target.files?.[0] || null,
                        }))
                      }
                    />
                  </label>
                  {uploadFormData.file && (
                    <div className="mt-2 text-xs sm:text-sm text-gray-400 break-words">
                      Selected: {uploadFormData.file.name}
                    </div>
                  )}
                </div>
    
                {/* Action Buttons */}
                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-4 pt-4 border-t border-gray-800">
                  <button
                    onClick={() => setIsUploadModalOpen(false)}
                    disabled={isUploading}
                    className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-transparent border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors disabled:opacity-50 text-sm sm:text-base"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleUpload}
                    disabled={isUploading || !uploadFormData.file || !uploadFormData.folder || !uploadFormData.documentName}
                    className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-white text-black rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 font-medium disabled:opacity-50 text-sm sm:text-base"
                  >
                    {isUploading ? (
                      <>
                        <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <svg
                          width="16"
                          height="16"
                          className="sm:w-[18px] sm:h-[18px]"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        Upload Document
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    
      {/* Bulk Upload Modal */}
      {isBulkUploadModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => {
              setIsBulkUploadModalOpen(false)
              setBulkUploadFiles([])
              setBulkUploadProgress({ current: 0, total: 0 })
              setBulkUploadFileOptions({})
              setExpandedBulkFileOptions(new Set())
              setOpenDocumentNameDropdown(null)
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            <div
              className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto opacity-100"
              onClick={(e) => e.stopPropagation()}
              style={{ backgroundColor: '#151515' }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-800">
                <h2 className="text-xl sm:text-2xl font-light text-white">Bulk Upload Documents</h2>
                <button
                  onClick={() => {
                    setIsBulkUploadModalOpen(false)
                    setBulkUploadFiles([])
                    setBulkUploadProgress({ current: 0, total: 0 })
                    setBulkUploadFileOptions({})
                    setExpandedBulkFileOptions(new Set())
                    setOpenDocumentNameDropdown(null)
                  }}
                  className="text-gray-400 hover:text-white transition-colors p-1"
                >
                  <svg
                    width="20"
                    height="20"
                    className="sm:w-6 sm:h-6"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
    
              {/* Modal Content */}
              <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                {/* Folder Selection */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                    Select Folder <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <button
                      onClick={() => setIsFolderDropdownOpen(!isFolderDropdownOpen)}
                      className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-white text-black rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-between font-medium text-sm sm:text-base"
                    >
                      <span className="truncate">{uploadFormData.folder || 'Select folder'}</span>
                      <svg
                        width="14"
                        height="14"
                        className={`sm:w-4 sm:h-4 flex-shrink-0 ml-2 transition-transform ${isFolderDropdownOpen ? 'rotate-180' : ''}`}
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    {isFolderDropdownOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-10"
                          onClick={() => setIsFolderDropdownOpen(false)}
                        />
                        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-800 rounded-lg shadow-2xl z-20 max-h-64 overflow-y-auto">
                          {documentFolders.map((folder) => (
                            <button
                              key={folder}
                              onClick={() => {
                                setUploadFormData((prev) => ({ ...prev, folder }))
                                setIsFolderDropdownOpen(false)
                              }}
                              className="w-full px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-gray-800 transition-colors text-white text-sm sm:text-base"
                            >
                              {folder}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
    
                {/* File Upload Area */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                    Select Multiple Files <span className="text-red-500">*</span>
                  </label>
                  <label className="flex flex-col items-center justify-center w-full h-40 sm:h-48 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-white/40 transition-colors bg-gray-900/50">
                    <div className="flex flex-col items-center justify-center pt-4 sm:pt-5 pb-4 sm:pb-6 px-4">
                      <svg
                        width="32"
                        height="32"
                        className="sm:w-12 sm:h-12 text-gray-400 mb-2 sm:mb-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <p className="mb-1 sm:mb-2 text-xs sm:text-sm text-white font-medium text-center">
                        Click to select multiple files or drag and drop
                      </p>
                      <p className="text-[10px] sm:text-xs text-gray-400 text-center">
                        PDF, DOC, DOCX, or images (max. 10MB per file)
                      </p>
                    </div>
                    <input
                      type="file"
                      className="hidden"
                      multiple
                      disabled={isUploading}
                      accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || [])
                        setBulkUploadFiles(files)
                        // Initialize options for new files
                        const newOptions: Record<string, any> = { ...bulkUploadFileOptions }
                        const newExpanded = new Set(expandedBulkFileOptions)
                        files.forEach(file => {
                          if (!newOptions[file.name]) {
                            newOptions[file.name] = {
                              documentName: file.name.replace(/\.[^/.]+$/, ''),
                              registrationDate: '',
                              expiryDate: '',
                              frequency: 'one-time',
                              hasNote: false,
                              externalEmail: '',
                              externalPassword: '',
                            }
                          }
                          // Auto-expand new files so advanced options are visible
                          newExpanded.add(file.name)
                        })
                        setBulkUploadFileOptions(newOptions)
                        setExpandedBulkFileOptions(newExpanded)
                      }}
                    />
                  </label>
                  {bulkUploadFiles.length > 0 && (
                    <div className="mt-3 space-y-3 max-h-[60vh] overflow-y-auto">
                      <div className="flex items-center justify-between">
                        <p className="text-xs sm:text-sm text-gray-400 font-medium">
                        {bulkUploadFiles.length} file(s) selected:
                      </p>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              const allExpanded = new Set(bulkUploadFiles.map(f => f.name))
                              setExpandedBulkFileOptions(allExpanded)
                            }}
                            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-800 transition-colors"
                          >
                            Expand All
                          </button>
                          <button
                            onClick={() => {
                              setExpandedBulkFileOptions(new Set())
                            }}
                            className="text-xs text-gray-400 hover:text-white px-2 py-1 rounded hover:bg-gray-800 transition-colors"
                          >
                            Collapse All
                          </button>
                        </div>
                      </div>
                      {bulkUploadFiles.map((file, idx) => {
                        const fileKey = file.name
                        const fileOptions = bulkUploadFileOptions[fileKey] || {
                          documentName: file.name.replace(/\.[^/.]+$/, ''),
                          registrationDate: '',
                          expiryDate: '',
                          frequency: 'one-time',
                          hasNote: false,
                          externalEmail: '',
                          externalPassword: '',
                        }
                        const isExpanded = expandedBulkFileOptions.has(fileKey)
                        
                        return (
                          <div key={idx} className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
                            {/* File Header */}
                            <div className="flex items-center justify-between p-3">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="truncate text-xs sm:text-sm text-gray-300 flex-1">{file.name}</span>
                                <span className="text-[10px] text-gray-500 flex-shrink-0">{(file.size / 1024 / 1024).toFixed(2)} MB</span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <button
                                  onClick={() => {
                                    const newExpanded = new Set(expandedBulkFileOptions)
                                    if (isExpanded) {
                                      newExpanded.delete(fileKey)
                                    } else {
                                      newExpanded.add(fileKey)
                                    }
                                    setExpandedBulkFileOptions(newExpanded)
                                  }}
                                  className="text-gray-400 hover:text-white transition-colors p-1"
                                  title={isExpanded ? 'Collapse options' : 'Expand options'}
                                >
                                  <svg
                                    className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </button>
                          <button
                            onClick={() => {
                              setBulkUploadFiles(prev => prev.filter((_, i) => i !== idx))
                                    const newOptions = { ...bulkUploadFileOptions }
                                    delete newOptions[fileKey]
                                    setBulkUploadFileOptions(newOptions)
                                    const newExpanded = new Set(expandedBulkFileOptions)
                                    newExpanded.delete(fileKey)
                                    setExpandedBulkFileOptions(newExpanded)
                                    if (openDocumentNameDropdown === fileKey) {
                                      setOpenDocumentNameDropdown(null)
                                    }
                                  }}
                                  className="text-red-400 hover:text-red-300 transition-colors p-1"
                                  title="Remove file"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                            </div>
                            
                            {/* Advanced Options */}
                            {isExpanded && (
                              <div className="border-t border-gray-800 p-3 space-y-4 bg-gray-950/50">
                                {/* Document Name with Dropdown */}
                                <div>
                                  <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                    Document Name <span className="text-red-500">*</span>
                                  </label>
                                  <div className="relative">
                                    <input
                                      type="text"
                                      value={fileOptions.documentName}
                                      onChange={(e) => {
                                        setBulkUploadFileOptions(prev => ({
                                          ...prev,
                                          [fileKey]: { ...prev[fileKey], documentName: e.target.value }
                                        }))
                                      }}
                                      placeholder="Select from list or type custom name"
                                      className="w-full px-3 py-2 pr-8 bg-black border border-gray-700 rounded-lg text-white text-xs placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                                    />
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setOpenDocumentNameDropdown(openDocumentNameDropdown === fileKey ? null : fileKey)
                                      }}
                                      className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-white transition-colors p-1"
                                      title="Show document name options"
                                    >
                                      <svg 
                                        className={`w-4 h-4 transition-transform ${openDocumentNameDropdown === fileKey ? 'rotate-180' : ''}`}
                                        fill="none" 
                                        stroke="currentColor" 
                                        viewBox="0 0 24 24"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                    
                                    {/* Custom Dropdown Menu */}
                                    {openDocumentNameDropdown === fileKey && (
                                      <>
                                        <div
                                          className="fixed inset-0 z-10"
                                          onClick={() => setOpenDocumentNameDropdown(null)}
                                        />
                                        <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-800 rounded-lg shadow-2xl z-20 max-h-48 overflow-y-auto">
                                          {uploadFormData.folder && predefinedDocuments[uploadFormData.folder] && predefinedDocuments[uploadFormData.folder].length > 0 ? (
                                            <>
                                              {predefinedDocuments[uploadFormData.folder].map((docName: string, docIdx: number) => (
                                                <button
                                                  key={docIdx}
                                                  type="button"
                                                  onClick={() => {
                                                    setBulkUploadFileOptions(prev => ({
                                                      ...prev,
                                                      [fileKey]: { ...prev[fileKey], documentName: docName }
                                                    }))
                                                    setOpenDocumentNameDropdown(null)
                                                  }}
                                                  className="w-full px-3 py-2 text-left hover:bg-gray-800 transition-colors text-white text-xs"
                                                >
                                                  {docName}
                                                </button>
                                              ))}
                                              <div className="border-t border-gray-800 my-1"></div>
                                              <div className="px-3 py-2 text-[10px] text-gray-400">
                                                Or type a custom name above
                                              </div>
                                            </>
                                          ) : (
                                            <div className="px-3 py-2 text-xs text-gray-400">
                                              No predefined documents for this folder. Type a custom name above.
                                            </div>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                  {uploadFormData.folder && predefinedDocuments[uploadFormData.folder] && predefinedDocuments[uploadFormData.folder].length > 0 && (
                                    <p className="text-[10px] text-gray-500 mt-1">
                                      Select from {predefinedDocuments[uploadFormData.folder].length} predefined document(s) or type a custom name
                                    </p>
                                  )}
                                </div>
    
                                {/* Frequency */}
                                <div>
                                  <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                    Frequency
                                  </label>
                                  <select
                                    value={fileOptions.frequency}
                                    onChange={(e) => {
                                      setBulkUploadFileOptions(prev => ({
                                        ...prev,
                                        [fileKey]: { ...prev[fileKey], frequency: e.target.value as 'one-time' | 'monthly' | 'quarterly' | 'annually' }
                                      }))
                                    }}
                                    className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors cursor-pointer"
                                  >
                                    <option value="one-time">One-time</option>
                                    <option value="monthly">Monthly</option>
                                    <option value="quarterly">Quarterly</option>
                                    <option value="annually">Annually</option>
                                    <option value="yearly">Yearly</option>
                                  </select>
                                </div>
    
                                {/* Dates */}
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                      Date of Registration
                                    </label>
                                    <input
                                      type="date"
                                      value={fileOptions.registrationDate}
                                      onChange={(e) => {
                                        setBulkUploadFileOptions(prev => ({
                                          ...prev,
                                          [fileKey]: { ...prev[fileKey], registrationDate: e.target.value }
                                        }))
                                      }}
                                      className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                      Expiry Date
                                    </label>
                                    <input
                                      type="date"
                                      value={fileOptions.expiryDate}
                                      onChange={(e) => {
                                        setBulkUploadFileOptions(prev => ({
                                          ...prev,
                                          [fileKey]: { ...prev[fileKey], expiryDate: e.target.value }
                                        }))
                                      }}
                                      className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-xs focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                                    />
                                  </div>
                                </div>
    
                                {/* Portal Credentials */}
                                <div>
                                  <label className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={fileOptions.hasNote}
                                      onChange={(e) => {
                                        setBulkUploadFileOptions(prev => ({
                                          ...prev,
                                          [fileKey]: { ...prev[fileKey], hasNote: e.target.checked }
                                        }))
                                      }}
                                      className="w-4 h-4 text-white bg-gray-800 border-gray-600 rounded focus:ring-white/40 focus:ring-2"
                                    />
                                    <span className="text-xs text-gray-300">Add External Portal Credentials</span>
                                  </label>
                                  
                                  {fileOptions.hasNote && (
                                    <div className="mt-2 space-y-2 bg-white/5 border border-white/10 rounded-lg p-2.5">
                                      <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                          Portal Email
                                        </label>
                                        <input
                                          type="email"
                                          value={fileOptions.externalEmail}
                                          onChange={(e) => {
                                            setBulkUploadFileOptions(prev => ({
                                              ...prev,
                                              [fileKey]: { ...prev[fileKey], externalEmail: e.target.value }
                                            }))
                                          }}
                                          placeholder="portal@example.com"
                                          className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-xs placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-xs font-medium text-gray-300 mb-1.5">
                                          Portal Password
                                        </label>
                                        <input
                                          type="password"
                                          value={fileOptions.externalPassword}
                                          onChange={(e) => {
                                            setBulkUploadFileOptions(prev => ({
                                              ...prev,
                                              [fileKey]: { ...prev[fileKey], externalPassword: e.target.value }
                                            }))
                                          }}
                                          placeholder="Enter password"
                                          className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-xs placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
    
                {/* Progress Bar */}
                {isUploading && bulkUploadProgress.total > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs sm:text-sm text-gray-400">
                      <span>Uploading {bulkUploadProgress.current} of {bulkUploadProgress.total} files...</span>
                      <span>{Math.round((bulkUploadProgress.current / bulkUploadProgress.total) * 100)}%</span>
                    </div>
                    <div className="w-full bg-gray-900 rounded-full h-2">
                      <div
                        className="bg-white h-2 rounded-full transition-all duration-300"
                        style={{ width: `${(bulkUploadProgress.current / bulkUploadProgress.total) * 100}%` }}
                      ></div>
                    </div>
                  </div>
                )}
    
                {/* Action Buttons */}
                <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-4 pt-4 border-t border-gray-800">
                  <button
                    onClick={() => {
                      setIsBulkUploadModalOpen(false)
                      setBulkUploadFiles([])
                      setBulkUploadProgress({ current: 0, total: 0 })
                      setBulkUploadFileOptions({})
                      setExpandedBulkFileOptions(new Set())
                      setOpenDocumentNameDropdown(null)
                    }}
                    disabled={isUploading}
                    className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-transparent border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors disabled:opacity-50 text-sm sm:text-base"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!uploadFormData.folder || bulkUploadFiles.length === 0 || !currentCompany) {
                        showToast?.('Please select a folder and at least one file.', 'warning')
                        return
                      }
    
                      // Validate that all files have document names
                      const filesWithoutNames = bulkUploadFiles.filter(file => {
                        const fileOptions = bulkUploadFileOptions[file.name]
                        return !fileOptions || !fileOptions.documentName || fileOptions.documentName.trim() === ''
                      })
    
                      if (filesWithoutNames.length > 0) {
                        showToast?.(`Please provide document names for all files. ${filesWithoutNames.length} file(s) missing document name.`, 'warning')
                        // Expand files without names
                        const newExpanded = new Set(expandedBulkFileOptions)
                        filesWithoutNames.forEach(file => newExpanded.add(file.name))
                        setExpandedBulkFileOptions(newExpanded)
                        return
                      }
    
                      setIsUploading(true)
                      setBulkUploadProgress({ current: 0, total: bulkUploadFiles.length })
                      let successCount = 0
                      let failCount = 0
    
                      try {
                        for (let i = 0; i < bulkUploadFiles.length; i++) {
                          const file = bulkUploadFiles[i]
                          try {
                            // Get options for this file
                            const fileKey = file.name
                            const fileOptions = bulkUploadFileOptions[fileKey] || {
                              documentName: file.name.replace(/\.[^/.]+$/, ''),
                              registrationDate: '',
                              expiryDate: '',
                              frequency: 'one-time',
                              hasNote: false,
                              externalEmail: '',
                              externalPassword: '',
                            }
    
                            // Validate document name
                            if (!fileOptions.documentName || fileOptions.documentName.trim() === '') {
                              throw new Error(`Document name is required for ${file.name}`)
                            }
    
                            const fileExt = file.name.split('.').pop()
                            const fileName = `${fileOptions.documentName.replace(/\s+/g, '_')}_${Date.now()}.${fileExt}`
                            const filePath = `${user?.id}/${currentCompany.id}/${fileName}`
    
                            // Upload to Storage via server action (works for both Supabase and Passport users)
                            const fileArrayBuffer = await file.arrayBuffer()
                            const uploadResult = await uploadFileToStorage(filePath, fileArrayBuffer, file.type)
    
                            if (!uploadResult.success) {
                              throw new Error(uploadResult.error || 'Upload failed')
                            }
    
                            // Save metadata with per-file options
                            const result = await uploadDocument(currentCompany.id, {
                              folderName: uploadFormData.folder,
                              documentName: fileOptions.documentName,
                              registrationDate: fileOptions.registrationDate,
                              expiryDate: fileOptions.expiryDate,
                              isPortalRequired: fileOptions.hasNote,
                              portalEmail: fileOptions.externalEmail,
                              portalPassword: fileOptions.externalPassword,
                              frequency: fileOptions.frequency,
                              filePath: filePath,
                              fileName: file.name,
                            })
    
                            if (result.success) {
                              successCount++
                            } else {
                              failCount++
                            }
                          } catch (error) {
                            console.error(`Error uploading ${file.name}:`, error)
                            failCount++
                          }
    
                          setBulkUploadProgress({ current: i + 1, total: bulkUploadFiles.length })
                        }
    
                        await fetchVaultDocuments()
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('vault:data-changed'))
    
                        if (successCount > 0) {
                          showToast?.(`Successfully uploaded ${successCount} file(s)${failCount > 0 ? `. ${failCount} failed.` : ''}`, successCount === bulkUploadFiles.length ? 'success' : 'warning')
                        } else {
                          showToast?.('Failed to upload files. Please try again.', 'error')
                        }
    
                        setIsBulkUploadModalOpen(false)
                        setBulkUploadFiles([])
                        setBulkUploadProgress({ current: 0, total: 0 })
                        setBulkUploadFileOptions({})
                        setExpandedBulkFileOptions(new Set())
                        setOpenDocumentNameDropdown(null)
                      } catch (error) {
                        console.error('Bulk upload failed:', error)
                        showToast?.('Bulk upload failed: ' + (error instanceof Error ? error.message : 'Something went wrong'), 'error')
                      } finally {
                        setIsUploading(false)
                      }
                    }}
                    disabled={isUploading || !uploadFormData.folder || bulkUploadFiles.length === 0}
                    className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-white text-black rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 font-medium disabled:opacity-50 text-sm sm:text-base"
                  >
                    {isUploading ? (
                      <>
                        <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Uploading...
                      </>
                    ) : (
                      <>
                        <svg
                          width="16"
                          height="16"
                          className="sm:w-[18px] sm:h-[18px]"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="17 8 12 3 7 8" />
                          <line x1="12" y1="3" x2="12" y2="15" />
                        </svg>
                        Upload {bulkUploadFiles.length} File{bulkUploadFiles.length !== 1 ? 's' : ''}
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    
      {/* Export Files Modal */}
      {isExportModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setIsExportModalOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto opacity-100"
              onClick={(e) => e.stopPropagation()}
              style={{ backgroundColor: '#151515' }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-800">
                <h2 className="text-2xl font-light text-white">Export Files</h2>
                <button
                  onClick={() => setIsExportModalOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
    
              {/* Modal Content */}
              <div className="p-6 space-y-6">
                {/* Select All */}
                <div className="flex items-center justify-between pb-4 border-b border-gray-800">
                  <label className={`flex items-center gap-3 ${allDocuments.length === 0 ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
                    <input
                      type="checkbox"
                      checked={allDocuments.length > 0 && selectedDocuments.size === allDocuments.length}
                      onChange={handleSelectAll}
                      disabled={allDocuments.length === 0}
                      className="w-5 h-5 text-white bg-gray-800 border-gray-600 rounded focus:ring-white/40 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <span className="text-white font-medium">Select All</span>
                  </label>
                  <span className="text-gray-400 text-sm">
                    {selectedDocuments.size} of {allDocuments.length} selected
                  </span>
                </div>
    
                {/* Document List */}
                <div className="space-y-3">
                  {allDocuments.map((doc) => (
                    <label
                      key={doc.id}
                      className="flex items-center gap-3 p-4 bg-gray-900 rounded-lg border border-gray-800 hover:border-white/40/50 transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDocuments.has(doc.id)}
                        onChange={() => toggleDocumentSelection(doc.id)}
                        className="w-5 h-5 text-white bg-gray-800 border-gray-600 rounded focus:ring-white/40 focus:ring-2"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-medium">{doc.name}</span>
                          {doc.period && (
                            <span className="px-2 py-0.5 text-xs rounded-full border bg-blue-500/20 text-blue-400 border-blue-500/30">
                              {doc.period}
                            </span>
                          )}
                        </div>
                        <div className="text-gray-400 text-sm mt-1">{doc.category}</div>
                      </div>
                    </label>
                  ))}
                </div>
    
                {/* Action Buttons */}
                <div className="flex justify-end gap-4 pt-4 border-t border-gray-800">
                  <button
                    onClick={() => {
                      setIsExportModalOpen(false)
                      setSelectedDocuments(new Set())
                    }}
                    className="px-6 py-3 bg-transparent border border-white/20 text-white rounded-lg hover:border-white/40 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (selectedDocuments.size > 0) {
                        try {
                          // Get selected document IDs from allDocuments (which respects FY filter)
                          const selectedDocIds = allDocuments
                            .filter(doc => selectedDocuments.has(doc.id))
                            .map(doc => doc.id)
    
                          // Get full document data from vaultDocuments (with file_path)
                          const selectedDocsWithPaths = vaultDocuments.filter(doc =>
                            selectedDocIds.includes(doc.id)
                          )
    
                          if (selectedDocsWithPaths.length === 0) {
                            showToast?.('No documents found to export. Please check your selection and financial year filter.', 'warning')
                            return
                          }
    
                          // Show a message that downloads will start
                          const proceed = confirm(`You are about to download ${selectedDocsWithPaths.length} file(s)${selectedFY ? ` for ${selectedFY}` : ''}. Your browser may ask for permission to download multiple files. Continue?`)
                          if (!proceed) return
    
                          let successCount = 0
                          let failCount = 0
    
                          // Download each file sequentially with proper delays
                          for (let i = 0; i < selectedDocsWithPaths.length; i++) {
                            const doc = selectedDocsWithPaths[i]
                            if (doc.file_path) {
                              try {
                                const result = await getDownloadUrl(doc.file_path)
                                if (result.success && result.url) {
                                  // Use fetch to download the file as blob, then create download
                                  try {
                                    const response = await fetch(result.url)
                                    const blob = await response.blob()
                                    const url = window.URL.createObjectURL(blob)
    
                                    const link = document.createElement('a')
                                    link.href = url
                                    link.download = doc.document_type || doc.file_name || `document-${i + 1}`
                                    link.style.display = 'none'
                                    document.body.appendChild(link)
    
                                    // Trigger download
                                    link.click()
    
                                    // Clean up
                                    setTimeout(() => {
                                      document.body.removeChild(link)
                                      window.URL.revokeObjectURL(url)
                                    }, 100)
    
                                    successCount++
                                  } catch (fetchError) {
                                    // Fallback to direct link method
                                    const link = document.createElement('a')
                                    link.href = result.url
                                    link.download = doc.document_type || doc.file_name || `document-${i + 1}`
                                    link.target = '_blank'
                                    link.style.display = 'none'
                                    document.body.appendChild(link)
                                    link.click()
    
                                    setTimeout(() => {
                                      document.body.removeChild(link)
                                    }, 1000)
    
                                    successCount++
                                  }
    
                                  // Wait between downloads - longer delay for browser to process
                                  if (i < selectedDocsWithPaths.length - 1) {
                                    await new Promise(resolve => setTimeout(resolve, 1000))
                                  }
                                } else {
                                  failCount++
                                  console.error(`Failed to get download URL for: ${doc.document_type || doc.file_name}`)
                                }
                              } catch (err) {
                                failCount++
                                console.error(`Error downloading ${doc.document_type || doc.file_name}:`, err)
                              }
                            } else {
                              failCount++
                            }
                          }
    
                          // Show result
                          if (successCount > 0) {
                            if (failCount > 0) {
                              showToast?.(`Downloaded ${successCount} file(s) successfully. ${failCount} file(s) failed.`, 'warning')
                            } else {
                              showToast?.(`Successfully downloaded ${successCount} file(s)`, 'success')
                            }
                          } else {
                            showToast?.('Failed to download files. Please try again or check your browser settings.', 'error')
                          }
    
                          setIsExportModalOpen(false)
                          setSelectedDocuments(new Set())
                        } catch (error) {
                          console.error('Export failed:', error)
                          showToast?.('Export failed: ' + (error instanceof Error ? error.message : 'Unknown error'), 'error')
                        }
                      }
                    }}
                    disabled={selectedDocuments.size === 0 || allDocuments.length === 0}
                    className="px-6 py-3 bg-white text-black rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    Export Selected ({selectedDocuments.size})
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    
      {/* Send Documents Modal */}
      {isSendModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => setIsSendModalOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto opacity-100"
              onClick={(e) => e.stopPropagation()}
              style={{ backgroundColor: '#151515' }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-800">
                <h2 className="text-2xl font-light text-white">Send Documents</h2>
                <button
                  onClick={() => setIsSendModalOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
    
              {/* Modal Content */}
              <div className="p-6 space-y-6">
                {/* Select All */}
                <div className="flex items-center justify-between pb-4 border-b border-gray-800">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedDocumentsToSend.size === allDocuments.length}
                      onChange={handleSelectAllForSend}
                      className="w-5 h-5 text-white bg-gray-800 border-gray-600 rounded focus:ring-white/40 focus:ring-2"
                    />
                    <span className="text-white font-medium">Select All</span>
                  </label>
                  <span className="text-gray-400 text-sm">
                    {selectedDocumentsToSend.size} of {allDocuments.length} selected
                  </span>
                </div>
    
                {/* Document List */}
                <div className="space-y-3">
                  {allDocuments.map((doc) => (
                    <label
                      key={doc.id}
                      className="flex items-center gap-3 p-4 bg-gray-900 rounded-lg border border-gray-800 hover:border-white/40/50 transition-colors cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedDocumentsToSend.has(doc.id)}
                        onChange={() => toggleDocumentSelectionForSend(doc.id)}
                        className="w-5 h-5 text-white bg-gray-800 border-gray-600 rounded focus:ring-white/40 focus:ring-2"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-white font-medium">{doc.name}</span>
                          {doc.period && (
                            <span className="px-2 py-0.5 text-xs rounded-full border bg-blue-500/20 text-blue-400 border-blue-500/30">
                              {doc.period}
                            </span>
                          )}
                        </div>
                        <div className="text-gray-400 text-sm mt-1">{doc.category}</div>
                      </div>
                    </label>
                  ))}
                </div>
    
                {/* Action Buttons */}
                <div className="flex justify-end gap-4 pt-4 border-t border-gray-800">
                  <button
                    onClick={() => {
                      setIsSendModalOpen(false)
                      setSelectedDocumentsToSend(new Set())
                    }}
                    className="px-6 py-3 bg-transparent border border-white/20 text-white rounded-lg hover:border-white/40 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSendNext}
                    disabled={selectedDocumentsToSend.size === 0}
                    className="px-6 py-3 bg-white text-black rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    
      {/* Email Template Modal */}
      {isEmailTemplateOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-50"
            onClick={() => {
              setIsEmailTemplateOpen(false)
              setSelectedDocumentsToSend(new Set())
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto opacity-100"
              onClick={(e) => e.stopPropagation()}
              style={{ backgroundColor: '#151515' }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-gray-800">
                <h2 className="text-2xl font-light text-white">Send Email</h2>
                <button
                  onClick={() => {
                    setIsEmailTemplateOpen(false)
                    setSelectedDocumentsToSend(new Set())
                  }}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
    
              {/* Modal Content */}
              <div className="p-6 space-y-6">
                {/* Selected Documents Info */}
                <div className="bg-black rounded-lg p-4 border border-white/10">
                  <div className="text-sm text-gray-400 mb-2">Selected Documents:</div>
                  <div className="text-white">
                    {selectedDocumentsToSend.size} document
                    {selectedDocumentsToSend.size !== 1 ? 's' : ''} selected
                  </div>
                </div>
    
                {/* Recipients */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Recipients <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={emailData.recipients}
                    onChange={(e) =>
                      setEmailData((prev) => ({ ...prev, recipients: e.target.value }))
                    }
                    placeholder="Enter email addresses (comma separated)"
                    className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                  />
                  <p className="text-gray-500 text-xs mt-1">
                    Separate multiple email addresses with commas
                  </p>
                </div>
    
                {/* Subject */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Subject <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={emailData.subject}
                    onChange={(e) =>
                      setEmailData((prev) => ({ ...prev, subject: e.target.value }))
                    }
                    placeholder="Email subject"
                    className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                  />
                </div>
    
                {/* Email Content */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Email Content <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={emailData.body}
                    onChange={(e) =>
                      setEmailData((prev) => ({ ...prev, body: e.target.value }))
                    }
                    rows={10}
                    placeholder="Write your email message here..."
                    className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors resize-none"
                  />
                </div>
    
                {/* Action Buttons */}
                <div className="flex justify-end gap-4 pt-4 border-t border-gray-800">
                  <button
                    onClick={() => {
                      setIsEmailTemplateOpen(false)
                      setSelectedDocumentsToSend(new Set())
                      setEmailData({
                        recipients: '',
                        subject: 'Document Sharing - Compliance Vault',
                        body: 'Please find the attached documents from our Compliance Vault.',
                        includeLinks: true,
                        includeAttachments: false,
                      })
                    }}
                    className="px-6 py-3 bg-transparent border border-white/20 text-white rounded-lg hover:border-white/40 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!emailData.recipients.trim() || !emailData.subject.trim() || !emailData.body.trim()) {
                        return
                      }
                      if (!currentCompany) {
                        showToast?.('No company selected', 'error')
                        return
                      }
    
                      setIsSendingEmail(true)
                      try {
                        // Parse recipients (comma or semicolon separated)
                        const recipients = emailData.recipients
                          .split(/[,;]/)
                          .map(e => e.trim())
                          .filter(e => e.includes('@'))
    
                        if (recipients.length === 0) {
                          showToast?.('Please enter valid email addresses', 'warning')
                          return
                        }
    
                        const result = await sendDocumentsEmail({
                          companyId: currentCompany.id,
                          companyName: currentCompany.name,
                          documentIds: Array.from(selectedDocumentsToSend),
                          recipients,
                          subject: emailData.subject,
                          message: emailData.body,
                        })
    
                        if (result.success) {
                          showToast?.(result.message || 'Documents sent successfully!', 'success')
                          setIsEmailTemplateOpen(false)
                          setSelectedDocumentsToSend(new Set())
                          setEmailData({
                            recipients: '',
                            subject: 'Document Sharing - Compliance Vault',
                            body: 'Please find the attached documents from our Compliance Vault.',
                        includeLinks: true,
                        includeAttachments: false,
                          })
                        } else {
                          showToast?.('Failed to send: ' + (result.error || 'Unknown error'), 'error')
                        }
                      } catch (error) {
                        console.error('Error sending documents:', error)
                        showToast?.('Error sending documents: ' + (error instanceof Error ? error.message : 'Something went wrong'), 'error')
                      } finally {
                        setIsSendingEmail(false)
                      }
                    }}
                    disabled={
                      isSendingEmail ||
                      !emailData.recipients.trim() ||
                      !emailData.subject.trim() ||
                      !emailData.body.trim()
                    }
                    className="px-6 py-3 bg-white text-black rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSendingEmail ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <polyline points="22,6 12,13 2,6" />
                        </svg>
                        Send Email
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Modals - Documents tab specific modals are defined above */}
      {/* Tracker-specific modals (Document Upload from Tracker, Bulk Action, Compliance Score) are handled in parent */}
          {isStorageBreakdownOpen && (
            <>
              <div
                className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
                onClick={() => setIsStorageBreakdownOpen(false)}
              />
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                <div
                  className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                  onClick={(e) => e.stopPropagation()}
                  style={{ backgroundColor: '#151515' }}
                >
                  {/* Modal Header */}
                  <div className="flex items-center justify-between p-6 border-b border-gray-800">
                    <h2 className="text-2xl font-light text-white">Storage Breakdown</h2>
                    <button
                      onClick={() => setIsStorageBreakdownOpen(false)}
                      className="text-gray-400 hover:text-white transition-colors"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
    
                  {/* Modal Content */}
                  <div className="p-6 space-y-6">
                    {/* Overall Stats */}
                    <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">Total Storage</span>
                        <span className="text-white font-medium">4.2 GB / 10 GB</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-2.5">
                        <div className="bg-white h-2.5 rounded-full" style={{ width: '42%' }}></div>
                      </div>
                      <p className="text-gray-500 text-xs mt-2">42% used</p>
                    </div>
    
                    {/* Breakdown by Folder */}
                    <div>
                      <h3 className="text-white font-medium mb-4">Storage by Folder</h3>
                      <div className="space-y-3">
                        {documentFolders.map((folder: string) => {
                          const folderDocs = vaultDocuments.filter((d: any) => d.folder_name === folder)
                          const folderSize = folderDocs.length * 0.5 // Mock size calculation
                          return (
                            <div key={folder} className="flex items-center justify-between p-3 bg-gray-900 rounded-lg border border-gray-800">
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm truncate">{folder}</p>
                                <p className="text-gray-400 text-xs">{folderDocs.length} documents</p>
                              </div>
                              <div className="text-right">
                                <p className="text-white text-sm font-medium">{folderSize.toFixed(1)} GB</p>
                                <p className="text-gray-400 text-xs">{((folderSize / 4.2) * 100).toFixed(0)}%</p>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
    
                    {/* Largest Files */}
                    <div>
                      <h3 className="text-white font-medium mb-4">Largest Files</h3>
                      <div className="space-y-2">
                        {vaultDocuments
                          .sort((a: any, b: any) => (b.file_size || 0) - (a.file_size || 0))
                          .slice(0, 5)
                          .map((doc: any) => (
                            <div key={doc.id} className="flex items-center justify-between p-2 bg-gray-900 rounded border border-gray-800">
                              <div className="flex-1 min-w-0">
                                <p className="text-white text-sm truncate">{doc.document_type}</p>
                                <p className="text-gray-400 text-xs truncate">{doc.folder_name}</p>
                              </div>
                              <p className="text-gray-400 text-xs ml-2">{(doc.file_size || 0) / (1024 * 1024)} MB</p>
                            </div>
                          ))}
                      </div>
                    </div>
    
                    {/* Cleanup Suggestions */}
                    <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-4">
                      <h3 className="text-yellow-400 font-medium mb-2">Cleanup Suggestions</h3>
                      <ul className="text-gray-300 text-sm space-y-1">
                        <li>· Review expired documents for deletion</li>
                        <li>· Archive old financial year documents</li>
                        <li>· Remove duplicate files</li>
                      </ul>
                    </div>
    
                    {/* Upgrade CTA */}
                    {4.2 / 10 > 0.8 && (
                      <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                        <h3 className="text-blue-400 font-medium mb-2">Storage Almost Full</h3>
                        <p className="text-gray-300 text-sm mb-3">You're using 80% of your storage. Consider upgrading your plan.</p>
                        <button className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors text-sm">
                          Upgrade Storage
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

      {/* Document Preview Modal */}
      {isPreviewModalOpen && previewDocument && (
        <>
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            onClick={() => {
              setIsPreviewModalOpen(false)
              setPreviewDocument(null)
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
              style={{ backgroundColor: '#151515' }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-800">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="text-gray-400 flex-shrink-0">
                    {getFileTypeIcon(previewDocument.file_name || previewDocument.document_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg sm:text-xl font-light text-white truncate">{previewDocument.document_type || previewDocument.file_name}</h2>
                    <p className="text-xs sm:text-sm text-gray-400 truncate">{previewDocument.folder_name}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => handleView(previewDocument.file_path)}
                    className="px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                  >
                    Open Full
                  </button>
                  <button
                    onClick={() => {
                      setIsPreviewModalOpen(false)
                      setPreviewDocument(null)
                      setPreviewModalTab('preview')
                    }}
                    className="text-gray-400 hover:text-white transition-colors p-1"
                  >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Tab Navigation */}
              <div className="border-b border-gray-800 flex">
                <button
                  onClick={() => setPreviewModalTab('preview')}
                  className={`px-4 sm:px-6 py-3 text-sm sm:text-base font-medium transition-colors ${previewModalTab === 'preview'
                      ? 'text-white border-b-2 border-white'
                      : 'text-gray-400 hover:text-gray-300'
                    }`}
                >
                  Preview
                </button>
                <button
                  onClick={() => setPreviewModalTab('compliance')}
                  className={`px-4 sm:px-6 py-3 text-sm sm:text-base font-medium transition-colors ${previewModalTab === 'compliance'
                      ? 'text-white border-b-2 border-white'
                      : 'text-gray-400 hover:text-gray-300'
                    }`}
                >
                  Compliance Info
                </button>
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-auto">
                {previewModalTab === 'preview' ? (
                  <div className="p-4 sm:p-6">
                    {previewDocument.previewUrl ? (
                      <iframe
                        src={previewDocument.previewUrl}
                        className="w-full h-full min-h-[500px] border border-gray-800 rounded-lg"
                        title="Document Preview"
                      />
                    ) : (
                      <div className="text-center text-gray-400 py-12">
                        <p>Loading preview...</p>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-4 sm:p-6 text-gray-400">
                    <p>Compliance information will be displayed here.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Document Upload Modal from Tracker */}
      {documentUploadModal && documentUploadModal.isOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-light text-white">Upload Document</h3>
                  <p className="text-sm text-gray-400 mt-1">Upload document for compliance requirement</p>
                </div>
                <button
                  onClick={() => {
                    if (!uploadingDocument && setDocumentUploadModal) {
                      setDocumentUploadModal(null)
                      if (setUploadFile) setUploadFile(null)
                      if (setUploadProgress) setUploadProgress(0)
                      if (setUploadStage) setUploadStage('')
                      if (setPreviewFileUrl) setPreviewFileUrl(null)
                    }
                  }}
                  disabled={uploadingDocument}
                  className="text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Requirement Info */}
              <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Requirement</label>
                    <div className="text-white font-medium">{documentUploadModal.requirement}</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Document Type</label>
                    <div className="text-blue-400 font-medium">{documentUploadModal.documentName}</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1">Category</label>
                    <div className="text-gray-300 text-sm">{documentUploadModal.category}</div>
                  </div>
                </div>
              </div>

              {/* File Upload Area */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Select File</label>
                <div
                  className={`border-2 border-dashed rounded-lg p-6 transition-colors ${uploadFile
                      ? 'border-green-500/50 bg-green-500/10'
                      : 'border-gray-700 bg-gray-900/50 hover:border-gray-600'
                    }`}
                  onDragOver={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const file = e.dataTransfer.files[0]
                    if (file && setUploadFile) {
                      setUploadFile(file)
                    }
                  }}
                >
                  {!uploadFile ? (
                    <div className="text-center">
                      <svg className="w-12 h-12 mx-auto text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      <p className="text-gray-400 text-sm mb-2">Drag and drop a file here, or click to browse</p>
                      <p className="text-gray-500 text-xs">Supports: PDF, Images (JPG, PNG), Word (DOC, DOCX)</p>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (file && setUploadFile) {
                            setUploadFile(file)
                          }
                        }}
                        className="hidden"
                        id="tracker-file-upload-input"
                      />
                      <label
                        htmlFor="tracker-file-upload-input"
                        className="mt-3 inline-block px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors cursor-pointer text-sm font-medium"
                      >
                        Browse Files
                      </label>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div className="min-w-0 flex-1">
                              <p className="text-white font-medium truncate">{uploadFile.name}</p>
                              <p className="text-gray-400 text-xs mt-0.5">
                                {(uploadFile.size / 1024 / 1024).toFixed(2)} MB • {uploadFile.type || 'Unknown type'}
                              </p>
                            </div>
                          </div>
                        </div>
                        {setUploadFile && (
                          <button
                            onClick={() => setUploadFile(null)}
                            disabled={uploadingDocument}
                            className="text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50 ml-2"
                          >
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Upload Progress */}
              {uploadingDocument && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{uploadStage || 'Uploading...'}</span>
                    <span className="text-white font-medium">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-white h-full rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 border-t border-gray-800 flex justify-end gap-3">
                <button
                  onClick={() => {
                    if (!uploadingDocument && setDocumentUploadModal) {
                      setDocumentUploadModal(null)
                      if (setUploadFile) setUploadFile(null)
                      if (setUploadProgress) setUploadProgress(0)
                      if (setUploadStage) setUploadStage('')
                      if (setPreviewFileUrl) setPreviewFileUrl(null)
                    }
                  }}
                  disabled={uploadingDocument}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (handleTrackerDocumentUpload) {
                      handleTrackerDocumentUpload().catch((err) => {
                        console.error('Upload error:', err)
                        if (showToast) {
                          showToast?.('Upload failed: ' + (err.message || 'Unknown error'), 'error')
                        }
                      })
                    } else {
                      console.error('handleTrackerDocumentUpload is not available')
                      if (showToast) {
                        showToast?.('Upload handler is not available', 'error')
                      }
                    }
                  }}
                  disabled={!uploadFile || uploadingDocument || !handleTrackerDocumentUpload}
                  className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
                >
                  {uploadingDocument ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                      {uploadStage || 'Uploading...'}
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                      Upload Document
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CIA Fullscreen Deep Dive */}
      {currentCompany && (
        <CIAFullscreen
          companyId={currentCompany.id}
          companyName={currentCompany.name || 'Company'}
          isOpen={isCIAOpen}
          onClose={() => { setIsCIAOpen(false); setCIAInitialQuestion(undefined); }}
          suggestedQuestions={[
            'What are my overdue compliances?',
            'Summarize my uploaded documents',
            'What filings are due this month?',
            'What penalties am I facing?',
          ]}
          initialQuestion={ciaInitialQuestion}
        />
      )}

      {/* Agent-assisted single-file upload (PRD v1.1 §2.1 / §2.2) */}
      {isAgentUploadOpen && currentCompany?.id && (
        <AgentAssistedUploadModal
          isOpen={isAgentUploadOpen}
          companyId={currentCompany.id}
          defaultFolderId={agentUploadDefaultFolderId}
          onClose={() => {
            setIsAgentUploadOpen(false)
            setAgentUploadDefaultFolderId(null)
          }}
          onFinalized={() => {
            // Refetch the vault so the newly-finalized document appears.
            fetchVaultDocuments()
          }}
        />
      )}

      {/* Agent-assisted bulk upload */}
      {isAgentBulkOpen && currentCompany?.id && (
        <AgentAssistedBulkUploadModal
          isOpen={isAgentBulkOpen}
          companyId={currentCompany.id}
          onClose={() => setIsAgentBulkOpen(false)}
          onFinalized={() => fetchVaultDocuments()}
        />
      )}
    </div>
  )
}
