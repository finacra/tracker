'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import React from 'react'
import Header from '@/components/Header'
import CompanySelector from '@/components/CompanySelector'
import SubtleCircuitBackground from '@/components/SubtleCircuitBackground'
import { createClient } from '@/utils/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { uploadDocument, getCompanyDocuments, getDocumentTemplates, getDownloadUrl, deleteDocument } from '@/app/onboarding/actions'
import { getRegulatoryRequirements, updateRequirementStatus, createRequirement, deleteRequirement, updateRequirement, type RegulatoryRequirement } from '@/app/data-room/actions'
import jsPDF from 'jspdf'
import { useUserRole } from '@/hooks/useUserRole'
import { enrichComplianceRequirements, type EnrichedComplianceData } from '@/app/data-room/actions-enrichment'

interface Company {
  id: string
  name: string
  type: string
  year: string
}

interface Director {
  id: string
  firstName: string
  lastName: string
  middleName: string
  din?: string
  designation?: string
  dob?: string
  pan?: string
  email?: string
  mobile?: string
  verified: boolean
}

interface EntityDetails {
  companyName: string
  type: string
  regDate: string
  pan: string
  cin: string
  address: string
  phoneNumber: string
  industryCategory: string
  directors: Director[]
}

export default function DataRoomPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()
  
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [entityDetails, setEntityDetails] = useState<EntityDetails | null>(null)
  const [vaultDocuments, setVaultDocuments] = useState<any[]>([])
  const [documentTemplates, setDocumentTemplates] = useState<any[]>([])
  const [regulatoryRequirements, setRegulatoryRequirements] = useState<RegulatoryRequirement[]>([])
  const [isLoadingRequirements, setIsLoadingRequirements] = useState(false)
  const [isGeneratingEnhancedPDF, setIsGeneratingEnhancedPDF] = useState(false)
  const [pdfGenerationProgress, setPdfGenerationProgress] = useState({ current: 0, total: 0, step: '' })

  // Get user role for current company
  const { role, canEdit, canManage, loading: roleLoading } = useUserRole(currentCompany?.id || null)

  // Fetch all companies for the selector (owned + invited)
  useEffect(() => {
    console.log('[fetchCompanies] useEffect triggered - authLoading:', authLoading, 'user:', user?.id, 'email:', user?.email)
    
    // Wait for auth to finish loading
    if (authLoading) {
      console.log('[fetchCompanies] Auth still loading, waiting...')
      return
    }
    
    // If no user after loading, return early
    if (!user) {
      console.log('[fetchCompanies] No user after auth loaded, returning early')
      return
    }
    
    async function fetchCompanies() {
      if (!user) {
        console.log('[fetchCompanies] No user available')
        return
      }
      
      console.log('[fetchCompanies] Function called - user:', user.id, 'email:', user.email)

      console.log('[fetchCompanies] Starting fetch for user:', user.id)
      
      try {
        // Fetch companies owned by user
        const { data: ownedCompanies, error: ownedError } = await supabase
          .from('companies')
          .select('id, name, type, incorporation_date')
          .eq('user_id', user.id)

        if (ownedError) throw ownedError

        // Fetch companies user has access to via user_roles
        // Try RPC first, then fallback to direct query
        let invitedCompanyIds: string[] = []
        
        console.log('[fetchCompanies] Starting to fetch invited companies for user:', user.id)
        
        // First try: Direct query (most reliable - uses "Users can view their own roles" policy)
        console.log('[fetchCompanies] Attempting direct query...')
        const { data: directRoles, error: directError } = await supabase
          .from('user_roles')
          .select('company_id')
          .eq('user_id', user.id)
          .not('company_id', 'is', null)
        
        if (directError) {
          console.error('[fetchCompanies] Direct query failed:', directError)
          // Fallback: Try RPC function
          console.log('[fetchCompanies] Trying RPC function as fallback...')
          try {
            const { data: userRoles, error: rolesError } = await supabase
              .rpc('get_user_company_ids', { p_user_id: user.id })
            
            if (rolesError) {
              console.error('[fetchCompanies] RPC also failed:', rolesError)
            } else {
              console.log('[fetchCompanies] RPC succeeded, found', userRoles?.length || 0, 'company IDs')
              invitedCompanyIds = userRoles 
                ? [...new Set((userRoles as Array<{ company_id: string | null }>).map((ur) => ur.company_id).filter((id: string | null): id is string => id !== null))]
                : []
            }
          } catch (rpcError) {
            console.error('[fetchCompanies] RPC exception:', rpcError)
          }
        } else {
          console.log('[fetchCompanies] Direct query succeeded! Found', directRoles?.length || 0, 'roles')
          console.log('[fetchCompanies] Role data:', JSON.stringify(directRoles, null, 2))
          invitedCompanyIds = directRoles 
            ? [...new Set(directRoles.map((ur: { company_id: string | null }) => ur.company_id).filter((id: string | null): id is string => id !== null))]
            : []
          console.log('[fetchCompanies] Extracted company IDs:', invitedCompanyIds)
        }

        // Fetch company details for invited companies
        let invitedCompanies: any[] = []
        if (invitedCompanyIds.length > 0) {
          console.log('[fetchCompanies] Fetching company details for', invitedCompanyIds.length, 'companies')
          console.log('[fetchCompanies] Company IDs to fetch:', JSON.stringify(invitedCompanyIds))
          
          const { data: invitedData, error: invitedError } = await supabase
            .from('companies')
            .select('id, name, type, incorporation_date')
            .in('id', invitedCompanyIds)

          console.log('[fetchCompanies] Company details query result - Data:', invitedData, 'Error:', invitedError)
          
          if (invitedError) {
            console.error('[fetchCompanies] ERROR fetching company details:', invitedError)
            console.error('[fetchCompanies] Error code:', invitedError.code, 'Message:', invitedError.message)
            console.error('[fetchCompanies] Error details:', invitedError.details, 'Hint:', invitedError.hint)
            // Don't throw - continue with empty array so owned companies still show
            invitedCompanies = []
          } else {
            console.log('[fetchCompanies] Fetched', invitedData?.length || 0, 'company details')
            if (invitedData && invitedData.length > 0) {
              console.log('[fetchCompanies] Company details:', JSON.stringify(invitedData, null, 2))
            } else {
              console.warn('[fetchCompanies] WARNING: Company IDs found but no company details returned!')
              console.warn('[fetchCompanies] This suggests an RLS policy is blocking access to the companies table.')
              console.warn('[fetchCompanies] Run FIX-COMPANIES-RLS-POLICY.sql to fix this!')
            }
            invitedCompanies = invitedData || []
          }
        } else {
          console.log('[fetchCompanies] No invited company IDs to fetch')
        }

        // Combine and deduplicate companies
        const companyMap = new Map<string, Company>()
        
        // Add owned companies
        if (ownedCompanies) {
          ownedCompanies.forEach(c => {
            companyMap.set(c.id, {
              id: c.id,
              name: c.name,
              type: c.type,
              year: new Date(c.incorporation_date).getFullYear().toString()
            })
          })
        }

        // Add companies from user_roles
        invitedCompanies.forEach(c => {
          if (!companyMap.has(c.id)) {
            companyMap.set(c.id, {
              id: c.id,
              name: c.name,
              type: c.type,
              year: new Date(c.incorporation_date).getFullYear().toString()
            })
          }
        })

        const allCompanies = Array.from(companyMap.values())
          .sort((a, b) => b.id.localeCompare(a.id)) // Sort by ID (newest first)

        console.log('[fetchCompanies] Total companies found:', allCompanies.length)
        console.log('[fetchCompanies] Companies:', allCompanies.map(c => ({ id: c.id, name: c.name })))
        
        if (allCompanies.length > 0) {
          console.log('[fetchCompanies] Setting companies and current company:', allCompanies[0].name)
          setCompanies(allCompanies)
          setCurrentCompany(allCompanies[0])
        } else {
          console.log('[fetchCompanies] No companies found, clearing state')
          setCompanies([])
          setCurrentCompany(null)
        }
      } catch (err) {
        console.error('[fetchCompanies] ERROR fetching companies:', err)
        console.error('[fetchCompanies] Error details:', JSON.stringify(err, null, 2))
      }
    }

    console.log('[fetchCompanies] useEffect setup complete, calling fetchCompanies...')

    async function fetchTemplates() {
      const result = await getDocumentTemplates()
      if (result.success) {
        setDocumentTemplates(result.templates || [])
      }
    }

    // Run both in parallel
    fetchCompanies()
    fetchTemplates()
  }, [user, supabase, authLoading])

  const fetchVaultDocuments = async () => {
    if (!currentCompany) return
    try {
      const result = await getCompanyDocuments(currentCompany.id)
      if (result.success) {
        setVaultDocuments(result.documents || [])
      } else {
        console.error('Failed to load vault documents:', result.error)
        setVaultDocuments([])
      }
    } catch (err) {
      console.error('Error fetching vault documents:', err)
      setVaultDocuments([])
    }
  }

  // Fetch specific company details and directors when currentCompany changes
  useEffect(() => {
    async function fetchDetails() {
      if (!currentCompany) return

      setIsLoading(true)
      const startTime = performance.now()
      console.log('[fetchDetails] Starting fetch for company:', currentCompany.id)
      
      try {
        // Fetch company details, directors, and documents IN PARALLEL
        const [companyResult, directorsResult] = await Promise.all([
          supabase.from('companies').select('*').eq('id', currentCompany.id).single(),
          supabase.from('directors').select('*').eq('company_id', currentCompany.id)
        ])

        console.log('[fetchDetails] Parallel fetch completed in', Math.round(performance.now() - startTime), 'ms')

        if (companyResult.error) throw companyResult.error
        if (directorsResult.error) throw directorsResult.error

        const company = companyResult.data
        const directors = directorsResult.data

        // Map to EntityDetails structure
        if (company) {
          const mappedDetails: EntityDetails = {
            companyName: company.name,
            type: company.type.toUpperCase(),
            regDate: new Date(company.incorporation_date).toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            }),
            pan: company.pan || 'Not Provided',
            cin: company.cin,
            address: company.address,
            phoneNumber: company.phone_number || 'Not Provided',
            industryCategory: Array.isArray(company.industry_categories) 
              ? company.industry_categories.join(', ') 
              : company.industry,
            directors: (directors || []).map(d => ({
              id: d.id,
              firstName: d.first_name,
              lastName: d.last_name || '',
              middleName: d.middle_name || '',
              din: d.din,
              designation: d.designation,
              dob: d.dob,
              pan: d.pan,
              email: d.email,
              mobile: d.mobile,
              verified: d.is_verified
            }))
          }
          setEntityDetails(mappedDetails)
        }

        // Fetch vault documents in background (don't block UI)
        fetchVaultDocuments()
        
        console.log('[fetchDetails] Total time:', Math.round(performance.now() - startTime), 'ms')
      } catch (err) {
        console.error('Error fetching entity details:', err)
      } finally {
        setIsLoading(false)
      }
    }

    fetchDetails()
  }, [currentCompany, supabase])

  const [selectedDirectorId, setSelectedDirectorId] = useState<string | null>(null)

  const [activeTab, setActiveTab] = useState('overview')
  
  // GST Integration States
  const [gstStep, setGstStep] = useState<'connect' | 'otp' | 'dashboard'>('connect')
  const [gstCredentials, setGstCredentials] = useState({ gstin: '', gstUsername: '' })
  const [gstOtp, setGstOtp] = useState('')
  const [isGstLoading, setIsGstLoading] = useState(false)
  const [gstAuthToken, setGstAuthToken] = useState<string | null>(null)
  const [gstError, setGstError] = useState<string | null>(null)
  const [gstData, setGstData] = useState<any>(null)
  const [selectedGstPeriod, setSelectedGstPeriod] = useState('012026')
  const [gstActiveSection, setGstActiveSection] = useState<'overview' | 'gstr1' | 'gstr2a' | 'gstr2b' | 'gstr3b' | 'ledger'>('overview')

  // Notices States
  const [noticesFilter, setNoticesFilter] = useState<'all' | 'pending' | 'responded' | 'resolved'>('all')
  const [noticesTypeFilter, setNoticesTypeFilter] = useState<string>('all')
  const [selectedNotice, setSelectedNotice] = useState<any>(null)
  const [noticeResponse, setNoticeResponse] = useState('')
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false)
  const [isAddNoticeModalOpen, setIsAddNoticeModalOpen] = useState(false)
  const [newNoticeForm, setNewNoticeForm] = useState({
    type: 'Income Tax',
    subType: '',
    section: '',
    subject: '',
    issuedBy: '',
    issuedDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    priority: 'medium',
    description: '',
    documents: [] as string[]
  })
  const [newDocument, setNewDocument] = useState('')
  const [isSubmittingNotice, setIsSubmittingNotice] = useState(false)

  // Demo Notices Data - Now stateful so we can add to it
  const [demoNotices, setDemoNotices] = useState([
    {
      id: 'NOT-2026-001',
      type: 'Income Tax',
      subType: 'Scrutiny Notice',
      section: 'Section 143(2)',
      subject: 'Selection for Scrutiny Assessment - AY 2024-25',
      issuedBy: 'Income Tax Department',
      issuedDate: '2026-01-15',
      dueDate: '2026-02-15',
      status: 'pending',
      priority: 'high',
      description: 'Your return for Assessment Year 2024-25 has been selected for scrutiny assessment. You are required to furnish the details/documents as specified.',
      documents: ['ITR Filed', 'Form 26AS', 'Bank Statements'],
      timeline: [
        { date: '2026-01-15', action: 'Notice Received', by: 'System' },
        { date: '2026-01-16', action: 'Assigned to CA', by: 'Admin' }
      ]
    },
    {
      id: 'NOT-2026-002',
      type: 'GST',
      subType: 'Show Cause Notice',
      section: 'Section 73',
      subject: 'Mismatch in GSTR-1 and GSTR-3B for FY 2024-25',
      issuedBy: 'GST Department',
      issuedDate: '2026-01-10',
      dueDate: '2026-01-25',
      status: 'responded',
      priority: 'high',
      description: 'Discrepancy noticed between outward supplies declared in GSTR-1 and tax paid in GSTR-3B. Please provide clarification with supporting documents.',
      documents: ['GSTR-1 Returns', 'GSTR-3B Returns', 'Reconciliation Statement'],
      timeline: [
        { date: '2026-01-10', action: 'Notice Received', by: 'System' },
        { date: '2026-01-12', action: 'Response Drafted', by: 'Accounts Team' },
        { date: '2026-01-14', action: 'Response Submitted', by: 'CA' }
      ]
    },
    {
      id: 'NOT-2026-003',
      type: 'MCA/RoC',
      subType: 'Compliance Notice',
      section: 'Section 92',
      subject: 'Non-filing of Annual Return (MGT-7)',
      issuedBy: 'Registrar of Companies',
      issuedDate: '2026-01-05',
      dueDate: '2026-01-20',
      status: 'resolved',
      priority: 'medium',
      description: 'It has been observed that the company has not filed the Annual Return in Form MGT-7 for the financial year 2024-25.',
      documents: ['MGT-7 Filed', 'Board Resolution'],
      timeline: [
        { date: '2026-01-05', action: 'Notice Received', by: 'System' },
        { date: '2026-01-08', action: 'MGT-7 Filed', by: 'CS' },
        { date: '2026-01-10', action: 'Compliance Completed', by: 'System' }
      ]
    },
    {
      id: 'NOT-2025-004',
      type: 'Labour Law',
      subType: 'Inspection Notice',
      section: 'EPF Act',
      subject: 'EPF Compliance Inspection Scheduled',
      issuedBy: 'EPFO',
      issuedDate: '2025-12-20',
      dueDate: '2026-01-10',
      status: 'resolved',
      priority: 'medium',
      description: 'An inspection under the EPF & MP Act, 1952 has been scheduled for your establishment. Please keep all relevant records ready.',
      documents: ['EPF Returns', 'Wage Register', 'Attendance Records'],
      timeline: [
        { date: '2025-12-20', action: 'Notice Received', by: 'System' },
        { date: '2025-12-25', action: 'Documents Prepared', by: 'HR' },
        { date: '2026-01-10', action: 'Inspection Completed', by: 'EPFO Officer' },
        { date: '2026-01-12', action: 'No Discrepancy Found', by: 'System' }
      ]
    },
    {
      id: 'NOT-2025-005',
      type: 'Income Tax',
      subType: 'Demand Notice',
      section: 'Section 156',
      subject: 'Outstanding Tax Demand - AY 2023-24',
      issuedBy: 'Income Tax Department',
      issuedDate: '2025-12-01',
      dueDate: '2025-12-30',
      status: 'pending',
      priority: 'critical',
      description: 'An outstanding tax demand of ₹2,45,000 is pending against your PAN for Assessment Year 2023-24. Please pay the amount or file rectification.',
      documents: ['Demand Notice', 'Computation Sheet'],
      timeline: [
        { date: '2025-12-01', action: 'Notice Received', by: 'System' },
        { date: '2025-12-05', action: 'Under Review by CA', by: 'CA' }
      ]
    },
    {
      id: 'NOT-2025-006',
      type: 'GST',
      subType: 'Registration Notice',
      section: 'Section 29',
      subject: 'Show Cause for GST Registration Cancellation',
      issuedBy: 'GST Department',
      issuedDate: '2025-11-15',
      dueDate: '2025-11-30',
      status: 'resolved',
      priority: 'critical',
      description: 'Non-filing of returns for consecutive 6 months. Show cause why GST registration should not be cancelled.',
      documents: ['All GSTR-3B Filed', 'Reply to SCN'],
      timeline: [
        { date: '2025-11-15', action: 'Notice Received', by: 'System' },
        { date: '2025-11-18', action: 'Filed Pending Returns', by: 'Accounts' },
        { date: '2025-11-20', action: 'Reply Submitted', by: 'CA' },
        { date: '2025-11-28', action: 'Registration Restored', by: 'GST Dept' }
      ]
    }
  ])

  const filteredNotices = demoNotices.filter(notice => {
    const matchesStatus = noticesFilter === 'all' || notice.status === noticesFilter
    const matchesType = noticesTypeFilter === 'all' || notice.type === noticesTypeFilter
    return matchesStatus && matchesType
  })
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false)
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isSendModalOpen, setIsSendModalOpen] = useState(false)
  const [isEmailTemplateOpen, setIsEmailTemplateOpen] = useState(false)
  const [selectedFY, setSelectedFY] = useState<string>('')
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set())
  const [selectedDocumentsToSend, setSelectedDocumentsToSend] = useState<Set<string>>(new Set())
  const [emailData, setEmailData] = useState({
    recipients: '',
    subject: 'Document Sharing - Compliance Vault',
    content: 'Please find the attached documents from our Compliance Vault.',
  })

  // Generate financial years from 2019 to current year
  const currentYear = new Date().getFullYear()
  const financialYears = Array.from({ length: currentYear - 2018 }, (_, i) => {
    const year = 2019 + i
    return `FY ${year}-${(year + 1).toString().slice(-2)}`
  }).reverse()
  const [uploadFormData, setUploadFormData] = useState({
    folder: '',
    documentName: '',
    registrationDate: '',
    expiryDate: '',
    hasNote: false,
    externalEmail: '',
    externalPassword: '',
    frequency: 'annually', // Default frequency
    file: null as File | null,
  })

  const [isUploading, setIsUploading] = useState(false)

  // Fallback defaults in case the database templates are empty
  const DEFAULT_FOLDERS = [
    'Constitutional Documents',
    'Financials and licenses',
    'Taxation & GST Compliance',
    'Regulatory & MCA Filings',
  ]

  const DEFAULT_DOCUMENTS: Record<string, string[]> = {
    'Constitutional Documents': [
      'Certificate of Incorporation',
      'MOA (Memorandum of Association)',
      'AOA (Articles of Association)',
      'Rental Deed',
      'DIN Certificate',
    ],
    'Financials and licenses': [
      'PAN',
      'TAN',
    ],
    'Taxation & GST Compliance': [
      'GST Returns',
      'Income Tax Returns',
    ],
    'Regulatory & MCA Filings': [
      'Annual Returns',
      'Board Minutes',
    ]
  }

  // Merge database templates with defaults to ensure all folders are present
  const documentFolders = documentTemplates.length > 0 
    ? Array.from(new Set([
        ...DEFAULT_FOLDERS, // Always include default folders
        ...documentTemplates.map(t => t.folder_name)
      ]))
    : DEFAULT_FOLDERS

  // Merge database templates with defaults
  const predefinedDocuments = documentTemplates.length > 0
    ? (() => {
        // Start with defaults (ensures PAN and TAN are in Financials and licenses)
        const merged = { ...DEFAULT_DOCUMENTS }
        
        // Add/override with database templates, but move PAN and TAN to correct folder
        documentTemplates.forEach(template => {
          const docName = template.document_name
          const folderName = template.folder_name
          
          // PAN and TAN should always be in "Financials and licenses"
          if (docName === 'PAN' || docName === 'TAN') {
            // Remove from any other folder
            Object.keys(merged).forEach(folder => {
              if (folder !== 'Financials and licenses') {
                merged[folder] = merged[folder].filter((d: string) => d !== docName)
              }
            })
            // Add to Financials and licenses
            if (!merged['Financials and licenses']) {
              merged['Financials and licenses'] = []
            }
            if (!merged['Financials and licenses'].includes(docName)) {
              merged['Financials and licenses'].push(docName)
            }
          } else {
            // For other documents, add to their specified folder
            if (!merged[folderName]) {
              merged[folderName] = []
            }
            if (!merged[folderName].includes(docName)) {
              merged[folderName].push(docName)
            }
          }
        })
        
        // Ensure PAN and TAN are removed from Constitutional Documents
        if (merged['Constitutional Documents']) {
          merged['Constitutional Documents'] = merged['Constitutional Documents'].filter(
            (d: string) => d !== 'PAN' && d !== 'TAN'
          )
        }
        
        return merged
      })()
    : DEFAULT_DOCUMENTS

  const handleView = async (filePath: string) => {
    try {
      const result = await getDownloadUrl(filePath)
      if (result.success && result.url) {
        window.open(result.url, '_blank')
      } else {
        alert('Failed to get document view URL')
      }
    } catch (err) {
      console.error('View error:', err)
      alert('Error opening document')
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
      } else {
        alert('Failed to download document')
      }
    } catch (err) {
      console.error('Export error:', err)
      alert('Error downloading document')
    }
  }

  const handleRemove = async (docId: string, filePath: string) => {
    if (!confirm('Are you sure you want to remove this document? This action cannot be undone.')) return

    try {
      const result = await deleteDocument(docId, filePath)
      if (result.success) {
        await fetchVaultDocuments()
        alert('Document removed successfully')
      } else {
        alert('Failed to remove document: ' + result.error)
      }
    } catch (err) {
      console.error('Remove error:', err)
      alert('Error removing document')
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

  const allDocuments = vaultDocuments
    .filter(doc => {
      // If no FY selected, show all documents
      if (!selectedFY) return true
      // If document has no registration date, don't show it when FY is selected
      if (!doc.registration_date) return false
      const docFY = getFinancialYear(doc.registration_date)
      return docFY === selectedFY
    })
    .map(doc => ({
      id: doc.id,
      name: doc.document_type,
      category: doc.folder_name,
      status: 'uploaded'
    }))

  const handleUpload = async () => {
    if (!uploadFormData.file || !uploadFormData.folder || !uploadFormData.documentName || !currentCompany) {
      alert('Please fill all required fields and select a file.')
      return
    }

    setIsUploading(true)
    try {
      const fileExt = uploadFormData.file.name.split('.').pop()
      const fileName = `${uploadFormData.documentName.replace(/\s+/g, '_')}_${Date.now()}.${fileExt}`
      const filePath = `${user?.id}/${currentCompany.id}/${fileName}`

      // 1. Upload to Storage
      const { error: uploadError } = await supabase.storage
        .from('company-documents')
        .upload(filePath, uploadFormData.file)

      if (uploadError) throw uploadError

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
        fileName: uploadFormData.file.name
      })

      if (result.success) {
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
        })
        // Refresh documents list
        await fetchVaultDocuments()
        alert('Document uploaded successfully!')
      }
    } catch (error: any) {
      console.error('Upload failed:', error)
      alert('Upload failed: ' + error.message)
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
  const [inviteEmail, setInviteEmail] = useState('colleague@example.com')
  const [inviteName, setInviteName] = useState('John Doe')
  const [inviteRole, setInviteRole] = useState('viewer')
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false)

  // Tracker filters
  // Calculate current financial year (Indian FY: April to March)
  const getCurrentFinancialYear = (): string => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() // 0-11 (Jan = 0, Apr = 3)
    
    // If current month is Jan-Mar (0-2), FY is previous year to current year
    // If current month is Apr-Dec (3-11), FY is current year to next year
    if (currentMonth < 3) {
      // Jan-Mar: FY is (currentYear - 1) - currentYear
      const fyStart = currentYear - 1
      return `FY ${fyStart}-${currentYear.toString().slice(-2)}`
    } else {
      // Apr-Dec: FY is currentYear - (currentYear + 1)
      return `FY ${currentYear}-${(currentYear + 1).toString().slice(-2)}`
    }
  }

  // Get current month name
  const getCurrentMonth = (): string => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December']
    return months[new Date().getMonth()]
  }

  const [selectedTrackerFY, setSelectedTrackerFY] = useState<string>(getCurrentFinancialYear())
  const [selectedMonth, setSelectedMonth] = useState<string | null>(getCurrentMonth())
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false)
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null)
  const [isQuarterDropdownOpen, setIsQuarterDropdownOpen] = useState(false)
  const [trackerView, setTrackerView] = useState<'list' | 'calendar'>('list')
  const [calendarMonth, setCalendarMonth] = useState<number>(new Date().getMonth())
  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear())
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all')
  const [industryFilter, setIndustryFilter] = useState<string>('all')
  const [industryCategoryFilter, setIndustryCategoryFilter] = useState<string>('all')
  const [complianceTypeFilter, setComplianceTypeFilter] = useState<string>('all')

  // CRUD modals and forms
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [editingRequirement, setEditingRequirement] = useState<RegulatoryRequirement | null>(null)
  const [requirementForm, setRequirementForm] = useState({
    category: '',
    requirement: '',
    description: '',
    due_date: '',
    penalty: '',
    is_critical: false,
    financial_year: '',
    status: 'not_started' as 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed',
    compliance_type: 'one-time' as 'one-time' | 'monthly' | 'quarterly' | 'annual',
    year: new Date().getFullYear().toString()
  })

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ]

  const quarters = [
    { value: 'q1', label: 'Q1 - April - June' },
    { value: 'q2', label: 'Q2 - July - Sep' },
    { value: 'q3', label: 'Q3 - Oct - Dec' },
    { value: 'q4', label: 'Q4 - Jan - Mar' },
  ]

  // Fetch regulatory requirements when company changes
  useEffect(() => {
    async function fetchRequirements() {
      if (!currentCompany) {
        setRegulatoryRequirements([])
        return
      }

      setIsLoadingRequirements(true)
      const startTime = performance.now()
      console.log('[fetchRequirements] Starting fetch for company:', currentCompany.id)
      
      try {
        const result = await getRegulatoryRequirements(currentCompany.id)
        console.log('[fetchRequirements] Completed in', Math.round(performance.now() - startTime), 'ms')
        
        if (result.success && result.requirements) {
          setRegulatoryRequirements(result.requirements)
        } else {
          console.error('Failed to fetch requirements:', result.error)
          setRegulatoryRequirements([])
        }
      } catch (error) {
        console.error('Error fetching requirements:', error)
        setRegulatoryRequirements([])
      } finally {
        setIsLoadingRequirements(false)
      }
    }

    fetchRequirements()
  }, [currentCompany]) // Removed activeTab - no need to re-fetch on tab change

  // Helper function to format date for display
  const formatDate = (dateStr: string): string => {
    try {
      const date = new Date(dateStr)
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
    } catch {
      return dateStr
    }
  }

  // Helper function to format date with full month name
  const formatDateForDisplay = (dateStr: string): string => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return dateStr
      return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    } catch {
      return dateStr
    }
  }

  // Refresh requirements
  const refreshRequirements = async () => {
    if (!currentCompany) return
    
    setIsLoadingRequirements(true)
    try {
      const result = await getRegulatoryRequirements(currentCompany.id)
      if (result.success && result.requirements) {
        setRegulatoryRequirements(result.requirements)
      } else {
        console.error('Failed to fetch requirements:', result.error)
        setRegulatoryRequirements([])
      }
    } catch (error) {
      console.error('Error fetching requirements:', error)
      setRegulatoryRequirements([])
    } finally {
      setIsLoadingRequirements(false)
    }
  }

  // Handle status change
  const handleStatusChange = async (requirementId: string, newStatus: 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed') => {
    if (!currentCompany) return

    try {
      const result = await updateRequirementStatus(requirementId, currentCompany.id, newStatus)
      if (result.success) {
        // Update local state
        setRegulatoryRequirements(prev => 
          prev.map(req => 
            req.id === requirementId 
              ? { ...req, status: newStatus }
              : req
          )
        )
      } else {
        alert(`Failed to update status: ${result.error}`)
      }
    } catch (error: any) {
      console.error('Error updating status:', error)
      alert(`Error: ${error.message}`)
    }
  }

  // Convert database requirements to display format
  const displayRequirements = regulatoryRequirements.map(req => ({
    id: req.id,
    category: req.category,
    requirement: req.requirement,
    description: req.description || '',
    status: req.status,
    dueDate: formatDate(req.due_date),
    penalty: req.penalty || '',
    isCritical: req.is_critical,
    financial_year: req.financial_year,
    entity_type: (req as any).entity_type,
    industry: (req as any).industry,
    industry_category: (req as any).industry_category,
    compliance_type: (req as any).compliance_type,
  }))


  const [teamMembers] = useState([
    {
      id: '1',
      name: 'Mohammed Ibrahim',
      email: 'ibrahimshaheer75@gmail.com',
      joinedDate: 'Jan 14, 2026',
      role: 'ADMIN',
    },
    {
      id: '2',
      name: 'MUNEER AHMED',
      email: 'camuneer@muneerassociates.in',
      joinedDate: 'Jan 16, 2026',
      role: 'ADMIN',
    },
  ])

  const roles = [
    { value: 'viewer', label: 'Viewer - Can view compliance items' },
    { value: 'editor', label: 'Editor - Can view and edit' },
    { value: 'admin', label: 'Admin - Full access including invites' },
  ]

  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      {/* Subtle Circuit Board Background */}
      <SubtleCircuitBackground />

      {/* Header */}
      <Header />

      {/* Main Content */}
      <div className="relative z-10 container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Company Selector */}
        <div className="mb-4 sm:mb-6">
          <h2 className="text-gray-400 text-sm font-medium mb-2 sm:mb-3">My companies</h2>
          <CompanySelector
            companies={companies}
            currentCompany={currentCompany}
            onCompanyChange={setCurrentCompany}
          />
        </div>

        {/* Page Title */}
        <h1 className="text-2xl sm:text-4xl font-light text-white mb-4 sm:mb-6">Data Room</h1>

        {/* Horizontal Tabs - Scrollable on Mobile */}
        <div className="flex items-center gap-2 mb-4 sm:mb-8 overflow-x-auto pb-2 -mx-3 sm:mx-0 px-3 sm:px-0 scrollbar-hide">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === 'overview'
                ? 'border-primary-orange bg-primary-orange/20 text-white'
                : 'border-gray-700 bg-primary-dark-card text-gray-400 hover:text-white hover:border-gray-600'
            }`}
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
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
            <span className="text-sm sm:text-base">Overview</span>
          </button>
          <button
            onClick={() => setActiveTab('tracker')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === 'tracker'
                ? 'border-primary-orange bg-primary-orange/20 text-white'
                : 'border-gray-700 bg-primary-dark-card text-gray-400 hover:text-white hover:border-gray-600'
            }`}
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
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            <span className="text-sm sm:text-base">Tracker</span>
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === 'documents'
                ? 'border-primary-orange bg-primary-orange/20 text-white'
                : 'border-gray-700 bg-primary-dark-card text-gray-400 hover:text-white hover:border-gray-600'
            }`}
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
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span className="text-sm sm:text-base">Documents</span>
          </button>
          <button
            onClick={() => setActiveTab('reports')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === 'reports'
                ? 'border-primary-orange bg-primary-orange/20 text-white'
                : 'border-gray-700 bg-primary-dark-card text-gray-400 hover:text-white hover:border-gray-600'
            }`}
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
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            <span className="text-sm sm:text-base">Reports</span>
          </button>
          <button
            onClick={() => setActiveTab('notices')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === 'notices'
                ? 'border-primary-orange bg-primary-orange/20 text-white'
                : 'border-gray-700 bg-primary-dark-card text-gray-400 hover:text-white hover:border-gray-600'
            }`}
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
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span className="text-sm sm:text-base">Notices <span className="text-gray-500 text-xs">(Soon)</span></span>
          </button>
          <button
            onClick={() => setActiveTab('gst')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${
              activeTab === 'gst'
                ? 'border-primary-orange bg-primary-orange/20 text-white'
                : 'border-gray-700 bg-primary-dark-card text-gray-400 hover:text-white hover:border-gray-600'
            }`}
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
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            <span className="text-sm sm:text-base">GST <span className="text-gray-500 text-xs">(Soon)</span></span>
          </button>
        </div>

        {/* Content based on active tab */}
        {activeTab === 'overview' && (
          <div>
            <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl shadow-2xl p-4 sm:p-8">
              {/* Card Header - Stack on Mobile */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-3 mb-4 sm:mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-primary-orange rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
                    <svg
                      width="16"
                      height="16"
                      className="sm:w-5 sm:h-5"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M14 2V8H20"
                      stroke="white"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
                  <h2 className="text-xl sm:text-2xl font-light text-white">Entity Details</h2>
                </div>
                <div className="sm:ml-auto w-full sm:w-auto">
                  <button
                    onClick={() => router.push('/manage-company')}
                    className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-primary-orange/20 border border-primary-orange text-primary-orange rounded-lg hover:bg-primary-orange/30 transition-colors text-xs sm:text-sm flex items-center justify-center gap-2"
                  >
                    <svg width="14" height="14" className="sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                    <span>Manage Company</span>
                  </button>
                </div>
              </div>

              {isLoading ? (
                <div className="py-8 sm:py-12 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-primary-orange border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-gray-400 text-sm sm:text-base">Loading company details...</p>
                </div>
              ) : entityDetails ? (
              <div className="space-y-3 sm:space-y-4">
                {/* Company Name */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                  <label className="text-xs sm:text-sm text-gray-400 sm:w-32 sm:flex-shrink-0">Company Name</label>
                  <div className="text-white text-base sm:text-lg font-medium break-words">{entityDetails.companyName}</div>
                </div>

                {/* Type */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                  <label className="text-xs sm:text-sm text-gray-400 sm:w-32 sm:flex-shrink-0">Type</label>
                  <span className="inline-block bg-primary-orange text-white px-3 py-1 rounded-full text-xs sm:text-sm font-medium w-fit">
                    {entityDetails.type}
                  </span>
                </div>

                {/* Reg Date */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                  <label className="text-xs sm:text-sm text-gray-400 sm:w-32 sm:flex-shrink-0">Reg Date</label>
                  <div className="text-white text-base sm:text-lg font-medium">{entityDetails.regDate}</div>
                </div>

                {/* PAN */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                  <label className="text-xs sm:text-sm text-gray-400 sm:w-32 sm:flex-shrink-0">PAN</label>
                  <div className="text-white text-base sm:text-lg font-medium break-all">{entityDetails.pan}</div>
                </div>

                {/* CIN */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                  <label className="text-xs sm:text-sm text-gray-400 sm:w-32 sm:flex-shrink-0">CIN</label>
                  <div className="text-white text-base sm:text-lg font-medium break-all">{entityDetails.cin}</div>
                </div>

                {/* Address */}
                <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                  <label className="text-xs sm:text-sm text-gray-400 sm:w-32 sm:flex-shrink-0 pt-0.5">Address</label>
                  <div className="text-white text-base sm:text-lg font-medium break-words flex-1">{entityDetails.address}</div>
                </div>

                {/* Phone Number */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                  <label className="text-xs sm:text-sm text-gray-400 sm:w-32 sm:flex-shrink-0">Phone Number</label>
                  <div className="text-white text-base sm:text-lg font-medium break-all">{entityDetails.phoneNumber}</div>
                </div>

                {/* Industry Category */}
                <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4">
                  <label className="text-xs sm:text-sm text-gray-400 sm:w-32 sm:flex-shrink-0 pt-0.5">Industry Category</label>
                  <div className="text-white text-base sm:text-lg font-medium break-words flex-1">{entityDetails.industryCategory}</div>
                </div>

                {/* Directors */}
                <div className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-4">
                  <label className="text-xs sm:text-sm text-gray-400 sm:w-32 sm:flex-shrink-0 pt-1">Directors</label>
                    <div className="flex-1 space-y-3 sm:space-y-4">
                      {/* Directors Dropdown */}
                      <div>
                        <select
                          value={selectedDirectorId || ''}
                          onChange={(e) => setSelectedDirectorId(e.target.value || null)}
                          className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors appearance-none cursor-pointer"
                        >
                          <option value="">Select a director to view profile</option>
                          {entityDetails.directors.map((director) => (
                            <option key={director.id} value={director.id}>
                              {director.firstName} {director.middleName} {director.lastName} {director.din ? `(DIN: ${director.din})` : ''}
                            </option>
                          ))}
                        </select>
                  </div>

                      {/* Director Profile */}
                      {selectedDirectorId && (() => {
                        const director = entityDetails.directors.find(d => d.id === selectedDirectorId)
                        if (!director) return null
                        
                        return (
                          <div className={`p-4 sm:p-6 bg-gray-900 border rounded-lg ${
                            director.verified
                              ? 'border-green-500/50 bg-green-500/5'
                              : 'border-gray-700'
                          }`}>
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4">
                              <div className="flex-1">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-primary-orange/20 rounded-full flex items-center justify-center flex-shrink-0">
                                    <span className="text-primary-orange font-semibold text-base sm:text-lg">
                                      {director.firstName?.[0] || ''}{director.lastName?.[0] || ''}
                                    </span>
                </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className="text-white font-semibold text-base sm:text-lg break-words">
                                      {director.firstName} {director.middleName} {director.lastName}
                                    </h3>
                                    {director.designation && (
                                      <p className="text-gray-400 text-xs sm:text-sm break-words">{director.designation}</p>
                                    )}
              </div>
                                  <div className="sm:ml-auto flex items-center gap-2 flex-shrink-0">
                                    {director.verified && (
                                      <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded flex items-center gap-1">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                          <polyline points="22 4 12 14.01 9 11.01" />
                                        </svg>
                                        Verified
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Director Details Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                                  {director.din && (
                                    <div className="p-3 bg-gray-800 rounded-lg">
                                      <div className="text-xs text-gray-500 mb-1">DIN Number</div>
                                      <div className="text-white font-mono text-sm sm:text-base break-all">{director.din}</div>
                                    </div>
                                  )}
                                  {director.pan && (
                                    <div className="p-3 bg-gray-800 rounded-lg">
                                      <div className="text-xs text-gray-500 mb-1">PAN Number</div>
                                      <div className="text-white font-mono text-sm sm:text-base break-all">{director.pan}</div>
                                    </div>
                                  )}
                                  {director.dob && (
                                    <div className="p-3 bg-gray-800 rounded-lg">
                                      <div className="text-xs text-gray-500 mb-1">Date of Birth</div>
                                      <div className="text-white text-sm sm:text-base">{formatDateForDisplay(director.dob)}</div>
                                    </div>
                                  )}
                                  {director.email && (
                                    <div className="p-3 bg-gray-800 rounded-lg">
                                      <div className="text-xs text-gray-500 mb-1">Email Address</div>
                                      <div className="text-white text-sm sm:text-base break-all">{director.email}</div>
                                    </div>
                                  )}
                                  {director.mobile && (
                                    <div className="p-3 bg-gray-800 rounded-lg">
                                      <div className="text-xs text-gray-500 mb-1">Mobile Number</div>
                                      <div className="text-white text-sm sm:text-base break-all">{director.mobile}</div>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center">
                  <p className="text-gray-400">No company selected or found.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'reports' && (() => {
          // Helper function to parse date
          const parseDate = (dateStr: string): Date | null => {
            try {
              // Try parsing formats like "Jan 15, 2026" or "2026-01-15"
              if (dateStr.includes(',')) {
                return new Date(dateStr)
              } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
                return new Date(dateStr)
              }
              return null
            } catch {
              return null
            }
          }

          // Calculate days delayed
          const calculateDelay = (dueDateStr: string, status: string): number | null => {
            if (status === 'completed' || status === 'upcoming') return null
            const dueDate = parseDate(dueDateStr)
            if (!dueDate) return null
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            dueDate.setHours(0, 0, 0, 0)
            const diffTime = today.getTime() - dueDate.getTime()
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
            return diffDays > 0 ? diffDays : null
          }

          // Calculate statistics
          const totalCompliances = displayRequirements.length
          const completed = displayRequirements.filter(r => r.status === 'completed').length
          const pending = displayRequirements.filter(r => r.status === 'pending').length
          const overdue = displayRequirements.filter(r => {
            if (r.status === 'overdue') return true
            if (r.status === 'completed') return false
            const dueDate = parseDate(r.dueDate)
            return dueDate !== null && dueDate < new Date()
          }).length
          const notStarted = displayRequirements.filter(r => r.status === 'not_started').length
          const upcoming = displayRequirements.filter(r => r.status === 'upcoming').length

          // Compliance score (0–100)
          // Base: completion rate; penalty: overdue items
          let complianceScore = 0
          if (totalCompliances > 0) {
            const completionRate = completed / totalCompliances
            const overdueRate = overdue / totalCompliances
            // Simple formula: 100 * completionRate, minus up to 30 points for overdue
            complianceScore = Math.max(
              0,
              Math.min(100, Math.round(100 * completionRate - 30 * overdueRate))
            )
          }

          // Category breakdown
          const categoryBreakdown: Record<string, number> = {}
          displayRequirements.forEach(req => {
            categoryBreakdown[req.category] = (categoryBreakdown[req.category] || 0) + 1
          })

          // Status breakdown
          const statusBreakdown = {
            completed,
            pending,
            overdue,
            notStarted,
            upcoming
          }

          // Financial year breakdown
          const fyBreakdown: Record<string, number> = {}
          displayRequirements.forEach(req => {
            const fy = req.financial_year || 'Not Specified'
            fyBreakdown[fy] = (fyBreakdown[fy] || 0) + 1
          })

          // Compliance type breakdown
          const complianceTypeBreakdown: Record<string, { total: number; completed: number; overdue: number; pending: number; notStarted: number }> = {
            'one-time': { total: 0, completed: 0, overdue: 0, pending: 0, notStarted: 0 },
            'monthly': { total: 0, completed: 0, overdue: 0, pending: 0, notStarted: 0 },
            'quarterly': { total: 0, completed: 0, overdue: 0, pending: 0, notStarted: 0 },
            'annual': { total: 0, completed: 0, overdue: 0, pending: 0, notStarted: 0 }
          }
          
          displayRequirements.forEach(req => {
            const type = (req.compliance_type || 'one-time') as 'one-time' | 'monthly' | 'quarterly' | 'annual'
            if (complianceTypeBreakdown[type]) {
              complianceTypeBreakdown[type].total++
              if (req.status === 'completed') {
                complianceTypeBreakdown[type].completed++
              } else if (req.status === 'overdue' || (parseDate(req.dueDate) && parseDate(req.dueDate)! < new Date())) {
                complianceTypeBreakdown[type].overdue++
              } else if (req.status === 'pending') {
                complianceTypeBreakdown[type].pending++
              } else if (req.status === 'not_started') {
                complianceTypeBreakdown[type].notStarted++
              }
            }
          })

          // Calculate penalty amount
          const calculatePenalty = (penaltyStr: string | null, daysDelayed: number | null): string => {
            if (daysDelayed === null || daysDelayed <= 0 || !penaltyStr || penaltyStr.trim() === '') {
              return '-'
            }

            const penalty = penaltyStr.trim()

            // ============================================
            // STEP 1: Handle NULL (from database)
            // ============================================
            if (penalty === 'NULL' || penalty === 'null' || penalty === '') {
              return 'Refer to Act'
            }

            // ============================================
            // STEP 2: Handle NUMERIC FORMATS (new database format)
            // ============================================

            // Simple daily rate: "50", "100", "200"
            if (/^\d+$/.test(penalty)) {
              const dailyRate = parseInt(penalty, 10)
              if (!isNaN(dailyRate) && dailyRate > 0) {
                return `₹${Math.round(dailyRate * daysDelayed).toLocaleString('en-IN')}`
              }
            }

            // Complex format with max cap: "100|500000" (daily|max)
            if (/^\d+\|\d+$/.test(penalty)) {
              const [dailyRateStr, maxCapStr] = penalty.split('|')
              const dailyRate = parseInt(dailyRateStr, 10)
              const maxCap = parseInt(maxCapStr, 10)
              
              if (!isNaN(dailyRate) && dailyRate > 0) {
                let calculated = dailyRate * daysDelayed
                if (!isNaN(maxCap) && maxCap > 0) {
                  calculated = Math.min(calculated, maxCap)
                }
                return `₹${Math.round(calculated).toLocaleString('en-IN')}`
              }
            }

            // Complex format with base amount: "500|100000" (daily|base)
            // This means: base amount + (daily rate * days)
            // Note: We need to distinguish this from max cap format
            // Convention: If second number > 10000, it's likely a base amount
            // But we'll check the original string context if available
            // For now, treat all pipe-separated as max cap (most common case)
            // If you need base+daily, we can add a different format like "500+100000"

            // ============================================
            // STEP 3: Handle REMAINING TEXT FORMATS (fallback for unconverted)
            // ============================================

            // Check for vague "Penalty as per X Act" or "Penalty as per X guidelines"
            if (/^Penalty\s+as\s+per/i.test(penalty) && !/Rs\.?\s*\d/i.test(penalty)) {
              return 'Refer to Act'
            }

            // Interest-based penalties (cannot calculate without principal)
            if (/Interest\s*@?\s*[\d.]+%/i.test(penalty)) {
              // Check if there's also a Late fee component we can calculate
              const lateFeeMatch = penalty.match(/Late\s*fee\s*(?:Rs\.?\s*|₹\s*)([\d,]+)(?:\s*(?:per\s*day|\/day))?/i)
              if (lateFeeMatch) {
                const dailyRate = parseFloat(lateFeeMatch[1].replace(/,/g, ''))
                if (!isNaN(dailyRate) && dailyRate > 0) {
                  return `₹${Math.round(dailyRate * daysDelayed).toLocaleString('en-IN')} (late fee only)`
                }
              }
              return 'Interest-based (needs tax amount)'
            }

            // Extract max cap if present (check BEFORE extracting daily rate)
            let maxCap: number | null = null
            const maxMatch = penalty.match(/(?:up\s*to\s*)?max\.?\s*Rs\.?\s*([\d,]+)/i)
            if (maxMatch) {
              maxCap = parseFloat(maxMatch[1].replace(/,/g, ''))
            }
            // Also check for Lakh format: "Rs. 5 Lakh max"
            const lakhMatch = penalty.match(/Rs\.?\s*([\d.]+)\s*(?:Lakh|L)\s*max/i)
            if (lakhMatch) {
              maxCap = parseFloat(lakhMatch[1].replace(/,/g, '')) * 100000
            }

            // Extract daily rate from text - regex should match even with extra text after "per day"
            // This handles: "Rs. 200 per day u/s 234E", "Rs. 50 per day (Rs. 20 for NIL)", etc.
            // The regex will match "Rs. 200 per day" even if followed by "u/s 234E" or other text
            const dailyMatch = penalty.match(/Rs\.?\s*([\d,]+)\s*per\s*day/i)
            if (dailyMatch) {
              const dailyRate = parseFloat(dailyMatch[1].replace(/,/g, ''))
              if (!isNaN(dailyRate) && dailyRate > 0) {
                let calculated = dailyRate * daysDelayed
                if (maxCap !== null && maxCap > 0) {
                  calculated = Math.min(calculated, maxCap)
                }
                return `₹${Math.round(calculated).toLocaleString('en-IN')}`
              }
            }
            
            // Handle "50/day (NIL: 20/day)" - extract the first number (main rate)
            const nilRateMatch = penalty.match(/(\d+)\/day\s*\([^)]*NIL[^)]*\)/i)
            if (nilRateMatch) {
              const dailyRate = parseFloat(nilRateMatch[1].replace(/,/g, ''))
              if (!isNaN(dailyRate) && dailyRate > 0) {
                let calculated = dailyRate * daysDelayed
                if (maxCap !== null && maxCap > 0) {
                  calculated = Math.min(calculated, maxCap)
                }
                return `₹${Math.round(calculated).toLocaleString('en-IN')}`
              }
            }

            // Try alternate formats - handle "50/day", "200/day", etc.
            const altMatch = penalty.match(/Rs\.?\s*([\d,]+)\s*\/\s*day/i) || 
                            penalty.match(/₹\s*([\d,]+)\s*(?:per\s*day|\/day)/i) ||
                            penalty.match(/(\d+)\s*per\s*day/i) ||
                            // Handle "50/day" format (without Rs.)
                            penalty.match(/^(\d+)\/day/i) ||
                            penalty.match(/(\d+)\/day/i)
            if (altMatch) {
              const dailyRate = parseFloat(altMatch[1].replace(/,/g, ''))
              if (!isNaN(dailyRate) && dailyRate > 0) {
                let calculated = dailyRate * daysDelayed
                if (maxCap !== null && maxCap > 0) {
                  calculated = Math.min(calculated, maxCap)
                }
                return `₹${Math.round(calculated).toLocaleString('en-IN')}`
              }
            }
            
            // Handle "200/day + 10000-100000" - extract daily rate before the +
            const dailyWithRangeMatch = penalty.match(/(\d+)\/day\s*\+\s*[\d-]+/i)
            if (dailyWithRangeMatch) {
              const dailyRate = parseFloat(dailyWithRangeMatch[1].replace(/,/g, ''))
              if (!isNaN(dailyRate) && dailyRate > 0) {
                return `₹${Math.round(dailyRate * daysDelayed).toLocaleString('en-IN')}`
              }
            }
            
            // Handle "2%/month + 5/day" - extract daily rate after the +
            const interestPlusDailyMatch = penalty.match(/[\d.]+%[^+]*\+\s*(\d+)\/day/i)
            if (interestPlusDailyMatch) {
              const dailyRate = parseFloat(interestPlusDailyMatch[1].replace(/,/g, ''))
              if (!isNaN(dailyRate) && dailyRate > 0) {
                return `₹${Math.round(dailyRate * daysDelayed).toLocaleString('en-IN')}`
              }
            }
            
            // Handle range formats like "25000-300000" - extract minimum
            const rangeMatch = penalty.match(/(\d+)\s*-\s*(\d+)/)
            if (rangeMatch && !penalty.includes('%')) {  // Not percentage ranges
              const minAmount = parseFloat(rangeMatch[1].replace(/,/g, ''))
              if (!isNaN(minAmount) && minAmount > 0) {
                // If it's a range without "per day", treat as fixed minimum
                // But if it's part of a daily rate pattern, we already handled it above
                if (!penalty.includes('/day') && !penalty.includes('per day')) {
                  return `₹${Math.round(minAmount).toLocaleString('en-IN')} (minimum)`
                }
              }
            }

            // Handle "Rs. 1 Lakh on Company + Rs. 5000 per day on officers" → extract officers penalty
            const officersMatch = penalty.match(/Rs\.?\s*([\d,]+)\s*per\s*day\s*on\s*officers/i)
            if (officersMatch) {
              const dailyRate = parseFloat(officersMatch[1].replace(/,/g, ''))
              if (!isNaN(dailyRate) && dailyRate > 0) {
                return `₹${Math.round(dailyRate * daysDelayed).toLocaleString('en-IN')}`
              }
            }

            // Handle Late fee patterns
            const lateFeeMatch = penalty.match(/Late\s*fee\s*(?:Rs\.?\s*|₹\s*)([\d,]+)/i)
            if (lateFeeMatch) {
              const dailyRate = parseFloat(lateFeeMatch[1].replace(/,/g, ''))
              if (!isNaN(dailyRate) && dailyRate > 0) {
                return `₹${Math.round(dailyRate * daysDelayed).toLocaleString('en-IN')}`
              }
            }

            // Check for fixed penalty amounts
            const fixedKeywords = /(?:fixed|one-time|one time|flat|lump)/i
            if (fixedKeywords.test(penalty)) {
              const fixedMatch = penalty.match(/(?:Rs\.?\s*|₹\s*)([\d,]+)/i)
              if (fixedMatch) {
                const amount = parseFloat(fixedMatch[1].replace(/,/g, ''))
                if (!isNaN(amount) && amount > 0) {
                  return `₹${Math.round(amount).toLocaleString('en-IN')}`
                }
              }
            }

            // Plain number as daily rate (fallback)
            const plainNumberMatch = penalty.match(/^[\d,]+(?:\.\d+)?$/)
            if (plainNumberMatch) {
              const amount = parseFloat(plainNumberMatch[0].replace(/,/g, ''))
              if (!isNaN(amount) && amount > 0) {
                return `₹${Math.round(amount * daysDelayed).toLocaleString('en-IN')}`
              }
            }

            // Vague "as per Act" references
            if (/as per.*Act/i.test(penalty) || /as per.*guidelines/i.test(penalty)) {
              return 'Refer to Act'
            }

            return 'Cannot calculate - Insufficient information'
          }

          // Calculate total penalties
          const calculateTotalPenalty = (): number => {
            let total = 0
            displayRequirements.forEach(req => {
              const delay = calculateDelay(req.dueDate, req.status)
              if (delay !== null && delay > 0 && req.penalty) {
                const penaltyStr = calculatePenalty(req.penalty, delay)
                if (penaltyStr !== '-' && !penaltyStr.includes('Cannot calculate')) {
                  const amount = parseFloat(penaltyStr.replace(/₹/g, '').replace(/,/g, ''))
                  if (!isNaN(amount)) {
                    total += amount
                  }
                }
              }
            })
            return total
          }

          const totalPenalty = calculateTotalPenalty()

          // Overdue compliances
          const overdueCompliances = displayRequirements.filter(req => {
            const delay = calculateDelay(req.dueDate, req.status)
            return delay !== null && delay > 0 && req.status !== 'completed'
          })

          // Export to CSV
          const exportToCSV = (data: any[], filename: string) => {
            if (data.length === 0) {
              alert('No data to export')
              return
            }

            const headers = Object.keys(data[0])
            const csvContent = [
              headers.join(','),
              ...data.map(row => headers.map(header => {
                const value = row[header] || ''
                return typeof value === 'string' && value.includes(',') ? `"${value}"` : value
              }).join(','))
            ].join('\n')

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
            const link = document.createElement('a')
            const url = URL.createObjectURL(blob)
            link.setAttribute('href', url)
            link.setAttribute('download', filename)
            link.style.visibility = 'hidden'
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
          }

          const exportComplianceReport = () => {
            const reportData = displayRequirements.map(req => ({
              'Category': req.category,
              'Requirement': req.requirement,
              'Status': req.status.toUpperCase(),
              'Due Date': req.dueDate,
              'Financial Year': req.financial_year || 'Not Specified',
              'Penalty': req.penalty || '-',
              'Is Critical': req.isCritical ? 'Yes' : 'No',
              'Compliance Type': req.compliance_type || 'one-time'
            }))
            exportToCSV(reportData, `compliance-report-${new Date().toISOString().split('T')[0]}.csv`)
          }

          const exportOverdueReport = () => {
            const reportData = overdueCompliances.map(req => {
              const delay = calculateDelay(req.dueDate, req.status)
              const penalty = calculatePenalty(req.penalty || '', delay)
              return {
                'Category': req.category,
                'Requirement': req.requirement,
                'Due Date': req.dueDate,
                'Days Delayed': delay || 0,
                'Penalty': req.penalty || '-',
                'Calculated Penalty': penalty,
                'Financial Year': req.financial_year || 'Not Specified',
                'Is Critical': req.isCritical ? 'Yes' : 'No'
              }
            })
            exportToCSV(reportData, `overdue-compliance-report-${new Date().toISOString().split('T')[0]}.csv`)
          }

          const exportPDFReport = async () => {
            setIsGeneratingEnhancedPDF(true)
            setPdfGenerationProgress({ current: 0, total: 0, step: 'Preparing report...' })

            // Identify non-compliant items (overdue, pending with past due dates)
            const nonCompliantItems = displayRequirements.filter(req => {
              const delay = calculateDelay(req.dueDate, req.status)
              return delay !== null && delay > 0 && req.status !== 'completed'
            })

            // Convert to RegulatoryRequirement format for enrichment
            const nonCompliantRequirements: RegulatoryRequirement[] = nonCompliantItems.map(req => ({
              id: req.id,
              company_id: currentCompany?.id || '',
              category: req.category,
              requirement: req.requirement,
              description: null,
              status: req.status as 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed',
              due_date: req.dueDate,
              penalty: req.penalty || null,
              is_critical: req.isCritical || false,
              financial_year: req.financial_year || null,
              created_at: '',
              updated_at: '',
              created_by: null,
              updated_by: null
            }))

            // Enrich non-compliant items
            let enrichedData: EnrichedComplianceData[] = []
            if (nonCompliantRequirements.length > 0) {
              setPdfGenerationProgress({ 
                current: 0, 
                total: nonCompliantRequirements.length, 
                step: 'Enriching compliance data...' 
              })
              
              // Call server action for enrichment (Tavily requires server-side execution)
              enrichedData = await enrichComplianceRequirements(nonCompliantRequirements)
              
              // Update progress after enrichment completes
              setPdfGenerationProgress({ 
                current: nonCompliantRequirements.length, 
                total: nonCompliantRequirements.length, 
                step: 'Enrichment complete' 
              })
            }

            setPdfGenerationProgress({ current: 0, total: 0, step: 'Generating PDF...' })

            const doc = new jsPDF()
            const pageWidth = doc.internal.pageSize.getWidth()
            const pageHeight = doc.internal.pageSize.getHeight()
            const margin = 15
            const contentWidth = pageWidth - 2 * margin
            let yPos = margin
            const lineHeight = 7
            const sectionSpacing = 12

            // Colors (grayscale for PDF)
            const primaryColor = [255, 140, 0] // Orange
            const darkGray = [40, 40, 40]
            const lightGray = [200, 200, 200]
            const textGray = [100, 100, 100]
            const redColor = [200, 0, 0] // Dark red for warnings

            // Helper function to add new page if needed
            // Reserve space for footer (20px from bottom to prevent overlap)
            const footerHeight = 20
            const footerY = pageHeight - 12
            const maxContentY = footerY - 5 // Content must stop 5px before footer
            const checkNewPage = (requiredSpace: number) => {
              if (yPos + requiredSpace > maxContentY) {
                doc.addPage()
                yPos = margin
                return true
              }
              return false
            }

            // Helper to split long text
            const splitText = (text: string, maxWidth: number, fontSize: number = 10): string[] => {
              doc.setFontSize(fontSize)
              const words = text.split(' ')
              const lines: string[] = []
              let currentLine = ''
              
              words.forEach(word => {
                const testLine = currentLine ? `${currentLine} ${word}` : word
                const textWidth = doc.getTextWidth(testLine)
                if (textWidth > maxWidth && currentLine) {
                  lines.push(currentLine)
                  currentLine = word
                } else {
                  currentLine = testLine
                }
              })
              if (currentLine) {
                lines.push(currentLine)
              }
              return lines
            }

            // CRITICAL SEVERITY SUMMARY PAGE (Full Page) - Only if there are overdue items
            if (overdue > 0 || totalPenalty > 0) {
              // Red warning background
              doc.setFillColor(redColor[0], redColor[1], redColor[2])
              doc.rect(0, 0, pageWidth, pageHeight, 'F')
              
              // White text box for content - ensure it doesn't overlap with footer
              const summaryBoxMargin = 20
              const summaryBoxWidth = pageWidth - 2 * summaryBoxMargin
              // White box should end before footer area (maxContentY + 5 for safety)
              const summaryBoxHeight = maxContentY - summaryBoxMargin + 5
              doc.setFillColor(255, 255, 255)
              doc.rect(summaryBoxMargin, summaryBoxMargin, summaryBoxWidth, summaryBoxHeight, 'F')
              
              let summaryY = summaryBoxMargin + 25
              const summaryMaxY = summaryBoxMargin + summaryBoxHeight - 10 // Leave 10px margin at bottom of white box
              
              // CRITICAL WARNING HEADER
              doc.setTextColor(redColor[0], redColor[1], redColor[2])
              doc.setFontSize(24)
              doc.setFont('helvetica', 'bold')
              doc.text('*** CRITICAL COMPLIANCE ALERT ***', pageWidth / 2, summaryY, { align: 'center' })
              summaryY += 20
              
              // Company name
              if (currentCompany) {
                doc.setFontSize(18)
                doc.setFont('helvetica', 'bold')
                doc.setTextColor(0, 0, 0)
                const companyLines = splitText(currentCompany.name.toUpperCase(), summaryBoxWidth - 20, 18)
                companyLines.forEach((line, idx) => {
                  doc.text(line, pageWidth / 2, summaryY + (idx * 10), { align: 'center', maxWidth: summaryBoxWidth - 20 })
                })
                summaryY += companyLines.length * 10 + 15
              }
              
              // Severity statement
              doc.setFontSize(16)
              doc.setFont('helvetica', 'bold')
              doc.setTextColor(redColor[0], redColor[1], redColor[2])
              doc.text('IMMEDIATE ACTION REQUIRED', pageWidth / 2, summaryY, { align: 'center' })
              summaryY += 20
              
              // Main severity content
              doc.setFontSize(11)
              doc.setFont('helvetica', 'normal')
              doc.setTextColor(0, 0, 0)
              
              const severityText = [
                `Your organization is currently facing ${overdue} overdue compliance requirement${overdue > 1 ? 's' : ''} with a total accumulated penalty of ₹${totalPenalty.toLocaleString('en-IN')}.`,
                '',
                'THIS IS NOT A MINOR ISSUE. Non-compliance with regulatory requirements carries severe consequences that can destroy your business:',
                '',
                '• FINANCIAL RUIN: Every day of delay increases your penalties. You are losing money right now. Interest compounds daily. Your total liability is growing exponentially.',
                '',
                '• JAIL TIME AND CRIMINAL PROSECUTION: Directors and key personnel can face imprisonment. Under the Companies Act, violations can result in imprisonment ranging from 6 months to 10 years. Under Income Tax Act, willful tax evasion can lead to 3 to 7 years in jail. Under GST Act, serious violations carry imprisonment of up to 5 years. You could go to jail. Your freedom is at risk.',
                '',
                '• LEGAL PROSECUTION: Regulatory authorities can initiate criminal proceedings against directors and key personnel. You could face imprisonment, hefty fines, and permanent blacklisting. Once convicted, you will have a criminal record that follows you forever.',
                '',
                '• BUSINESS DEATH: Non-compliance can result in your company being struck off the register. Your business will cease to exist. All assets will be frozen. You will lose everything.',
                '',
                '• REPUTATION DESTRUCTION: Once flagged for non-compliance, your credit rating plummets. Banks will refuse loans. Investors will flee. Business partners will terminate contracts. Your name will be tarnished permanently.',
                '',
                '• PERSONAL LIABILITY: Directors can be held personally liable. Your personal assets, including your home and savings, can be seized to pay penalties. Your family\'s financial security is at stake.',
                '',
                'TIME IS RUNNING OUT. Every passing day makes your situation worse. The longer you wait, the more you will pay. The more you delay, the higher the risk of criminal action and jail time.',
                '',
                'This report details every violation, every penalty, and every consequence including potential jail sentences. Read it carefully. Understand the gravity. Take immediate action.',
                '',
                'YOUR BUSINESS SURVIVAL AND YOUR FREEDOM DEPEND ON IT.'
              ]
              
              severityText.forEach((para, idx) => {
                // Check if we need a new page - ensure content stays within white box
                const estimatedLines = para === '' ? 1 : Math.ceil(para.length / 60) // Rough estimate
                const estimatedHeight = estimatedLines * 6 + 3
                if (summaryY + estimatedHeight > summaryMaxY) {
                  doc.addPage()
                  doc.setFillColor(redColor[0], redColor[1], redColor[2])
                  doc.rect(0, 0, pageWidth, pageHeight, 'F')
                  doc.setFillColor(255, 255, 255)
                  const newSummaryBoxHeight = maxContentY - summaryBoxMargin + 5
                  doc.rect(summaryBoxMargin, summaryBoxMargin, summaryBoxWidth, newSummaryBoxHeight, 'F')
                  summaryY = summaryBoxMargin + 25
                }
                
                if (para === '') {
                  summaryY += 5
                } else {
                  const isBold = para.includes('•') || para.includes('THIS IS NOT') || para.includes('TIME IS RUNNING') || para.includes('YOUR BUSINESS') || para.includes('JAIL TIME')
                  if (isBold) {
                    doc.setFont('helvetica', 'bold')
                    doc.setTextColor(redColor[0], redColor[1], redColor[2])
                  } else {
                    doc.setFont('helvetica', 'normal')
                    doc.setTextColor(0, 0, 0)
                  }
                  
                  const lines = splitText(para, summaryBoxWidth - 20, 11)
                  lines.forEach((line, lineIdx) => {
                    // Safety check before each line - ensure it stays within white box
                    if (summaryY + (lineIdx * 6) > summaryMaxY) {
                      doc.addPage()
                      doc.setFillColor(redColor[0], redColor[1], redColor[2])
                      doc.rect(0, 0, pageWidth, pageHeight, 'F')
                      doc.setFillColor(255, 255, 255)
                      const newSummaryBoxHeight = maxContentY - summaryBoxMargin + 5
                      doc.rect(summaryBoxMargin, summaryBoxMargin, summaryBoxWidth, newSummaryBoxHeight, 'F')
                      summaryY = summaryBoxMargin + 25
                    }
                    doc.text(line, summaryBoxMargin + 10, summaryY + (lineIdx * 6), { maxWidth: summaryBoxWidth - 20 })
                  })
                  summaryY += lines.length * 6 + 3
                  
                  // Final safety check - ensure we haven't exceeded white box
                  if (summaryY > summaryMaxY) {
                    doc.addPage()
                    doc.setFillColor(redColor[0], redColor[1], redColor[2])
                    doc.rect(0, 0, pageWidth, pageHeight, 'F')
                    doc.setFillColor(255, 255, 255)
                    const newSummaryBoxHeight = maxContentY - summaryBoxMargin + 5
                    doc.rect(summaryBoxMargin, summaryBoxMargin, summaryBoxWidth, newSummaryBoxHeight, 'F')
                    summaryY = summaryBoxMargin + 25
                  }
                }
              })
              
              // Add new page for rest of report
              doc.addPage()
              yPos = margin
            }

            // Header
            doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
            doc.rect(0, 0, pageWidth, 50, 'F')
            doc.setTextColor(255, 255, 255)
            doc.setFontSize(22)
            doc.setFont('helvetica', 'bold')
            doc.text('Compliance Report', margin, 30, { maxWidth: contentWidth })
            doc.setFontSize(9)
            doc.setFont('helvetica', 'normal')
            const generatedText = `Generated: ${new Date().toLocaleDateString('en-IN', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}`
            doc.text(generatedText, margin, 42, { maxWidth: contentWidth * 0.6 })
            if (currentCompany) {
              const companyText = `Company: ${currentCompany.name}`
              const companyLines = splitText(companyText, contentWidth * 0.4, 9)
              companyLines.forEach((line, idx) => {
                doc.text(line, pageWidth - margin, 42 - (companyLines.length - 1 - idx) * 4, { align: 'right', maxWidth: contentWidth * 0.4 })
              })
            }

            yPos = 60

            // Executive Summary Section
            doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
            doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
            doc.setTextColor(255, 255, 255)
            doc.setFontSize(14)
            doc.setFont('helvetica', 'bold')
            doc.text('Executive Summary', margin + 3, yPos + 6)
            yPos += 15

            doc.setTextColor(0, 0, 0)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')

            // Key Metrics Grid - Better spacing
            const metricsPerRow = 2
            const metricWidth = (contentWidth - 20) / metricsPerRow // Leave 20px gap between metrics
            const metrics = [
              { label: 'Total Compliances', value: totalCompliances.toString() },
              { label: 'Completed', value: completed.toString() },
              { label: 'Overdue', value: overdue.toString() },
              { label: 'Pending', value: pending.toString() }
            ]

            const startY = yPos
            metrics.forEach((metric, index) => {
              const row = Math.floor(index / metricsPerRow)
              const col = index % metricsPerRow
              const xPos = margin + (col * metricWidth) + (col * 20)
              const currentY = startY + (row * 25)
              
              if (row > 0 && col === 0) {
                checkNewPage(30)
              }
              
              // Value (large number)
              doc.setFont('helvetica', 'bold')
              doc.setFontSize(20)
              doc.setTextColor(0, 0, 0)
              doc.text(metric.value, xPos, currentY, { maxWidth: metricWidth - 10 })
              
              // Label (small text below)
              doc.setFont('helvetica', 'normal')
              doc.setFontSize(9)
              doc.setTextColor(textGray[0], textGray[1], textGray[2])
              doc.text(metric.label, xPos, currentY + 8, { maxWidth: metricWidth - 10 })
              doc.setTextColor(0, 0, 0)
            })

            yPos = startY + (Math.ceil(metrics.length / metricsPerRow) * 25) + 5
            checkNewPage(20)

            // Compliance Score
            if (totalCompliances > 0) {
              const score = Math.max(0, Math.min(100, Math.round((completed / totalCompliances) * 100 - (overdue / totalCompliances) * 30)))
              doc.setFont('helvetica', 'bold')
              doc.setFontSize(12)
              doc.text('Compliance Score:', margin, yPos)
              doc.setFontSize(20)
              doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
              doc.text(`${score}/100`, margin + 50, yPos)
              doc.setTextColor(0, 0, 0)
              yPos += 10
            }

            yPos += sectionSpacing
            checkNewPage(30)

            // Status Breakdown
            doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
            doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
            doc.setTextColor(255, 255, 255)
            doc.setFontSize(14)
            doc.setFont('helvetica', 'bold')
            doc.text('Status Breakdown', margin + 3, yPos + 6)
            yPos += 15

            doc.setTextColor(0, 0, 0)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')

            Object.entries(statusBreakdown).forEach(([status, count]) => {
              // Check before adding each status line
              if (yPos + lineHeight + 2 > maxContentY) {
                doc.addPage()
                yPos = margin
              }
              
              const percentage = totalCompliances > 0 ? (count / totalCompliances) * 100 : 0
              const statusLabel = status === 'notStarted' ? 'Not Started' : status.charAt(0).toUpperCase() + status.slice(1)
              
              doc.text(`${statusLabel}:`, margin, yPos, { maxWidth: 60 })
              doc.setFont('helvetica', 'bold')
              doc.text(count.toString(), margin + 45, yPos, { maxWidth: 20 })
              doc.setFont('helvetica', 'normal')
              doc.setTextColor(textGray[0], textGray[1], textGray[2])
              doc.text(`(${Math.round(percentage)}%)`, margin + 60, yPos, { maxWidth: 30 })
              doc.setTextColor(0, 0, 0)
              
              // Progress bar - ensure it fits within page
              const barStartX = margin + 95
              const barWidth = Math.min(80, pageWidth - barStartX - margin)
              const barHeight = 4
              doc.setDrawColor(lightGray[0], lightGray[1], lightGray[2])
              doc.rect(barStartX, yPos - 3, barWidth, barHeight, 'S')
              doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
              doc.rect(barStartX, yPos - 3, Math.min((barWidth * percentage) / 100, barWidth), barHeight, 'F')
              
              yPos += lineHeight + 2
            })

            yPos += sectionSpacing
            checkNewPage(30)

            // Category Breakdown
            doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
            doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
            doc.setTextColor(255, 255, 255)
            doc.setFontSize(14)
            doc.setFont('helvetica', 'bold')
            doc.text('Category Breakdown', margin + 3, yPos + 6)
            yPos += 15

            doc.setTextColor(0, 0, 0)
            doc.setFontSize(10)
            doc.setFont('helvetica', 'normal')

            const sortedCategories = Object.entries(categoryBreakdown)
              .sort(([, a], [, b]) => b - a)
              .slice(0, 8) // Limit to top 8 categories

            sortedCategories.forEach(([category, count]) => {
              checkNewPage(10)
              const percentage = totalCompliances > 0 ? (count / totalCompliances) * 100 : 0
              
              const categoryLines = splitText(category, 60, 10)
              categoryLines.forEach((line, idx) => {
                doc.text(line, margin, yPos + (idx * 5), { maxWidth: 60 })
              })
              const textY = yPos + (categoryLines.length - 1) * 5
              
              doc.setFont('helvetica', 'bold')
              doc.text(count.toString(), pageWidth - margin - 35, textY, { align: 'right', maxWidth: 20 })
              doc.setFont('helvetica', 'normal')
              doc.setTextColor(textGray[0], textGray[1], textGray[2])
              doc.text(`(${Math.round(percentage)}%)`, pageWidth - margin - 10, textY, { align: 'right', maxWidth: 25 })
              doc.setTextColor(0, 0, 0)
              
              // Progress bar - ensure it fits
              const barStartX = margin + 65
              const barWidth = Math.min(70, pageWidth - barStartX - margin - 40)
              const barHeight = 4
              doc.setDrawColor(lightGray[0], lightGray[1], lightGray[2])
              doc.rect(barStartX, textY - 3, barWidth, barHeight, 'S')
              doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
              doc.rect(barStartX, textY - 3, Math.min((barWidth * percentage) / 100, barWidth), barHeight, 'F')
              
              yPos += (categoryLines.length * lineHeight) + 2
            })

            yPos += sectionSpacing
            checkNewPage(30)

            // Compliance Type Breakdown
            doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
            doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
            doc.setTextColor(255, 255, 255)
            doc.setFontSize(14)
            doc.setFont('helvetica', 'bold')
            doc.text('Compliance Type Breakdown', margin + 3, yPos + 6)
            yPos += 15

            doc.setTextColor(0, 0, 0)
            doc.setFontSize(9)

            Object.entries(complianceTypeBreakdown)
              .filter(([, data]) => data.total > 0)
              .forEach(([type, data]) => {
                // Check before adding each type breakdown
                if (yPos + 28 > maxContentY) {
                  doc.addPage()
                  yPos = margin
                }
                
                const typeLabels: Record<string, string> = {
                  'one-time': 'One-time',
                  'monthly': 'Monthly',
                  'quarterly': 'Quarterly',
                  'annual': 'Annual'
                }
                const completionRate = data.total > 0 ? (data.completed / data.total) * 100 : 0
                
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(11)
                doc.text(typeLabels[type] || type, margin, yPos)
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(9)
                doc.text(`Total: ${data.total}`, margin + 10, yPos + 6)
                doc.text(`Completed: ${data.completed}`, margin + 10, yPos + 12)
                doc.text(`Overdue: ${data.overdue}`, margin + 10, yPos + 18)
                doc.text(`Pending: ${data.pending}`, margin + 80, yPos + 6)
                doc.text(`Not Started: ${data.notStarted}`, margin + 80, yPos + 12)
                doc.setTextColor(textGray[0], textGray[1], textGray[2])
                doc.text(`Completion: ${Math.round(completionRate)}%`, margin + 80, yPos + 18)
                doc.setTextColor(0, 0, 0)
                
                yPos += 28
              })

            yPos += sectionSpacing
            checkNewPage(30)

            // Financial Year Breakdown (if available)
            if (Object.keys(fyBreakdown).length > 0) {
              doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
              doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
              doc.setTextColor(255, 255, 255)
              doc.setFontSize(14)
              doc.setFont('helvetica', 'bold')
              doc.text('Financial Year Breakdown', margin + 3, yPos + 6)
              yPos += 15

              doc.setTextColor(0, 0, 0)
              doc.setFontSize(10)
              doc.setFont('helvetica', 'normal')

              const sortedFY = Object.entries(fyBreakdown)
                .sort(([a], [b]) => {
                  const getYear = (fy: string) => {
                    if (fy === 'Not Specified') return 0
                    const match = fy.match(/\d{4}/)
                    return match ? parseInt(match[0]) : 0
                  }
                  return getYear(b) - getYear(a)
                })

              sortedFY.forEach(([fy, count], index) => {
                checkNewPage(10)
                if (index % 2 === 0) {
                  doc.text(`${fy}:`, margin, yPos)
                  doc.setFont('helvetica', 'bold')
                  doc.text(count.toString(), margin + 50, yPos)
                } else {
                  doc.text(`${fy}:`, margin + 100, yPos)
                  doc.setFont('helvetica', 'bold')
                  doc.text(count.toString(), margin + 150, yPos)
                  yPos += lineHeight
                }
                doc.setFont('helvetica', 'normal')
              })

              if (sortedFY.length % 2 !== 0) {
                yPos += lineHeight
              }

              yPos += sectionSpacing
              checkNewPage(30)
            }

            // Overdue Compliances (if any)
            if (overdueCompliances.length > 0) {
              doc.setFillColor(255, 0, 0) // Red for overdue
              doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
              doc.setTextColor(255, 255, 255)
              doc.setFontSize(14)
              doc.setFont('helvetica', 'bold')
              doc.text(`Overdue Compliances (${overdueCompliances.length})`, margin + 3, yPos + 6)
              yPos += 15

              doc.setTextColor(0, 0, 0)
              doc.setFontSize(9)
              doc.setFont('helvetica', 'normal')

              overdueCompliances.slice(0, 10).forEach((req, index) => {
                checkNewPage(30)
                const delay = calculateDelay(req.dueDate, req.status)
                let penalty = calculatePenalty(req.penalty || '', delay)
                // Remove leading apostrophe if present
                if (penalty.startsWith("'")) {
                  penalty = penalty.substring(1)
                }
                
                const itemStartY = yPos
                
                // Item number and requirement name
                doc.setFont('helvetica', 'bold')
                doc.setFontSize(10)
                doc.setTextColor(0, 0, 0)
                const reqText = `${index + 1}. ${req.requirement}`
                const reqLines = splitText(reqText, contentWidth * 0.55, 10)
                reqLines.forEach((line, idx) => {
                  doc.text(line, margin, itemStartY + (idx * 5), { maxWidth: contentWidth * 0.55 })
                })
                const reqEndY = itemStartY + (reqLines.length - 1) * 5
                
                // Category and Due Date on separate lines
                doc.setFont('helvetica', 'normal')
                doc.setFontSize(8)
                doc.setTextColor(0, 0, 0)
                let detailY = reqEndY + 6
                doc.text(`Category: ${req.category}`, margin + 5, detailY, { maxWidth: contentWidth * 0.55 })
                detailY += 5
                doc.text(`Due Date: ${req.dueDate}`, margin + 5, detailY, { maxWidth: contentWidth * 0.55 })
                
                // Right column: Days Delayed and Penalty
                const rightX = margin + contentWidth * 0.6
                let rightY = reqEndY + 6
                
                if (delay !== null && delay > 0) {
                  doc.setTextColor(255, 0, 0)
                  doc.setFont('helvetica', 'bold')
                  doc.setFontSize(8)
                  doc.text(`Days Delayed: ${delay}`, rightX, rightY, { maxWidth: contentWidth * 0.35 })
                  doc.setFont('helvetica', 'normal')
                  rightY += 5
                }
                
                if (penalty !== '-' && !penalty.includes('Cannot calculate')) {
                  doc.setTextColor(255, 0, 0)
                  doc.setFont('helvetica', 'bold')
                  doc.setFontSize(8)
                  const penaltyText = `Penalty: ${penalty}`
                  const penaltyLines = splitText(penaltyText, contentWidth * 0.35, 8)
                  penaltyLines.forEach((line, idx) => {
                    doc.text(line, rightX, rightY + (idx * 5), { maxWidth: contentWidth * 0.35 })
                  })
                  doc.setFont('helvetica', 'normal')
                  rightY += (penaltyLines.length - 1) * 5
                }
                
                // Calculate the maximum height used for this item
                const leftHeight = detailY - itemStartY + 5
                const rightHeight = rightY - reqEndY
                const itemHeight = Math.max(leftHeight, rightHeight) + 5
                
                // Add a subtle line separator
                doc.setDrawColor(lightGray[0], lightGray[1], lightGray[2])
                doc.setLineWidth(0.5)
                doc.line(margin, yPos + itemHeight, pageWidth - margin, yPos + itemHeight)
                
                yPos += itemHeight + 3
              })

              if (overdueCompliances.length > 10) {
                yPos += 5
                doc.setFontSize(8)
                doc.setTextColor(textGray[0], textGray[1], textGray[2])
                doc.text(`... and ${overdueCompliances.length - 10} more overdue compliances`, margin, yPos)
                doc.setTextColor(0, 0, 0)
              }
            }

            // Legal & Business Impact Analysis Section (for non-compliant items)
            if (enrichedData.length > 0) {
              yPos += sectionSpacing
              checkNewPage(40)

              doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
              doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
              doc.setTextColor(255, 255, 255)
              doc.setFontSize(14)
              doc.setFont('helvetica', 'bold')
              doc.text('Legal & Business Impact Analysis', margin + 3, yPos + 6)
              yPos += 15

              doc.setTextColor(0, 0, 0)
              doc.setFontSize(8)
              doc.setFont('helvetica', 'normal')
              doc.setTextColor(textGray[0], textGray[1], textGray[2])
              doc.text('This section provides detailed legal sections, penalty provisions, and business impact for non-compliant items.', margin, yPos, { maxWidth: contentWidth })
              yPos += 8

              // Table header
              const colWidths = {
                requirement: contentWidth * 0.25,
                category: contentWidth * 0.12,
                legalSection: contentWidth * 0.18,
                penaltyProvision: contentWidth * 0.15,
                exactPenalty: contentWidth * 0.12,
                financial: contentWidth * 0.18
              }

              doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
              doc.rect(margin, yPos, contentWidth, 6, 'F')
              doc.setTextColor(255, 255, 255)
              doc.setFontSize(7)
              doc.setFont('helvetica', 'bold')
              
              let headerX = margin + 2
              doc.text('Requirement', headerX, yPos + 4.5, { maxWidth: colWidths.requirement - 4 })
              headerX += colWidths.requirement
              doc.text('Category', headerX, yPos + 4.5, { maxWidth: colWidths.category - 4 })
              headerX += colWidths.category
              doc.text('Legal Section', headerX, yPos + 4.5, { maxWidth: colWidths.legalSection - 4 })
              headerX += colWidths.legalSection
              doc.text('Penalty', headerX, yPos + 4.5, { maxWidth: colWidths.penaltyProvision - 4 })
              headerX += colWidths.penaltyProvision
              doc.text('Amount', headerX, yPos + 4.5, { maxWidth: colWidths.exactPenalty - 4 })
              headerX += colWidths.exactPenalty
              doc.text('Financial Impact', headerX, yPos + 4.5, { maxWidth: colWidths.financial - 4 })

              yPos += 8

              // Table rows
              enrichedData.forEach((enriched, index) => {
                const req = nonCompliantItems.find(r => r.id === enriched.requirementId)
                if (!req) return

                // Estimate row height before writing
                const reqLines = splitText(req.requirement, colWidths.requirement - 4, 7)
                const legalLines = splitText(enriched.legalSection, colWidths.legalSection - 4, 7)
                const penaltyLines = splitText(enriched.penaltyProvision, colWidths.penaltyProvision - 4, 7)
                const financialLines = splitText(enriched.businessImpact.financial, colWidths.financial - 4, 7)
                const estimatedRowHeight = Math.max(
                  reqLines.length * 4,
                  legalLines.length * 4,
                  penaltyLines.length * 4,
                  financialLines.length * 4
                ) + 4
                
                // Check if row fits on current page
                checkNewPage(estimatedRowHeight)

                // Alternate row background
                if (index % 2 === 0) {
                  doc.setFillColor(245, 245, 245)
                  doc.rect(margin, yPos - 2, contentWidth, 0, 'F')
                }

                doc.setTextColor(0, 0, 0)
                doc.setFontSize(7)
                doc.setFont('helvetica', 'normal')

                let cellX = margin + 2
                let maxHeight = 0

                // Requirement
                reqLines.forEach((line, idx) => {
                  doc.text(line, cellX, yPos + (idx * 4), { maxWidth: colWidths.requirement - 4 })
                })
                maxHeight = Math.max(maxHeight, reqLines.length * 4)

                // Category
                cellX += colWidths.requirement
                doc.text(req.category, cellX, yPos, { maxWidth: colWidths.category - 4 })

                // Legal Section
                cellX += colWidths.category
                legalLines.forEach((line, idx) => {
                  doc.text(line, cellX, yPos + (idx * 4), { maxWidth: colWidths.legalSection - 4 })
                })
                maxHeight = Math.max(maxHeight, legalLines.length * 4)

                // Penalty Provision
                cellX += colWidths.legalSection
                penaltyLines.forEach((line, idx) => {
                  doc.text(line, cellX, yPos + (idx * 4), { maxWidth: colWidths.penaltyProvision - 4 })
                })
                maxHeight = Math.max(maxHeight, penaltyLines.length * 4)

                // Exact Penalty
                cellX += colWidths.penaltyProvision
                doc.setFont('helvetica', 'bold')
                doc.setTextColor(255, 0, 0)
                doc.text(enriched.exactPenalty, cellX, yPos, { maxWidth: colWidths.exactPenalty - 4 })
                doc.setFont('helvetica', 'normal')
                doc.setTextColor(0, 0, 0)

                // Financial Impact
                cellX += colWidths.exactPenalty
                financialLines.forEach((line, idx) => {
                  doc.text(line, cellX, yPos + (idx * 4), { maxWidth: colWidths.financial - 4 })
                })
                maxHeight = Math.max(maxHeight, financialLines.length * 4)

                // Draw row separator
                doc.setDrawColor(lightGray[0], lightGray[1], lightGray[2])
                doc.setLineWidth(0.3)
                doc.line(margin, yPos + maxHeight + 2, pageWidth - margin, yPos + maxHeight + 2)

                yPos += maxHeight + 4
                
                // Final safety check - ensure we haven't exceeded footer area
                if (yPos > maxContentY) {
                  doc.addPage()
                  yPos = margin
                }
              })

              yPos += sectionSpacing
              checkNewPage(20)

              // Reputation and Operations Impact (separate section)
              doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
              doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
              doc.setTextColor(255, 255, 255)
              doc.setFontSize(12)
              doc.setFont('helvetica', 'bold')
              doc.text('Additional Business Impact Details', margin + 3, yPos + 6)
              yPos += 15

              enrichedData.forEach((enriched, index) => {
                const req = nonCompliantItems.find(r => r.id === enriched.requirementId)
                if (!req) return

                // Estimate content height
                const repLines = splitText(enriched.businessImpact.reputation, contentWidth - 10, 8)
                const opsLines = splitText(enriched.businessImpact.operations, contentWidth - 10, 8)
                const estimatedHeight = 6 + 5 + repLines.length * 4 + 3 + 5 + opsLines.length * 4 + 5
                
                // Check if content fits on current page
                if (yPos + estimatedHeight > maxContentY) {
                  doc.addPage()
                  yPos = margin
                }

                doc.setTextColor(0, 0, 0)
                doc.setFontSize(9)
                doc.setFont('helvetica', 'bold')
                doc.text(`${index + 1}. ${req.requirement}`, margin, yPos, { maxWidth: contentWidth })
                yPos += 6

                doc.setFont('helvetica', 'normal')
                doc.setFontSize(8)
                doc.setTextColor(0, 0, 0)

                // Reputation Impact
                doc.setFont('helvetica', 'bold')
                doc.setTextColor(0, 0, 0)
                doc.text('Reputation Impact:', margin + 5, yPos, { maxWidth: contentWidth - 10 })
                yPos += 5
                doc.setFont('helvetica', 'normal')
                doc.setTextColor(textGray[0], textGray[1], textGray[2])
                repLines.forEach((line, idx) => {
                  // Safety check before each line
                  if (yPos + (idx * 4) > maxContentY) {
                    doc.addPage()
                    yPos = margin
                  }
                  doc.text(line, margin + 5, yPos + (idx * 4), { maxWidth: contentWidth - 10 })
                })
                yPos += repLines.length * 4 + 3

                // Operations Impact
                doc.setFont('helvetica', 'bold')
                doc.setTextColor(0, 0, 0)
                // Check before adding operations section
                if (yPos + 5 > maxContentY) {
                  doc.addPage()
                  yPos = margin
                }
                doc.text('Operational Impact:', margin + 5, yPos, { maxWidth: contentWidth - 10 })
                yPos += 5
                doc.setFont('helvetica', 'normal')
                doc.setTextColor(textGray[0], textGray[1], textGray[2])
                opsLines.forEach((line, idx) => {
                  // Safety check before each line
                  if (yPos + (idx * 4) > maxContentY) {
                    doc.addPage()
                    yPos = margin
                  }
                  doc.text(line, margin + 5, yPos + (idx * 4), { maxWidth: contentWidth - 10 })
                })
                yPos += opsLines.length * 4 + 5

                doc.setTextColor(0, 0, 0)
                
                // Final safety check
                if (yPos > maxContentY) {
                  doc.addPage()
                  yPos = margin
                }
              })
            }

            // Total Penalty
            if (totalPenalty > 0) {
              yPos += sectionSpacing
              checkNewPage(15)
              doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
              doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
              doc.setTextColor(255, 255, 255)
              doc.setFontSize(14)
              doc.setFont('helvetica', 'bold')
              doc.text('Total Accumulated Penalty', margin + 3, yPos + 6)
              yPos += 15

              doc.setTextColor(255, 0, 0)
              doc.setFontSize(16)
              doc.setFont('helvetica', 'bold')
              const penaltyText = `₹${totalPenalty.toLocaleString('en-IN')}`
              doc.text(penaltyText, margin, yPos, { maxWidth: contentWidth })
            }

            // Footer - Add to all pages with proper spacing
            const totalPages = doc.getNumberOfPages()
            // footerY is already defined at the top of the function
            for (let i = 1; i <= totalPages; i++) {
              doc.setPage(i)
              doc.setFontSize(8)
              doc.setTextColor(textGray[0], textGray[1], textGray[2])
              doc.text(
                `Page ${i} of ${totalPages} | Compliance Report | Generated on ${new Date().toLocaleDateString('en-IN')}`,
                pageWidth / 2,
                footerY,
                { align: 'center' }
              )
            }

            // Save PDF
            const fileName = `compliance-report-${currentCompany?.name || 'company'}-${new Date().toISOString().split('T')[0]}.pdf`
            doc.save(fileName)
            
            setIsGeneratingEnhancedPDF(false)
            setPdfGenerationProgress({ current: 0, total: 0, step: '' })
          }

          return (
            <div className="space-y-4 sm:space-y-6">
              {/* Header */}
              <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3 sm:mb-4">
                  <h2 className="text-xl sm:text-2xl font-light text-white">Compliance Reports</h2>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                    <button
                      onClick={exportPDFReport}
                      disabled={isGeneratingEnhancedPDF}
                      className="px-3 sm:px-4 py-2 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors flex items-center justify-center gap-2 font-medium text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isGeneratingEnhancedPDF ? (
                        <>
                          <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span className="hidden sm:inline">Generating...</span>
                          <span className="sm:hidden">Generating...</span>
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" className="sm:w-4 sm:h-4 hidden sm:inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                          <span className="hidden sm:inline">Export PDF Report</span>
                          <span className="sm:hidden">Export PDF</span>
                        </>
                      )}
                    </button>
                    <button
                      onClick={exportComplianceReport}
                      className="px-3 sm:px-4 py-2 bg-primary-orange/20 border border-primary-orange text-primary-orange rounded-lg hover:bg-primary-orange/30 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
                    >
                      <svg width="14" height="14" className="sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                      <span className="hidden sm:inline">Export CSV Report</span>
                      <span className="sm:hidden">Export CSV</span>
                    </button>
                    {overdueCompliances.length > 0 && (
                      <button
                        onClick={exportOverdueReport}
                        className="px-3 sm:px-4 py-2 bg-red-500/20 border border-red-500 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
                      >
                        <svg width="14" height="14" className="sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="16" y1="13" x2="8" y2="13" />
                          <line x1="16" y1="17" x2="8" y2="17" />
                        </svg>
                        <span className="hidden sm:inline">Export Overdue CSV</span>
                        <span className="sm:hidden">Overdue CSV</span>
                      </button>
                    )}
              </div>
                  {isGeneratingEnhancedPDF && (
                    <div className="mt-4 p-4 bg-primary-orange/10 border border-primary-orange/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <svg className="animate-spin h-5 w-5 text-primary-orange" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <div className="flex-1">
                          <div className="text-white text-sm font-medium">{pdfGenerationProgress.step}</div>
                          {pdfGenerationProgress.total > 0 && (
                            <div className="text-gray-400 text-xs mt-1">
                              {pdfGenerationProgress.current} of {pdfGenerationProgress.total} items enriched
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-gray-400">
                        This may take a few moments as we research legal sections and analyze business impact...
            </div>
          </div>
        )}
                </div>
                <p className="text-gray-400 text-sm sm:text-base">Comprehensive compliance analytics and insights</p>
              </div>

              {/* Statistics Overview */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
                {/* Total Compliances */}
                <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <h3 className="text-base sm:text-lg font-medium text-gray-300">Total Compliances</h3>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg width="20" height="20" className="sm:w-6 sm:h-6 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 11l3 3L22 4" />
                        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
                      </svg>
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-light text-white mb-1 sm:mb-2">{totalCompliances}</div>
                  <p className="text-xs sm:text-sm text-gray-400">All compliance requirements</p>
                </div>

                {/* Completed */}
                <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <h3 className="text-base sm:text-lg font-medium text-gray-300">Completed</h3>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg width="20" height="20" className="sm:w-6 sm:h-6 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-light text-white mb-1 sm:mb-2">{completed}</div>
                  <p className="text-xs sm:text-sm text-gray-400">
                    {totalCompliances > 0 ? `${Math.round((completed / totalCompliances) * 100)}% completion rate` : 'No compliances'}
                  </p>
                </div>

                {/* Overdue */}
                <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <h3 className="text-base sm:text-lg font-medium text-gray-300">Overdue</h3>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg width="20" height="20" className="sm:w-6 sm:h-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-light text-white mb-1 sm:mb-2">{overdue}</div>
                  <p className="text-xs sm:text-sm text-gray-400">
                    {totalCompliances > 0 ? `${Math.round((overdue / totalCompliances) * 100)}% overdue rate` : 'No compliances'}
                  </p>
                </div>

                {/* Pending */}
                <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <h3 className="text-base sm:text-lg font-medium text-gray-300">Pending</h3>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg width="20" height="20" className="sm:w-6 sm:h-6 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-light text-white mb-1 sm:mb-2">{pending}</div>
                  <p className="text-xs sm:text-sm text-gray-400">In progress</p>
                </div>

                {/* Not Started */}
                <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <h3 className="text-base sm:text-lg font-medium text-gray-300">Not Started</h3>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg width="20" height="20" className="sm:w-6 sm:h-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-light text-white mb-1 sm:mb-2">{notStarted}</div>
                  <p className="text-xs sm:text-sm text-gray-400">Awaiting action</p>
                </div>

              {/* Compliance Score */}
              <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <div className="flex items-center justify-between mb-3 sm:mb-4">
                  <h3 className="text-base sm:text-lg font-medium text-gray-300">Compliance Score</h3>
                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg width="20" height="20" className="sm:w-6 sm:h-6 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2L2 7l10 5 10-5-10-5z" />
                      <path d="M2 17l10 5 10-5" />
                      <path d="M2 12l10 5 10-5" />
                    </svg>
                  </div>
                </div>
                <div className="flex items-baseline gap-2 mb-1">
                  <div className="text-2xl sm:text-3xl font-light text-white">
                    {totalCompliances === 0 ? '—' : `${complianceScore}`}
                  </div>
                  {totalCompliances > 0 && (
                    <div className="text-xs sm:text-sm text-gray-400">/ 100</div>
                  )}
                </div>
                <p className="text-xs sm:text-sm text-gray-400">
                  Overall compliance health based on completion and overdue items
                </p>
              </div>

              {/* Total Penalty */}
              <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <h3 className="text-base sm:text-lg font-medium text-gray-300">Total Penalty</h3>
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                      <svg width="20" height="20" className="sm:w-6 sm:h-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="12" y1="8" x2="12" y2="12" />
                        <line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                    </div>
                  </div>
                  <div className="text-2xl sm:text-3xl font-light text-white mb-1 sm:mb-2">
                    {totalPenalty > 0 ? `₹${totalPenalty.toLocaleString('en-IN')}` : '₹0'}
                  </div>
                  <p className="text-xs sm:text-sm text-gray-400">Accumulated penalties</p>
                </div>
              </div>

              {/* Status Breakdown Chart */}
              <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <h3 className="text-lg sm:text-xl font-light text-white mb-4 sm:mb-6">Status Breakdown</h3>
                <div className="space-y-3 sm:space-y-4">
                  {Object.entries(statusBreakdown).map(([status, count]) => {
                    const percentage = totalCompliances > 0 ? (count / totalCompliances) * 100 : 0
                    const statusColors: Record<string, { bg: string; text: string; bar: string }> = {
                      completed: { bg: 'bg-green-500/20', text: 'text-green-400', bar: 'bg-green-500' },
                      pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', bar: 'bg-yellow-500' },
                      overdue: { bg: 'bg-red-500/20', text: 'text-red-400', bar: 'bg-red-500' },
                      notStarted: { bg: 'bg-gray-500/20', text: 'text-gray-400', bar: 'bg-gray-500' },
                      upcoming: { bg: 'bg-blue-500/20', text: 'text-blue-400', bar: 'bg-blue-500' }
                    }
                    const colors = statusColors[status] || statusColors.notStarted
                    const statusLabel = status === 'notStarted' ? 'Not Started' : status.charAt(0).toUpperCase() + status.slice(1)
                    
                    return (
                      <div key={status}>
                        <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                          <span className={`text-xs sm:text-sm font-medium ${colors.text}`}>{statusLabel}</span>
                          <span className="text-xs sm:text-sm text-gray-400">{count} ({Math.round(percentage)}%)</span>
                        </div>
                        <div className="w-full bg-gray-800 rounded-full h-1.5 sm:h-2">
                          <div
                            className={`h-1.5 sm:h-2 rounded-full ${colors.bar} transition-all duration-300`}
                            style={{ width: `${percentage}%` }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Category Breakdown */}
              <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <h3 className="text-lg sm:text-xl font-light text-white mb-4 sm:mb-6">Category Breakdown</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {Object.entries(categoryBreakdown)
                    .sort(([, a], [, b]) => b - a)
                    .map(([category, count]) => {
                      const percentage = totalCompliances > 0 ? (count / totalCompliances) * 100 : 0
                      return (
                        <div key={category} className="border border-gray-700 rounded-lg p-3 sm:p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-white font-medium text-sm sm:text-base break-words">{category}</span>
                            <span className="text-primary-orange font-semibold text-sm sm:text-base flex-shrink-0 ml-2">{count}</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-1 sm:h-1.5">
                            <div
                              className="bg-primary-orange h-1 sm:h-1.5 rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                          <p className="text-[10px] sm:text-xs text-gray-400 mt-1">{Math.round(percentage)}% of total</p>
                        </div>
                      )
                    })}
                </div>
              </div>

              {/* Compliance Type Breakdown */}
              <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <h3 className="text-lg sm:text-xl font-light text-white mb-4 sm:mb-6">Compliance Type Breakdown</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  {Object.entries(complianceTypeBreakdown)
                    .filter(([, data]) => data.total > 0)
                    .map(([type, data]) => {
                      const typeLabels: Record<string, string> = {
                        'one-time': 'One-time',
                        'monthly': 'Monthly',
                        'quarterly': 'Quarterly',
                        'annual': 'Annual'
                      }
                      const typeColors: Record<string, { bg: string; text: string; border: string; bar: string }> = {
                        'one-time': { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', bar: 'bg-blue-400' },
                        'monthly': { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', bar: 'bg-purple-400' },
                        'quarterly': { bg: 'bg-indigo-500/20', text: 'text-indigo-400', border: 'border-indigo-500/30', bar: 'bg-indigo-400' },
                        'annual': { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', bar: 'bg-cyan-400' }
                      }
                      const colors = typeColors[type] || typeColors['one-time']
                      const completionRate = data.total > 0 ? (data.completed / data.total) * 100 : 0
                      
                      return (
                        <div key={type} className={`border ${colors.border} rounded-lg p-3 sm:p-4 ${colors.bg}`}>
                          <div className="flex items-center justify-between mb-2 sm:mb-3">
                            <h4 className={`font-semibold text-sm sm:text-base ${colors.text}`}>{typeLabels[type]}</h4>
                            <span className="text-white font-bold text-base sm:text-lg flex-shrink-0 ml-2">{data.total}</span>
                          </div>
                          <div className="space-y-1.5 sm:space-y-2">
                            <div className="flex items-center justify-between text-xs sm:text-sm">
                              <span className="text-gray-400">Completed</span>
                              <span className="text-green-400 font-medium">{data.completed}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs sm:text-sm">
                              <span className="text-gray-400">Overdue</span>
                              <span className="text-red-400 font-medium">{data.overdue}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs sm:text-sm">
                              <span className="text-gray-400">Pending</span>
                              <span className="text-yellow-400 font-medium">{data.pending}</span>
                            </div>
                            <div className="flex items-center justify-between text-xs sm:text-sm">
                              <span className="text-gray-400">Not Started</span>
                              <span className="text-gray-400 font-medium">{data.notStarted}</span>
                            </div>
                          </div>
                          <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-gray-700">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] sm:text-xs text-gray-400">Completion Rate</span>
                              <span className={`text-[10px] sm:text-xs font-semibold ${colors.text}`}>{Math.round(completionRate)}%</span>
                            </div>
                            <div className="w-full bg-gray-800 rounded-full h-1 sm:h-1.5">
                              <div
                                className={`h-1 sm:h-1.5 rounded-full ${colors.bar} transition-all duration-300`}
                                style={{ width: `${completionRate}%` }}
                              />
                            </div>
                          </div>
                        </div>
                      )
                    })}
                </div>
              </div>

              {/* Financial Year Breakdown */}
              {Object.keys(fyBreakdown).length > 0 && (
                <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                  <h3 className="text-lg sm:text-xl font-light text-white mb-4 sm:mb-6">Financial Year Breakdown</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    {Object.entries(fyBreakdown)
                      .sort(([a], [b]) => {
                        // Sort by FY year (extract year from "FY 2019-20")
                        const getYear = (fy: string) => {
                          if (fy === 'Not Specified') return 0
                          const match = fy.match(/\d{4}/)
                          return match ? parseInt(match[0]) : 0
                        }
                        return getYear(b) - getYear(a)
                      })
                      .map(([fy, count]) => (
                        <div key={fy} className="border border-gray-700 rounded-lg p-3 sm:p-4 text-center">
                          <div className="text-xl sm:text-2xl font-light text-white mb-1">{count}</div>
                          <div className="text-xs sm:text-sm text-gray-400 break-words">{fy}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Overdue Compliances Detail */}
              {overdueCompliances.length > 0 && (
                <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-4 sm:mb-6">
                    <h3 className="text-lg sm:text-xl font-light text-white">Overdue Compliances</h3>
                    <span className="px-2 sm:px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-xs sm:text-sm font-medium w-fit">
                      {overdueCompliances.length} items
                    </span>
                  </div>
                  <div className="overflow-x-auto scrollbar-hide">
                    {/* Mobile Card View */}
                    <div className="block sm:hidden space-y-3">
                      {overdueCompliances.slice(0, 10).map((req) => {
                        const delay = calculateDelay(req.dueDate, req.status)
                        const penalty = calculatePenalty(req.penalty || '', delay)
                        return (
                          <div key={req.id} className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 space-y-2">
                            <div>
                              <div className="text-xs text-gray-400 mb-1">Category</div>
                              <div className="text-white text-sm font-medium break-words">{req.category}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-400 mb-1">Requirement</div>
                              <div className="text-white text-sm break-words">{req.requirement}</div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <div className="text-gray-400 mb-1">Due Date</div>
                                <div className="text-gray-300">{req.dueDate}</div>
                              </div>
                              <div>
                                <div className="text-gray-400 mb-1">Days Delayed</div>
                                <div className="text-red-400 font-medium">{delay || 0} days</div>
                              </div>
                            </div>
                            {req.penalty && (
                              <div>
                                <div className="text-xs text-gray-400 mb-1">Penalty</div>
                                <div className="text-gray-300 text-xs break-words">{req.penalty}</div>
                              </div>
                            )}
                            {penalty !== '-' && !penalty.includes('Cannot calculate') && (
                              <div>
                                <div className="text-xs text-gray-400 mb-1">Calculated Penalty</div>
                                <div className="text-red-400 font-semibold text-sm">{penalty}</div>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    {/* Desktop Table View */}
                    <table className="hidden sm:table w-full">
                      <thead>
                        <tr className="border-b border-gray-700">
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Category</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Requirement</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Due Date</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Days Delayed</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Penalty</th>
                          <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Calculated Penalty</th>
                        </tr>
                      </thead>
                      <tbody>
                        {overdueCompliances.slice(0, 10).map((req) => {
                          const delay = calculateDelay(req.dueDate, req.status)
                          const penalty = calculatePenalty(req.penalty || '', delay)
                          return (
                            <tr key={req.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                              <td className="py-3 px-4 text-white">{req.category}</td>
                              <td className="py-3 px-4 text-white">{req.requirement}</td>
                              <td className="py-3 px-4 text-gray-400">{req.dueDate}</td>
                              <td className="py-3 px-4">
                                <span className="text-red-400 font-medium">{delay || 0} days</span>
                              </td>
                              <td className="py-3 px-4 text-gray-400">{req.penalty || '-'}</td>
                              <td className="py-3 px-4">
                                {penalty !== '-' && !penalty.includes('Cannot calculate') ? (
                                  <span className="text-red-400 font-semibold">{penalty}</span>
                                ) : (
                                  <span className="text-gray-500">-</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                    {overdueCompliances.length > 10 && (
                      <p className="text-xs sm:text-sm text-gray-400 mt-4 text-center">
                        Showing 10 of {overdueCompliances.length} overdue compliances. Export to see all.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })()}

        {activeTab === 'notices' && (
          <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-light text-white mb-1">Government Notices</h2>
                <p className="text-gray-400">Track and respond to regulatory notices from various departments</p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {/* Status Filter */}
                <select
                  value={noticesFilter}
                  onChange={(e) => setNoticesFilter(e.target.value as any)}
                  className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-orange"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="responded">Responded</option>
                  <option value="resolved">Resolved</option>
                </select>
                {/* Type Filter */}
                <select
                  value={noticesTypeFilter}
                  onChange={(e) => setNoticesTypeFilter(e.target.value)}
                  className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-orange"
                >
                  <option value="all">All Types</option>
                  <option value="Income Tax">Income Tax</option>
                  <option value="GST">GST</option>
                  <option value="MCA/RoC">MCA/RoC</option>
                  <option value="Labour Law">Labour Law</option>
                </select>
                <button 
                  onClick={() => setIsAddNoticeModalOpen(true)}
                  className="px-4 py-2 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors flex items-center gap-2 text-sm"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Add Notice
                </button>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-light text-white">{demoNotices.filter(n => n.status === 'pending').length}</p>
                    <p className="text-gray-400 text-xs">Pending Response</p>
                  </div>
                </div>
              </div>
              <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EAB308" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-light text-white">{demoNotices.filter(n => n.status === 'responded').length}</p>
                    <p className="text-gray-400 text-xs">Awaiting Decision</p>
                  </div>
                </div>
              </div>
              <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-light text-white">{demoNotices.filter(n => n.status === 'resolved').length}</p>
                    <p className="text-gray-400 text-xs">Resolved</p>
                  </div>
                </div>
              </div>
              <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-light text-white">{demoNotices.length}</p>
                    <p className="text-gray-400 text-xs">Total Notices</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Content - List and Detail View */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Notices List */}
              <div className="lg:col-span-1 space-y-3">
                <p className="text-gray-400 text-sm mb-2">{filteredNotices.length} notices found</p>
                {filteredNotices.map((notice) => (
                  <div
                    key={notice.id}
                    onClick={() => setSelectedNotice(notice)}
                    className={`bg-primary-dark-card border rounded-xl p-4 cursor-pointer transition-all hover:border-primary-orange/50 ${
                      selectedNotice?.id === notice.id ? 'border-primary-orange' : 'border-gray-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          notice.type === 'Income Tax' ? 'bg-blue-500/20 text-blue-400' :
                          notice.type === 'GST' ? 'bg-green-500/20 text-green-400' :
                          notice.type === 'MCA/RoC' ? 'bg-purple-500/20 text-purple-400' :
                          'bg-orange-500/20 text-orange-400'
                        }`}>
                          {notice.type}
                        </span>
                        {notice.priority === 'critical' && (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">Critical</span>
                        )}
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs ${
                        notice.status === 'pending' ? 'bg-red-500/20 text-red-400' :
                        notice.status === 'responded' ? 'bg-yellow-500/20 text-yellow-400' :
                        'bg-green-500/20 text-green-400'
                      }`}>
                        {notice.status.charAt(0).toUpperCase() + notice.status.slice(1)}
                      </span>
                    </div>
                    <h4 className="text-white text-sm font-medium mb-1 line-clamp-2">{notice.subject}</h4>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                      <span>{notice.id}</span>
                      <span>Due: {new Date(notice.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Notice Detail */}
              <div className="lg:col-span-2">
                {selectedNotice ? (
                  <div className="bg-primary-dark-card border border-gray-800 rounded-2xl overflow-hidden">
                    {/* Detail Header */}
                    <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-6 border-b border-gray-800">
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="flex items-center gap-3">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                            selectedNotice.type === 'Income Tax' ? 'bg-blue-500/20' :
                            selectedNotice.type === 'GST' ? 'bg-green-500/20' :
                            selectedNotice.type === 'MCA/RoC' ? 'bg-purple-500/20' :
                            'bg-orange-500/20'
                          }`}>
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={
                              selectedNotice.type === 'Income Tax' ? '#3B82F6' :
                              selectedNotice.type === 'GST' ? '#22C55E' :
                              selectedNotice.type === 'MCA/RoC' ? '#A855F7' :
                              '#F97316'
                            } strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                              <line x1="16" y1="13" x2="8" y2="13" />
                              <line x1="16" y1="17" x2="8" y2="17" />
                            </svg>
                          </div>
                          <div>
                            <p className="text-gray-400 text-sm">{selectedNotice.id}</p>
                            <h3 className="text-white text-lg font-medium">{selectedNotice.subType}</h3>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-lg text-sm font-medium ${
                          selectedNotice.status === 'pending' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                          selectedNotice.status === 'responded' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                          'bg-green-500/20 text-green-400 border border-green-500/30'
                        }`}>
                          {selectedNotice.status.charAt(0).toUpperCase() + selectedNotice.status.slice(1)}
                        </span>
                      </div>
                      <h2 className="text-white text-xl mb-2">{selectedNotice.subject}</h2>
                      <div className="flex flex-wrap items-center gap-4 text-sm">
                        <span className="text-gray-400">
                          <span className="text-gray-500">Section:</span> {selectedNotice.section}
                        </span>
                        <span className="text-gray-400">
                          <span className="text-gray-500">Issued:</span> {new Date(selectedNotice.issuedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                        <span className={`${new Date(selectedNotice.dueDate) < new Date() && selectedNotice.status === 'pending' ? 'text-red-400' : 'text-gray-400'}`}>
                          <span className="text-gray-500">Due:</span> {new Date(selectedNotice.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </span>
                      </div>
                    </div>

                    {/* Detail Body */}
                    <div className="p-6 space-y-6">
                      {/* Description */}
                      <div>
                        <h4 className="text-gray-400 text-sm font-medium mb-2">Notice Description</h4>
                        <p className="text-white text-sm leading-relaxed bg-gray-900/50 p-4 rounded-lg">
                          {selectedNotice.description}
                        </p>
                      </div>

                      {/* Required Documents */}
                      <div>
                        <h4 className="text-gray-400 text-sm font-medium mb-2">Required Documents</h4>
                        <div className="flex flex-wrap gap-2">
                          {selectedNotice.documents.map((doc: string, idx: number) => (
                            <span key={idx} className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm flex items-center gap-2">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                              </svg>
                              {doc}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Timeline */}
                      <div>
                        <h4 className="text-gray-400 text-sm font-medium mb-3">Activity Timeline</h4>
                        <div className="space-y-3">
                          {selectedNotice.timeline.map((event: any, idx: number) => (
                            <div key={idx} className="flex items-start gap-3">
                              <div className="flex flex-col items-center">
                                <div className={`w-3 h-3 rounded-full ${idx === 0 ? 'bg-primary-orange' : 'bg-gray-600'}`}></div>
                                {idx < selectedNotice.timeline.length - 1 && (
                                  <div className="w-0.5 h-8 bg-gray-700"></div>
                                )}
                              </div>
                              <div className="flex-1 pb-2">
                                <div className="flex items-center justify-between">
                                  <p className="text-white text-sm">{event.action}</p>
                                  <span className="text-gray-500 text-xs">{new Date(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                                </div>
                                <p className="text-gray-500 text-xs">by {event.by}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Response Section (only for pending notices) */}
                      {selectedNotice.status === 'pending' && (
                        <div className="border-t border-gray-800 pt-6">
                          <h4 className="text-gray-400 text-sm font-medium mb-3">Submit Response</h4>
                          <textarea
                            value={noticeResponse}
                            onChange={(e) => setNoticeResponse(e.target.value)}
                            placeholder="Enter your response or remarks..."
                            rows={4}
                            className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors resize-none"
                          />
                          <div className="flex items-center justify-between mt-4">
                            <button className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                              </svg>
                              Attach Documents
                            </button>
                            <button
                              onClick={async () => {
                                setIsSubmittingResponse(true)
                                await new Promise(resolve => setTimeout(resolve, 1500))
                                setSelectedNotice({ ...selectedNotice, status: 'responded', timeline: [...selectedNotice.timeline, { date: new Date().toISOString().split('T')[0], action: 'Response Submitted', by: 'You' }] })
                                setNoticeResponse('')
                                setIsSubmittingResponse(false)
                              }}
                              disabled={isSubmittingResponse || !noticeResponse.trim()}
                              className="px-6 py-2 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {isSubmittingResponse ? (
                                <>
                                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                  Submitting...
                                </>
                              ) : (
                                <>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <line x1="22" y1="2" x2="11" y2="13" />
                                    <polygon points="22 2 15 22 11 13 2 9 22 2" />
                                  </svg>
                                  Submit Response
                                </>
                              )}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Actions for responded/resolved notices */}
                      {selectedNotice.status !== 'pending' && (
                        <div className="border-t border-gray-800 pt-6 flex items-center gap-3">
                          <button className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                              <polyline points="7 10 12 15 17 10" />
                              <line x1="12" y1="15" x2="12" y2="3" />
                            </svg>
                            Download Notice
                          </button>
                          <button className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                            View Response
                          </button>
                          {selectedNotice.status === 'responded' && (
                            <button className="px-4 py-2 bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 transition-colors flex items-center gap-2 text-sm">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                <polyline points="22 4 12 14.01 9 11.01" />
                              </svg>
                              Mark as Resolved
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-primary-dark-card border border-gray-800 rounded-2xl h-full flex flex-col items-center justify-center py-20">
                    <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center mb-6">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                        <line x1="16" y1="13" x2="8" y2="13" />
                        <line x1="16" y1="17" x2="8" y2="17" />
                      </svg>
                    </div>
                    <h3 className="text-white text-lg font-medium mb-2">Select a Notice</h3>
                    <p className="text-gray-400 text-sm">Click on a notice from the list to view details</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add Notice Modal */}
        {isAddNoticeModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="sticky top-0 bg-primary-dark-card border-b border-gray-800 p-6 flex items-center justify-between z-10">
                <div>
                  <h2 className="text-2xl font-light text-white mb-1">Add New Notice</h2>
                  <p className="text-gray-400 text-sm">Enter the details of the government notice received</p>
                </div>
                <button
                  onClick={() => {
                    setIsAddNoticeModalOpen(false)
                    setNewNoticeForm({
                      type: 'Income Tax',
                      subType: '',
                      section: '',
                      subject: '',
                      issuedBy: '',
                      issuedDate: new Date().toISOString().split('T')[0],
                      dueDate: '',
                      priority: 'medium',
                      description: '',
                      documents: []
                    })
                    setNewDocument('')
                  }}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>

              {/* Modal Body */}
              <div className="p-6 space-y-6">
                {/* Notice Type */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Notice Type <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={newNoticeForm.type}
                      onChange={(e) => setNewNoticeForm({ ...newNoticeForm, type: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                    >
                      <option value="Income Tax">Income Tax</option>
                      <option value="GST">GST</option>
                      <option value="MCA/RoC">MCA/RoC</option>
                      <option value="Labour Law">Labour Law</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Sub Type <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newNoticeForm.subType}
                      onChange={(e) => setNewNoticeForm({ ...newNoticeForm, subType: e.target.value })}
                      placeholder="e.g., Scrutiny Notice, Show Cause Notice"
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                    />
                  </div>
                </div>

                {/* Section & Subject */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Section/Act <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newNoticeForm.section}
                      onChange={(e) => setNewNoticeForm({ ...newNoticeForm, section: e.target.value })}
                      placeholder="e.g., Section 143(2), Section 73"
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Priority
                    </label>
                    <select
                      value={newNoticeForm.priority}
                      onChange={(e) => setNewNoticeForm({ ...newNoticeForm, priority: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="critical">Critical</option>
                    </select>
                  </div>
                </div>

                {/* Subject */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Subject <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newNoticeForm.subject}
                    onChange={(e) => setNewNoticeForm({ ...newNoticeForm, subject: e.target.value })}
                    placeholder="Enter the notice subject/title"
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                  />
                </div>

                {/* Issued By & Dates */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Issued By <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={newNoticeForm.issuedBy}
                      onChange={(e) => setNewNoticeForm({ ...newNoticeForm, issuedBy: e.target.value })}
                      placeholder="e.g., Income Tax Department"
                      className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Issued Date <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        value={newNoticeForm.issuedDate ? formatDateForDisplay(newNoticeForm.issuedDate) : ''}
                        onClick={() => {
                          const dateInput = document.getElementById('issuedDate-hidden') as HTMLInputElement
                          if (dateInput) {
                            try {
                              dateInput.showPicker?.()
                            } catch {
                              dateInput.click()
                            }
                          }
                        }}
                        placeholder="Select date"
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors cursor-pointer pr-10"
                      />
                      <input
                        type="date"
                        id="issuedDate-hidden"
                        value={newNoticeForm.issuedDate}
                        onChange={(e) => setNewNoticeForm({ ...newNoticeForm, issuedDate: e.target.value })}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        style={{ pointerEvents: 'auto' }}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Due Date <span className="text-red-500">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        readOnly
                        value={newNoticeForm.dueDate ? formatDateForDisplay(newNoticeForm.dueDate) : ''}
                        onClick={() => {
                          const dateInput = document.getElementById('dueDate-hidden') as HTMLInputElement
                          if (dateInput) {
                            try {
                              dateInput.showPicker?.()
                            } catch {
                              dateInput.click()
                            }
                          }
                        }}
                        placeholder="Select date"
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors cursor-pointer pr-10"
                      />
                      <input
                        type="date"
                        id="dueDate-hidden"
                        value={newNoticeForm.dueDate}
                        onChange={(e) => setNewNoticeForm({ ...newNoticeForm, dueDate: e.target.value })}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        style={{ pointerEvents: 'auto' }}
                      />
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-gray-400">
                          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                          <line x1="16" y1="2" x2="16" y2="6" />
                          <line x1="8" y1="2" x2="8" y2="6" />
                          <line x1="3" y1="10" x2="21" y2="10" />
                        </svg>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={newNoticeForm.description}
                    onChange={(e) => setNewNoticeForm({ ...newNoticeForm, description: e.target.value })}
                    placeholder="Enter the full notice description and requirements..."
                    rows={5}
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors resize-none"
                  />
                </div>

                {/* Required Documents */}
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Required Documents
                  </label>
                  <div className="space-y-3">
                    {/* Existing Documents */}
                    {newNoticeForm.documents.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {newNoticeForm.documents.map((doc, idx) => (
                          <span key={idx} className="px-3 py-1.5 bg-gray-800 text-gray-300 rounded-lg text-sm flex items-center gap-2">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <polyline points="14 2 14 8 20 8" />
                            </svg>
                            {doc}
                            <button
                              onClick={() => {
                                setNewNoticeForm({
                                  ...newNoticeForm,
                                  documents: newNoticeForm.documents.filter((_, i) => i !== idx)
                                })
                              }}
                              className="ml-1 hover:text-red-400 transition-colors"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Add Document Input */}
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newDocument}
                        onChange={(e) => setNewDocument(e.target.value)}
                        onKeyPress={(e) => {
                          if (e.key === 'Enter' && newDocument.trim()) {
                            setNewNoticeForm({
                              ...newNoticeForm,
                              documents: [...newNoticeForm.documents, newDocument.trim()]
                            })
                            setNewDocument('')
                          }
                        }}
                        placeholder="Enter document name and press Enter"
                        className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                      />
                      <button
                        onClick={() => {
                          if (newDocument.trim()) {
                            setNewNoticeForm({
                              ...newNoticeForm,
                              documents: [...newNoticeForm.documents, newDocument.trim()]
                            })
                            setNewDocument('')
                          }
                        }}
                        className="px-4 py-2 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors flex items-center gap-2"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                {/* Form Actions */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-800">
                  <button
                    onClick={() => {
                      setIsAddNoticeModalOpen(false)
                      setNewNoticeForm({
                        type: 'Income Tax',
                        subType: '',
                        section: '',
                        subject: '',
                        issuedBy: '',
                        issuedDate: new Date().toISOString().split('T')[0],
                        dueDate: '',
                        priority: 'medium',
                        description: '',
                        documents: []
                      })
                      setNewDocument('')
                    }}
                    className="px-6 py-2.5 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      // Validation
                      if (!newNoticeForm.type || !newNoticeForm.subType || !newNoticeForm.section || 
                          !newNoticeForm.subject || !newNoticeForm.issuedBy || !newNoticeForm.issuedDate || 
                          !newNoticeForm.dueDate || !newNoticeForm.description) {
                        alert('Please fill in all required fields')
                        return
                      }

                      setIsSubmittingNotice(true)
                      
                      // Simulate API call
                      await new Promise(resolve => setTimeout(resolve, 1500))

                      // Generate notice ID
                      const noticeId = `NOT-${new Date().getFullYear()}-${String(demoNotices.length + 1).padStart(3, '0')}`

                      // Create new notice
                      const newNotice = {
                        id: noticeId,
                        type: newNoticeForm.type,
                        subType: newNoticeForm.subType,
                        section: newNoticeForm.section,
                        subject: newNoticeForm.subject,
                        issuedBy: newNoticeForm.issuedBy,
                        issuedDate: newNoticeForm.issuedDate,
                        dueDate: newNoticeForm.dueDate,
                        status: 'pending',
                        priority: newNoticeForm.priority,
                        description: newNoticeForm.description,
                        documents: newNoticeForm.documents,
                        timeline: [
                          { date: newNoticeForm.issuedDate, action: 'Notice Received', by: 'You' }
                        ]
                      }

                      // Add to notices list
                      setDemoNotices([newNotice, ...demoNotices])
                      
                      // Select the new notice
                      setSelectedNotice(newNotice)

                      // Reset form and close modal
                      setNewNoticeForm({
                        type: 'Income Tax',
                        subType: '',
                        section: '',
                        subject: '',
                        issuedBy: '',
                        issuedDate: new Date().toISOString().split('T')[0],
                        dueDate: '',
                        priority: 'medium',
                        description: '',
                        documents: []
                      })
                      setNewDocument('')
                      setIsAddNoticeModalOpen(false)
                      setIsSubmittingNotice(false)
                    }}
                    disabled={isSubmittingNotice}
                    className="px-6 py-2.5 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {isSubmittingNotice ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        Adding...
                      </>
                    ) : (
                      <>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        Add Notice
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'gst' && (
          <div className="space-y-6">
            {/* GST Integration Flow */}
            {gstStep === 'connect' && (
              <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-8">
                <div className="max-w-lg mx-auto">
                  {/* Header */}
                  <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/20">
                      <span className="text-3xl font-bold text-white">GST</span>
                    </div>
                    <h2 className="text-2xl font-light text-white mb-2">Connect Your GST Account</h2>
                    <p className="text-gray-400">Link your GST portal credentials to fetch returns automatically</p>
                  </div>

                  {/* Progress Steps */}
                  <div className="flex items-center justify-center gap-4 mb-8">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-primary-orange rounded-full flex items-center justify-center text-white text-sm font-bold">1</div>
                      <span className="text-white text-sm">Connect</span>
                    </div>
                    <div className="h-px w-12 bg-gray-700"></div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-gray-400 text-sm font-bold">2</div>
                      <span className="text-gray-400 text-sm">Verify OTP</span>
                    </div>
                    <div className="h-px w-12 bg-gray-700"></div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-gray-400 text-sm font-bold">3</div>
                      <span className="text-gray-400 text-sm">Dashboard</span>
                    </div>
                  </div>

                  {/* Form */}
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        GSTIN <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={gstCredentials.gstin}
                        onChange={(e) => setGstCredentials({ ...gstCredentials, gstin: e.target.value.toUpperCase() })}
                        placeholder="Enter your 15-digit GSTIN"
                        maxLength={15}
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors font-mono tracking-wider"
                      />
                      <p className="mt-1 text-xs text-gray-500">Example: 27AQOPD9471C3ZM</p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        GST Portal Username <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={gstCredentials.gstUsername}
                        onChange={(e) => setGstCredentials({ ...gstCredentials, gstUsername: e.target.value })}
                        placeholder="Enter your GST portal username"
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                      />
                    </div>

                    {gstError && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
                        {gstError}
                      </div>
                    )}

                    <button
                      onClick={async () => {
                        if (!gstCredentials.gstin || !gstCredentials.gstUsername) {
                          setGstError('Please enter both GSTIN and Username')
                          return
                        }
                        if (gstCredentials.gstin.length !== 15) {
                          setGstError('GSTIN must be exactly 15 characters')
                          return
                        }
                        setGstError(null)
                        setIsGstLoading(true)
                        // Simulate API call to send OTP
                        await new Promise(resolve => setTimeout(resolve, 1500))
                        setIsGstLoading(false)
                        setGstStep('otp')
                      }}
                      disabled={isGstLoading}
                      className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
                    >
                      {isGstLoading ? (
                        <>
                          <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Sending OTP...
                        </>
                      ) : (
                        <>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 2L11 13" />
                            <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                          </svg>
                          Send OTP
                        </>
                      )}
                    </button>

                    <p className="text-center text-xs text-gray-500">
                      By connecting, you agree to share your GST data securely with Finnovate
                    </p>
                  </div>
                </div>
              </div>
            )}

            {gstStep === 'otp' && (
              <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-8">
                <div className="max-w-lg mx-auto">
                  {/* Header */}
                  <div className="text-center mb-8">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/20">
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                    <h2 className="text-2xl font-light text-white mb-2">Verify OTP</h2>
                    <p className="text-gray-400">Enter the OTP sent to your registered mobile number</p>
                  </div>

                  {/* Progress Steps */}
                  <div className="flex items-center justify-center gap-4 mb-8">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      </div>
                      <span className="text-green-400 text-sm">Connect</span>
                    </div>
                    <div className="h-px w-12 bg-green-500"></div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-primary-orange rounded-full flex items-center justify-center text-white text-sm font-bold">2</div>
                      <span className="text-white text-sm">Verify OTP</span>
                    </div>
                    <div className="h-px w-12 bg-gray-700"></div>
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-gray-400 text-sm font-bold">3</div>
                      <span className="text-gray-400 text-sm">Dashboard</span>
                    </div>
                  </div>

                  {/* OTP Info */}
                  <div className="bg-gray-900/50 rounded-lg p-4 mb-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                        <span className="text-green-400 font-bold text-sm">GST</span>
                      </div>
                      <div>
                        <p className="text-white font-medium">{gstCredentials.gstin}</p>
                        <p className="text-gray-400 text-sm">{gstCredentials.gstUsername}</p>
                      </div>
                    </div>
                  </div>

                  {/* OTP Input */}
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Enter OTP <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={gstOtp}
                        onChange={(e) => setGstOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Enter 6-digit OTP"
                        maxLength={6}
                        className="w-full px-4 py-4 bg-gray-900 border border-gray-700 rounded-lg text-white text-center text-2xl font-mono tracking-[0.5em] placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                      />
                      <p className="mt-2 text-center text-xs text-gray-500">
                        OTP expires in <span className="text-primary-orange">5:00</span> minutes
                      </p>
                    </div>

                    {gstError && (
                      <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
                        {gstError}
                      </div>
                    )}

                    <div className="flex gap-4">
                      <button
                        onClick={() => {
                          setGstStep('connect')
                          setGstOtp('')
                          setGstError(null)
                        }}
                        className="flex-1 py-4 bg-gray-800 text-gray-300 rounded-lg font-medium hover:bg-gray-700 transition-colors"
                      >
                        Back
                      </button>
                      <button
                        onClick={async () => {
                          if (gstOtp.length !== 6) {
                            setGstError('Please enter a valid 6-digit OTP')
                            return
                          }
                          setGstError(null)
                          setIsGstLoading(true)
                          // Simulate API authentication
                          await new Promise(resolve => setTimeout(resolve, 2000))
                          setGstAuthToken('demo_auth_token_' + Date.now())
                          // Load mock GST data
                          setGstData({
                            gstin: gstCredentials.gstin,
                            tradeName: currentCompany?.name || 'Demo Company',
                            legalName: currentCompany?.name || 'Demo Company Pvt Ltd',
                            status: 'Active',
                            gstr1: {
                              filed: true,
                              filedDate: '2026-01-11',
                              period: '122025',
                              totalInvoices: 156,
                              totalValue: 4523150.00,
                              igst: 287650.00,
                              cgst: 143825.00,
                              sgst: 143825.00,
                              cess: 0
                            },
                            gstr3b: {
                              filed: true,
                              filedDate: '2026-01-20',
                              period: '122025',
                              totalLiability: 575300.00,
                              itcClaimed: 412500.00,
                              taxPaid: 162800.00
                            },
                            cashBalance: {
                              igst: 125180.00,
                              cgst: 62590.00,
                              sgst: 62590.00,
                              cess: 0
                            },
                            itcBalance: {
                              igst: 312500.00,
                              cgst: 156250.00,
                              sgst: 156250.00,
                              cess: 0
                            }
                          })
                          setIsGstLoading(false)
                          setGstStep('dashboard')
                        }}
                        disabled={isGstLoading || gstOtp.length !== 6}
                        className="flex-1 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
                      >
                        {isGstLoading ? (
                          <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            Verifying...
                          </>
                        ) : (
                          <>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                              <polyline points="22 4 12 14.01 9 11.01" />
                            </svg>
                            Verify & Connect
                          </>
                        )}
                      </button>
                    </div>

                    <button className="w-full text-center text-sm text-primary-orange hover:text-primary-orange/80 transition-colors">
                      Didn't receive OTP? Resend
                    </button>
                  </div>
                </div>
              </div>
            )}

            {gstStep === 'dashboard' && gstData && (
              <div className="space-y-6">
                {/* GST Dashboard Header */}
                <div className="bg-primary-dark-card border border-gray-800 rounded-2xl p-6">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-green-500/20">
                        <span className="text-xl font-bold text-white">GST</span>
                      </div>
                      <div>
                        <h2 className="text-2xl font-light text-white">{gstData.tradeName}</h2>
                        <p className="text-gray-400 font-mono">{gstData.gstin}</p>
                        <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                          <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                          {gstData.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        value={selectedGstPeriod}
                        onChange={(e) => setSelectedGstPeriod(e.target.value)}
                        className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange"
                      >
                        <option value="012026">January 2026</option>
                        <option value="122025">December 2025</option>
                        <option value="112025">November 2025</option>
                        <option value="102025">October 2025</option>
                      </select>
                      <button
                        onClick={() => {
                          setGstStep('connect')
                          setGstAuthToken(null)
                          setGstData(null)
                          setGstCredentials({ gstin: '', gstUsername: '' })
                          setGstOtp('')
                        }}
                        className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors text-sm"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                </div>

                {/* Navigation Tabs */}
                <div className="flex flex-wrap gap-2 overflow-x-auto pb-2">
                  {[
                    { id: 'overview', label: 'Overview', icon: '📊' },
                    { id: 'gstr1', label: 'GSTR-1', icon: '📤' },
                    { id: 'gstr2a', label: 'GSTR-2A', icon: '📥' },
                    { id: 'gstr2b', label: 'GSTR-2B', icon: '📋' },
                    { id: 'gstr3b', label: 'GSTR-3B', icon: '📝' },
                    { id: 'ledger', label: 'Ledger', icon: '💰' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setGstActiveSection(tab.id as any)}
                      className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${
                        gstActiveSection === tab.id
                          ? 'bg-primary-orange text-white'
                          : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                      }`}
                    >
                      <span>{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  ))}
                </div>

                {/* Overview Section */}
                {gstActiveSection === 'overview' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Cash Balance Card */}
                    <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2">
                            <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                            <line x1="1" y1="10" x2="23" y2="10" />
                          </svg>
                        </div>
                        <span className="text-gray-400 text-sm">Cash Balance</span>
                      </div>
                      <p className="text-2xl font-light text-white mb-2">
                        ₹{(gstData.cashBalance.igst + gstData.cashBalance.cgst + gstData.cashBalance.sgst).toLocaleString('en-IN')}
                      </p>
                      <div className="text-xs text-gray-500 space-y-1">
                        <div className="flex justify-between"><span>IGST</span><span>₹{gstData.cashBalance.igst.toLocaleString('en-IN')}</span></div>
                        <div className="flex justify-between"><span>CGST</span><span>₹{gstData.cashBalance.cgst.toLocaleString('en-IN')}</span></div>
                        <div className="flex justify-between"><span>SGST</span><span>₹{gstData.cashBalance.sgst.toLocaleString('en-IN')}</span></div>
                      </div>
                    </div>

                    {/* ITC Balance Card */}
                    <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                          </svg>
                        </div>
                        <span className="text-gray-400 text-sm">ITC Balance</span>
                      </div>
                      <p className="text-2xl font-light text-white mb-2">
                        ₹{(gstData.itcBalance.igst + gstData.itcBalance.cgst + gstData.itcBalance.sgst).toLocaleString('en-IN')}
                      </p>
                      <div className="text-xs text-gray-500 space-y-1">
                        <div className="flex justify-between"><span>IGST</span><span>₹{gstData.itcBalance.igst.toLocaleString('en-IN')}</span></div>
                        <div className="flex justify-between"><span>CGST</span><span>₹{gstData.itcBalance.cgst.toLocaleString('en-IN')}</span></div>
                        <div className="flex justify-between"><span>SGST</span><span>₹{gstData.itcBalance.sgst.toLocaleString('en-IN')}</span></div>
                      </div>
                    </div>

                    {/* GSTR-1 Status Card */}
                    <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="2">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                            <line x1="16" y1="13" x2="8" y2="13" />
                            <line x1="16" y1="17" x2="8" y2="17" />
                          </svg>
                        </div>
                        <span className="text-gray-400 text-sm">GSTR-1 (Dec 2025)</span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${gstData.gstr1.filed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {gstData.gstr1.filed ? 'Filed' : 'Pending'}
                        </span>
                        <span className="text-gray-500 text-xs">{gstData.gstr1.filedDate}</span>
                      </div>
                      <p className="text-lg font-light text-white">₹{gstData.gstr1.totalValue.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-gray-500">{gstData.gstr1.totalInvoices} invoices</p>
                    </div>

                    {/* GSTR-3B Status Card */}
                    <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-6">
                      <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 bg-orange-500/20 rounded-lg flex items-center justify-center">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth="2">
                            <path d="M9 11l3 3L22 4" />
                            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                          </svg>
                        </div>
                        <span className="text-gray-400 text-sm">GSTR-3B (Dec 2025)</span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded text-xs ${gstData.gstr3b.filed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {gstData.gstr3b.filed ? 'Filed' : 'Pending'}
                        </span>
                        <span className="text-gray-500 text-xs">{gstData.gstr3b.filedDate}</span>
                      </div>
                      <p className="text-lg font-light text-white">₹{gstData.gstr3b.taxPaid.toLocaleString('en-IN')}</p>
                      <p className="text-xs text-gray-500">Tax paid</p>
                    </div>
                  </div>
                )}

                {/* GSTR-1 Section */}
                {gstActiveSection === 'gstr1' && (
                  <div className="bg-primary-dark-card border border-gray-800 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-xl font-light text-white">GSTR-1 - Outward Supplies</h3>
                        <p className="text-gray-400 text-sm">Return period: December 2025</p>
                      </div>
                      <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-lg text-sm">Filed on {gstData.gstr1.filedDate}</span>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                      <div className="bg-gray-900/50 rounded-lg p-4">
                        <p className="text-gray-400 text-xs mb-1">Total Value</p>
                        <p className="text-white text-lg font-light">₹{gstData.gstr1.totalValue.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-4">
                        <p className="text-gray-400 text-xs mb-1">IGST</p>
                        <p className="text-white text-lg font-light">₹{gstData.gstr1.igst.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-4">
                        <p className="text-gray-400 text-xs mb-1">CGST</p>
                        <p className="text-white text-lg font-light">₹{gstData.gstr1.cgst.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-4">
                        <p className="text-gray-400 text-xs mb-1">SGST</p>
                        <p className="text-white text-lg font-light">₹{gstData.gstr1.sgst.toLocaleString('en-IN')}</p>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-4">
                        <p className="text-gray-400 text-xs mb-1">Invoices</p>
                        <p className="text-white text-lg font-light">{gstData.gstr1.totalInvoices}</p>
                      </div>
                    </div>

                    {/* Sample Invoice Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-800">
                            <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Invoice No</th>
                            <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Date</th>
                            <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Customer GSTIN</th>
                            <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Value</th>
                            <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Tax</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { inv: 'INV-2025-001', date: '05-12-2025', ctin: '29AABCU9603R1ZJ', val: 125000, tax: 22500 },
                            { inv: 'INV-2025-002', date: '08-12-2025', ctin: '27AAACR5055K1Z7', val: 85000, tax: 15300 },
                            { inv: 'INV-2025-003', date: '12-12-2025', ctin: '33AADCB2230M1ZE', val: 210000, tax: 37800 },
                            { inv: 'INV-2025-004', date: '18-12-2025', ctin: '07AAHCS0973B1ZL', val: 56000, tax: 10080 },
                            { inv: 'INV-2025-005', date: '25-12-2025', ctin: '19AAECI3797E1ZO', val: 175000, tax: 31500 }
                          ].map((row, idx) => (
                            <tr key={idx} className="border-b border-gray-800/50 hover:bg-gray-900/30">
                              <td className="py-3 px-4 text-white font-mono text-sm">{row.inv}</td>
                              <td className="py-3 px-4 text-gray-300 text-sm">{row.date}</td>
                              <td className="py-3 px-4 text-gray-300 font-mono text-sm">{row.ctin}</td>
                              <td className="py-3 px-4 text-white text-sm text-right">₹{row.val.toLocaleString('en-IN')}</td>
                              <td className="py-3 px-4 text-green-400 text-sm text-right">₹{row.tax.toLocaleString('en-IN')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* GSTR-2A Section */}
                {gstActiveSection === 'gstr2a' && (
                  <div className="bg-primary-dark-card border border-gray-800 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-xl font-light text-white">GSTR-2A - Auto-drafted Inward Supplies</h3>
                        <p className="text-gray-400 text-sm">Return period: December 2025</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                      <div className="bg-gray-900/50 rounded-lg p-4">
                        <p className="text-gray-400 text-xs mb-1">Total ITC Available</p>
                        <p className="text-white text-lg font-light">₹412,500</p>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-4">
                        <p className="text-gray-400 text-xs mb-1">B2B Invoices</p>
                        <p className="text-white text-lg font-light">89</p>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-4">
                        <p className="text-gray-400 text-xs mb-1">Credit Notes</p>
                        <p className="text-white text-lg font-light">12</p>
                      </div>
                      <div className="bg-gray-900/50 rounded-lg p-4">
                        <p className="text-gray-400 text-xs mb-1">Amendments</p>
                        <p className="text-white text-lg font-light">3</p>
                      </div>
                    </div>

                    {/* Sample Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-800">
                            <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Supplier GSTIN</th>
                            <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Trade Name</th>
                            <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Invoice</th>
                            <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Taxable Value</th>
                            <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">ITC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { gstin: '29AABCU9603R1ZJ', name: 'ABC Traders', inv: 'ST/001', val: 85000, itc: 15300 },
                            { gstin: '27AAACR5055K1Z7', name: 'XYZ Supplies', inv: 'INV-789', val: 125000, itc: 22500 },
                            { gstin: '33AADCB2230M1ZE', name: 'Tech Solutions', inv: 'TS-456', val: 65000, itc: 11700 }
                          ].map((row, idx) => (
                            <tr key={idx} className="border-b border-gray-800/50 hover:bg-gray-900/30">
                              <td className="py-3 px-4 text-gray-300 font-mono text-sm">{row.gstin}</td>
                              <td className="py-3 px-4 text-white text-sm">{row.name}</td>
                              <td className="py-3 px-4 text-gray-300 text-sm">{row.inv}</td>
                              <td className="py-3 px-4 text-white text-sm text-right">₹{row.val.toLocaleString('en-IN')}</td>
                              <td className="py-3 px-4 text-green-400 text-sm text-right">₹{row.itc.toLocaleString('en-IN')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* GSTR-2B Section */}
                {gstActiveSection === 'gstr2b' && (
                  <div className="bg-primary-dark-card border border-gray-800 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-xl font-light text-white">GSTR-2B - ITC Statement</h3>
                        <p className="text-gray-400 text-sm">Return period: December 2025</p>
                      </div>
                      <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-lg text-sm">Generated on 14-01-2026</span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                      {/* ITC Available */}
                      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6">
                        <h4 className="text-green-400 font-medium mb-4">ITC Available</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-gray-400 text-xs mb-1">IGST</p>
                            <p className="text-white text-lg">₹156,250</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-xs mb-1">CGST</p>
                            <p className="text-white text-lg">₹128,125</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-xs mb-1">SGST</p>
                            <p className="text-white text-lg">₹128,125</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-xs mb-1">Total</p>
                            <p className="text-green-400 text-lg font-medium">₹412,500</p>
                          </div>
                        </div>
                      </div>

                      {/* ITC Not Available */}
                      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
                        <h4 className="text-red-400 font-medium mb-4">ITC Not Available</h4>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-gray-400 text-xs mb-1">IGST</p>
                            <p className="text-white text-lg">₹12,500</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-xs mb-1">CGST</p>
                            <p className="text-white text-lg">₹6,250</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-xs mb-1">SGST</p>
                            <p className="text-white text-lg">₹6,250</p>
                          </div>
                          <div>
                            <p className="text-gray-400 text-xs mb-1">Total</p>
                            <p className="text-red-400 text-lg font-medium">₹25,000</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* GSTR-3B Section */}
                {gstActiveSection === 'gstr3b' && (
                  <div className="bg-primary-dark-card border border-gray-800 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h3 className="text-xl font-light text-white">GSTR-3B - Summary Return</h3>
                        <p className="text-gray-400 text-sm">Return period: December 2025</p>
                      </div>
                      <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-lg text-sm">Filed on {gstData.gstr3b.filedDate}</span>
                    </div>

                    {/* Summary */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                      <div className="bg-gray-900/50 rounded-xl p-6">
                        <h4 className="text-gray-400 text-sm mb-4">Tax Liability</h4>
                        <p className="text-3xl font-light text-white mb-2">₹{gstData.gstr3b.totalLiability.toLocaleString('en-IN')}</p>
                        <div className="text-xs text-gray-500 space-y-1">
                          <div className="flex justify-between"><span>IGST</span><span>₹287,650</span></div>
                          <div className="flex justify-between"><span>CGST</span><span>₹143,825</span></div>
                          <div className="flex justify-between"><span>SGST</span><span>₹143,825</span></div>
                        </div>
                      </div>

                      <div className="bg-gray-900/50 rounded-xl p-6">
                        <h4 className="text-gray-400 text-sm mb-4">ITC Claimed</h4>
                        <p className="text-3xl font-light text-green-400 mb-2">₹{gstData.gstr3b.itcClaimed.toLocaleString('en-IN')}</p>
                        <div className="text-xs text-gray-500 space-y-1">
                          <div className="flex justify-between"><span>IGST</span><span>₹206,250</span></div>
                          <div className="flex justify-between"><span>CGST</span><span>₹103,125</span></div>
                          <div className="flex justify-between"><span>SGST</span><span>₹103,125</span></div>
                        </div>
                      </div>

                      <div className="bg-primary-orange/10 border border-primary-orange/30 rounded-xl p-6">
                        <h4 className="text-gray-400 text-sm mb-4">Tax Paid</h4>
                        <p className="text-3xl font-light text-primary-orange mb-2">₹{gstData.gstr3b.taxPaid.toLocaleString('en-IN')}</p>
                        <div className="text-xs text-gray-500 space-y-1">
                          <div className="flex justify-between"><span>Cash</span><span>₹81,400</span></div>
                          <div className="flex justify-between"><span>ITC</span><span>₹81,400</span></div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Ledger Section */}
                {gstActiveSection === 'ledger' && (
                  <div className="space-y-6">
                    {/* Cash Ledger */}
                    <div className="bg-primary-dark-card border border-gray-800 rounded-2xl p-6">
                      <h3 className="text-xl font-light text-white mb-6">Cash Ledger</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-800">
                              <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Date</th>
                              <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Description</th>
                              <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Ref No</th>
                              <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Credit</th>
                              <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Debit</th>
                              <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { date: '01-12-2025', desc: 'Opening Balance', ref: '-', cr: 0, dr: 0, bal: 185360 },
                              { date: '05-12-2025', desc: 'Cash Deposit', ref: 'DC1205250001', cr: 100000, dr: 0, bal: 285360 },
                              { date: '20-12-2025', desc: 'GSTR-3B Payment', ref: 'DC2012250002', cr: 0, dr: 35000, bal: 250360 }
                            ].map((row, idx) => (
                              <tr key={idx} className="border-b border-gray-800/50 hover:bg-gray-900/30">
                                <td className="py-3 px-4 text-gray-300 text-sm">{row.date}</td>
                                <td className="py-3 px-4 text-white text-sm">{row.desc}</td>
                                <td className="py-3 px-4 text-gray-400 font-mono text-sm">{row.ref}</td>
                                <td className="py-3 px-4 text-green-400 text-sm text-right">{row.cr > 0 ? `₹${row.cr.toLocaleString('en-IN')}` : '-'}</td>
                                <td className="py-3 px-4 text-red-400 text-sm text-right">{row.dr > 0 ? `₹${row.dr.toLocaleString('en-IN')}` : '-'}</td>
                                <td className="py-3 px-4 text-white text-sm text-right font-medium">₹{row.bal.toLocaleString('en-IN')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* ITC Ledger */}
                    <div className="bg-primary-dark-card border border-gray-800 rounded-2xl p-6">
                      <h3 className="text-xl font-light text-white mb-6">ITC Ledger</h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className="border-b border-gray-800">
                              <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Date</th>
                              <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Description</th>
                              <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Return Period</th>
                              <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Credit</th>
                              <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Debit</th>
                              <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { date: '01-12-2025', desc: 'Opening Balance', period: '-', cr: 0, dr: 0, bal: 525000 },
                              { date: '11-12-2025', desc: 'ITC from GSTR-3B', period: '112025', cr: 100000, dr: 0, bal: 625000 },
                              { date: '20-12-2025', desc: 'ITC Utilization', period: '122025', cr: 0, dr: 81400, bal: 543600 }
                            ].map((row, idx) => (
                              <tr key={idx} className="border-b border-gray-800/50 hover:bg-gray-900/30">
                                <td className="py-3 px-4 text-gray-300 text-sm">{row.date}</td>
                                <td className="py-3 px-4 text-white text-sm">{row.desc}</td>
                                <td className="py-3 px-4 text-gray-400 text-sm">{row.period}</td>
                                <td className="py-3 px-4 text-green-400 text-sm text-right">{row.cr > 0 ? `₹${row.cr.toLocaleString('en-IN')}` : '-'}</td>
                                <td className="py-3 px-4 text-red-400 text-sm text-right">{row.dr > 0 ? `₹${row.dr.toLocaleString('en-IN')}` : '-'}</td>
                                <td className="py-3 px-4 text-white text-sm text-right font-medium">₹{row.bal.toLocaleString('en-IN')}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'tracker' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Header with Title and Actions - Stack on Mobile */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-xl sm:text-3xl font-light text-white mb-1 sm:mb-2">Regulatory Timeline</h2>
                <p className="text-gray-400 text-sm sm:text-base">Keep track of upcoming tax and compliance deadlines.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                {/* View Toggle */}
                <div className="flex items-center gap-1 sm:gap-2 bg-gray-800 rounded-lg p-0.5 sm:p-1">
                  <button
                    onClick={() => setTrackerView('list')}
                    className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-md transition-colors flex items-center gap-1 sm:gap-2 text-xs sm:text-sm ${
                      trackerView === 'list'
                        ? 'bg-primary-orange text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    title="List View"
                  >
                    <svg width="14" height="14" className="sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="8" y1="6" x2="21" y2="6" />
                      <line x1="8" y1="12" x2="21" y2="12" />
                      <line x1="8" y1="18" x2="21" y2="18" />
                      <line x1="3" y1="6" x2="3.01" y2="6" />
                      <line x1="3" y1="12" x2="3.01" y2="12" />
                      <line x1="3" y1="18" x2="3.01" y2="18" />
                    </svg>
                    <span className="hidden sm:inline">List</span>
                  </button>
                  <button
                    onClick={() => setTrackerView('calendar')}
                    className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-md transition-colors flex items-center gap-1 sm:gap-2 text-xs sm:text-sm ${
                      trackerView === 'calendar'
                        ? 'bg-primary-orange text-white'
                        : 'text-gray-400 hover:text-white'
                    }`}
                    title="Calendar View"
                  >
                    <svg width="14" height="14" className="sm:w-4 sm:h-4 hidden sm:inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                    <span className="hidden sm:inline">Calendar</span>
                    <span className="sm:hidden">Calendar</span>
                  </button>
                </div>
                <button
                  onClick={refreshRequirements}
                  disabled={isLoadingRequirements}
                  className="bg-gray-800 text-gray-300 px-2 sm:px-4 py-1.5 sm:py-2 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm"
                  title="Refresh requirements"
                >
                  <svg 
                    width="14" 
                    height="14" 
                    className={`sm:w-4 sm:h-4 ${isLoadingRequirements ? 'animate-spin' : ''}`}
                    viewBox="0 0 24 24" 
                    fill="none" 
                    stroke="currentColor" 
                    strokeWidth="2"
                  >
                    <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                  </svg>
                  <span className="hidden sm:inline">Refresh</span>
                </button>
                {canEdit && (
                  <button
                    onClick={() => {
                      setRequirementForm({
                        category: '',
                        requirement: '',
                        description: '',
                        due_date: '',
                        penalty: '',
                        is_critical: false,
                        financial_year: selectedTrackerFY || '',
                        status: 'not_started',
                        compliance_type: 'one-time',
                        year: new Date().getFullYear().toString()
                      })
                      setIsCreateModalOpen(true)
                    }}
                    className="bg-primary-orange text-white px-3 sm:px-6 py-2 sm:py-3 rounded-lg hover:bg-primary-orange/90 transition-colors flex items-center gap-1.5 sm:gap-2 font-medium text-xs sm:text-base"
                  >
                    <svg
                      width="14"
                      height="14"
                      className="sm:w-[18px] sm:h-[18px]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span className="hidden sm:inline">Add Compliance</span>
                    <span className="sm:hidden">Add</span>
                  </button>
                )}
                <button className="bg-primary-dark-card border border-gray-700 text-white px-3 sm:px-6 py-2 sm:py-3 rounded-lg hover:border-primary-orange/50 transition-colors flex items-center gap-1.5 sm:gap-2 font-medium text-xs sm:text-base">
                <svg
                  width="14"
                  height="14"
                  className="sm:w-[18px] sm:h-[18px]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
                <span className="hidden sm:inline">Sync Calendar</span>
                <span className="sm:hidden">Sync</span>
              </button>
              </div>
            </div>

            {/* Super Filters - Stack on Mobile */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
              {/* Financial Year Dropdown */}
              <div className="relative flex-1 sm:flex-initial">
                <select
                  value={selectedTrackerFY}
                  onChange={(e) => {
                    const newFY = e.target.value
                    setSelectedTrackerFY(newFY)
                    // If changing to current FY, set current month; otherwise clear
                    if (newFY === getCurrentFinancialYear()) {
                      setSelectedMonth(getCurrentMonth())
                    } else {
                    setSelectedMonth(null)
                    }
                    setSelectedQuarter(null)
                  }}
                  className="w-full sm:w-auto px-3 sm:px-4 py-2 rounded-lg border-2 border-gray-700 bg-primary-dark-card text-white text-sm sm:text-base hover:border-gray-600 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors appearance-none cursor-pointer"
                >
                  <option value="">Select Financial Year</option>
                  {financialYears.map((fy) => (
                    <option key={fy} value={fy}>
                      {fy}
                    </option>
                  ))}
                </select>
              </div>

              {/* Monthly Dropdown - Only enabled if FY is selected */}
              <div className="relative flex-1 sm:flex-initial">
                <button
                  onClick={() => {
                    if (selectedTrackerFY) {
                      setIsMonthDropdownOpen(!isMonthDropdownOpen)
                      setIsQuarterDropdownOpen(false)
                    }
                  }}
                  disabled={!selectedTrackerFY}
                  className={`w-full sm:w-auto px-3 sm:px-4 py-2 rounded-lg border-2 transition-colors flex items-center justify-between sm:justify-start gap-2 text-sm sm:text-base ${
                    selectedMonth
                      ? 'border-primary-orange bg-primary-orange/20 text-white'
                      : selectedTrackerFY
                      ? 'border-gray-700 bg-primary-dark-card text-white hover:border-gray-600'
                      : 'border-gray-700 bg-primary-dark-card text-gray-500 cursor-not-allowed opacity-50'
                  }`}
                >
                  <span>Monthly</span>
                  <svg
                    width="14"
                    height="14"
                    className={`sm:w-4 sm:h-4 flex-shrink-0 transition-transform ${isMonthDropdownOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {isMonthDropdownOpen && selectedTrackerFY && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsMonthDropdownOpen(false)}
                    />
                    <div className="absolute top-full left-0 mt-2 bg-gray-900 border border-gray-800 rounded-lg shadow-2xl z-20 min-w-[200px] max-h-64 overflow-y-auto">
                      {months.map((month) => (
                        <button
                          key={month}
                          onClick={() => {
                            setSelectedMonth(month)
                            setIsMonthDropdownOpen(false)
                            setSelectedQuarter(null) // Clear quarter when month is selected
                          }}
                          className={`w-full px-4 py-2 text-left hover:bg-gray-800 transition-colors ${
                            selectedMonth === month
                              ? 'bg-primary-orange/20 text-white'
                              : 'text-gray-300'
                          }`}
                        >
                          {month} {selectedTrackerFY ? selectedTrackerFY.split(' ')[1].split('-')[0] : ''}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Quarters Dropdown - Only enabled if FY is selected */}
              <div className="relative flex-1 sm:flex-initial">
                <button
                  onClick={() => {
                    if (selectedTrackerFY) {
                      setIsQuarterDropdownOpen(!isQuarterDropdownOpen)
                      setIsMonthDropdownOpen(false)
                    }
                  }}
                  disabled={!selectedTrackerFY}
                  className={`w-full sm:w-auto px-3 sm:px-4 py-2 rounded-lg border-2 transition-colors flex items-center justify-between sm:justify-start gap-2 text-sm sm:text-base ${
                    selectedQuarter
                      ? 'border-primary-orange bg-primary-orange/20 text-white'
                      : selectedTrackerFY
                      ? 'border-gray-700 bg-primary-dark-card text-white hover:border-gray-600'
                      : 'border-gray-700 bg-primary-dark-card text-gray-500 cursor-not-allowed opacity-50'
                  }`}
                >
                  <span>Quarters</span>
                  <svg
                    width="14"
                    height="14"
                    className={`sm:w-4 sm:h-4 flex-shrink-0 transition-transform ${isQuarterDropdownOpen ? 'rotate-180' : ''}`}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {isQuarterDropdownOpen && selectedTrackerFY && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsQuarterDropdownOpen(false)}
                    />
                    <div className="absolute top-full left-0 mt-2 bg-gray-900 border border-gray-800 rounded-lg shadow-2xl z-20 min-w-[200px]">
                      {quarters.map((quarter) => (
                        <button
                          key={quarter.value}
                          onClick={() => {
                            setSelectedQuarter(quarter.value)
                            setIsQuarterDropdownOpen(false)
                            setSelectedMonth(null) // Clear month when quarter is selected
                          }}
                          className={`w-full px-4 py-2 text-left hover:bg-gray-800 transition-colors ${
                            selectedQuarter === quarter.value
                              ? 'bg-primary-orange/20 text-white'
                              : 'text-gray-300'
                          }`}
                        >
                          {quarter.label} {selectedTrackerFY ? selectedTrackerFY.split(' ')[1].split('-')[0] : ''}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Category Filters - Scrollable on Mobile */}
            <div className="flex items-center gap-2 flex-wrap overflow-x-auto pb-2 -mx-3 sm:mx-0 px-3 sm:px-0 scrollbar-hide">
              {['all', 'critical', 'pending', 'upcoming', 'completed'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setCategoryFilter(filter)}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg border-2 transition-colors capitalize text-xs sm:text-sm whitespace-nowrap flex-shrink-0 ${
                    categoryFilter === filter
                      ? 'border-primary-orange bg-primary-orange/20 text-white'
                      : 'border-gray-700 bg-primary-dark-card text-white hover:border-gray-600'
                  }`}
                >
                  {filter === 'all'
                    ? 'All'
                    : filter === 'critical'
                    ? (
                        <>
                          <span className="sm:hidden">Critical</span>
                          <span className="hidden sm:inline">Passed Due Date (Critical)</span>
                        </>
                      )
                    : filter}
                </button>
              ))}
            </div>

            {/* Regulatory Requirements Table */}
            <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden">
              {isLoadingRequirements ? (
                <div className="py-8 sm:py-12 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-primary-orange border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-gray-400 text-sm sm:text-base">Loading requirements...</p>
                </div>
              ) : displayRequirements.length === 0 ? (
                <div className="py-8 sm:py-12 flex flex-col items-center justify-center">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 border-2 border-gray-700 rounded-full flex items-center justify-center mb-4">
                    <svg
                      width="24"
                      height="24"
                      className="sm:w-8 sm:h-8 text-gray-600"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                    </svg>
                  </div>
                  <p className="text-gray-500 text-sm sm:text-base">No regulatory requirements found</p>
                  {canEdit && (
                    <p className="text-gray-600 text-xs sm:text-sm mt-2 text-center px-4">You can create requirements once the feature is available</p>
                  )}
                </div>
              ) : (
              <div className="sm:overflow-x-auto scrollbar-hide">
                {(() => {
                  const categoryOrder = ['Income Tax', 'GST', 'Payroll', 'RoC', 'Renewals', 'Others']
                  
                  // Helper function to parse date and get month/quarter
                  const getMonthFromDate = (dateStr: string) => {
                    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                    const monthStr = dateStr.split(' ')[0]
                    return months.indexOf(monthStr)
                  }
                  
                  const getQuarterFromDate = (dateStr: string) => {
                    const month = getMonthFromDate(dateStr)
                    if (month >= 3 && month <= 5) return 'q1' // Apr-Jun
                    if (month >= 6 && month <= 8) return 'q2' // Jul-Sep
                    if (month >= 9 && month <= 11) return 'q3' // Oct-Dec
                    return 'q4' // Jan-Mar
                  }
                  
                  const getMonthName = (monthIndex: number) => {
                    const months = ['January', 'February', 'March', 'April', 'May', 'June',
                      'July', 'August', 'September', 'October', 'November', 'December']
                    return months[monthIndex]
                  }

                  // Helper function to parse date string and calculate delay
                  const parseDate = (dateStr: string): Date | null => {
                    try {
                      const months: { [key: string]: number } = {
                        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
                      }
                      const parts = dateStr.split(' ')
                      if (parts.length >= 3) {
                        const day = parseInt(parts[1].replace(',', ''))
                        const month = months[parts[0]]
                        const year = parseInt(parts[2])
                        return new Date(year, month, day)
                      }
                      return null
                    } catch {
                      return null
                    }
                  }

                  // Calculate days delayed
                  const calculateDelay = (dueDateStr: string, status: string): number | null => {
                    // For not_started, pending, or overdue status, calculate delay if date has passed
                    if (status === 'completed' || status === 'upcoming') return null
                    const dueDate = parseDate(dueDateStr)
                    if (!dueDate) return null
                    const today = new Date()
                    today.setHours(0, 0, 0, 0)
                    dueDate.setHours(0, 0, 0, 0)
                    const diffTime = today.getTime() - dueDate.getTime()
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
                    // Return delay if date has passed (diffDays > 0)
                    return diffDays > 0 ? diffDays : null
                  }

                  // Calculate penalty amount
                  const calculatePenalty = (penaltyStr: string | null, daysDelayed: number | null): string => {
                    // If no delay or penalty string is empty, return '-'
                    if (daysDelayed === null || daysDelayed <= 0 || !penaltyStr || penaltyStr.trim() === '') {
                      return '-'
                    }

                    const penalty = penaltyStr.trim()

                    // Handle NULL (from database)
                    if (penalty === 'NULL' || penalty === 'null' || penalty === '') {
                      return 'Refer to Act'
                    }

                    // ============================================
                    // Handle NUMERIC FORMATS (new database format)
                    // ============================================

                    // Simple daily rate: "50", "100", "200"
                    if (/^\d+$/.test(penalty)) {
                      const dailyRate = parseInt(penalty, 10)
                      if (!isNaN(dailyRate) && dailyRate > 0) {
                        return `₹${Math.round(dailyRate * daysDelayed).toLocaleString('en-IN')}`
                      }
                    }

                    // Complex format with max cap: "100|500000" (daily|max)
                    if (/^\d+\|\d+$/.test(penalty)) {
                      const [dailyRateStr, maxCapStr] = penalty.split('|')
                      const dailyRate = parseInt(dailyRateStr, 10)
                      const maxCap = parseInt(maxCapStr, 10)
                      
                      if (!isNaN(dailyRate) && dailyRate > 0) {
                        let calculated = dailyRate * daysDelayed
                        if (!isNaN(maxCap) && maxCap > 0) {
                          calculated = Math.min(calculated, maxCap)
                        }
                        return `₹${Math.round(calculated).toLocaleString('en-IN')}`
                      }
                    }

                    // ============================================
                    // Handle REMAINING TEXT FORMATS (fallback)
                    // ============================================

                    // Extract daily rate from penalty string (e.g., "₹100/day", "100/day")
                    // Handle "50/day (NIL: 20/day)" - extract first number
                    let dailyRateMatch = penalty.match(/(\d+)\/day\s*\([^)]*NIL[^)]*\)/i)
                    if (!dailyRateMatch) {
                      dailyRateMatch = penalty.match(/(?:₹)?[\d,]+(?:\.[\d]+)?\/day/i)
                    }
                    if (dailyRateMatch) {
                      const rateStr = dailyRateMatch[1] || dailyRateMatch[0].replace(/₹/gi, '').replace(/\/day/gi, '').replace(/,/g, '')
                      const dailyRate = parseFloat(rateStr.replace(/,/g, ''))
                      if (!isNaN(dailyRate) && dailyRate > 0) {
                        let calculatedPenalty = dailyRate * daysDelayed
                        
                        // Check for maximum limit
                        const maxMatch = penalty.match(/max\s*(?:₹)?[\d,]+(?:\.[\d]+)?/i)
                        if (maxMatch) {
                          const maxStr = maxMatch[0].replace(/max\s*(?:₹)?/gi, '').replace(/,/g, '')
                          const maxAmount = parseFloat(maxStr)
                          if (!isNaN(maxAmount) && maxAmount > 0) {
                            calculatedPenalty = Math.min(calculatedPenalty, maxAmount)
                          }
                        }
                        
                        return `₹${calculatedPenalty.toLocaleString('en-IN')}`
                      }
                    }
                    
                    // Handle "200/day + 10000-100000" - extract daily rate before the +
                    const dailyWithRangeMatch = penalty.match(/(\d+)\/day\s*\+\s*[\d-]+/i)
                    if (dailyWithRangeMatch) {
                      const dailyRate = parseFloat(dailyWithRangeMatch[1].replace(/,/g, ''))
                      if (!isNaN(dailyRate) && dailyRate > 0) {
                        return `₹${Math.round(dailyRate * daysDelayed).toLocaleString('en-IN')}`
                      }
                    }
                    
                    // Handle "2%/month + 5/day" - extract daily rate after the +
                    const interestPlusDailyMatch = penalty.match(/[\d.]+%[^+]*\+\s*(\d+)\/day/i)
                    if (interestPlusDailyMatch) {
                      const dailyRate = parseFloat(interestPlusDailyMatch[1].replace(/,/g, ''))
                      if (!isNaN(dailyRate) && dailyRate > 0) {
                        return `₹${Math.round(dailyRate * daysDelayed).toLocaleString('en-IN')}`
                      }
                    }
                    
                    // Handle range formats like "25000-300000" - extract minimum
                    const rangeMatch = penalty.match(/(\d+)\s*-\s*(\d+)/)
                    if (rangeMatch && !penalty.includes('%') && !penalty.includes('/day')) {
                      const minAmount = parseFloat(rangeMatch[1].replace(/,/g, ''))
                      if (!isNaN(minAmount) && minAmount > 0) {
                        return `₹${Math.round(minAmount).toLocaleString('en-IN')} (minimum)`
                      }
                    }

                    // Check for explicit fixed penalty amounts
                    const fixedKeywords = /(?:fixed|one-time|one time|flat|lump)/i
                    if (fixedKeywords.test(penalty)) {
                      let fixedMatch = penalty.match(/₹[\d,]+(?:\.[\d]+)?/i)
                      if (!fixedMatch) {
                        const plainNumberMatch = penalty.match(/[\d,]+(?:\.[\d]+)?/i)
                        if (plainNumberMatch) {
                          const amount = plainNumberMatch[0].replace(/,/g, '')
                          const numAmount = parseFloat(amount)
                          if (!isNaN(numAmount) && numAmount > 0) {
                            return `₹${numAmount.toLocaleString('en-IN')}`
                          }
                        }
                      } else {
                        return fixedMatch[0]
                      }
                    }

                    // Plain number as daily rate (fallback for text format)
                    const plainNumberMatch = penalty.match(/^[\d,]+(?:\.[\d]+)?$/i)
                    if (plainNumberMatch && !penalty.includes('/day') && !penalty.includes('Interest') && !penalty.includes('+')) {
                      const amount = plainNumberMatch[0].replace(/,/g, '')
                      const numAmount = parseFloat(amount)
                      if (!isNaN(numAmount) && numAmount > 0) {
                        const calculatedPenalty = numAmount * daysDelayed
                        return `₹${calculatedPenalty.toLocaleString('en-IN')}`
                      }
                    }

                    // Check for penalties with Interest
                    if (penalty.includes('Interest') || penalty.includes('+ Interest')) {
                      return 'Cannot calculate - Insufficient information (Interest calculation requires principal amount)'
                    }

                    // Check for vague "as per Act" references
                    if (/as per.*Act/i.test(penalty) || /as per.*guidelines/i.test(penalty)) {
                      return 'Refer to Act'
                    }

                    // Check for penalties that are too complex
                    if (penalty.includes('+') && !penalty.includes('/day')) {
                      return 'Cannot calculate - Complex penalty structure requires additional information'
                    }

                    return 'Cannot calculate - Insufficient information'
                  }
                  
                  // Filter by date (Monthly/Quarters based on selected FY)
                  let dateFilteredRequirements = displayRequirements
                  
                  if (selectedTrackerFY) {
                    // Extract year from FY (e.g., "FY 2019-20" -> 2019)
                    const fyYear = parseInt(selectedTrackerFY.split(' ')[1].split('-')[0])
                    
                    if (selectedMonth) {
                      const monthIndex = months.indexOf(selectedMonth)
                      dateFilteredRequirements = dateFilteredRequirements.filter((req) => {
                        const reqMonth = getMonthFromDate(req.dueDate)
                        const reqYear = parseInt(req.dueDate.split(', ')[1] || req.dueDate.split(' ')[2] || '2026')
                        // For Indian FY: April (3) to March (2) spans two calendar years
                        // Months Apr-Jun (3-5) are in fyYear, Jul-Sep (6-8) are in fyYear, Oct-Dec (9-11) are in fyYear
                        // Months Jan-Mar (0-2) are in fyYear + 1
                        let expectedYear = fyYear
                        if (monthIndex >= 0 && monthIndex <= 2) {
                          // Jan-Mar are in the next calendar year
                          expectedYear = fyYear + 1
                        }
                        return reqMonth === monthIndex && reqYear === expectedYear
                      })
                    } else if (selectedQuarter) {
                      dateFilteredRequirements = dateFilteredRequirements.filter((req) => {
                        const reqQuarter = getQuarterFromDate(req.dueDate)
                        const reqYear = parseInt(req.dueDate.split(', ')[1] || req.dueDate.split(' ')[2] || '2026')
                        // Q1 (Apr-Jun) = fyYear
                        // Q2 (Jul-Sep) = fyYear
                        // Q3 (Oct-Dec) = fyYear
                        // Q4 (Jan-Mar) = fyYear + 1
                        if (selectedQuarter === 'q4') {
                          return reqQuarter === selectedQuarter && reqYear === fyYear + 1
                        } else {
                          return reqQuarter === selectedQuarter && reqYear === fyYear
                        }
                      })
                    } else {
                      // If FY is selected but no month/quarter, show all items for that FY
                      dateFilteredRequirements = dateFilteredRequirements.filter((req) => {
                        const reqYear = parseInt(req.dueDate.split(', ')[1] || req.dueDate.split(' ')[2] || '2026')
                        const reqMonth = getMonthFromDate(req.dueDate)
                        // FY spans from April (month 3) of fyYear to March (month 2) of fyYear + 1
                        if (reqMonth >= 3) {
                          // Apr-Dec are in fyYear
                          return reqYear === fyYear
                        } else {
                          // Jan-Mar are in fyYear + 1
                          return reqYear === fyYear + 1
                        }
                      })
                    }
                  }
                  
                  // Filter by status/category and additional filters
                  const filteredRequirements = dateFilteredRequirements.filter((req) => {
                    // Status filter
                    if (categoryFilter !== 'all') {
                      if (categoryFilter === 'critical' && !(req.isCritical || req.status === 'overdue')) return false
                      if (categoryFilter === 'pending' && req.status !== 'pending') return false
                      if (categoryFilter === 'upcoming' && req.status !== 'upcoming') return false
                      if (categoryFilter === 'completed' && req.status !== 'completed') return false
                    }

                    // Entity type filter
                    if (entityTypeFilter !== 'all') {
                      // Get entity type from requirement metadata or company
                      const reqEntityType = (req as any).entity_type || entityDetails?.type
                      if (reqEntityType !== entityTypeFilter) return false
                    }

                    // Industry filter
                    if (industryFilter !== 'all') {
                      const reqIndustry = (req as any).industry || entityDetails?.industryCategory
                      if (reqIndustry !== industryFilter) return false
                    }

                    // Industry category filter
                    if (industryCategoryFilter !== 'all') {
                      const reqIndustryCategory = (req as any).industry_category || entityDetails?.industryCategory
                      if (reqIndustryCategory !== industryCategoryFilter) return false
                    }

                    // Compliance type filter
                    if (complianceTypeFilter !== 'all') {
                      const reqComplianceType = (req as any).compliance_type
                      if (reqComplianceType !== complianceTypeFilter) return false
                    }

                    return true
                  })

                  const groupedByCategory = categoryOrder.map((category) => {
                    const items = filteredRequirements
                      .filter((req) => req.category === category)
                      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                    return { category, items }
                  }).filter((group) => group.items.length > 0)

                  // Calendar view helper functions
                  const parseDateForCalendar = (dateStr: string): Date | null => {
                    try {
                      const months: { [key: string]: number } = {
                        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
                        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
                      }
                      const parts = dateStr.split(' ')
                      if (parts.length >= 3) {
                        const day = parseInt(parts[1].replace(',', ''))
                        const month = months[parts[0]]
                        const year = parseInt(parts[2])
                        return new Date(year, month, day)
                      }
                      return null
                    } catch {
                      return null
                    }
                  }

                  // Group requirements by date for calendar view
                  const requirementsByDate = new Map<string, typeof filteredRequirements>()
                  filteredRequirements.forEach((req) => {
                    const date = parseDateForCalendar(req.dueDate)
                    if (date) {
                      const dateKey = date.toISOString().split('T')[0] // YYYY-MM-DD
                      if (!requirementsByDate.has(dateKey)) {
                        requirementsByDate.set(dateKey, [])
                      }
                      requirementsByDate.get(dateKey)!.push(req)
                    }
                  })

                  // Use state for calendar month/year
                  const currentCalendarMonth = calendarMonth
                  const currentCalendarYear = calendarYear
                  
                  // Remove old navigation functions - they're now inline

                  if (trackerView === 'calendar') {
                    // Recalculate for current calendar month/year
                    const firstDay = new Date(currentCalendarYear, currentCalendarMonth, 1)
                    const lastDay = new Date(currentCalendarYear, currentCalendarMonth + 1, 0)
                    const daysInMonth = lastDay.getDate()
                    const startingDayOfWeek = firstDay.getDay()

                  return (
                      <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-3 sm:p-6">
                        {/* Calendar Header with Navigation - Stack on Mobile */}
                        <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="flex-1">
                            <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-4">
                              <button
                                onClick={() => setCalendarYear(currentCalendarYear - 1)}
                                className="p-1.5 sm:p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
                                title="Previous Year"
                              >
                                <svg width="16" height="16" className="sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="11 17 6 12 11 7" />
                                  <polyline points="18 17 13 12 18 7" />
                                </svg>
                              </button>
                              <button
                                onClick={() => {
                                  if (currentCalendarMonth === 0) {
                                    setCalendarMonth(11)
                                    setCalendarYear(currentCalendarYear - 1)
                                  } else {
                                    setCalendarMonth(currentCalendarMonth - 1)
                                  }
                                }}
                                className="p-1.5 sm:p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
                                title="Previous Month"
                              >
                                <svg width="16" height="16" className="sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="15 18 9 12 15 6" />
                                </svg>
                              </button>
                              <h3 className="text-base sm:text-xl font-semibold text-white min-w-[140px] sm:min-w-[200px] text-center">
                                {months[currentCalendarMonth]} {currentCalendarYear}
                              </h3>
                              <button
                                onClick={() => {
                                  if (currentCalendarMonth === 11) {
                                    setCalendarMonth(0)
                                    setCalendarYear(currentCalendarYear + 1)
                                  } else {
                                    setCalendarMonth(currentCalendarMonth + 1)
                                  }
                                }}
                                className="p-1.5 sm:p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
                                title="Next Month"
                              >
                                <svg width="16" height="16" className="sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </button>
                              <button
                                onClick={() => {
                                  setCalendarYear(currentCalendarYear + 1)
                                }}
                                className="p-1.5 sm:p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
                                title="Next Year"
                              >
                                <svg width="16" height="16" className="sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="13 17 18 12 13 7" />
                                  <polyline points="6 17 11 12 6 7" />
                                </svg>
                              </button>
                            </div>
                            {selectedTrackerFY && (
                              <p className="text-gray-400 text-xs sm:text-sm mt-2 text-center sm:text-left">{selectedTrackerFY}</p>
                            )}
                          </div>
                        </div>
                        
                        {/* Calendar Grid */}
                        <div className="grid grid-cols-7 gap-1 sm:gap-2">
                          {/* Day headers */}
                          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                            <div key={day} className="text-center text-[10px] sm:text-xs font-medium text-gray-400 py-1 sm:py-2">
                              {day}
                            </div>
                          ))}
                          {/* Empty cells for days before month starts */}
                          {Array.from({ length: startingDayOfWeek }).map((_, i) => (
                            <div key={`empty-${i}`} className="aspect-square"></div>
                          ))}
                          {/* Calendar days */}
                          {Array.from({ length: daysInMonth }).map((_, i) => {
                            const day = i + 1
                            const dateKey = `${currentCalendarYear}-${String(currentCalendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
                            const dayRequirements = requirementsByDate.get(dateKey) || []
                            const isToday = new Date().toDateString() === new Date(currentCalendarYear, currentCalendarMonth, day).toDateString()
                            
                            return (
                              <div
                                key={day}
                                className={`min-h-[60px] sm:min-h-[120px] border border-gray-700 rounded sm:rounded-lg p-1 sm:p-2 bg-gray-900/50 ${
                                  isToday ? 'ring-1 sm:ring-2 ring-primary-orange' : ''
                                }`}
                              >
                                <div className={`text-xs sm:text-sm mb-1 sm:mb-2 font-medium ${isToday ? 'text-primary-orange font-bold' : 'text-gray-300'}`}>
                                  {day}
                                </div>
                                <div className="space-y-1 sm:space-y-1.5 overflow-y-auto max-h-[45px] sm:max-h-[90px]">
                                  {dayRequirements.map((req) => {
                                    const isOverdue = req.status === 'overdue' || (parseDateForCalendar(req.dueDate) && parseDateForCalendar(req.dueDate)! < new Date())
                                    const daysDelayed = calculateDelay(req.dueDate, req.status)
                                    const calculatedPenalty = calculatePenalty(req.penalty, daysDelayed)
                                    
                                    return (
                                      <div
                                        key={req.id}
                                        className={`text-[10px] sm:text-xs p-1 sm:p-2 rounded border cursor-pointer hover:opacity-80 transition-opacity ${
                                          isOverdue
                                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                                            : req.status === 'completed'
                                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                                            : req.status === 'pending'
                                            ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                                            : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                                        }`}
                                        title={`${req.category} - ${req.requirement}\n${req.description || ''}\nStatus: ${req.status}\nPenalty: ${req.penalty}\nCalculated: ${calculatedPenalty}`}
                                      >
                                        <div className="font-semibold truncate">{req.requirement}</div>
                                        <div className="text-[8px] sm:text-[10px] text-gray-400 truncate mt-0.5 hidden sm:block">{req.category}</div>
                                        <div className="flex items-center gap-0.5 sm:gap-1 mt-0.5 sm:mt-1">
                                          <span className={`px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] font-medium ${
                                            req.status === 'completed' ? 'bg-green-500/30 text-green-300' :
                                            req.status === 'overdue' ? 'bg-red-500/30 text-red-300' :
                                            req.status === 'pending' ? 'bg-yellow-500/30 text-yellow-300' :
                                            'bg-gray-700 text-gray-300'
                                          }`}>
                                            {req.status === 'completed' ? '✓' : req.status === 'overdue' ? '!' : req.status === 'pending' ? '⏳' : '○'}
                                          </span>
                                          {req.compliance_type && (
                                            <span className="text-[8px] sm:text-[10px] text-gray-400 hidden sm:inline">
                                              {req.compliance_type.charAt(0).toUpperCase()}
                                            </span>
                                          )}
                                        </div>
                                        {calculatedPenalty !== '-' && (
                                          <div className="text-[8px] sm:text-[10px] text-red-400 mt-0.5 font-medium truncate">
                                            {calculatedPenalty}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  }

                  // List view
                  return (
                    <>
                      {/* Mobile Card View */}
                      <div className="block sm:hidden space-y-3">
                        {groupedByCategory.map((group, groupIndex) => (
                          <div key={group.category}>
                            {/* Category Header */}
                            <div className="mb-2">
                              <h3 className="text-primary-orange font-semibold text-base">
                                {group.category}
                              </h3>
                              {groupIndex > 0 && (
                                <div className="h-0.5 bg-gradient-to-r from-transparent via-primary-orange/50 to-transparent my-2"></div>
                              )}
                            </div>
                            {/* Category Items as Cards */}
                            <div className="space-y-3">
                              {group.items.map((req) => {
                                const daysDelayed = calculateDelay(req.dueDate, req.status)
                                const calculatedPenalty = calculatePenalty(req.penalty, daysDelayed)
                                const complianceType = req.compliance_type
                                
                                return (
                                  <div key={req.id} className="bg-gray-900/50 border border-gray-800 rounded-lg p-3 space-y-2">
                                    {/* Requirement Header */}
                                    <div className="flex items-start gap-2">
                                      {(req.isCritical || req.status === 'overdue') && (
                                        <svg
                                          width="16"
                                          height="16"
                                          className="flex-shrink-0 mt-0.5 text-red-500"
                                          viewBox="0 0 24 24"
                                          fill="none"
                                          stroke="currentColor"
                                          strokeWidth="2"
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                        >
                                          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                          <line x1="12" y1="9" x2="12" y2="13" />
                                          <line x1="12" y1="17" x2="12.01" y2="17" />
                                        </svg>
                                      )}
                                      <div className="min-w-0 flex-1">
                                        <div className="text-white font-medium text-sm break-words">{req.requirement}</div>
                                        {req.description && (
                                          <div className="text-gray-400 text-xs break-words mt-1">{req.description}</div>
                                        )}
                                      </div>
                                    </div>
                                    
                                    {/* Status and Type Row */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {canEdit ? (
                                        <select
                                          value={req.status}
                                          onChange={(e) => handleStatusChange(req.id, e.target.value as any)}
                                          className={`px-2 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                                            req.status === 'completed'
                                              ? 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30'
                                              : req.status === 'overdue'
                                              ? 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30'
                                              : req.status === 'pending'
                                              ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30'
                                              : req.status === 'upcoming'
                                              ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30'
                                              : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
                                          }`}
                                          style={{
                                            appearance: 'none',
                                            backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                                            backgroundRepeat: 'no-repeat',
                                            backgroundPosition: 'right 6px center',
                                            paddingRight: '22px'
                                          }}
                                        >
                                          <option value="not_started">NOT STARTED</option>
                                          <option value="upcoming">UPCOMING</option>
                                          <option value="pending">PENDING</option>
                                          <option value="overdue">OVERDUE</option>
                                          <option value="completed">COMPLETED</option>
                                        </select>
                                      ) : (
                                        <span
                                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                                            req.status === 'completed'
                                              ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                              : req.status === 'overdue'
                                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                              : req.status === 'pending'
                                              ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                              : req.status === 'upcoming'
                                              ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                              : 'bg-gray-800 text-gray-400 border border-gray-700'
                                          }`}
                                        >
                                          {req.status === 'completed'
                                            ? 'COMPLETED'
                                            : req.status === 'overdue'
                                            ? 'OVERDUE'
                                            : req.status === 'pending'
                                            ? 'PENDING'
                                            : req.status === 'upcoming'
                                            ? 'UPCOMING'
                                            : 'NOT STARTED'}
                                        </span>
                                      )}
                                      {complianceType && (
                                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                                          complianceType === 'one-time' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                          complianceType === 'monthly' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                          complianceType === 'quarterly' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                          'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                        }`}>
                                          {complianceType.toUpperCase()}
                                        </span>
                                      )}
                                    </div>
                                    
                                    {/* Due Date */}
                                    <div className="flex items-center gap-1.5 text-white">
                                      <svg
                                        width="14"
                                        height="14"
                                        className="flex-shrink-0 text-gray-400"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <circle cx="12" cy="12" r="10" />
                                        <polyline points="12 6 12 12 16 14" />
                                      </svg>
                                      <span className="text-xs">Due: {req.dueDate}</span>
                                    </div>
                                    
                                    {/* Delayed, Penalty, Calculated Penalty */}
                                    <div className="grid grid-cols-2 gap-2 text-xs">
                                      {daysDelayed !== null && (
                                        <div>
                                          <span className="text-gray-400">Delayed:</span>
                                          <span className="text-red-400 font-medium ml-1">
                                            {daysDelayed} {daysDelayed === 1 ? 'day' : 'days'}
                                          </span>
                                        </div>
                                      )}
                                      {req.penalty && (
                                        <div>
                                          <span className="text-gray-400">Penalty:</span>
                                          <span className="text-red-400 ml-1 break-words">{req.penalty}</span>
                                        </div>
                                      )}
                                      {calculatedPenalty !== '-' && (
                                        <div className="col-span-2">
                                          <span className="text-gray-400">Calculated Penalty:</span>
                                          <span className="text-red-400 font-semibold ml-1">
                                            {calculatedPenalty}
                                          </span>
                                        </div>
                                      )}
                                    </div>
                                    
                                    {/* Actions */}
                                    {canEdit && (
                                      <div className="flex items-center gap-2 pt-2 border-t border-gray-800">
                                        <button
                                          onClick={() => {
                                            const originalReq = regulatoryRequirements.find(r => r.id === req.id)
                                            if (originalReq) {
                                              setEditingRequirement(originalReq)
                                              setRequirementForm({
                                                category: originalReq.category,
                                                requirement: originalReq.requirement,
                                                description: originalReq.description || '',
                                                due_date: originalReq.due_date,
                                                penalty: originalReq.penalty || '',
                                                is_critical: originalReq.is_critical,
                                                financial_year: originalReq.financial_year || '',
                                                status: originalReq.status,
                                                compliance_type: (originalReq as any).compliance_type || 'one-time',
                                                year: new Date().getFullYear().toString()
                                              })
                                              setIsEditModalOpen(true)
                                            }
                                          }}
                                          className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 rounded-lg transition-colors"
                                          title="Edit"
                                        >
                                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={async () => {
                                            if (!confirm('Are you sure you want to delete this compliance requirement?')) return
                                            if (!currentCompany) return
                                            
                                            try {
                                              const result = await deleteRequirement(req.id, currentCompany.id)
                                              if (result.success) {
                                                const refreshResult = await getRegulatoryRequirements(currentCompany.id)
                                                if (refreshResult.success && refreshResult.requirements) {
                                                  setRegulatoryRequirements(refreshResult.requirements)
                                                }
                                                alert('Requirement deleted successfully')
                                              } else {
                                                alert(`Failed to delete: ${result.error}`)
                                              }
                                            } catch (error: any) {
                                              console.error('Error deleting requirement:', error)
                                              alert(`Error: ${error.message}`)
                                            }
                                          }}
                                          className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                                          title="Delete"
                                        >
                                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="3 6 5 6 21 6" />
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                          </svg>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Desktop Table View */}
                      <table className="hidden sm:table w-full">
                      <thead className="bg-gray-900 border-b border-gray-800">
                        <tr>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            CATEGORY
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            REQUIREMENT
                          </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                              TYPE
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            STATUS
                          </th>
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                            DUE DATE
                          </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden md:table-cell">
                              DELAYED
                          </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                            PENALTY
                          </th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                              CALC PENALTY
                            </th>
                            {canEdit && (
                          <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                                ACTIONS
                          </th>
                            )}
                        </tr>
                      </thead>
                      <tbody>
                        {groupedByCategory.map((group, groupIndex) => (
                          <React.Fragment key={group.category}>
                            {/* Visual Separator between categories */}
                            {groupIndex > 0 && (
                              <tr>
                                  <td colSpan={canEdit ? 9 : 8} className="px-0 py-0">
                                  <div className="h-0.5 bg-gradient-to-r from-transparent via-primary-orange/50 to-transparent my-2"></div>
                                </td>
                              </tr>
                            )}
                            {/* Category Items */}
                            {group.items.map((req, itemIndex) => (
                              <tr key={req.id} className="hover:bg-gray-900/50 transition-colors border-t border-gray-800">
                                {itemIndex === 0 && (
                                  <td 
                                    className="px-6 py-4 border-r-0 border-l-0 border-t-0 border-b-0 align-top"
                                    rowSpan={group.items.length}
                                  >
                                    <span className="text-primary-orange font-semibold text-2xl block">
                                      {group.category}
                                    </span>
                                  </td>
                                )}
                                <td className="px-6 py-4">
                                    <div className="flex items-start gap-2">
                                    {(req.isCritical || req.status === 'overdue') && (
                                      <svg
                                        width="16"
                                        height="16"
                                        className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                      >
                                        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                                        <line x1="12" y1="9" x2="12" y2="13" />
                                        <line x1="12" y1="17" x2="12.01" y2="17" />
                                      </svg>
                                    )}
                                      <div className="min-w-0 flex-1">
                                        <div className="text-white font-medium text-base break-words">{req.requirement}</div>
                                        <div className="text-gray-400 text-sm break-words">{req.description}</div>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-6 py-4">
                                    {(() => {
                                      const complianceType = req.compliance_type
                                      if (!complianceType) return <span className="text-gray-500 text-sm">-</span>
                                      return (
                                        <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                          complianceType === 'one-time' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                          complianceType === 'monthly' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                          complianceType === 'quarterly' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                          'bg-orange-500/20 text-orange-400 border border-orange-500/30'
                                        }`}>
                                          {complianceType.toUpperCase()}
                                        </span>
                                      )
                                    })()}
                                  </td>
                                  <td className="px-6 py-4">
                                    {canEdit ? (
                                      <select
                                        value={req.status}
                                        onChange={(e) => handleStatusChange(req.id, e.target.value as any)}
                                        className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                                          req.status === 'completed'
                                            ? 'bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30'
                                            : req.status === 'overdue'
                                            ? 'bg-red-500/20 text-red-400 border-red-500/30 hover:bg-red-500/30'
                                            : req.status === 'pending'
                                            ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30 hover:bg-yellow-500/30'
                                            : req.status === 'upcoming'
                                            ? 'bg-blue-500/20 text-blue-400 border-blue-500/30 hover:bg-blue-500/30'
                                            : 'bg-gray-800 text-gray-400 border-gray-700 hover:bg-gray-700'
                                        }`}
                                        style={{
                                          appearance: 'none',
                                          backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                                          backgroundRepeat: 'no-repeat',
                                          backgroundPosition: 'right 6px center',
                                          paddingRight: '22px'
                                        }}
                                      >
                                        <option value="not_started">NOT STARTED</option>
                                        <option value="upcoming">UPCOMING</option>
                                        <option value="pending">PENDING</option>
                                        <option value="overdue">OVERDUE</option>
                                        <option value="completed">COMPLETED</option>
                                      </select>
                                    ) : (
                                  <span
                                    className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
                                      req.status === 'completed'
                                        ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                        : req.status === 'overdue'
                                        ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                                        : req.status === 'pending'
                                        ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                        : req.status === 'upcoming'
                                        ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                        : 'bg-gray-800 text-gray-400 border border-gray-700'
                                    }`}
                                  >
                                    {req.status === 'completed'
                                      ? 'COMPLETED'
                                      : req.status === 'overdue'
                                      ? 'OVERDUE'
                                      : req.status === 'pending'
                                      ? 'PENDING'
                                      : req.status === 'upcoming'
                                      ? 'UPCOMING'
                                      : 'NOT STARTED'}
                                  </span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                  <div className="flex items-center gap-2 text-white">
                                    <svg
                                      width="16"
                                      height="16"
                                        className="w-4 h-4 flex-shrink-0 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                                    >
                                      <circle cx="12" cy="12" r="10" />
                                      <polyline points="12 6 12 12 16 14" />
                                    </svg>
                                      <span className="text-sm whitespace-nowrap">{req.dueDate}</span>
                                  </div>
                                </td>
                                  <td className="px-6 py-4 hidden md:table-cell">
                                  {(() => {
                                    const daysDelayed = calculateDelay(req.dueDate, req.status)
                                    if (daysDelayed === null) {
                                      return <div className="text-gray-500 text-sm">-</div>
                                    }
                                    return (
                                      <div className="text-red-400 text-sm font-medium">
                                        {daysDelayed} {daysDelayed === 1 ? 'day' : 'days'}
                                      </div>
                                    )
                                  })()}
                                </td>
                                  <td className="px-6 py-4 hidden lg:table-cell">
                                    <div className="text-red-400 text-sm break-words">{req.penalty}</div>
                                </td>
                                  <td className="px-6 py-4 hidden lg:table-cell">
                                  {(() => {
                                    const daysDelayed = calculateDelay(req.dueDate, req.status)
                                    const calculatedPenalty = calculatePenalty(req.penalty, daysDelayed)
                                    if (calculatedPenalty === '-') {
                                      return <div className="text-gray-500 text-sm">-</div>
                                    }
                                    if (calculatedPenalty.startsWith('Cannot calculate')) {
                                      return (
                                        <div className="text-yellow-400 text-xs max-w-xs" title={calculatedPenalty}>
                                          {calculatedPenalty}
                                        </div>
                                      )
                                    }
                                    return (
                                      <div className="text-red-400 text-sm font-semibold">
                                        {calculatedPenalty}
                                      </div>
                                    )
                                  })()}
                                </td>
                                  {canEdit && (
                                    <td className="px-6 py-4">
                                      <div className="flex items-center gap-2">
                                        <button
                                          onClick={() => {
                                            const originalReq = regulatoryRequirements.find(r => r.id === req.id)
                                            if (originalReq) {
                                              setEditingRequirement(originalReq)
                                              setRequirementForm({
                                                category: originalReq.category,
                                                requirement: originalReq.requirement,
                                                description: originalReq.description || '',
                                                due_date: originalReq.due_date,
                                                penalty: originalReq.penalty || '',
                                                is_critical: originalReq.is_critical,
                                                financial_year: originalReq.financial_year || '',
                                                status: originalReq.status,
                                                compliance_type: (originalReq as any).compliance_type || 'one-time',
                                                year: new Date().getFullYear().toString()
                                              })
                                              setIsEditModalOpen(true)
                                            }
                                          }}
                                          className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 rounded-lg transition-colors"
                                          title="Edit"
                                        >
                                          <svg width="16" height="16" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                          </svg>
                                        </button>
                                        <button
                                          onClick={async () => {
                                            if (!confirm('Are you sure you want to delete this compliance requirement?')) return
                                            if (!currentCompany) return
                                            
                                            try {
                                              const result = await deleteRequirement(req.id, currentCompany.id)
                                              if (result.success) {
                                                // Refresh requirements
                                                const refreshResult = await getRegulatoryRequirements(currentCompany.id)
                                                if (refreshResult.success && refreshResult.requirements) {
                                                  setRegulatoryRequirements(refreshResult.requirements)
                                                }
                                                alert('Requirement deleted successfully')
                                              } else {
                                                alert(`Failed to delete: ${result.error}`)
                                              }
                                            } catch (error: any) {
                                              console.error('Error deleting requirement:', error)
                                              alert(`Error: ${error.message}`)
                                            }
                                          }}
                                          className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                                          title="Delete"
                                        >
                                          <svg width="16" height="16" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="3 6 5 6 21 6" />
                                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                          </svg>
                                        </button>
                                      </div>
                                    </td>
                                  )}
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                    </>
                  )
                })()}
              </div>
              )}
            </div>

            {/* Create/Edit Compliance Modal */}
            {(isCreateModalOpen || isEditModalOpen) && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
                  <div className="p-6 border-b border-gray-800">
                    <div className="flex items-center justify-between">
                      <h3 className="text-2xl font-light text-white">
                        {isEditModalOpen ? 'Edit Compliance' : 'Add Compliance'}
                      </h3>
                      <button
                        onClick={() => {
                          setIsCreateModalOpen(false)
                          setIsEditModalOpen(false)
                          setEditingRequirement(null)
                          setRequirementForm({
                            category: '',
                            requirement: '',
                            description: '',
                            due_date: '',
                            penalty: '',
                            is_critical: false,
                            financial_year: '',
                            status: 'not_started',
                            compliance_type: 'one-time',
                            year: new Date().getFullYear().toString()
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
                        value={requirementForm.category}
                        onChange={(e) => setRequirementForm(prev => ({ ...prev, category: e.target.value }))}
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
                        value={requirementForm.requirement}
                        onChange={(e) => setRequirementForm(prev => ({ ...prev, requirement: e.target.value }))}
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
                        value={requirementForm.description}
                        onChange={(e) => setRequirementForm(prev => ({ ...prev, description: e.target.value }))}
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
                        value={requirementForm.compliance_type}
                        onChange={(e) => setRequirementForm(prev => ({ ...prev, compliance_type: e.target.value as any }))}
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                      >
                        <option value="one-time">One-time</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="annual">Annual</option>
                      </select>
                    </div>

                    {/* Year Selection - Show for monthly, quarterly, and annual */}
                    {(requirementForm.compliance_type === 'monthly' || 
                      requirementForm.compliance_type === 'quarterly' || 
                      requirementForm.compliance_type === 'annual') && (
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Year *
                        </label>
                        <select
                          value={requirementForm.year}
                          onChange={(e) => setRequirementForm(prev => ({ ...prev, year: e.target.value }))}
                          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                        >
                          {Array.from({ length: 5 }, (_, i) => {
                            const year = new Date().getFullYear() - 2 + i
                            return (
                              <option key={year} value={year.toString()}>
                                {year}
                              </option>
                            )
                          })}
                        </select>
                        <p className="text-xs text-gray-400 mt-1">
                          Select the year for which this compliance applies
                        </p>
                      </div>
                    )}

                    {/* Due Date */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Due Date *
                      </label>
                      <input
                        type="date"
                        value={requirementForm.due_date}
                        onChange={(e) => setRequirementForm(prev => ({ ...prev, due_date: e.target.value }))}
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                      />
                      {requirementForm.compliance_type !== 'one-time' && (
                        <p className="text-xs text-gray-400 mt-1">
                          For {requirementForm.compliance_type} compliances, this is the base due date. The system will generate requirements for all applicable periods.
                        </p>
                      )}
                    </div>

                    {/* Penalty */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Penalty
                      </label>
                      <input
                        type="text"
                        value={requirementForm.penalty}
                        onChange={(e) => setRequirementForm(prev => ({ ...prev, penalty: e.target.value }))}
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                        placeholder="e.g., Late fee ₹200/day"
                      />
                    </div>

                    {/* Financial Year */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Financial Year
                      </label>
                      <select
                        value={requirementForm.financial_year}
                        onChange={(e) => setRequirementForm(prev => ({ ...prev, financial_year: e.target.value }))}
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                      >
                        <option value="">Select Financial Year</option>
                        {financialYears.map((fy) => (
                          <option key={fy} value={fy}>{fy}</option>
                        ))}
                      </select>
                    </div>

                    {/* Status (only for edit) */}
                    {isEditModalOpen && (
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Status
                        </label>
                        <select
                          value={requirementForm.status}
                          onChange={(e) => setRequirementForm(prev => ({ ...prev, status: e.target.value as any }))}
                          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                        >
                          <option value="not_started">Not Started</option>
                          <option value="upcoming">Upcoming</option>
                          <option value="pending">Pending</option>
                          <option value="overdue">Overdue</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                    )}

                    {/* Is Critical */}
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        id="is_critical"
                        checked={requirementForm.is_critical}
                        onChange={(e) => setRequirementForm(prev => ({ ...prev, is_critical: e.target.checked }))}
                        className="w-4 h-4 text-primary-orange bg-gray-900 border-gray-700 rounded focus:ring-primary-orange"
                      />
                      <label htmlFor="is_critical" className="text-sm font-medium text-gray-300">
                        Mark as Critical
                      </label>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-3 pt-4">
                      <button
                        onClick={async () => {
                          if (!currentCompany) return
                          if (!requirementForm.category || !requirementForm.requirement || !requirementForm.due_date) {
                            alert('Please fill all required fields')
                            return
                          }

                          try {
                            let result
                            if (isEditModalOpen && editingRequirement) {
                              result = await updateRequirement(
                                editingRequirement.id,
                                currentCompany.id,
                                requirementForm
                              )
                            } else {
                              result = await createRequirement(currentCompany.id, requirementForm)
                            }

                            if (result.success) {
                              // Refresh requirements
                              const refreshResult = await getRegulatoryRequirements(currentCompany.id)
                              if (refreshResult.success && refreshResult.requirements) {
                                setRegulatoryRequirements(refreshResult.requirements)
                              }
                              setIsCreateModalOpen(false)
                              setIsEditModalOpen(false)
                              setEditingRequirement(null)
                              setRequirementForm({
                                category: '',
                                requirement: '',
                                description: '',
                                due_date: '',
                                penalty: '',
                                is_critical: false,
                                financial_year: '',
                                status: 'not_started',
                                compliance_type: 'one-time',
                                year: new Date().getFullYear().toString()
                              })
                              alert(isEditModalOpen ? 'Requirement updated successfully' : 'Requirement created successfully')
                            } else {
                              alert(`Failed: ${result.error}`)
                            }
                          } catch (error: any) {
                            console.error('Error saving requirement:', error)
                            alert(`Error: ${error.message}`)
                          }
                        }}
                        className="flex-1 bg-primary-orange text-white px-6 py-3 rounded-lg hover:bg-primary-orange/90 transition-colors font-medium"
                      >
                        {isEditModalOpen ? 'Update' : 'Create'}
                      </button>
                      <button
                        onClick={() => {
                          setIsCreateModalOpen(false)
                          setIsEditModalOpen(false)
                          setEditingRequirement(null)
                          setRequirementForm({
                            category: '',
                            requirement: '',
                            description: '',
                            due_date: '',
                            penalty: '',
                            is_critical: false,
                            financial_year: '',
                            status: 'not_started',
                            compliance_type: 'one-time',
                            year: new Date().getFullYear().toString()
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
        )}

        {activeTab === 'documents' && (
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
                  className="bg-primary-dark-card border border-gray-700 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg hover:border-primary-orange/50 transition-colors flex items-center justify-center gap-2 font-medium text-sm sm:text-base"
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
                  className="bg-primary-dark-card border border-gray-700 text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg hover:border-primary-orange/50 transition-colors flex items-center justify-center gap-2 font-medium text-sm sm:text-base"
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
                  onClick={() => setIsUploadModalOpen(true)}
                  className="bg-primary-orange text-white px-4 sm:px-6 py-2 sm:py-3 rounded-lg hover:bg-primary-orange/90 transition-colors flex items-center justify-center gap-2 font-medium text-sm sm:text-base"
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
                </button>
              </div>
            </div>

            {/* FY Filter */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <label className="text-sm font-medium text-gray-300">Financial Year:</label>
              <select
                value={selectedFY}
                onChange={(e) => setSelectedFY(e.target.value)}
                className="px-3 sm:px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors appearance-none cursor-pointer"
              >
                <option value="">All Financial Years</option>
                {financialYears.map((fy) => (
                  <option key={fy} value={fy}>
                    {fy}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
              {/* Left Side - Document Categories */}
              <div className="lg:col-span-2 space-y-4 sm:space-y-6">
                {documentFolders.map((folderName) => {
                  const filteredVaultDocs = vaultDocuments.filter(doc => {
                    // If no FY selected, show all documents
                    if (!selectedFY) return true
                    // If document has no registration date, don't show it when FY is selected
                    if (!doc.registration_date) return false
                    const docFY = getFinancialYear(doc.registration_date)
                    return docFY === selectedFY
                  })
                  
                  // Filter uploaded docs by folder, but move PAN and TAN to Financials and licenses
                  let uploadedDocs = filteredVaultDocs.filter(d => {
                    if (folderName === 'Financials and licenses') {
                      // Include PAN and TAN from any folder
                      return d.folder_name === folderName || 
                             (d.document_type === 'PAN' || d.document_type === 'TAN')
                    } else {
                      // Exclude PAN and TAN from other folders
                      return d.folder_name === folderName && 
                             d.document_type !== 'PAN' && 
                             d.document_type !== 'TAN'
                    }
                  })
                  
                  const predefinedNames = predefinedDocuments[folderName] || []
                  
                  // Combine predefined and uploaded docs
                  // Map predefined names to a status
                  const folderDocs = predefinedNames.map((name: string) => {
                    const uploaded = uploadedDocs.find(d => d.document_type === name)
                    return uploaded ? { ...uploaded, status: 'uploaded' } : { document_type: name, status: 'pending', id: `pending-${name}` }
                  })

                  // Add any uploaded docs that aren't in the predefined list
                  uploadedDocs.forEach(uploaded => {
                    if (!predefinedNames.includes(uploaded.document_type)) {
                      folderDocs.push({ ...uploaded, status: 'uploaded' })
                    }
                  })

                  const iconColor = folderName === 'Constitutional Documents' ? 'bg-primary-orange' : 
                                   folderName === 'Financials and licenses' ? 'bg-purple-500' :
                                   folderName === 'Taxation & GST Compliance' ? 'bg-green-500' : 'bg-blue-500'
                  
                  return (
                    <div key={folderName} className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                  <div className="flex items-center gap-2 sm:gap-3 mb-3 sm:mb-4">
                        <div className={`w-8 h-8 sm:w-10 sm:h-10 ${iconColor} rounded-lg flex items-center justify-center flex-shrink-0`}>
                      <svg
                        width="16"
                        height="16"
                        className="sm:w-5 sm:h-5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="white"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      </div>
                    <div className="min-w-0 flex-1">
                          <h3 className="text-base sm:text-xl font-light text-white break-words">{folderName}</h3>
                          <p className="text-gray-400 text-xs sm:text-sm">{folderDocs.filter((d: any) => d.status === 'uploaded').length} DOCUMENTS</p>
                      </div>
                    </div>
                      
                  <div className="space-y-2 sm:space-y-3">
                        {folderDocs.length > 0 ? folderDocs.map((doc: any) => (
                          <div key={doc.id} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border transition-colors ${
                            doc.status === 'uploaded' 
                              ? 'bg-gray-900 border-gray-800 hover:border-primary-orange/50' 
                              : 'bg-gray-900/30 border-gray-800/50 border-dashed opacity-60'
                          }`}>
                      <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0 flex-1">
                        <svg
                          width="16"
                          height="16"
                          className={`sm:w-5 sm:h-5 flex-shrink-0 mt-0.5 sm:mt-0 ${doc.status === 'uploaded' ? 'text-gray-400' : 'text-gray-600'}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                        <div className="min-w-0 flex-1">
                                <span className={`text-white text-sm sm:text-base block break-words ${doc.status === 'pending' ? 'italic text-gray-500' : ''}`}>
                                  {doc.document_type}
                                  {doc.status === 'pending' && ' (Pending Upload)'}
                                </span>
                                {doc.status === 'uploaded' && (
                                  <div className="text-gray-500 text-xs mt-1 break-words">
                                    {doc.expiry_date ? `Expires: ${formatDateForDisplay(doc.expiry_date)}` : 'No expiry date'}
                                    {doc.frequency && ` • ${doc.frequency.toUpperCase()}`}
                      </div>
                                )}
                      </div>
                    </div>
                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                              {doc.status === 'uploaded' ? (
                                <>
                                  <button 
                                    onClick={() => handleView(doc.file_path)}
                                    className="text-primary-orange hover:text-primary-orange/80 font-medium text-xs sm:text-sm border border-primary-orange/30 px-2 sm:px-3 py-1 rounded-lg hover:bg-primary-orange/10 transition-colors flex-shrink-0"
                                  >
                          View
                        </button>
                                  <button 
                                    onClick={() => handleExport(doc.file_path, doc.file_name)}
                                    className="text-primary-orange hover:text-primary-orange/80 font-medium text-xs sm:text-sm border border-primary-orange/30 px-2 sm:px-3 py-1 rounded-lg hover:bg-primary-orange/10 transition-colors flex-shrink-0"
                                  >
                          Export
                        </button>
                                  <button 
                                    onClick={() => handleRemove(doc.id, doc.file_path)}
                                    className="text-red-400 hover:text-red-300 font-medium text-xs sm:text-sm border border-red-500/30 px-2 sm:px-3 py-1 rounded-lg hover:bg-red-500/10 transition-colors flex-shrink-0"
                                  >
                          Remove
                        </button>
                                </>
                              ) : (
                                <button 
                                  onClick={() => {
                                    setUploadFormData(prev => ({ 
                                      ...prev, 
                                      folder: folderName,
                                      documentName: doc.document_type
                                    }))
                                    setIsUploadModalOpen(true)
                                  }}
                                  className="text-primary-orange hover:text-white font-medium text-xs sm:text-sm border border-primary-orange px-3 sm:px-4 py-1.5 rounded-lg hover:bg-primary-orange transition-colors w-full sm:w-auto"
                                >
                                  Upload Now
                        </button>
                              )}
                      </div>
                    </div>
                        )) : (
                          <div className="p-6 sm:p-8 text-center bg-gray-900/50 rounded-lg border border-dashed border-gray-800">
                            <p className="text-gray-500 text-xs sm:text-sm">No documents defined for this folder.</p>
                      </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Right Sidebar */}
              <div className="lg:col-span-1 space-y-4 sm:space-y-6">
                {/* Storage Stats */}
                <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6">
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
                  </div>
                  <div className="space-y-2 sm:space-y-3">
                    <div className="w-full bg-gray-900 rounded-full h-2 sm:h-2.5">
                      <div
                        className="bg-primary-orange h-2 sm:h-2.5 rounded-full"
                        style={{ width: '42%' }}
                      ></div>
                    </div>
                    <div className="text-gray-400 text-xs sm:text-sm">4.2 GB / 10 GB</div>
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                  <h3 className="text-base sm:text-lg font-light text-white mb-3 sm:mb-4">Recent Activity</h3>
                  <div className="space-y-2 sm:space-y-3">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full flex-shrink-0"></div>
                      <span className="text-gray-400 text-xs sm:text-sm">Encrypted vault synced</span>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-primary-orange rounded-full flex-shrink-0"></div>
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
                  onClick={() => setIsUploadModalOpen(false)}
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
                        onClick={() => setIsUploadModalOpen(false)}
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
                            className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors flex items-center justify-between font-medium text-sm sm:text-base"
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
                                      setUploadFormData((prev) => ({ ...prev, folder, documentName: '' }))
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

                      {/* Document Name */}
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                          Document Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          value={uploadFormData.documentName}
                          onChange={(e) =>
                            setUploadFormData((prev) => ({ ...prev, documentName: e.target.value }))
                          }
                          placeholder="Enter document name"
                          className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                        />
                      </div>

                      {/* Frequency Selection */}
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                          Frequency
                        </label>
                        <select
                          value={uploadFormData.frequency}
                          onChange={(e) =>
                            setUploadFormData((prev) => ({ ...prev, frequency: e.target.value }))
                          }
                          className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors cursor-pointer"
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
                            className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
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
                            className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
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
                            className="w-4 h-4 sm:w-5 sm:h-5 text-primary-orange bg-gray-800 border-gray-600 rounded focus:ring-primary-orange focus:ring-2 mt-0.5 flex-shrink-0"
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
                        <div className="bg-primary-orange/10 border border-primary-orange/30 rounded-lg p-3 sm:p-4 space-y-3 sm:space-y-4">
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
                              className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
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
                              className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                            />
                          </div>
                        </div>
                      )}

                      {/* File Upload Area */}
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                          Upload File
                        </label>
                        <label className="flex flex-col items-center justify-center w-full h-32 sm:h-48 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-primary-orange transition-colors bg-gray-900/50">
                          <div className="flex flex-col items-center justify-center pt-4 sm:pt-5 pb-4 sm:pb-6 px-4">
                            {isUploading ? (
                              <div className="w-8 h-8 sm:w-12 sm:h-12 border-4 border-primary-orange border-t-transparent rounded-full animate-spin mb-3 sm:mb-4"></div>
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
                          className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors flex items-center justify-center gap-2 font-medium disabled:opacity-50 text-sm sm:text-base"
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
                            className="w-5 h-5 text-primary-orange bg-gray-800 border-gray-600 rounded focus:ring-primary-orange focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                            className="flex items-center gap-3 p-4 bg-gray-900 rounded-lg border border-gray-800 hover:border-primary-orange/50 transition-colors cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedDocuments.has(doc.id)}
                              onChange={() => toggleDocumentSelection(doc.id)}
                              className="w-5 h-5 text-primary-orange bg-gray-800 border-gray-600 rounded focus:ring-primary-orange focus:ring-2"
                            />
                            <div className="flex-1">
                              <div className="text-white font-medium">{doc.name}</div>
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
                          className="px-6 py-3 bg-transparent border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors"
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
                                  alert('No documents found to export. Please check your selection and financial year filter.')
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
                                    alert(`Downloaded ${successCount} file(s) successfully. ${failCount} file(s) failed.`)
                                  } else {
                                    alert(`Successfully downloaded ${successCount} file(s)`)
                                  }
                                } else {
                                  alert('Failed to download files. Please try again or check your browser settings.')
                                }
                                
                              setIsExportModalOpen(false)
                              setSelectedDocuments(new Set())
                              } catch (error: any) {
                                console.error('Export failed:', error)
                                alert('Export failed: ' + (error.message || 'Unknown error'))
                              }
                            }
                          }}
                          disabled={selectedDocuments.size === 0 || allDocuments.length === 0}
                          className="px-6 py-3 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
                            className="w-5 h-5 text-primary-orange bg-gray-800 border-gray-600 rounded focus:ring-primary-orange focus:ring-2"
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
                            className="flex items-center gap-3 p-4 bg-gray-900 rounded-lg border border-gray-800 hover:border-primary-orange/50 transition-colors cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={selectedDocumentsToSend.has(doc.id)}
                              onChange={() => toggleDocumentSelectionForSend(doc.id)}
                              className="w-5 h-5 text-primary-orange bg-gray-800 border-gray-600 rounded focus:ring-primary-orange focus:ring-2"
                            />
                            <div className="flex-1">
                              <div className="text-white font-medium">{doc.name}</div>
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
                          className="px-6 py-3 bg-transparent border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSendNext}
                          disabled={selectedDocumentsToSend.size === 0}
                          className="px-6 py-3 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
                      <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
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
                          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
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
                          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                        />
                      </div>

                      {/* Email Content */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Email Content <span className="text-red-500">*</span>
                        </label>
                        <textarea
                          value={emailData.content}
                          onChange={(e) =>
                            setEmailData((prev) => ({ ...prev, content: e.target.value }))
                          }
                          rows={10}
                          placeholder="Write your email message here..."
                          className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors resize-none"
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
                              content: 'Please find the attached documents from our Compliance Vault.',
                            })
                          }}
                          className="px-6 py-3 bg-transparent border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => {
                            if (emailData.recipients.trim() && emailData.subject.trim() && emailData.content.trim()) {
                              console.log('Sending email:', {
                                recipients: emailData.recipients,
                                subject: emailData.subject,
                                content: emailData.content,
                                documents: Array.from(selectedDocumentsToSend),
                              })
                              // Handle send email logic here
                              setIsEmailTemplateOpen(false)
                              setSelectedDocumentsToSend(new Set())
                              setEmailData({
                                recipients: '',
                                subject: 'Document Sharing - Compliance Vault',
                                content: 'Please find the attached documents from our Compliance Vault.',
                              })
                            }
                          }}
                          disabled={
                            !emailData.recipients.trim() ||
                            !emailData.subject.trim() ||
                            !emailData.content.trim()
                          }
                          className="px-6 py-3 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors flex items-center gap-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                          Send Email
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}



