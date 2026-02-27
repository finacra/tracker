'use client'

import { useState, useEffect, Suspense, useMemo, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import React from 'react'
import Header from '@/components/Header'
import CompanySelector from '@/components/CompanySelector'
import SubtleCircuitBackground from '@/components/SubtleCircuitBackground'
import { createClient } from '@/utils/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { uploadDocument, getCompanyDocuments, getDocumentTemplates, getDownloadUrl, deleteDocument } from '@/app/onboarding/actions'
import { getRegulatoryRequirements, updateRequirementStatus, createRequirement, deleteRequirement, updateRequirement, sendDocumentsEmail, getDirectors, hideDocumentTemplateForCompany, getHiddenDocumentTemplates, hideComplianceForCompany, showComplianceForCompany, getHiddenCompliances, type RegulatoryRequirement } from '@/app/data-room/actions'
import { trackTrackerTabOpened, trackStatusChange, trackDocumentUpload, trackCalendarSync, trackVaultFileExport, trackReportDownload, trackVaultFileUpload } from '@/lib/tracking/kpi-tracker'
import jsPDF from 'jspdf'
import { useUserRole } from '@/hooks/useUserRole'
import { useCompanyAccess, useAnyCompanyAccess } from '@/hooks/useCompanyAccess'
import { enrichComplianceRequirements, type EnrichedComplianceData } from '@/app/data-room/actions-enrichment'
import { showToast } from '@/components/Toast'
import ToastContainer from '@/components/Toast'
import { getCurrentFinancialYear, parseFinancialYear, getFinancialYearMonths, isInFinancialYear as isInFinancialYearUtil } from '@/lib/utils/financial-year'
import { formatCurrency } from '@/lib/utils/currency'
import { useCompanyCountry } from '@/hooks/useCompanyCountry'
import { useComplianceCategories } from '@/hooks/useComplianceCategories'

interface Company {
  id: string
  name: string
  type: string
  year: string
  country_code?: string
  region?: string
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
  taxId: string // Country-specific: PAN (India), VAT (GCC), EIN (USA)
  registrationId: string // Country-specific: CIN (India), Trade License (UAE), Commercial Registration (GCC), EIN (USA)
  address: string
  phoneNumber: string
  industryCategory: string
  directors: Director[]
}

// Generate ICS calendar file from regulatory requirements
function generateICSFile(requirements: RegulatoryRequirement[]): string {
  const now = new Date()
  const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Finacra//Compliance Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ].join('\r\n') + '\r\n'

  requirements.forEach((req, index) => {
    if (!req.due_date) return

    const dueDate = new Date(req.due_date)
    const dateStr = dueDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const uid = `compliance-${req.id}-${index}@finacra.com`

    // Escape text for ICS format
    const escapeText = (text: string | null | undefined) => {
      if (!text) return ''
      return text.replace(/\\/g, '\\\\')
        .replace(/;/g, '\\;')
        .replace(/,/g, '\\,')
        .replace(/\n/g, '\\n')
    }

    const summary = escapeText(req.requirement || '')
    const description = escapeText(
      `${req.category || ''}${req.description ? ': ' + req.description : ''}${req.penalty ? ' | Penalty: ' + req.penalty : ''}`
    )

    icsContent += [
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${timestamp}`,
      `DTSTART:${dateStr}`,
      `DTEND:${dateStr}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      `STATUS:CONFIRMED`,
      `SEQUENCE:0`,
      'END:VEVENT'
    ].join('\r\n') + '\r\n'
  })

  icsContent += 'END:VCALENDAR\r\n'

  return icsContent
}

function DataRoomPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()
  // Memoize supabase client to prevent infinite re-renders
  const supabase = useMemo(() => createClient(), [])
  // Memoize initialCompanyId to prevent unnecessary re-renders
  const initialCompanyId = useMemo(() => {
    return searchParams.get('company_id') || searchParams.get('company') || null
  }, [searchParams])

  const [currentCompany, setCurrentCompany] = useState<Company | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [entityDetails, setEntityDetails] = useState<EntityDetails | null>(null)
  const [vaultDocuments, setVaultDocuments] = useState<any[]>([])
  const [isLoadingVaultDocuments, setIsLoadingVaultDocuments] = useState(false)
  const [documentTemplates, setDocumentTemplates] = useState<any[]>([])
  const [hiddenTemplates, setHiddenTemplates] = useState<Set<string>>(new Set()) // Track hidden templates as "folderName:documentName"
  const [regulatoryRequirements, setRegulatoryRequirements] = useState<RegulatoryRequirement[]>([])
  const [isLoadingRequirements, setIsLoadingRequirements] = useState(false)
  const [hiddenCompliances, setHiddenCompliances] = useState<Set<string>>(new Set()) // Track hidden compliance IDs

  // Refs to track if data has been fetched to prevent re-fetching on tab switch
  const companiesFetchedRef = useRef(false)
  const detailsFetchedRef = useRef<string | null>(null)
  const requirementsFetchedRef = useRef<string | null>(null)
  const [isGeneratingEnhancedPDF, setIsGeneratingEnhancedPDF] = useState(false)
  const [pdfGenerationProgress, setPdfGenerationProgress] = useState({ current: 0, total: 0, step: '' })

  // Get user role for current company
  const { role, canEdit, canManage, loading: roleLoading } = useUserRole(currentCompany?.id || null)

  // Check subscription/trial access for current company
  const { hasAccess, accessType, isLoading: accessLoading, trialDaysRemaining, isOwner, ownerSubscriptionExpired } = useCompanyAccess(currentCompany?.id || null)

  // Check if user has access to ANY company (for initial page load check)
  const { hasAnyAccess, accessibleCompanyIds, isLoading: anyAccessLoading } = useAnyCompanyAccess()


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

    // Skip if already fetched (prevents re-fetch on tab switch)
    if (companiesFetchedRef.current && companies.length > 0) {
      console.log('[fetchCompanies] Already fetched, skipping...')
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
          .select('id, name, type, incorporation_date, country_code, region')
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
            .select('id, name, type, incorporation_date, country_code, region')
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
              year: new Date(c.incorporation_date).getFullYear().toString(),
              country_code: c.country_code || 'IN', // Include country_code, default to IN
              region: c.region || 'APAC' // Include region
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
              year: new Date(c.incorporation_date).getFullYear().toString(),
              country_code: c.country_code || 'IN', // Include country_code, default to IN
              region: c.region || 'APAC' // Include region
            })
          }
        })

        const allCompanies = Array.from(companyMap.values())
          .sort((a, b) => b.id.localeCompare(a.id)) // Sort by ID (newest first)

        console.log('[fetchCompanies] Total companies found:', allCompanies.length)
        console.log('[fetchCompanies] Companies:', allCompanies.map(c => ({ id: c.id, name: c.name })))

        // Mark as fetched
        companiesFetchedRef.current = true

        if (allCompanies.length > 0) {
          const preferred = initialCompanyId
            ? allCompanies.find(c => c.id === initialCompanyId)
            : undefined
          const selected = preferred || allCompanies[0]
          console.log('[fetchCompanies] Setting companies and current company:', selected.name)
          setCompanies(allCompanies)
          // Only update currentCompany if it's different to prevent infinite loops
          setCurrentCompany(prev => {
            // If the company ID is the same, keep the previous reference to prevent re-renders
            if (prev?.id === selected.id) {
              return prev
            }
            return selected
          })
          // Update URL params when setting initial company (only if not already set)
          if (!initialCompanyId || initialCompanyId !== selected.id) {
            const params = new URLSearchParams(searchParams.toString())
            params.set('company_id', selected.id)
            router.replace(`/data-room?${params.toString()}`, { scroll: false })
          }
        } else {
          console.log('[fetchCompanies] No companies found, clearing state')
          setCompanies([])
          setCurrentCompany(prev => {
            // Only update if not already null to prevent unnecessary re-renders
            if (prev === null) return prev
            return null
          })
        }
      } catch (err) {
        console.error('[fetchCompanies] ERROR fetching companies:', err)
        console.error('[fetchCompanies] Error details:', JSON.stringify(err, null, 2))
      }
    }

    console.log('[fetchCompanies] useEffect setup complete, calling fetchCompanies...')

    // Run fetchCompanies
    fetchCompanies()
  }, [user, supabase, authLoading, initialCompanyId])

  // Check if user has access to ANY company - redirect if no access at all
  useEffect(() => {
    // Wait for all loading states to complete
    if (anyAccessLoading || authLoading || isLoading) return

    // If no user, redirect to login
    if (!user) {
      router.push('/login')
      return
    }

    // If user has no companies at all, redirect to onboarding or subscribe
    if (companies.length === 0 && !isLoading) {
      console.log('[Access Check] User has no companies, checking subscription status')

      // Check if user has active subscription or trial
      supabase.rpc('check_user_subscription', { target_user_id: user.id })
        .single()
        .then(({ data, error }) => {
          if (!error && data) {
            const subInfo = data as {
              has_subscription: boolean
              is_trial: boolean
              trial_days_remaining: number
            }

            // If user has active subscription or trial, redirect to onboarding to create company
            if (subInfo.has_subscription || (subInfo.is_trial && subInfo.trial_days_remaining > 0)) {
              console.log('[Access Check] User has subscription/trial but no companies, redirecting to onboarding')
              router.push('/onboarding')
            } else {
              // No subscription/trial and no companies, redirect to subscribe
              console.log('[Access Check] User has no subscription/trial and no companies, redirecting to subscribe')
              router.push('/subscribe')
            }
          } else {
            // Error checking subscription, redirect to subscribe
            console.log('[Access Check] Error checking subscription, redirecting to subscribe')
            router.push('/subscribe')
          }
        })
      return
    }

    // If user has companies but no access to any of them, redirect
    if (companies.length > 0 && !hasAnyAccess && !anyAccessLoading) {
      console.log('[Access Check] User has companies but no access to any, redirecting to subscribe')
      router.push('/subscribe')
      return
    }
  }, [companies.length, hasAnyAccess, anyAccessLoading, authLoading, isLoading, user, router, supabase])

  // Check access when company is selected - redirect if no access
  useEffect(() => {
    // Wait for all loading states to complete
    if (accessLoading || authLoading) return

    // If no company selected, don't check access yet
    if (!currentCompany) return

    // If user is owner but no subscription/trial (or company subscription revoked/expired)
    if (isOwner && !hasAccess) {
      console.log('[Access Check] Owner has no subscription or company subscription expired, redirecting to subscription-required page')
      router.push(`/subscription-required?company_id=${currentCompany.id}`)
      return
    }

    // If user is invited but owner's subscription expired
    if (!isOwner && ownerSubscriptionExpired) {
      console.log('[Access Check] Owner subscription expired, redirecting to contact owner page')
      router.push(`/owner-subscription-expired?company_id=${currentCompany.id}`)
      return
    }

    // If user is not owner and doesn't have access for other reasons
    if (!hasAccess && !isOwner) {
      console.log('[Access Check] No access to this company')
      router.push(`/subscription-required?company_id=${currentCompany.id}`)
    }
  }, [currentCompany, hasAccess, isOwner, ownerSubscriptionExpired, accessLoading, authLoading, router])

  const fetchVaultDocuments = async () => {
    if (!currentCompany) return
    setIsLoadingVaultDocuments(true)
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
    } finally {
      setIsLoadingVaultDocuments(false)
    }
  }

  // Fetch specific company details and directors when currentCompany changes
  useEffect(() => {
    async function fetchDetails() {
      if (!currentCompany) return

      // Skip if already fetched for this company (prevents re-fetch on tab switch)
      if (detailsFetchedRef.current === currentCompany.id) {
        console.log('[fetchDetails] Already fetched for company:', currentCompany.id, 'skipping...')
        return
      }

      setIsLoading(true)
      const startTime = performance.now()
      console.log('[fetchDetails] Starting fetch for company:', currentCompany.id)

      try {
        // Fetch company details and directors IN PARALLEL
        // Use server action for directors to bypass RLS
        const [companyResult, directorsResult] = await Promise.all([
          supabase.from('companies').select('*').eq('id', currentCompany.id).single(),
          getDirectors(currentCompany.id)
        ])

        console.log('[fetchDetails] Parallel fetch completed in', Math.round(performance.now() - startTime), 'ms')

        if (companyResult.error) {
          console.error('[fetchDetails] Company fetch error:', companyResult.error)
          throw companyResult.error
        }
        if (!directorsResult.success) {
          console.error('[fetchDetails] Directors fetch error:', directorsResult.error)
          // Don't throw - continue with empty directors array
        }

        const company = companyResult.data
        const directors = directorsResult.directors || []
        
        console.log('[fetchDetails] Directors fetched:', directors.length, 'directors')
        console.log('[fetchDetails] Directors data:', directors)

        // Map to EntityDetails structure
        if (company) {
          // Get country config for date formatting (use current company's country)
          const companyCountryCode = company.country_code || 'IN'
          const { getCountryConfig } = await import('@/lib/config/countries')
          const countryConfig = getCountryConfig(companyCountryCode)

          // Format date based on country config
          const incorporationDate = new Date(company.incorporation_date)
          let formattedDate = ''
          if (countryConfig?.dateFormat === 'DD/MM/YYYY') {
            formattedDate = incorporationDate.toLocaleDateString('en-GB', {
              day: '2-digit',
              month: 'long',
              year: 'numeric'
            })
          } else {
            formattedDate = incorporationDate.toLocaleDateString('en-US', {
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            })
          }

          const mappedDetails: EntityDetails = {
            companyName: company.name,
            type: company.type.toUpperCase(),
            regDate: formattedDate,
            taxId: company.tax_id || 'Not Provided', // Generic tax identifier
            registrationId: company.registration_id || 'Not Provided', // Generic registration identifier
            address: company.address,
            phoneNumber: company.phone_number || 'Not Provided',
            industryCategory: Array.isArray(company.industry_categories)
              ? company.industry_categories.join(', ')
              : company.industry,
            directors: directors.map(d => ({
              id: d.id,
              firstName: d.firstName,
              lastName: d.lastName,
              middleName: d.middleName,
              din: d.din,
              designation: d.designation,
              dob: d.dob,
              pan: d.pan,
              email: d.email,
              mobile: d.mobile,
              verified: d.verified
            }))
          }
          setEntityDetails(mappedDetails)
        }

        // Mark as fetched for this company
        detailsFetchedRef.current = currentCompany.id

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

  // Handle company change - update both state and URL params
  const handleCompanyChange = useCallback((company: Company) => {
    setCurrentCompany(company)
    // Update URL params without causing navigation
    const params = new URLSearchParams(searchParams.toString())
    params.set('company_id', company.id)
    router.replace(`/data-room?${params.toString()}`, { scroll: false })
    // Reset director selection when company changes
    setSelectedDirectorId(null)
    // Reset fetch refs so new data is fetched for the new company
    detailsFetchedRef.current = null
    requirementsFetchedRef.current = null
    templatesFetchedRef.current.clear() // Clear the Set for templates
  }, [router, searchParams])

  // Sync URL params to state on mount/change (only when companies are loaded)
  // Only sync FROM URL TO STATE, not the other way around (to prevent loops)
  useEffect(() => {
    if (companies.length === 0) return // Wait for companies to load
    
    const urlCompanyId = searchParams.get('company_id') || searchParams.get('company')
    if (urlCompanyId) {
      // Only update if URL has a company and it's different from current
      const companyFromUrl = companies.find(c => c.id === urlCompanyId)
      if (companyFromUrl && (!currentCompany || currentCompany.id !== urlCompanyId)) {
        setCurrentCompany(companyFromUrl)
        setSelectedDirectorId(null) // Reset director when company changes
        // Reset fetch refs so new data is fetched for the new company
        detailsFetchedRef.current = null
        requirementsFetchedRef.current = null
        templatesFetchedRef.current.clear() // Clear the Set for templates
      }
    } else if (currentCompany && companies.length > 0) {
      // If URL has no company but we have one selected, set first company as default
      // This only happens on initial load when there's no URL param
      if (!searchParams.has('company_id') && !searchParams.has('company')) {
        const firstCompany = companies[0]
        if (firstCompany && firstCompany.id !== currentCompany.id) {
          setCurrentCompany(firstCompany)
          setSelectedDirectorId(null)
          // Update URL to match
          const params = new URLSearchParams(searchParams.toString())
          params.set('company_id', firstCompany.id)
          router.replace(`/data-room?${params.toString()}`, { scroll: false })
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, companies.length]) // Only depend on URL and companies, not currentCompany to prevent loops

  const [selectedDirectorId, setSelectedDirectorId] = useState<string | null>(null)

  // Reset director selection when company changes
  useEffect(() => {
    setSelectedDirectorId(null)
  }, [currentCompany?.id])

  // Fetch hidden templates when company changes
  useEffect(() => {
    async function fetchHiddenTemplates() {
      if (!currentCompany) {
        setHiddenTemplates(new Set())
        return
      }

      try {
        const result = await getHiddenDocumentTemplates(currentCompany.id)
        if (result.success && result.hiddenTemplates) {
          const hiddenSet = new Set(
            result.hiddenTemplates.map(t => `${t.folder_name}:${t.document_name}`)
          )
          setHiddenTemplates(hiddenSet)
        }
      } catch (error) {
        console.error('Error fetching hidden templates:', error)
        setHiddenTemplates(new Set())
      }
    }

    fetchHiddenTemplates()
  }, [currentCompany?.id])

  // Fetch hidden compliances when company changes
  useEffect(() => {
    async function fetchHiddenCompliances() {
      if (!currentCompany) {
        setHiddenCompliances(new Set())
        return
      }

      try {
        const result = await getHiddenCompliances(currentCompany.id)
        if (result.success && result.hiddenComplianceIds) {
          setHiddenCompliances(new Set(result.hiddenComplianceIds))
        } else {
          setHiddenCompliances(new Set())
        }
      } catch (error) {
        console.error('Error fetching hidden compliances:', error)
        setHiddenCompliances(new Set())
      }
    }

    fetchHiddenCompliances()
  }, [currentCompany?.id])

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
  const [complianceDetailsModal, setComplianceDetailsModal] = useState<any>(null)
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

  // Document upload from tracker
  const [documentUploadModal, setDocumentUploadModal] = useState<{
    isOpen: boolean
    requirementId: string
    requirement: string
    category: string
    documentName: string
    complianceType: string
    dueDate: string
    financialYear: string | null
    allRequiredDocs: string[]
  } | null>(null)
  const [uploadingDocument, setUploadingDocument] = useState(false)
  const [uploadFile, setUploadFile] = useState<File | null>(null)
  const [uploadProgress, setUploadProgress] = useState<number>(0)
  const [uploadStage, setUploadStage] = useState<string>('')
  const [previewFileUrl, setPreviewFileUrl] = useState<string | null>(null)
  const [requirementUploadHistory, setRequirementUploadHistory] = useState<any[]>([])

  // Demo Notices Data - Country-aware: Only show India-specific demo notices for Indian companies
  // For other countries, start with empty array (notices should come from database)
  const [demoNotices, setDemoNotices] = useState<any[]>([])

  // Get country configuration for current company (must be before useEffect that uses it)
  const { countryCode, countryConfig } = useCompanyCountry(currentCompany)

  // Fetch compliance categories from database
  const { categories: complianceCategories } = useComplianceCategories(countryCode || 'IN')

  // Track if templates have been fetched to prevent re-fetching on tab switch
  const templatesFetchedRef = useRef<Set<string>>(new Set())

  // Fetch document templates when country code changes (must be after countryCode is defined)
  useEffect(() => {
    if (!countryCode) return
    // Skip if already fetched for this country
    if (templatesFetchedRef.current.has(countryCode)) return

    async function fetchTemplates() {
      try {
        // Use server action which bypasses RLS
        const result = await getDocumentTemplates()
        if (result.success && result.templates) {
          // Filter by country code on client side if templates have country_code
          const filtered = result.templates.filter((t: any) => 
            !t.country_code || t.country_code === countryCode
          )
          setDocumentTemplates(filtered)
          templatesFetchedRef.current.add(countryCode)
        }
      } catch (error) {
        console.error('Error fetching templates:', error)
        setDocumentTemplates([])
      }
    }

    fetchTemplates()
  }, [countryCode])

  // Update demo notices when company changes (show for all companies for demo)
  useEffect(() => {
    // Show demo notices for all companies (for prototype/demo purposes)
    // Always show demo notices for demo/prototype
    setDemoNotices([
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
        type: 'RoC',
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
        type: 'Payroll',
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
        priority: 'high',
        description: `An outstanding tax demand of ${formatCurrency(245000, countryCode)} is pending against your PAN for Assessment Year 2023-24. Please pay the amount or file rectification.`,
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
        priority: 'high',
        description: 'Non-filing of returns for consecutive 6 months. Show cause why GST registration should not be cancelled.',
        documents: ['All GSTR-3B Filed', 'Reply to SCN'],
        timeline: [
          { date: '2025-11-15', action: 'Notice Received', by: 'System' },
          { date: '2025-11-18', action: 'Filed Pending Returns', by: 'Accounts' },
          { date: '2025-11-20', action: 'Reply Submitted', by: 'CA' },
          { date: '2025-11-28', action: 'Registration Restored', by: 'GST Dept' }
        ]
      },
      {
        id: 'NOT-2026-007',
        type: 'GST',
        subType: 'DRC-01',
        section: 'Section 73/74',
        subject: 'Demand for Unpaid Tax - GSTR-3B for Oct 2025',
        issuedBy: 'GST Department',
        issuedDate: '2026-01-20',
        dueDate: '2026-02-05',
        status: 'pending',
        priority: 'high',
        description: 'Demand notice for unpaid/short-paid tax or wrong ITC claim for the month of October 2025. Amount due: ' + formatCurrency(125000, countryCode),
        documents: ['GSTR-3B Oct 2025', 'Payment Challan', 'ITC Documents'],
        timeline: [
          { date: '2026-01-20', action: 'Notice Received', by: 'System' },
          { date: '2026-01-21', action: 'Under Review', by: 'Accounts Team' }
        ]
      },
      {
        id: 'NOT-2026-008',
        type: 'Income Tax',
        subType: 'ASMT-10',
        section: 'Section 65',
        subject: 'Scrutiny Notice for AY 2023-24',
        issuedBy: 'Income Tax Department',
        issuedDate: '2026-01-18',
        dueDate: '2026-02-18',
        status: 'pending',
        priority: 'medium',
        description: 'Notice for scrutiny of returns filed for Assessment Year 2023-24. Please provide supporting documents and clarifications.',
        documents: ['ITR-3 AY 2023-24', 'Audited Financials', 'Tax Audit Report'],
        timeline: [
          { date: '2026-01-18', action: 'Notice Received', by: 'System' },
          { date: '2026-01-19', action: 'Assigned to CA', by: 'Admin' }
        ]
      },
      {
        id: 'NOT-2026-009',
        type: 'RoC',
        subType: 'DIR-3 KYC',
        section: 'Section 152',
        subject: 'Non-compliance with Director KYC Requirements',
        issuedBy: 'Registrar of Companies',
        issuedDate: '2026-01-12',
        dueDate: '2026-01-27',
        status: 'responded',
        priority: 'medium',
        description: 'Directors of the company have not completed their KYC requirements as per Section 152 of Companies Act, 2013.',
        documents: ['DIR-3 KYC Forms', 'Director PAN Cards', 'Address Proofs'],
        timeline: [
          { date: '2026-01-12', action: 'Notice Received', by: 'System' },
          { date: '2026-01-15', action: 'KYC Forms Collected', by: 'CS' },
          { date: '2026-01-18', action: 'DIR-3 Filed', by: 'CS' },
          { date: '2026-01-20', action: 'Response Submitted', by: 'System' }
        ]
      },
      {
        id: 'NOT-2026-010',
        type: 'GST',
        subType: 'ASMT-13',
        section: 'Section 66',
        subject: 'Best Judgment Assessment - GSTR-3B',
        issuedBy: 'GST Department',
        issuedDate: '2026-01-08',
        dueDate: '2026-01-23',
        status: 'responded',
        priority: 'high',
        description: 'Best judgment assessment order passed due to non-filing of GSTR-3B for the period July-September 2025.',
        documents: ['GSTR-3B Returns', 'Payment Proof', 'Rectification Request'],
        timeline: [
          { date: '2026-01-08', action: 'Notice Received', by: 'System' },
          { date: '2026-01-10', action: 'Returns Filed', by: 'Accounts' },
          { date: '2026-01-12', action: 'Rectification Filed', by: 'CA' },
          { date: '2026-01-15', action: 'Response Submitted', by: 'CA' }
        ]
      },
      {
        id: 'NOT-2025-011',
        type: 'Payroll',
        subType: 'ESIC Notice',
        section: 'ESIC Act',
        subject: 'Non-payment of ESIC Contributions',
        issuedBy: 'ESIC',
        issuedDate: '2025-11-25',
        dueDate: '2025-12-10',
        status: 'resolved',
        priority: 'medium',
        description: 'Outstanding ESIC contributions for the months of August-October 2025. Please clear the dues immediately.',
        documents: ['ESIC Returns', 'Payment Challans', 'Employee Details'],
        timeline: [
          { date: '2025-11-25', action: 'Notice Received', by: 'System' },
          { date: '2025-11-28', action: 'Payment Made', by: 'Accounts' },
          { date: '2025-12-05', action: 'Compliance Verified', by: 'ESIC' },
          { date: '2025-12-08', action: 'Case Closed', by: 'System' }
        ]
      },
      {
        id: 'NOT-2026-012',
        type: 'Income Tax',
        subType: 'Section 142(1)',
        section: 'Section 142(1)',
        subject: 'Notice for Production of Documents - AY 2024-25',
        issuedBy: 'Income Tax Department',
        issuedDate: '2026-01-22',
        dueDate: '2026-02-07',
        status: 'pending',
        priority: 'medium',
        description: 'You are required to produce or cause to be produced such accounts or documents as specified in the notice for the purpose of assessment.',
        documents: ['Books of Accounts', 'Bank Statements', 'Audit Reports'],
        timeline: [
          { date: '2026-01-22', action: 'Notice Received', by: 'System' },
          { date: '2026-01-23', action: 'Documents Being Prepared', by: 'CA' }
        ]
      },
      {
        id: 'NOT-2026-013',
        type: 'GST',
        subType: 'DRC-07',
        section: 'Section 73/74',
        subject: 'Summary of Order - Demand Notice',
        issuedBy: 'GST Department',
        issuedDate: '2026-01-14',
        dueDate: '2026-01-29',
        status: 'pending',
        priority: 'high',
        description: 'Summary of order demanding payment of GST dues amounting to ' + formatCurrency(87500, countryCode) + ' for the period April-June 2025.',
        documents: ['Order Copy', 'Payment Challan', 'Appeal Documents'],
        timeline: [
          { date: '2026-01-14', action: 'Notice Received', by: 'System' },
          { date: '2026-01-16', action: 'Legal Opinion Sought', by: 'Admin' }
        ]
      },
      {
        id: 'NOT-2026-014',
        type: 'RoC',
        subType: 'AOC-4',
        section: 'Section 137',
        subject: 'Non-filing of Annual Financial Statements',
        issuedBy: 'Registrar of Companies',
        issuedDate: '2026-01-10',
        dueDate: '2026-01-25',
        status: 'responded',
        priority: 'medium',
        description: 'The company has not filed its Annual Financial Statements in Form AOC-4 for the financial year ended 31st March 2025.',
        documents: ['AOC-4 Filed', 'Audited Financials', 'Board Resolution'],
        timeline: [
          { date: '2026-01-10', action: 'Notice Received', by: 'System' },
          { date: '2026-01-12', action: 'AOC-4 Filed', by: 'CS' },
          { date: '2026-01-15', action: 'Response Submitted', by: 'System' }
        ]
      },
      {
        id: 'NOT-2025-015',
        type: 'Income Tax',
        subType: 'Section 148',
        section: 'Section 148',
        subject: 'Reopening of Assessment - AY 2022-23',
        issuedBy: 'Income Tax Department',
        issuedDate: '2025-10-15',
        dueDate: '2025-11-15',
        status: 'resolved',
        priority: 'high',
        description: 'Assessment for AY 2022-23 is being reopened as per Section 148 of Income Tax Act, 1961. Please file your return if not filed or provide additional information.',
        documents: ['ITR Filed', 'Supporting Documents', 'Clarifications'],
        timeline: [
          { date: '2025-10-15', action: 'Notice Received', by: 'System' },
          { date: '2025-10-20', action: 'ITR Filed', by: 'CA' },
          { date: '2025-10-25', action: 'Assessment Completed', by: 'IT Dept' },
          { date: '2025-11-10', action: 'Case Closed', by: 'System' }
        ]
      }
    ])
  }, [currentCompany?.id, countryCode])

  const filteredNotices = demoNotices.filter(notice => {
    const matchesStatus = noticesFilter === 'all' || notice.status === noticesFilter
    const matchesType = noticesTypeFilter === 'all' || notice.type === noticesTypeFilter
    return matchesStatus && matchesType
  })
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [isBulkUploadModalOpen, setIsBulkUploadModalOpen] = useState(false)
  const [isAdvancedOptionsOpen, setIsAdvancedOptionsOpen] = useState(false)
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false)
  const [showComplianceContext, setShowComplianceContext] = useState(true)
  const [bulkUploadFiles, setBulkUploadFiles] = useState<File[]>([])
  const [bulkUploadProgress, setBulkUploadProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 })
  // Track advanced options for each file in bulk upload (indexed by file name)
  const [bulkUploadFileOptions, setBulkUploadFileOptions] = useState<Record<string, {
    documentName: string
    registrationDate: string
    expiryDate: string
    frequency: string
    hasNote: boolean
    externalEmail: string
    externalPassword: string
  }>>({})
  // Track which file's advanced options are expanded
  const [expandedBulkFileOptions, setExpandedBulkFileOptions] = useState<Set<string>>(new Set())
  // Track which file's document name dropdown is open
  const [openDocumentNameDropdown, setOpenDocumentNameDropdown] = useState<string | null>(null)
  const [previewDocument, setPreviewDocument] = useState<any | null>(null)
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false)
  const [previewModalTab, setPreviewModalTab] = useState<'preview' | 'compliance'>('preview')
  const [isStorageBreakdownOpen, setIsStorageBreakdownOpen] = useState(false)
  const [expiringSoonFilter, setExpiringSoonFilter] = useState<'all' | 'expiring' | 'expired'>('all')
  const [selectedVersions, setSelectedVersions] = useState<Record<string, number>>({})
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const [expandedDocumentVersions, setExpandedDocumentVersions] = useState<Set<string>>(new Set())
  const [expandedYearGroups, setExpandedYearGroups] = useState<Record<string, Set<string>>>({})
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isSendModalOpen, setIsSendModalOpen] = useState(false)
  const [isEmailTemplateOpen, setIsEmailTemplateOpen] = useState(false)
  const [selectedFY, setSelectedFY] = useState<string>('')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [sortOption, setSortOption] = useState<'name-asc' | 'name-desc' | 'date-newest' | 'date-oldest' | 'expiry' | 'folder'>('date-newest')
  const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set())
  const [selectedDocumentsToSend, setSelectedDocumentsToSend] = useState<Set<string>>(new Set())
  const [isSendingEmail, setIsSendingEmail] = useState(false)
  const [emailData, setEmailData] = useState({
    recipients: '',
    subject: 'Document Sharing - Compliance Vault',
    content: 'Please find the attached documents from our Compliance Vault.',
  })

  // Generate financial years from 2019 to current year (country-aware)
  const currentYear = new Date().getFullYear()
  const financialYears = useMemo(() => {
    const years: string[] = []
    for (let year = 2019; year <= currentYear; year++) {
      // Generate FY based on country's FY start month
      const config = countryConfig
      if (config.financialYear.type === 'CY') {
        years.push(`CY ${year}`)
      } else {
        // FY format: FY 2024-25
        years.push(`FY ${year}-${(year + 1).toString().slice(-2)}`)
      }
    }
    return years.reverse()
  }, [currentYear, countryConfig])
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
    // Period metadata for tracker integration
    periodType: '' as '' | 'one-time' | 'monthly' | 'quarterly' | 'annual',
    periodFinancialYear: '',
    periodKey: '',
    requirementId: '', // If uploading from tracker context
  })

  const [isUploading, setIsUploading] = useState(false)

  // Country-aware default folders and documents
  const getCountryDefaultFolders = (countryCode: string): string[] => {
    const config = countryConfig
    if (!config) return ['Constitutional Documents', 'Financials and licenses', 'Taxation & GST Compliance', 'Regulatory & MCA Filings']

    // Base folders that apply to all countries
    const baseFolders = ['Constitutional Documents', 'Financials and licenses']

    // Country-specific compliance folders based on compliance categories
    const complianceFolders: string[] = []

    if (countryCode === 'IN') {
      // India-specific folders
      complianceFolders.push('Taxation & GST Compliance', 'Regulatory & MCA Filings')
    } else if (['AE', 'SA', 'OM', 'QA', 'BH'].includes(countryCode)) {
      // GCC countries
      complianceFolders.push('VAT & Tax Compliance', 'Corporate & Regulatory Filings')
    } else if (countryCode === 'US') {
      // USA
      complianceFolders.push('Federal Tax Returns', 'State Tax Returns', 'Business License & Registration')
    } else {
      // Fallback
      complianceFolders.push('Tax Compliance', 'Regulatory Filings')
    }

    return [...baseFolders, ...complianceFolders]
  }

  const getCountryDefaultDocuments = (countryCode: string): Record<string, string[]> => {
    const config = countryConfig
    if (!config) {
      return {
        'Constitutional Documents': ['Certificate of Incorporation', 'MOA (Memorandum of Association)', 'AOA (Articles of Association)', 'Rental Deed', 'DIN Certificate'],
        'Financials and licenses': ['PAN', 'TAN'],
        'Taxation & GST Compliance': ['GST Returns', 'Income Tax Returns'],
        'Regulatory & MCA Filings': ['Annual Returns', 'Board Minutes']
      }
    }

    // Use country config's document types and compliance categories
    const constitutionalDocs = config.onboarding.documentTypes.filter(doc =>
      doc.includes('Certificate') || doc.includes('Memorandum') || doc.includes('Articles') || doc.includes('Association')
    )

    const financialDocs = config.onboarding.documentTypes.filter(doc =>
      doc === config.labels.taxId || doc.includes('TAN') || doc.includes('Tax') || doc.includes('License')
    )

    const complianceDocs: Record<string, string[]> = {}

    if (countryCode === 'IN') {
      // India-specific documents
      complianceDocs['Taxation & GST Compliance'] = ['GST Returns', 'Income Tax Returns']
      complianceDocs['Regulatory & MCA Filings'] = ['Annual Returns', 'Board Minutes', 'ROC Filings']
    } else if (['AE', 'SA', 'OM', 'QA', 'BH'].includes(countryCode)) {
      // GCC countries
      complianceDocs['VAT & Tax Compliance'] = ['VAT Returns', 'Corporate Tax Returns']
      complianceDocs['Corporate & Regulatory Filings'] = ['Commercial Registration', 'Trade License Renewal', 'Annual Returns']
    } else if (countryCode === 'US') {
      // USA
      complianceDocs['Federal Tax Returns'] = ['Federal Income Tax Return', 'EIN Certificate']
      complianceDocs['State Tax Returns'] = ['State Income Tax Return', 'Sales Tax Return']
      complianceDocs['Business License & Registration'] = ['Business License', 'State Registration', 'Annual Report']
    } else {
      // Fallback
      complianceDocs['Tax Compliance'] = ['Tax Returns']
      complianceDocs['Regulatory Filings'] = ['Annual Returns']
    }

    return {
      'Constitutional Documents': constitutionalDocs.length > 0 ? constitutionalDocs : ['Certificate of Incorporation', 'Memorandum of Association'],
      'Financials and licenses': financialDocs.length > 0 ? financialDocs : [config.labels.taxId],
      ...complianceDocs
    }
  }

  // Get country-specific defaults
  const DEFAULT_FOLDERS = useMemo(() => {
    const folders = getCountryDefaultFolders(countryCode || 'IN')
    console.log('[DataRoom] Country:', countryCode, 'Default folders:', folders)
    return folders
  }, [countryCode, countryConfig])

  const DEFAULT_DOCUMENTS = useMemo(() => {
    const docs = getCountryDefaultDocuments(countryCode || 'IN')
    console.log('[DataRoom] Country:', countryCode, 'Default documents:', docs)
    return docs
  }, [countryCode, countryConfig])

  // Merge database templates with defaults to ensure all folders are present
  // Prioritize country-aware DEFAULT_FOLDERS, filter out country-inappropriate folders
  const documentFolders = useMemo(() => {
    const countryFolders = new Set(DEFAULT_FOLDERS)

    console.log('[DataRoom] Computing documentFolders for country:', countryCode)
    console.log('[DataRoom] DEFAULT_FOLDERS:', DEFAULT_FOLDERS)
    console.log('[DataRoom] documentTemplates count:', documentTemplates.length)

    // Only add database template folders if they're appropriate for the country
    if (documentTemplates.length > 0) {
      documentTemplates.forEach(t => {
        const folderName = t.folder_name
        const folderLower = folderName.toLowerCase()

        // Skip if already in country-specific folders
        if (countryFolders.has(folderName)) {
          console.log('[DataRoom] Skipping', folderName, '- already in DEFAULT_FOLDERS')
          return
        }

        // Filter out India-specific folders for non-India countries
        if (countryCode !== 'IN') {
          // Don't add India-specific folder names
          if (folderLower.includes('gst') ||
            folderLower.includes('mca') ||
            folderLower.includes('roc') ||
            folderLower.includes('income tax') ||
            folderLower.includes('taxation & gst') ||
            folderLower.includes('regulatory & mca')) {
            console.log('[DataRoom] Filtering out India-specific folder:', folderName, 'for country:', countryCode)
            return // Skip India-specific folders
          }
        }

        // Add the folder if it passed the filter
        console.log('[DataRoom] Adding folder from database:', folderName)
        countryFolders.add(folderName)
      })
    }

    const finalFolders = Array.from(countryFolders)
    console.log('[DataRoom] Final documentFolders:', finalFolders)
    return finalFolders
  }, [DEFAULT_FOLDERS, documentTemplates, countryCode])

  // Merge database templates with defaults, filtering out hidden templates
  const predefinedDocuments = useMemo(() => {
    if (documentTemplates.length > 0) {
      // Start with defaults (ensures PAN and TAN are in Financials and licenses)
      const merged = { ...DEFAULT_DOCUMENTS }

      // Add/override with database templates, but move PAN and TAN to correct folder
      documentTemplates.forEach(template => {
        const docName = template.document_name
        const folderName = template.folder_name

        // Skip if this template is hidden for this company
        const templateKey = `${folderName}:${docName}`
        if (hiddenTemplates.has(templateKey)) {
          return
        }

        // Country-specific tax ID documents should be in "Financials and licenses"
        const taxIdLabel = countryConfig?.labels.taxId || 'PAN'
        if (docName === taxIdLabel || docName === 'PAN' || docName === 'TAN' ||
          (countryCode !== 'IN' && (docName.includes('Tax') || docName.includes('VAT') || docName.includes('Registration')))) {
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

      // Ensure tax ID documents are removed from Constitutional Documents
      const taxIdLabel = countryConfig?.labels.taxId || 'PAN'
      if (merged['Constitutional Documents']) {
        merged['Constitutional Documents'] = merged['Constitutional Documents'].filter(
          (d: string) => d !== taxIdLabel && d !== 'PAN' && d !== 'TAN'
        )
      }

      // Also filter out hidden templates from default documents
      Object.keys(merged).forEach(folder => {
        merged[folder] = merged[folder].filter((docName: string) => {
          const templateKey = `${folder}:${docName}`
          return !hiddenTemplates.has(templateKey)
        })
      })

      return merged
    } else {
      // Filter hidden templates from default documents too
      const filtered = { ...DEFAULT_DOCUMENTS }
      Object.keys(filtered).forEach(folder => {
        filtered[folder] = filtered[folder].filter((docName: string) => {
          const templateKey = `${folder}:${docName}`
          return !hiddenTemplates.has(templateKey)
        })
      })
      return filtered
    }
  }, [documentTemplates, hiddenTemplates, countryCode, countryConfig])

  const handleView = async (filePath: string) => {
    try {
      const result = await getDownloadUrl(filePath)
      if (result.success && result.url) {
        window.open(result.url, '_blank')
      } else {
        showToast('Failed to get document view URL', 'error')
      }
    } catch (err) {
      console.error('View error:', err)
      showToast('Error opening document', 'error')
    }
  }

  const handlePreview = async (doc: any) => {
    try {
      const result = await getDownloadUrl(doc.file_path)
      if (result.success && result.url) {
        setPreviewDocument({ ...doc, previewUrl: result.url })
        setIsPreviewModalOpen(true)
      } else {
        showToast('Failed to get document preview URL', 'error')
      }
    } catch (err) {
      console.error('Preview error:', err)
      showToast('Error loading document preview', 'error')
    }
  }

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
        showToast('Document downloaded successfully', 'success')
      } else {
        showToast('Failed to download document', 'error')
      }
    } catch (err) {
      console.error('Export error:', err)
      showToast('Error downloading document', 'error')
    }
  }

  const handleRemove = async (docId: string, filePath: string) => {
    if (!confirm('Are you sure you want to remove this document? This action cannot be undone.')) return

    try {
      const result = await deleteDocument(docId, filePath)
      if (result.success) {
        await fetchVaultDocuments()
        showToast('Document removed successfully', 'success')
      } else {
        showToast('Failed to remove document: ' + result.error, 'error')
      }
    } catch (err) {
      console.error('Remove error:', err)
      showToast('Error removing document', 'error')
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

  // Interface for version groups
  interface VersionGroup {
    documentType: string
    latestVersion: any
    yearlyVersions: Map<string, any[]> // Key: financial year, Value: array of versions
    totalVersions: number
    folderName: string
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

  const allDocuments = (vaultDocuments || [])
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
    .map(doc => ({
      id: doc.id,
      name: doc.document_type,
      category: doc.folder_name,
      status: 'uploaded',
      period: formatPeriodInfo(doc) || null
    }))

  const handleUpload = async () => {
    if (!uploadFormData.file || !uploadFormData.folder || !uploadFormData.documentName || !currentCompany) {
      showToast('Please fill all required fields and select a file.', 'warning')
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
        fileName: uploadFormData.file.name,
        // Period metadata for tracker integration
        periodType: uploadFormData.periodType || undefined,
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
        showToast('Document uploaded successfully!', 'success')
      } else {
        showToast('Upload failed: Unknown error', 'error')
      }
    } catch (error: any) {
      console.error('Upload failed:', error)
      showToast('Upload failed: ' + error.message, 'error')
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

  // Get current month name
  const getCurrentMonth = (): string => {
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December']
    return months[new Date().getMonth()]
  }

  const [selectedTrackerFY, setSelectedTrackerFY] = useState<string>('') // '' means "All Years"
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null) // null means "All Months"
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false)
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null)
  const [isQuarterDropdownOpen, setIsQuarterDropdownOpen] = useState(false)
  const [trackerView, setTrackerView] = useState<'list' | 'calendar'>('list')
  const [calendarMonth, setCalendarMonth] = useState<number>(new Date().getMonth())
  const [calendarYear, setCalendarYear] = useState<number>(new Date().getFullYear())
  const [categoryFilter, setCategoryFilter] = useState('all') // Status filter (all, critical, pending, etc.)
  const [selectedCategory, setSelectedCategory] = useState<string>('all') // Category filter (Income Tax, GST, etc.)
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false)
  const [entityTypeFilter, setEntityTypeFilter] = useState<string>('all')
  const [industryFilter, setIndustryFilter] = useState<string>('all')
  const [industryCategoryFilter, setIndustryCategoryFilter] = useState<string>('all')
  const [complianceTypeFilter, setComplianceTypeFilter] = useState<string>('all')
  const [trackerSearchQuery, setTrackerSearchQuery] = useState('')
  const [selectedRequirements, setSelectedRequirements] = useState<Set<string>>(new Set())
  const [isComplianceScoreModalOpen, setIsComplianceScoreModalOpen] = useState(false)
  const [isBulkActionModalOpen, setIsBulkActionModalOpen] = useState(false)
  const [bulkActionType, setBulkActionType] = useState<'status' | 'delete' | null>(null)

  // DSC/DIN Management state
  const [directorDscDinData, setDirectorDscDinData] = useState<Record<string, {
    dscFile: File | null
    dinFile: File | null
    dscFilePath: string | null
    dinFilePath: string | null
    portalEmail: string
    portalPassword: string
    hasCredentials: boolean
    expiryDate: string
    reminderEnabled: boolean
  }>>({})

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
    penalty_base_amount: null as number | null,
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

      // Skip if already fetched for this company (prevents re-fetch on tab switch)
      if (requirementsFetchedRef.current === currentCompany.id) {
        console.log('[fetchRequirements] Already fetched for company:', currentCompany.id, 'skipping...')
        return
      }

      setIsLoadingRequirements(true)
      const startTime = performance.now()
      console.log('[fetchRequirements] Starting fetch for company:', currentCompany.id)

      try {
        const result = await getRegulatoryRequirements(currentCompany.id)
        console.log('[fetchRequirements] Completed in', Math.round(performance.now() - startTime), 'ms')

        if (result.success && result.requirements) {
          console.log('[fetchRequirements] Setting requirements, count:', result.requirements.length)
          // Log sample requirement with required_documents
          if (result.requirements.length > 0) {
            const sample = result.requirements.find((r: any) => r.requirement === 'GSTR-3B - Monthly Summary Return' || r.requirement === 'ESI Challan - Monthly ESI Payment')
            if (sample) {
              console.log('[fetchRequirements] Sample requirement in state:', {
                requirement: sample.requirement,
                required_documents: sample.required_documents,
                type: typeof sample.required_documents,
                isArray: Array.isArray(sample.required_documents)
              })
            }
          }
          setRegulatoryRequirements(result.requirements)
          // Mark as fetched for this company
          requirementsFetchedRef.current = currentCompany.id
        } else {
          console.error('Failed to fetch requirements:', result.error)
          setRegulatoryRequirements([])
        }
      } catch (error: any) {
        console.error('Error fetching requirements:', error)
        // Handle network errors gracefully
        if (error?.message?.includes('fetch failed') || error?.name === 'TypeError' || error?.message?.includes('Failed to fetch')) {
          console.warn('Network error while fetching requirements - this may be a temporary connectivity issue')
          // Continue with empty array - user can retry by refreshing or the app will retry on company change
        }
        setRegulatoryRequirements([])
      } finally {
        setIsLoadingRequirements(false)
      }
    }

    fetchRequirements()
  }, [currentCompany]) // Removed activeTab - no need to re-fetch on tab change

  // Track tracker tab opened
  useEffect(() => {
    if (activeTab === 'tracker' && currentCompany?.id && user?.id) {
      trackTrackerTabOpened(user.id, currentCompany.id)
    }
  }, [activeTab, currentCompany?.id, user?.id])

  // Date normalization utilities for consistency
  // Normalize date to UTC midnight for consistent comparisons (avoids timezone issues)
  const normalizeDate = (dateStr: string | Date | null | undefined): Date | null => {
    if (!dateStr) return null
    try {
      const date = dateStr instanceof Date ? dateStr : new Date(dateStr)
      if (isNaN(date.getTime())) return null
      // Normalize to UTC midnight for consistent comparisons
      return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
    } catch {
      return null
    }
  }

  // Compare dates ignoring time (for due date comparisons)
  const compareDates = (date1: string | Date | null, date2: string | Date | null): number => {
    const d1 = normalizeDate(date1)
    const d2 = normalizeDate(date2)
    if (!d1 && !d2) return 0
    if (!d1) return 1
    if (!d2) return -1
    return d1.getTime() - d2.getTime()
  }

  // Check if date is in the future (for validation)
  const isDateInFuture = (dateStr: string | Date | null): boolean => {
    const date = normalizeDate(dateStr)
    if (!date) return false
    const today = normalizeDate(new Date())
    if (!today) return false
    return date.getTime() > today.getTime()
  }

  // Validate due date for upcoming items
  const validateDueDate = (dueDate: string, status: string): { valid: boolean; error?: string } => {
    if (!dueDate) {
      return { valid: false, error: 'Due date is required' }
    }

    const normalized = normalizeDate(dueDate)
    if (!normalized) {
      return { valid: false, error: 'Invalid date format' }
    }

    // For "upcoming" status, due date should be in the future
    if (status === 'upcoming') {
      if (!isDateInFuture(dueDate)) {
        return { valid: false, error: 'Due date for upcoming items must be in the future' }
      }
    }

    return { valid: true }
  }

  // Helper function to format date for display (consistent format)
  const formatDate = (dateStr: string): string => {
    try {
      const date = normalizeDate(dateStr)
      if (!date) return dateStr
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`
    } catch {
      return dateStr
    }
  }

  // Helper function to format date with full month name (consistent format)
  const formatDateForDisplay = (dateStr: string): string => {
    if (!dateStr) return ''
    try {
      const date = normalizeDate(dateStr)
      if (!date) return dateStr
      // Use UTC to avoid timezone issues
      const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
      return `${months[date.getUTCMonth()]} ${date.getUTCDate()}, ${date.getUTCFullYear()}`
    } catch {
      return dateStr
    }
  }

  // Format date as ISO string for storage (consistent format)
  const formatDateForStorage = (dateStr: string | Date | null): string | null => {
    const date = normalizeDate(dateStr)
    if (!date) return null
    // Return ISO string in YYYY-MM-DD format
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
  }

  // Memoized penalty calculation function
  const calculatePenaltyMemoized = useCallback((
    penaltyStr: string | null,
    daysDelayed: number | null,
    penaltyBaseAmount?: number | null  // Base amount for interest calculations
  ): string => {
    // If no delay or penalty string is empty, return '-'
    if (daysDelayed === null || daysDelayed <= 0 || !penaltyStr || penaltyStr.trim() === '') {
      return '-'
    }

    const penalty = penaltyStr.trim()

    // Handle NULL (from database)
    if (penalty === 'NULL' || penalty === 'null' || penalty === '') {
      return 'Refer to Act'
    }

    // Simple daily rate: "50", "100", "200"
    if (/^\d+$/.test(penalty)) {
      const dailyRate = parseInt(penalty, 10)
      if (!isNaN(dailyRate) && dailyRate > 0) {
        return formatCurrency(Math.round(dailyRate * daysDelayed), countryCode)
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
        return formatCurrency(Math.round(calculated), countryCode)
      }
    }

    // Extract daily rate from penalty string (e.g., "₹100/day", "100/day")
    // Use country-specific currency symbol
    const currencySymbol = countryConfig.currency.symbol
    const currencySymbolEscaped = currencySymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    let dailyRateMatch = penalty.match(/(\d+)\/day\s*\([^)]*NIL[^)]*\)/i)
    if (!dailyRateMatch) {
      dailyRateMatch = penalty.match(new RegExp(`(?:${currencySymbolEscaped})?[\\d,]+(?:\\.[\\d]+)?\\/day`, 'i'))
    }
    if (dailyRateMatch) {
      const rateStr = dailyRateMatch[1] || dailyRateMatch[0].replace(new RegExp(currencySymbolEscaped, 'gi'), '').replace(/\/day/gi, '').replace(/,/g, '')
      const dailyRate = parseFloat(rateStr.replace(/,/g, ''))
      if (!isNaN(dailyRate) && dailyRate > 0) {
        let calculatedPenalty = dailyRate * daysDelayed

        // Check for maximum limit
        const maxMatch = penalty.match(new RegExp(`max\\s*(?:${currencySymbolEscaped})?[\\d,]+(?:\\.[\\d]+)?`, 'i'))
        if (maxMatch) {
          const maxStr = maxMatch[0].replace(new RegExp(`max\\s*(?:${currencySymbolEscaped})?`, 'gi'), '').replace(/,/g, '')
          const maxAmount = parseFloat(maxStr)
          if (!isNaN(maxAmount) && maxAmount > 0) {
            calculatedPenalty = Math.min(calculatedPenalty, maxAmount)
          }
        }

        return formatCurrency(calculatedPenalty, countryCode)
      }
    }

    // Handle "200/day + 10000-100000" - extract daily rate before the +
    const dailyWithRangeMatch = penalty.match(/(\d+)\/day\s*\+\s*[\d-]+/i)
    if (dailyWithRangeMatch) {
      const dailyRate = parseFloat(dailyWithRangeMatch[1].replace(/,/g, ''))
      if (!isNaN(dailyRate) && dailyRate > 0) {
        return formatCurrency(Math.round(dailyRate * daysDelayed), countryCode)
      }
    }

    // Handle "2%/month + 5/day" - extract daily rate after the +
    const interestPlusDailyMatch = penalty.match(/[\d.]+%[^+]*\+\s*(\d+)\/day/i)
    if (interestPlusDailyMatch) {
      const dailyRate = parseFloat(interestPlusDailyMatch[1].replace(/,/g, ''))
      if (!isNaN(dailyRate) && dailyRate > 0) {
        return formatCurrency(Math.round(dailyRate * daysDelayed), countryCode)
      }
    }

    // Handle range formats like "25000-300000" - extract minimum
    const rangeMatch = penalty.match(/(\d+)\s*-\s*(\d+)/)
    if (rangeMatch && !penalty.includes('%') && !penalty.includes('/day')) {
      const minAmount = parseFloat(rangeMatch[1].replace(/,/g, ''))
      if (!isNaN(minAmount) && minAmount > 0) {
        return `${formatCurrency(Math.round(minAmount), countryCode)} (minimum)`
      }
    }

    // Check for explicit fixed penalty amounts
    const fixedKeywords = /(?:fixed|one-time|one time|flat|lump)/i
    if (fixedKeywords.test(penalty)) {
      let fixedMatch = penalty.match(new RegExp(`${currencySymbolEscaped}[\\d,]+(?:\\.[\\d]+)?`, 'i'))
      if (!fixedMatch) {
        const plainNumberMatch = penalty.match(/[\d,]+(?:\.[\d]+)?/i)
        if (plainNumberMatch) {
          const amount = plainNumberMatch[0].replace(/,/g, '')
          const numAmount = parseFloat(amount)
          if (!isNaN(numAmount) && numAmount > 0) {
            return formatCurrency(numAmount, countryCode)
          }
        }
      } else {
        // Extract amount from fixed match and format with country currency
        const amountStr = fixedMatch[0].replace(new RegExp(currencySymbolEscaped, 'gi'), '').replace(/,/g, '')
        const amount = parseFloat(amountStr)
        if (!isNaN(amount) && amount > 0) {
          return formatCurrency(amount, countryCode)
        }
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
        return formatCurrency(calculatedPenalty, countryCode)
      }
    }

    // Check for penalties with Interest - IMPROVED: Calculate if base amount is available
    if (penalty.includes('Interest') || penalty.includes('+ Interest') || penalty.includes('interest')) {
      // Try to calculate interest if base amount is available
      if (penaltyBaseAmount && penaltyBaseAmount > 0) {
        // Extract interest rate from penalty string
        // Common formats: "1%/month", "12%/year", "1.5%/month", "Interest @ 1%/month", "u/s 234B & 234C"
        const interestRateMatch = penalty.match(/([\d.]+)\s*%\s*(?:\/|\s*)(month|year|annum|annually|per month|per year)/i)

        if (interestRateMatch) {
          const rate = parseFloat(interestRateMatch[1])
          const period = interestRateMatch[2].toLowerCase()

          if (!isNaN(rate) && rate > 0 && daysDelayed) {
            // Calculate interest based on period
            let interest = 0

            if (period.includes('month')) {
              // Monthly interest: (principal * rate/100) * (days/30)
              const months = daysDelayed / 30
              interest = (penaltyBaseAmount * rate / 100) * months
            } else if (period.includes('year') || period.includes('annum') || period.includes('annually')) {
              // Annual interest: (principal * rate/100) * (days/365)
              const years = daysDelayed / 365
              interest = (penaltyBaseAmount * rate / 100) * years
            }

            if (interest > 0) {
              return `${formatCurrency(Math.round(interest), countryCode)} (Interest @ ${rate}%/${period.includes('month') ? 'month' : 'year'} on ${formatCurrency(penaltyBaseAmount, countryCode)})`
            }
          }
        }

        // Special handling for Income Tax sections 234B & 234C (default 1% per month)
        if (penalty.includes('234B') || penalty.includes('234C') || penalty.includes('u/s 234') || penalty.includes('section 234')) {
          if (daysDelayed) {
            // Default to 1% per month for Income Tax interest
            const months = daysDelayed / 30
            const interest = (penaltyBaseAmount * 0.01) * months
            return `${formatCurrency(Math.round(interest), countryCode)} (Interest @ 1%/month u/s 234B/234C on ${formatCurrency(penaltyBaseAmount, countryCode)})`
          }
        }

        // If rate format not found but base amount exists, try to extract any percentage
        const anyPercentMatch = penalty.match(/([\d.]+)\s*%/i)
        if (anyPercentMatch && daysDelayed) {
          const rate = parseFloat(anyPercentMatch[1])
          if (!isNaN(rate) && rate > 0) {
            // Default to monthly calculation if period not specified
            const months = daysDelayed / 30
            const interest = (penaltyBaseAmount * rate / 100) * months
            return `${formatCurrency(Math.round(interest), countryCode)} (Interest @ ${rate}%/month on ${formatCurrency(penaltyBaseAmount, countryCode)})`
          }
        }
      }

      // If base amount not available, return helpful error message
      return 'Cannot calculate - Please provide principal amount (Base Amount) for interest calculation'
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
  }, [])

  // Memoized delay calculation
  const calculateDelayMemoized = useCallback((dueDateStr: string, status: string): number | null => {
    // For not_started, pending, or overdue status, calculate delay if date has passed
    if (status === 'completed' || status === 'upcoming') return null

    try {
      const months: { [key: string]: number } = {
        'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
        'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
      }
      const parts = dueDateStr.split(' ')
      if (parts.length >= 3) {
        const day = parseInt(parts[1].replace(',', ''))
        const month = months[parts[0]]
        const year = parseInt(parts[2])
        const dueDate = new Date(year, month, day)
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        dueDate.setHours(0, 0, 0, 0)
        const diffTime = today.getTime() - dueDate.getTime()
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
        // Return delay if date has passed (diffDays > 0)
        return diffDays > 0 ? diffDays : null
      }
    } catch {
      // Invalid date format
    }
    return null
  }, [])

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

  // Validate status transition
  const isValidStatusTransition = (oldStatus: string, newStatus: string): { valid: boolean; reason?: string } => {
    // Define valid status transitions
    const validTransitions: Record<string, string[]> = {
      'not_started': ['upcoming', 'pending', 'overdue', 'completed'],
      'upcoming': ['pending', 'overdue', 'completed', 'not_started'],
      'pending': ['completed', 'overdue', 'upcoming', 'not_started'],
      'overdue': ['completed', 'pending', 'upcoming', 'not_started'],
      'completed': ['pending', 'overdue', 'upcoming', 'not_started'] // Allow reopening completed items
    }

    // Same status is always valid (no-op)
    if (oldStatus === newStatus) {
      return { valid: true }
    }

    // Check if transition is allowed
    const allowedTransitions = validTransitions[oldStatus] || []
    if (!allowedTransitions.includes(newStatus)) {
      return {
        valid: false,
        reason: `Cannot change status from "${oldStatus}" to "${newStatus}". Valid transitions: ${allowedTransitions.join(', ')}`
      }
    }

    return { valid: true }
  }

  // Handle status change
  const handleStatusChange = async (requirementId: string, newStatus: 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed') => {
    if (!currentCompany) return

    try {
      // Get old status for validation and tracking
      const oldRequirement = (regulatoryRequirements || []).find(req => req.id === requirementId)
      if (!oldRequirement) {
        showToast('Requirement not found', 'error')
        return
      }

      const oldStatus = oldRequirement.status

      // Validate status transition
      const validation = isValidStatusTransition(oldStatus, newStatus)
      if (!validation.valid) {
        showToast(validation.reason || 'Invalid status transition', 'error')
        return
      }

      // For critical items or moving to completed, show confirmation
      if ((oldRequirement.is_critical || oldStatus === 'overdue') && newStatus === 'completed') {
        if (!confirm(`Are you sure you want to mark this ${oldRequirement.is_critical ? 'critical ' : ''}requirement as completed?`)) {
          return
        }
      }

      const result = await updateRequirementStatus(requirementId, currentCompany.id, newStatus)
      if (result.success) {
        // Track status change
        if (user?.id && currentCompany?.id) {
          await trackStatusChange(user.id, currentCompany.id, requirementId, oldStatus, result.actualStatus || newStatus).catch(err => {
            console.error('Failed to track status change:', err)
          })
        }

        // Update local state with actual status (may differ from requested if validation changed it)
        const actualStatus: 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed' = (result.actualStatus || newStatus) as 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed'
        setRegulatoryRequirements(prev =>
          prev.map(req =>
            req.id === requirementId
              ? { ...req, status: actualStatus, status_reason: result.missingDocs ? `Missing documents: ${result.missingDocs.join(', ')}` : req.status_reason }
              : req
          )
        )
        
        // Show appropriate message
        if (result.missingDocs && result.missingDocs.length > 0 && actualStatus === 'completed') {
          showToast(`Status updated to completed. Note: ${result.missingDocs.length} required document(s) still pending. Admin has been notified.`, 'success')
        } else {
        showToast('Status updated successfully', 'success')
        }
      } else {
        showToast(`Failed to update status: ${result.error}`, 'error')
      }
    } catch (error: any) {
      console.error('Error updating status:', error)
      showToast(`Error: ${error.message}`, 'error')
    }
  }

  // Helper function to detect notice type from document name (for metadata/priority flagging)
  const detectNoticeType = (documentName: string): {
    type?: string
    formCode?: string
    section?: string
    priority?: 'low' | 'medium' | 'high'
    description?: string
  } | null => {
    if (!countryConfig?.regulatory?.noticeTypes) return null

    const docLower = documentName.toLowerCase()
    const noticeTypes = countryConfig.regulatory.noticeTypes

    // Check for exact form code matches first (e.g., DRC-01, ASMT-10)
    for (const [key, notice] of Object.entries(noticeTypes)) {
      const formCodeLower = notice.formCode.toLowerCase()
      if (docLower.includes(formCodeLower) || docLower.includes(key.toLowerCase())) {
        return {
          type: notice.type,
          formCode: notice.formCode,
          section: notice.section,
          priority: notice.priority,
          description: notice.description
        }
      }
    }

    // Check for section-based notices (e.g., Section 142, Section 143)
    for (const [key, notice] of Object.entries(noticeTypes)) {
      if (notice.section) {
        const sectionLower = notice.section.toLowerCase()
        if (docLower.includes(sectionLower)) {
          return {
            type: notice.type,
            formCode: notice.formCode,
            section: notice.section,
            priority: notice.priority,
            description: notice.description
          }
        }
      }
    }

    return null
  }

  // Helper to get form frequency for a requirement
  const getFormFrequency = (requirement: string): string | null => {
    if (!countryConfig?.regulatory?.formFrequencies) return null

    const reqLower = requirement.toLowerCase()

    // Try to match requirement to form name
    for (const [formName, frequency] of Object.entries(countryConfig.regulatory.formFrequencies)) {
      if (reqLower.includes(formName.toLowerCase())) {
        return frequency
      }
    }
    return null
  }

  // Helper to find relevant legal sections for a requirement
  const getRelevantLegalSections = (requirement: string, category: string): Array<{
    act: string
    section: string
    description: string
    relevance: string
  }> => {
    if (!countryConfig?.regulatory?.legalSections) return []

    const reqLower = requirement.toLowerCase()
    const relevantSections: Array<{
      act: string
      section: string
      description: string
      relevance: string
    }> = []

    // Match based on requirement text and category
    Object.values(countryConfig.regulatory.legalSections).forEach(section => {
      const sectionLower = section.section.toLowerCase()
      const actLower = section.act.toLowerCase()

      if (reqLower.includes(sectionLower) ||
        reqLower.includes(actLower) ||
        (category === 'GST' && actLower.includes('gst')) ||
        (category === 'Income Tax' && actLower.includes('income tax')) ||
        (category === 'RoC' && actLower.includes('companies act'))) {
        relevantSections.push(section)
      }
    })

    return relevantSections
  }

  // Helper to get authority for category
  const getAuthorityForCategory = (category: string): string | null => {
    if (!countryConfig?.regulatory?.authorities) return null

    const categoryMap: Record<string, keyof typeof countryConfig.regulatory.authorities> = {
      'GST': 'indirectTax',
      'Income Tax': 'tax',
      'RoC': 'corporate',
      'Payroll': 'labor',
      'Labour Law': 'labor',
      'Renewals': 'registration'
    }

    const authorityKey = categoryMap[category]
    return authorityKey ? countryConfig.regulatory.authorities[authorityKey] || null : null
  }

  // Helper to map folder names to compliance categories (country-aware)
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
        'Financials and licenses': 'Other',
        'Taxation & GST Compliance': 'GST',
        'Regulatory & MCA Filings': 'RoC'
      }
      return folderMap[folderName] || null
    } else if (['AE', 'SA', 'OM', 'QA', 'BH'].includes(countryCode || '')) {
      // GCC countries
      const folderMap: Record<string, string> = {
        'VAT & Tax Compliance': 'VAT',
        'Corporate & Regulatory Filings': 'Corporate Tax',
        'Constitutional Documents': 'Other',
        'Financials and licenses': 'Other'
      }
      return folderMap[folderName] || null
    } else if (countryCode === 'US') {
      // USA
      const folderMap: Record<string, string> = {
        'Federal Tax Returns': 'Federal Tax',
        'State Tax Returns': 'State Tax',
        'Business License & Registration': 'Business License',
        'Constitutional Documents': 'Other',
        'Financials and licenses': 'Other'
      }
      return folderMap[folderName] || null
    }

    // Fallback
    return null
  }

  // Get relevant forms for folder (country-aware)
  const getRelevantFormsForFolder = (folderName: string): string[] => {
    const category = getCategoryFromFolder(folderName)
    if (!category || !countryConfig?.regulatory?.commonForms) return []

    const categoryLower = category.toLowerCase()
    const forms = countryConfig.regulatory.commonForms.filter(form => {
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

  // Get authority for folder
  const getAuthorityForFolder = (folderName: string): string | null => {
    const category = getCategoryFromFolder(folderName)
    return category ? getAuthorityForCategory(category) : null
  }

  // Suggest folders based on document name (country-aware)
  const suggestFoldersForDocument = (documentName: string): string[] => {
    const docLower = documentName.toLowerCase()
    const suggestions: string[] = []

    if (countryCode === 'IN') {
      // India-specific patterns
      if (docLower.includes('gstr') || docLower.includes('gst') || docLower.includes('cmp-') || docLower.includes('itc-') || docLower.includes('iff')) {
        suggestions.push('Taxation & GST Compliance')
      }
      if (docLower.includes('itr') || docLower.includes('form 24') || docLower.includes('form 26') || docLower.includes('form 27') || docLower.includes('tds') || docLower.includes('tcs')) {
        suggestions.push('Taxation & GST Compliance')
      }
      if (docLower.includes('mgt') || docLower.includes('aoc') || docLower.includes('roc') || docLower.includes('dir-') || docLower.includes('pas-') || docLower.includes('ben-') || docLower.includes('inc-') || docLower.includes('adt-') || docLower.includes('cra-') || docLower.includes('llp form')) {
        suggestions.push('Regulatory & MCA Filings')
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

  // Get folder description with authority and form count
  const getFolderDescription = (folderName: string): { authority: string | null, formCount: number } => {
    const authority = getAuthorityForFolder(folderName)
    const forms = getRelevantFormsForFolder(folderName)
    return {
      authority,
      formCount: forms.length
    }
  }

  // Get legal sections for document
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

  // Helper function to map document name to folder based on category (country-aware)
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
        if (patterns.tax && patterns.tax.some(pattern => docLower.includes(pattern.toLowerCase()))) {
          // GST patterns
          if (patterns.tax.some(p => ['gstr', 'gst', 'cmp-', 'itc-', 'iff'].some(gst => p.toLowerCase().includes(gst)) && docLower.includes(p.toLowerCase()))) {
            return 'GST Returns'
          }
          // Income Tax patterns (TDS, ITR, notices)
          if (patterns.tax.some(p => ['itr', 'form 24q', 'form 26q', 'form 27q', 'form 27eq', 'tds', 'tcs', 'drc-', 'asmt-', 'section 142', 'section 143', 'section 156'].some(it => p.toLowerCase().includes(it)) && docLower.includes(p.toLowerCase()))) {
            return 'Income Tax Returns'
          }
          // Default tax pattern match
          return 'Income Tax Returns'
        }

        // Check corporate patterns (MCA/RoC) - map to RoC
        if (patterns.corporate && patterns.corporate.some(pattern => docLower.includes(pattern.toLowerCase()))) {
          return 'ROC Filings'
        }

        // Check labor patterns (EPFO/ESIC) - map to Payroll category
        if (patterns.labor && patterns.labor.some(pattern => docLower.includes(pattern.toLowerCase()))) {
          return 'Labour Law Compliance'
        }

        // Check notice patterns - map to Others/Renewals
        if (patterns.notices && patterns.notices.some(pattern => docLower.includes(pattern.toLowerCase()))) {
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

  // Calculate period metadata for document upload
  const calculatePeriodMetadata = (req: any) => {
    const complianceType = req.compliance_type || 'one-time'
    const dueDate = new Date(req.dueDate)
    const financialYear = req.financial_year || null

    let periodType: 'one-time' | 'monthly' | 'quarterly' | 'annual' = 'one-time'
    let periodKey = ''
    let periodStart = ''
    let periodEnd = ''
    let periodFinancialYear = financialYear

    if (complianceType === 'monthly') {
      periodType = 'monthly'
      const month = dueDate.getMonth() + 1
      const year = dueDate.getFullYear()
      periodKey = `${year}-${String(month).padStart(2, '0')}`
      periodStart = `${year}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(year, month, 0).getDate()
      periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    } else if (complianceType === 'quarterly') {
      periodType = 'quarterly'
      const month = dueDate.getMonth() + 1
      const year = dueDate.getFullYear()
      let quarter = 1
      if (month >= 4 && month <= 6) quarter = 1
      else if (month >= 7 && month <= 9) quarter = 2
      else if (month >= 10 && month <= 12) quarter = 3
      else quarter = 4
      periodKey = `Q${quarter}-${year}`
      const quarterStartMonth = (quarter - 1) * 3 + 1
      periodStart = `${year}-${String(quarterStartMonth).padStart(2, '0')}-01`
      const quarterEndMonth = quarter * 3
      const lastDay = new Date(year, quarterEndMonth, 0).getDate()
      periodEnd = `${year}-${String(quarterEndMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
    } else if (complianceType === 'annual') {
      // Annual compliance: recurs every year
      periodType = 'annual'
      const year = dueDate.getFullYear()
      periodKey = `FY-${year}`
      periodStart = `${year}-04-01`
      periodEnd = `${year + 1}-03-31`
      periodFinancialYear = `FY ${year}-${String(year + 1).slice(-2)}`
    } else if (complianceType === 'one-time') {
      // One-time compliance: happens once, no recurring
      periodType = 'one-time'
      const year = dueDate.getFullYear()
      periodKey = `one-time-${year}`
      const normalizedDate = normalizeDate(dueDate)
      if (normalizedDate) {
        periodStart = formatDateForStorage(normalizedDate) || ''
        periodEnd = formatDateForStorage(normalizedDate) || ''
      } else {
        periodStart = `${year}-01-01`
        periodEnd = `${year}-12-31`
      }
      periodFinancialYear = null // One-time items don't have a recurring financial year
    }

    return { periodType, periodKey, periodStart, periodEnd, periodFinancialYear }
  }

  // Handle document upload from tracker
  const handleTrackerDocumentUpload = async () => {
    if (!documentUploadModal || !uploadFile || !currentCompany) return

    setUploadingDocument(true)
    setUploadProgress(0)
    setUploadStage('Uploading file...')

    try {
      const supabase = createClient()

      // Upload file to storage
      const fileExt = uploadFile.name.split('.').pop()
      const fileName = `${documentUploadModal.requirementId}-${documentUploadModal.documentName}-${Date.now()}.${fileExt}`
      const filePath = `${currentCompany.id}/compliance/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('company-documents')
        .upload(filePath, uploadFile)

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`)
      }

      // Get the requirement to calculate period metadata
      const requirement = (regulatoryRequirements || []).find(r => r.id === documentUploadModal.requirementId)
      if (!requirement) throw new Error('Requirement not found')

      const periodMeta = calculatePeriodMetadata({
        compliance_type: requirement.compliance_type,
        dueDate: requirement.due_date,
        financial_year: requirement.financial_year
      })

      // Determine folder name
      const folderName = getFolderForDocument(documentUploadModal.documentName, documentUploadModal.category)

      // Save document metadata
      try {
        const uploadResult = await uploadDocument(currentCompany.id, {
          folderName,
          documentName: documentUploadModal.documentName,
          registrationDate: undefined,
          expiryDate: undefined,
          isPortalRequired: false,
          // Map compliance_type to frequency:
          // - 'one-time': no recurring, happens once (use 'one-time' or null)
          // - 'annual': recurs annually (use 'annually')
          // - 'monthly': recurs monthly (use 'monthly')
          // - 'quarterly': recurs quarterly (use 'quarterly')
          frequency: documentUploadModal.complianceType === 'one-time' ? 'one-time' :
            documentUploadModal.complianceType === 'annual' ? 'annually' :
              documentUploadModal.complianceType === 'monthly' ? 'monthly' :
                documentUploadModal.complianceType === 'quarterly' ? 'quarterly' : 'one-time',
          filePath,
          fileName: uploadFile.name,
          periodType: periodMeta.periodType,
          periodFinancialYear: periodMeta.periodFinancialYear || null,
          periodKey: periodMeta.periodKey,
          periodStart: periodMeta.periodStart,
          periodEnd: periodMeta.periodEnd,
          requirementId: documentUploadModal.requirementId
        })

        if (!uploadResult.success) {
          throw new Error('Failed to save document metadata')
        }

        // Track document upload
        if (user?.id && currentCompany?.id) {
          await trackDocumentUpload(user.id, currentCompany.id, documentUploadModal.documentName).catch(err => {
            console.error('Failed to track document upload:', err)
          })
        }
      } catch (uploadError: any) {
        throw new Error(uploadError.message || 'Failed to upload document')
      }

      setUploadStage('Verifying upload...')
      setUploadProgress(90)

      // Check if all required documents are uploaded
      const allDocs = documentUploadModal.allRequiredDocs
      const uploadedDocs = await getCompanyDocuments(currentCompany.id)
      if (!uploadedDocs.success) throw new Error('Failed to check uploaded documents')

      // Filter documents for this requirement by period_key and document_type
      // Improved matching: exact match preferred, then normalized comparison
      const normalizeDocName = (name: string): string => {
        return name.toLowerCase()
          .replace(/[^a-z0-9]/g, '') // Remove special chars
          .replace(/\s+/g, '') // Remove spaces
          .trim()
      }

      const requirementDocs = (uploadedDocs.documents || []).filter((doc: any) => {
        // Must match period
        if (doc.period_key !== periodMeta.periodKey) return false

        // Check for document match with improved logic
        const docTypeNormalized = normalizeDocName(doc.document_type || '')
        return allDocs.some(reqDoc => {
          const reqDocNormalized = normalizeDocName(reqDoc)
          // Exact normalized match (preferred)
          if (docTypeNormalized === reqDocNormalized) return true
          // Check if one contains the other (but require at least 3 chars to avoid false positives)
          if (docTypeNormalized.length >= 3 && reqDocNormalized.length >= 3) {
            if (docTypeNormalized.includes(reqDocNormalized) || reqDocNormalized.includes(docTypeNormalized)) {
              // Additional validation: ensure it's not a substring match that's too short
              const minLength = Math.min(docTypeNormalized.length, reqDocNormalized.length)
              if (minLength >= 5) return true // Only allow substring match if at least 5 chars
            }
          }
          return false
        })
      })

      const uploadedDocNames = requirementDocs.map((doc: any) => normalizeDocName(doc.document_type || ''))
      const allRequiredUploaded = allDocs.every(doc => {
        const reqDocNormalized = normalizeDocName(doc)
        return uploadedDocNames.some(uploaded => {
          // Exact match
          if (uploaded === reqDocNormalized) return true
          // Substring match with minimum length requirement
          if (uploaded.length >= 5 && reqDocNormalized.length >= 5) {
            return uploaded.includes(reqDocNormalized) || reqDocNormalized.includes(uploaded)
          }
          return false
        })
      })

      setUploadStage('Updating requirement status...')
      setUploadProgress(95)

      // Update requirement status
      let newStatus: 'pending' | 'completed' = 'pending'
      if (allRequiredUploaded) {
        newStatus = 'completed'
      } else if (requirementDocs.length > 0) {
        newStatus = 'pending'
      }

      // Update requirement status
      const statusResult = await updateRequirementStatus(
        documentUploadModal.requirementId,
        currentCompany.id,
        newStatus
      )

      if (!statusResult.success) {
        console.error('Failed to update status:', statusResult.error)
      }

      setUploadProgress(100)
      setUploadStage('Complete!')

      // Refresh requirements and vault documents
      const refreshResult = await getRegulatoryRequirements(currentCompany.id)
      if (refreshResult.success && refreshResult.requirements) {
        setRegulatoryRequirements(refreshResult.requirements)
      }

      const vaultResult = await getCompanyDocuments(currentCompany.id)
      if (vaultResult.success) {
        setVaultDocuments(vaultResult.documents || [])
      }

      // Show success message with more detail
      const successMessage = allRequiredUploaded
        ? `✅ Document uploaded successfully! All required documents are now uploaded. Requirement status updated to "Completed".`
        : `✅ Document uploaded successfully! ${allDocs.length - requirementDocs.length - 1} document(s) remaining. Requirement status updated to "Pending".`

      showToast(successMessage, 'success')

      // Keep modal open briefly to show success, then close
      setTimeout(() => {
        setDocumentUploadModal(null)
        setUploadFile(null)
        setUploadProgress(0)
        setUploadStage('')
        setPreviewFileUrl(null)
      }, 1500)
    } catch (error: any) {
      console.error('Error uploading document:', error)
      showToast(`❌ Error uploading document: ${error.message}`, 'error')
      setUploadProgress(0)
      setUploadStage('')
    } finally {
      setUploadingDocument(false)
    }
  }

  // Fetch upload history for requirement
  useEffect(() => {
    const fetchUploadHistory = async () => {
      if (!documentUploadModal || !currentCompany) {
        setRequirementUploadHistory([])
        return
      }

      try {
        const result = await getCompanyDocuments(currentCompany.id)
        if (result.success && result.documents) {
          // Filter documents for this requirement
          const history = result.documents.filter((doc: any) =>
            doc.requirement_id === documentUploadModal.requirementId
          ).sort((a: any, b: any) => {
            const dateA = new Date(a.created_at || 0).getTime()
            const dateB = new Date(b.created_at || 0).getTime()
            return dateB - dateA // Newest first
          })
          setRequirementUploadHistory(history)
        }
      } catch (error) {
        console.error('Error fetching upload history:', error)
        setRequirementUploadHistory([])
      }
    }

    fetchUploadHistory()
  }, [documentUploadModal, currentCompany])

  // Generate preview URL for file
  useEffect(() => {
    if (uploadFile) {
      const url = URL.createObjectURL(uploadFile)
      setPreviewFileUrl(url)
      return () => {
        URL.revokeObjectURL(url)
      }
    } else {
      setPreviewFileUrl(null)
    }
  }, [uploadFile])

  // Convert database requirements to display format and apply filters
  const displayRequirements = (regulatoryRequirements || [])
    .filter(req => {
      // Filter out hidden compliances
      if (hiddenCompliances.has(req.id)) {
        return false
      }
      // Apply category filter
      if (selectedCategory !== 'all' && req.category !== selectedCategory) {
        return false
      }
      return true
    })
    .map(req => ({
    id: req.id,
    template_id: (req as any).template_id ?? null,
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
    required_documents: req.required_documents || [],
    possible_legal_action: req.possible_legal_action,
    penalty_config: req.penalty_config,
    penalty_base_amount: req.penalty_base_amount,
    filed_on: req.filed_on,
    filed_by: req.filed_by,
    status_reason: req.status_reason,
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

  // Show loading while fetching companies or checking access
  if (isLoading || anyAccessLoading || (authLoading && !user)) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/40 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  // If no companies and access check is complete, show redirect message (redirect happens via useEffect)
  if (companies.length === 0 && !isLoading && !anyAccessLoading && user) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/40 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Redirecting...</p>
        </div>
      </div>
    )
  }

  // Show loading while checking access
  if (currentCompany && accessLoading) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/40 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Checking access...</p>
        </div>
      </div>
    )
  }

  // If owner without access, show redirect message (redirect happens via useEffect)
  if (currentCompany && isOwner && !hasAccess && !accessLoading) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-white/40 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Redirecting to subscription...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      {/* Subtle Circuit Board Background */}
      <SubtleCircuitBackground />

      {/* Header */}
      <Header />

      {/* Trial Banner */}
      {accessType === 'trial' && trialDaysRemaining !== null && currentCompany && (
        <div className="relative z-20 bg-gradient-to-r from-white/10 to-gray-600/20 border-b border-white/20">
          <div className="container mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-gray-300">
                <span className="text-white font-semibold">{trialDaysRemaining} days</span> left in your trial
              </span>
            </div>
            <button
              onClick={() => router.push(`/subscribe?company_id=${currentCompany.id}`)}
              className="text-xs sm:text-sm bg-white text-black px-3 py-1 rounded-lg hover:bg-gray-700 transition-colors"
            >
              Upgrade Now
            </button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="relative z-10 container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Company Selector */}
        <div className="mb-4 sm:mb-6">
          <h2 className="text-gray-400 text-sm font-medium mb-2 sm:mb-3">My companies</h2>
          <CompanySelector
            companies={companies}
            currentCompany={currentCompany}
            onCompanyChange={handleCompanyChange}
          />
        </div>

        {/* Page Title */}
        <h1 className="text-2xl sm:text-4xl font-light text-white mb-4 sm:mb-6">Data Room</h1>

        {/* Horizontal Tabs - Scrollable on Mobile */}
        <div className="flex items-center gap-2 mb-4 sm:mb-8 overflow-x-auto pb-2 -mx-3 sm:mx-0 px-3 sm:px-0 scrollbar-hide">
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'overview'
                ? 'border-white/40 bg-white/10 text-white'
                : 'border-white/20 bg-black text-white hover:text-white hover:border-white/40'
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
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'tracker'
                ? 'border-white/40 bg-white/10 text-white'
                : 'border-white/20 bg-black text-white hover:text-white hover:border-white/40'
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
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'documents'
                ? 'border-white/40 bg-white/10 text-white'
                : 'border-white/20 bg-black text-white hover:text-white hover:border-white/40'
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
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'reports'
                ? 'border-white/40 bg-white/10 text-white'
                : 'border-white/20 bg-black text-white hover:text-white hover:border-white/40'
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
            onClick={() => setActiveTab('dsc-din')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'dsc-din'
                ? 'border-white/40 bg-white/10 text-white'
                : 'border-white/20 bg-black text-white hover:text-white hover:border-white/40'
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
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span className="text-sm sm:text-base">DSC & DIN</span>
          </button>
          <button
            onClick={() => setActiveTab('notices')}
            className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'notices'
                ? 'border-white/40 bg-white/10 text-white'
                : 'border-white/20 bg-black text-white hover:text-white hover:border-white/40'
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
          {/* GST Tab - Only show for India */}
          {countryCode === 'IN' && (
            <button
              onClick={() => setActiveTab('gst')}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 transition-colors whitespace-nowrap flex-shrink-0 ${activeTab === 'gst'
                  ? 'border-white/40 bg-white/10 text-white'
                  : 'border-white/20 bg-black text-white hover:text-white hover:border-white/40'
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
          )}
        </div>

        {/* Content based on active tab */}
        {activeTab === 'overview' && (
          <div>
            <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl shadow-2xl p-4 sm:p-8">
              {/* Card Header - Stack on Mobile */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-3 mb-4 sm:mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
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
                    onClick={() => router.push(`/manage-company?company_id=${currentCompany?.id || ''}`)}
                    className="w-full sm:w-auto px-3 sm:px-4 py-2 bg-white/10 border border-white/40 text-white rounded-lg hover:bg-white/20 transition-colors text-xs sm:text-sm flex items-center justify-center gap-2"
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
                  <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-white/40 border-t-transparent rounded-full animate-spin mb-4"></div>
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
                    <span className="inline-block bg-white text-black px-3 py-1 rounded-full text-xs sm:text-sm font-medium w-fit">
                      {entityDetails.type}
                    </span>
                  </div>

                  {/* Reg Date */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                    <label className="text-xs sm:text-sm text-gray-400 sm:w-32 sm:flex-shrink-0">Reg Date</label>
                    <div className="text-white text-base sm:text-lg font-medium">{entityDetails.regDate}</div>
                  </div>

                  {/* Tax ID (country-specific label) */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                    <label className="text-xs sm:text-sm text-gray-400 sm:w-32 sm:flex-shrink-0">{countryConfig.labels.taxId}</label>
                    <div className="text-white text-base sm:text-lg font-medium break-all">{entityDetails.taxId}</div>
                  </div>

                  {/* Registration ID (country-specific label) */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4">
                    <label className="text-xs sm:text-sm text-gray-400 sm:w-32 sm:flex-shrink-0">{countryConfig.labels.registrationId}</label>
                    <div className="text-white text-base sm:text-lg font-medium break-all">{entityDetails.registrationId}</div>
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
                        {entityDetails.directors && entityDetails.directors.length > 0 ? (
                        <select
                          value={selectedDirectorId || ''}
                            onChange={(e) => {
                              e.preventDefault()
                              setSelectedDirectorId(e.target.value || null)
                            }}
                          className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-black border border-white/20 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors appearance-none cursor-pointer"
                        >
                          <option value="">Select a director to view profile</option>
                          {entityDetails.directors.map((director) => (
                            <option key={director.id} value={director.id}>
                              {director.firstName} {director.middleName} {director.lastName} {director.din ? `(${countryConfig.labels.directorId || 'Director ID'}: ${director.din})` : ''}
                            </option>
                          ))}
                        </select>
                        ) : (
                          <div className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-black border border-white/20 rounded-lg text-gray-400 text-sm sm:text-base">
                            No directors found for this company
                          </div>
                        )}
                      </div>

                      {/* Director Profile */}
                      {selectedDirectorId && (() => {
                        const director = entityDetails.directors.find(d => d.id === selectedDirectorId)
                        if (!director) return null

                        return (
                          <div className={`p-4 sm:p-6 bg-black border rounded-lg ${director.verified
                              ? 'border-green-500/50 bg-green-500/5'
                              : 'border-white/10'
                            }`}>
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4 mb-4">
                              <div className="flex-1">
                                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
                                  <div className="w-10 h-10 sm:w-12 sm:h-12 bg-white/10 rounded-full flex items-center justify-center flex-shrink-0">
                                    <span className="text-white font-semibold text-base sm:text-lg">
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
                                    <div className="p-3 bg-black border border-white/10 rounded-lg">
                                      <div className="text-xs text-gray-500 mb-1">{countryConfig.labels.directorId || 'Director ID'}</div>
                                      <div className="text-white font-mono text-sm sm:text-base break-all">{director.din}</div>
                                    </div>
                                  )}
                                  {director.pan && (
                                    <div className="p-3 bg-black border border-white/10 rounded-lg">
                                      <div className="text-xs text-gray-500 mb-1">{countryConfig.labels.taxId}</div>
                                      <div className="text-white font-mono text-sm sm:text-base break-all">{director.pan}</div>
                                    </div>
                                  )}
                                  {director.dob && (
                                    <div className="p-3 bg-black border border-white/10 rounded-lg">
                                      <div className="text-xs text-gray-500 mb-1">Date of Birth</div>
                                      <div className="text-white text-sm sm:text-base">{formatDateForDisplay(director.dob)}</div>
                                    </div>
                                  )}
                                  {director.email && (
                                    <div className="p-3 bg-black border border-white/10 rounded-lg">
                                      <div className="text-xs text-gray-500 mb-1">Email Address</div>
                                      <div className="text-white text-sm sm:text-base break-all">{director.email}</div>
                                    </div>
                                  )}
                                  {director.mobile && (
                                    <div className="p-3 bg-black border border-white/10 rounded-lg">
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
          const totalCompliances = (displayRequirements || []).length
          const completed = (displayRequirements || []).filter(r => r.status === 'completed').length
          const pending = (displayRequirements || []).filter(r => r.status === 'pending').length
          const overdue = (displayRequirements || []).filter(r => {
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

          // Calculate penalty amount - use memoized version with base amount support
          const calculatePenalty = (penaltyStr: string | null, daysDelayed: number | null, penaltyBaseAmount?: number | null): string => {
            return calculatePenaltyMemoized(penaltyStr, daysDelayed, penaltyBaseAmount)
          }

          // Legacy calculatePenalty function kept for reference but replaced above
          const _calculatePenaltyLegacyDashboard = (penaltyStr: string | null, daysDelayed: number | null): string => {
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
                return formatCurrency(Math.round(dailyRate * daysDelayed), countryCode)
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
                return formatCurrency(Math.round(calculated), countryCode)
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
              const currencySymbol = countryConfig.currency.symbol
              const currencySymbolEscaped = currencySymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
              const lateFeePattern = new RegExp(`Late\\s*fee\\s*(?:Rs\\.?\\s*|${currencySymbolEscaped}\\s*)([\\d,]+)(?:\\s*(?:per\\s*day|\\/day))?`, 'i')
              const lateFeeMatch = penalty.match(lateFeePattern)
              if (lateFeeMatch) {
                const dailyRate = parseFloat(lateFeeMatch[1].replace(/,/g, ''))
                if (!isNaN(dailyRate) && dailyRate > 0) {
                  return `${formatCurrency(Math.round(dailyRate * daysDelayed), countryCode)} (late fee only)`
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
            // Use country-specific currency symbol
            const currencySymbol = countryConfig.currency.symbol
            const currencySymbolEscaped = currencySymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            const dailyMatch = penalty.match(new RegExp(`(?:Rs\\.?\\s*|${currencySymbolEscaped}\\s*)([\\d,]+)\\s*per\\s*day`, 'i'))
            if (dailyMatch) {
              const dailyRate = parseFloat(dailyMatch[1].replace(/,/g, ''))
              if (!isNaN(dailyRate) && dailyRate > 0) {
                let calculated = dailyRate * daysDelayed
                if (maxCap !== null && maxCap > 0) {
                  calculated = Math.min(calculated, maxCap)
                }
                return formatCurrency(Math.round(calculated), countryCode)
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
                return formatCurrency(Math.round(calculated), countryCode)
              }
            }

            // Try alternate formats - handle "50/day", "200/day", etc.
            // Use country-specific currency symbol
            const altMatch = penalty.match(new RegExp(`(?:Rs\\.?\\s*|${currencySymbolEscaped}\\s*)([\\d,]+)\\s*\\/\\s*day`, 'i')) ||
              penalty.match(new RegExp(`${currencySymbolEscaped}\\s*([\\d,]+)\\s*(?:per\\s*day|\\/day)`, 'i')) ||
              penalty.match(/(\d+)\s*per\s*day/i) ||
              // Handle "50/day" format (without currency symbol)
              penalty.match(/^(\d+)\/day/i) ||
              penalty.match(/(\d+)\/day/i)
            if (altMatch) {
              const dailyRate = parseFloat(altMatch[1].replace(/,/g, ''))
              if (!isNaN(dailyRate) && dailyRate > 0) {
                let calculated = dailyRate * daysDelayed
                if (maxCap !== null && maxCap > 0) {
                  calculated = Math.min(calculated, maxCap)
                }
                return formatCurrency(Math.round(calculated), countryCode)
              }
            }

            // Handle "200/day + 10000-100000" - extract daily rate before the +
            const dailyWithRangeMatch = penalty.match(/(\d+)\/day\s*\+\s*[\d-]+/i)
            if (dailyWithRangeMatch) {
              const dailyRate = parseFloat(dailyWithRangeMatch[1].replace(/,/g, ''))
              if (!isNaN(dailyRate) && dailyRate > 0) {
                return formatCurrency(Math.round(dailyRate * daysDelayed), countryCode)
              }
            }

            // Handle "2%/month + 5/day" - extract daily rate after the +
            const interestPlusDailyMatch = penalty.match(/[\d.]+%[^+]*\+\s*(\d+)\/day/i)
            if (interestPlusDailyMatch) {
              const dailyRate = parseFloat(interestPlusDailyMatch[1].replace(/,/g, ''))
              if (!isNaN(dailyRate) && dailyRate > 0) {
                return formatCurrency(Math.round(dailyRate * daysDelayed), countryCode)
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
                  return `${formatCurrency(Math.round(minAmount), countryCode)} (minimum)`
                }
              }
            }

            // Handle "Rs. 1 Lakh on Company + Rs. 5000 per day on officers" → extract officers penalty
            const officersMatch = penalty.match(new RegExp(`(?:Rs\\.?\\s*|${currencySymbolEscaped}\\s*)([\\d,]+)\\s*per\\s*day\\s*on\\s*officers`, 'i'))
            if (officersMatch) {
              const dailyRate = parseFloat(officersMatch[1].replace(/,/g, ''))
              if (!isNaN(dailyRate) && dailyRate > 0) {
                return formatCurrency(Math.round(dailyRate * daysDelayed), countryCode)
              }
            }

            // Handle Late fee patterns
            const lateFeeMatch = penalty.match(new RegExp(`Late\\s*fee\\s*(?:Rs\\.?\\s*|${currencySymbolEscaped}\\s*)([\\d,]+)`, 'i'))
            if (lateFeeMatch) {
              const dailyRate = parseFloat(lateFeeMatch[1].replace(/,/g, ''))
              if (!isNaN(dailyRate) && dailyRate > 0) {
                return formatCurrency(Math.round(dailyRate * daysDelayed), countryCode)
              }
            }

            // Check for fixed penalty amounts
            const fixedKeywords = /(?:fixed|one-time|one time|flat|lump)/i
            if (fixedKeywords.test(penalty)) {
              const fixedMatch = penalty.match(new RegExp(`(?:Rs\\.?\\s*|${currencySymbolEscaped}\\s*)([\\d,]+)`, 'i'))
              if (fixedMatch) {
                const amount = parseFloat(fixedMatch[1].replace(/,/g, ''))
                if (!isNaN(amount) && amount > 0) {
                  return formatCurrency(Math.round(amount), countryCode)
                }
              }
            }

            // Plain number as daily rate (fallback)
            const plainNumberMatch = penalty.match(/^[\d,]+(?:\.\d+)?$/)
            if (plainNumberMatch) {
              const amount = parseFloat(plainNumberMatch[0].replace(/,/g, ''))
              if (!isNaN(amount) && amount > 0) {
                return formatCurrency(Math.round(amount * daysDelayed), countryCode)
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
            const currencySymbol = countryConfig.currency.symbol
            const currencySymbolEscaped = currencySymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
            displayRequirements.forEach(req => {
              const delay = calculateDelayMemoized(req.dueDate, req.status)
              if (delay !== null && delay > 0 && req.penalty) {
                const penaltyStr = calculatePenaltyMemoized(req.penalty, delay, req.penalty_base_amount)
                if (penaltyStr !== '-' && !penaltyStr.includes('Cannot calculate')) {
                  // Remove currency symbol and commas, then parse
                  const cleaned = penaltyStr.replace(new RegExp(currencySymbolEscaped, 'g'), '').replace(/,/g, '').replace(/[^\d.-]/g, '')
                  const amount = parseFloat(cleaned)
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
            const delay = calculateDelayMemoized(req.dueDate, req.status)
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
              'Description': req.description || '',
              'Status': req.status.toUpperCase(),
              'Due Date': req.dueDate,
              'Financial Year': req.financial_year || 'Not Specified',
              'Penalty': req.penalty || '-',
              'Is Critical': req.isCritical ? 'Yes' : 'No',
              'Compliance Type': req.compliance_type || 'one-time',
              'Filed On': (req as any).filed_on ? new Date((req as any).filed_on).toLocaleDateString('en-GB') : '-',
              'Filed By': (req as any).filed_by_name || ((req as any).filed_by ? 'User' : '-'),
              'Status Reason': (req as any).status_reason || '-',
              'Documents': req.required_documents?.join(', ') || '-'
            }))
            exportToCSV(reportData, `compliance-report-${new Date().toISOString().split('T')[0]}.csv`)
          }

          const exportOverdueReport = () => {
            const reportData = overdueCompliances.map(req => {
              const delay = calculateDelay(req.dueDate, req.status)
              const penalty = calculatePenalty(req.penalty || '', delay, req.penalty_base_amount)
              return {
                'Category': req.category,
                'Requirement': req.requirement,
                'Description': req.description || '',
                'Due Date': req.dueDate,
                'Days Delayed': delay || 0,
                'Penalty': req.penalty || '-',
                'Calculated Penalty': penalty,
                'Financial Year': req.financial_year || 'Not Specified',
                'Is Critical': req.isCritical ? 'Yes' : 'No',
                'Compliance Type': req.compliance_type || 'one-time',
                'Status Reason': (req as any).status_reason || '-',
                'Documents': req.required_documents?.join(', ') || '-'
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

            // Group repeated compliances (e.g., same template across months) to keep report fast and avoid duplicate research
            const groupKeyFor = (req: any) => {
              if (req.template_id) return `template:${req.template_id}`
              return `text:${(req.category || '').toLowerCase()}|${(req.requirement || '').toLowerCase()}`
            }

            const nonCompliantGroups = new Map<
              string,
              { key: string; category: string; requirement: string; items: any[]; representative: any }
            >()

            nonCompliantItems.forEach((item: any) => {
              const key = groupKeyFor(item)
              const existing = nonCompliantGroups.get(key)
              if (existing) {
                existing.items.push(item)
              } else {
                nonCompliantGroups.set(key, {
                  key,
                  category: item.category,
                  requirement: item.requirement,
                  items: [item],
                  representative: item,
                })
              }
            })

            // Convert to RegulatoryRequirement format for enrichment (ONE per unique compliance type)
            const nonCompliantRequirements: RegulatoryRequirement[] = Array.from(nonCompliantGroups.values()).map(group => {
              const req = group.representative
              return {
                id: req.id,
                template_id: req.template_id ?? null,
                company_id: currentCompany?.id || '',
                category: req.category,
                requirement: req.requirement,
                description: null,
                status: req.status as 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed',
                due_date: req.dueDate,
                penalty: req.penalty || null,
                penalty_config: null,
                penalty_base_amount: null,
                is_critical: req.isCritical || false,
                financial_year: req.financial_year || null,
                compliance_type: req.compliance_type || null,
                filed_on: null,
                filed_by: null,
                status_reason: null,
                required_documents: [],
                possible_legal_action: null,
                created_at: '',
                updated_at: '',
                created_by: null,
                updated_by: null
              }
            })

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
            const primaryColor = [30, 58, 95] // Navy (McKinsey/EY style)
            const darkGray = [44, 44, 44]
            const lightGray = [210, 210, 210]
            const textGray = [90, 90, 90]
            const redColor = [198, 40, 40] // Muted red for highlights only
            const accentBlue = [112, 160, 220] // Light accent for cover accents (subtle)

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

            // Cover page (modern, minimalist — keep content, refresh layout)
            const coverDate = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
            const companyName = currentCompany?.name || 'Company'

            // White background
            doc.setFillColor(255, 255, 255)
            doc.rect(0, 0, pageWidth, pageHeight, 'F')

            // Diagonal accents (top-left + bottom-right) inspired by modern report covers
            // Use thick diagonal lines to avoid relying on polygon APIs.
            doc.setLineCap(2)

            // Top-left main band
            doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2])
            doc.setLineWidth(34)
            doc.line(-40, 40, pageWidth * 0.58, -60)

            // Top-left accent strokes
            doc.setDrawColor(210, 230, 255)
            doc.setLineWidth(10)
            doc.line(-38, 55, pageWidth * 0.56, -45)
            doc.setDrawColor(accentBlue[0], accentBlue[1], accentBlue[2])
            doc.setLineWidth(6)
            doc.line(-35, 68, pageWidth * 0.54, -32)

            // Bottom-right band
            doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2])
            doc.setLineWidth(42)
            doc.line(pageWidth * 0.52, pageHeight + 70, pageWidth + 60, pageHeight * 0.62)

            // Bottom-right accent strokes
            doc.setDrawColor(210, 230, 255)
            doc.setLineWidth(12)
            doc.line(pageWidth * 0.56, pageHeight + 62, pageWidth + 52, pageHeight * 0.66)
            doc.setDrawColor(accentBlue[0], accentBlue[1], accentBlue[2])
            doc.setLineWidth(7)
            doc.line(pageWidth * 0.60, pageHeight + 50, pageWidth + 44, pageHeight * 0.70)

            // Content block
            doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(12)
            doc.text('COMPLIANCE REPORT', margin, 45, { maxWidth: contentWidth })

            // Company name (large, wrapped)
            doc.setFont('helvetica', 'bold')
            doc.setFontSize(40)
            const companyLines = splitText(companyName.toUpperCase(), contentWidth, 40)
            let coverY = 85
            companyLines.slice(0, 3).forEach((line, idx) => {
              doc.text(line, margin, coverY + idx * 18, { maxWidth: contentWidth })
            })

            // Byline
            coverY += Math.min(companyLines.length, 3) * 18 + 10
            doc.setFont('helvetica', 'italic')
            doc.setFontSize(14)
            doc.text('BY FINACRA AI', margin, coverY, { maxWidth: contentWidth })

            // Footer details (bottom-left)
            const footerBlockY = pageHeight - 70
            doc.setFont('helvetica', 'normal')
            doc.setFontSize(10)
            doc.setTextColor(textGray[0], textGray[1], textGray[2])
            doc.text('PREPARED FOR MANAGEMENT REVIEW', margin, footerBlockY, { maxWidth: contentWidth })
            doc.setFontSize(9)
            doc.text(`Date: ${coverDate}`, margin, footerBlockY + 10, { maxWidth: contentWidth })
            doc.text(`Scope: Overdue & pending (past due) compliances for the selected company.`, margin, footerBlockY + 20, { maxWidth: contentWidth })
            doc.text('Confidential — for internal use only.', margin, footerBlockY + 32, { maxWidth: contentWidth })
            doc.text(`Generated: ${coverDate}`, margin, footerBlockY + 44, { maxWidth: contentWidth })

            // Page break to main content
            doc.addPage()
            yPos = margin

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

                // Compliance type labels: one-time (no recurring), annual (recurs annually)
                const typeLabels: Record<string, string> = {
                  'one-time': 'One-time (No Recurring)',
                  'annual': 'Annual (Recurring)',
                  'monthly': 'Monthly (Recurring)',
                  'quarterly': 'Quarterly (Recurring)'
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
              doc.setFillColor(redColor[0], redColor[1], redColor[2]) // Muted red for overdue
              doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
              doc.setTextColor(255, 255, 255)
              doc.setFontSize(14)
              doc.setFont('helvetica', 'bold')
              doc.text(`Overdue Compliances (Top 10 shown)`, margin + 3, yPos + 6)
              yPos += 15

              doc.setTextColor(0, 0, 0)
              doc.setFontSize(9)
              doc.setFont('helvetica', 'normal')

              // To keep report generation fast, show only top 10 individual overdue items
              overdueCompliances.slice(0, 10).forEach((req, index) => {
                checkNewPage(30)
                const delay = calculateDelayMemoized(req.dueDate, req.status)
                let penalty = calculatePenalty(req.penalty || '', delay, req.penalty_base_amount)
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
              // Enrichment is computed once per unique compliance type (group representative only)
              enrichedData.forEach((enriched, index) => {
                const group = Array.from(nonCompliantGroups.values()).find(g => g.representative.id === enriched.requirementId)
                const req = group?.representative
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
              const penaltyText = formatCurrency(totalPenalty, countryCode)
              doc.text(penaltyText, margin, yPos, { maxWidth: contentWidth })
            }

            // Last page: QR + CTA (brand)
            doc.addPage()
            // White background
            doc.setFillColor(255, 255, 255)
            doc.rect(0, 0, pageWidth, pageHeight, 'F')

            // Subtle diagonal accents (match cover)
            doc.setLineCap(2)
            doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2])
            doc.setLineWidth(34)
            doc.line(pageWidth * 0.55, pageHeight + 70, pageWidth + 60, pageHeight * 0.62)
            doc.setDrawColor(210, 230, 255)
            doc.setLineWidth(10)
            doc.line(pageWidth * 0.58, pageHeight + 62, pageWidth + 52, pageHeight * 0.66)

            // QR code
            try {
              const QRCode: any = await import('qrcode')
              const qrUrl = 'https://www.finacra.com'
              const qrDataUrl: string = await QRCode.toDataURL(qrUrl, {
                margin: 1,
                width: 260,
                color: {
                  dark: '#1E3A5F',
                  light: '#FFFFFF',
                },
              })

              const qrSize = 80
              const qrX = (pageWidth - qrSize) / 2
              const qrY = pageHeight / 2 - 55
              doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize)

              doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
              doc.setFont('helvetica', 'bold')
              doc.setFontSize(18)
              doc.text('Try free trial now!', pageWidth / 2, qrY + qrSize + 18, { align: 'center' })

              doc.setFont('helvetica', 'normal')
              doc.setFontSize(10)
              doc.setTextColor(textGray[0], textGray[1], textGray[2])
              doc.text('Scan to visit', pageWidth / 2, qrY + qrSize + 32, { align: 'center' })
              doc.text('www.finacra.com', pageWidth / 2, qrY + qrSize + 44, { align: 'center' })
            } catch (qrErr) {
              // Fallback if QR generation fails: show the URL + CTA text
              doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
              doc.setFont('helvetica', 'bold')
              doc.setFontSize(18)
              doc.text('Try free trial now!', pageWidth / 2, pageHeight / 2, { align: 'center' })
              doc.setFont('helvetica', 'normal')
              doc.setFontSize(10)
              doc.setTextColor(textGray[0], textGray[1], textGray[2])
              doc.text('www.finacra.com', pageWidth / 2, pageHeight / 2 + 14, { align: 'center' })
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

            // Track report download
            if (user?.id && currentCompany?.id) {
              await trackReportDownload(user.id, currentCompany.id, 'compliance_pdf').catch(err => {
                console.error('Failed to track report download:', err)
              })
            }

            setIsGeneratingEnhancedPDF(false)
            setPdfGenerationProgress({ current: 0, total: 0, step: '' })
          }

          return (
            <div className="space-y-4 sm:space-y-6">
              {/* Header */}
              <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3 sm:mb-4">
                  <h2 className="text-xl sm:text-2xl font-light text-white">Compliance Reports</h2>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                    <button
                      onClick={exportPDFReport}
                      disabled={isGeneratingEnhancedPDF}
                      className="px-3 sm:px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 font-medium text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
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
                      className="px-3 sm:px-4 py-2 bg-white/10 border border-white/40 text-white rounded-lg hover:bg-white/20 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
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
                    <div className="mt-4 p-4 bg-white/5 border border-white/40/30 rounded-lg">
                      <div className="flex items-center gap-3">
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
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
                <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
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
                <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
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
                <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
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
                <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
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
                <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
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
                <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                  <div className="flex items-center justify-between mb-3 sm:mb-4">
                    <h3 className="text-base sm:text-lg font-medium text-gray-300">Compliance Score</h3>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsComplianceScoreModalOpen(true)}
                        className="text-gray-400 hover:text-white transition-colors"
                        title="Learn more about compliance score"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="12" y1="16" x2="12" y2="12" />
                          <line x1="12" y1="8" x2="12.01" y2="8" />
                        </svg>
                      </button>
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                        <svg width="20" height="20" className="sm:w-6 sm:h-6 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 2L2 7l10 5 10-5-10-5z" />
                          <path d="M2 17l10 5 10-5" />
                          <path d="M2 12l10 5 10-5" />
                        </svg>
                      </div>
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
                <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
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
                    {totalPenalty > 0 ? formatCurrency(totalPenalty, countryCode) : formatCurrency(0, countryCode)}
                  </div>
                  <p className="text-xs sm:text-sm text-gray-400">Accumulated penalties</p>
                </div>
              </div>

              {/* Status Breakdown Chart */}
              <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
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
              <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
                <h3 className="text-lg sm:text-xl font-light text-white mb-4 sm:mb-6">Category Breakdown</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {Object.entries(categoryBreakdown)
                    .sort(([, a], [, b]) => b - a)
                    .map(([category, count]) => {
                      const percentage = totalCompliances > 0 ? (count / totalCompliances) * 100 : 0
                      return (
                        <div key={category} className="border border-white/10 rounded-lg p-3 sm:p-4">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-white font-medium text-sm sm:text-base break-words">{category}</span>
                            <span className="text-white font-semibold text-sm sm:text-base flex-shrink-0 ml-2">{count}</span>
                          </div>
                          <div className="w-full bg-gray-800 rounded-full h-1 sm:h-1.5">
                            <div
                              className="bg-white h-1 sm:h-1.5 rounded-full transition-all duration-300"
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
              <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
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
                      // Color coding: one-time (purple), annual (green), monthly (blue), quarterly (cyan)
                      const typeColors: Record<string, { bg: string; text: string; border: string; bar: string }> = {
                        'one-time': { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', bar: 'bg-purple-400' },
                        'annual': { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', bar: 'bg-green-400' },
                        'monthly': { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', bar: 'bg-blue-400' },
                        'quarterly': { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', bar: 'bg-cyan-400' }
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
                          <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-white/10">
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
                <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
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
                        <div key={fy} className="border border-white/10 rounded-lg p-3 sm:p-4 text-center">
                          <div className="text-xl sm:text-2xl font-light text-white mb-1">{count}</div>
                          <div className="text-xs sm:text-sm text-gray-400 break-words">{fy}</div>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Overdue Compliances Detail */}
              {overdueCompliances.length > 0 && (
                <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
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
                        const delay = calculateDelayMemoized(req.dueDate, req.status)
                        const penalty = calculatePenalty(req.penalty || '', delay, req.penalty_base_amount)
                        return (
                          <div key={req.id} className="bg-black border border-white/10 rounded-lg p-3 space-y-2">
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
                        <tr className="border-b border-white/10">
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
                          const penalty = calculatePenalty(req.penalty || '', delay, req.penalty_base_amount)
                          return (
                            <tr key={req.id} className="border-b border-white/10 hover:bg-black/50">
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
                  className="px-4 py-2 bg-black border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-white/40"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="responded">Responded</option>
                  <option value="resolved">Resolved</option>
                </select>
                {/* Type Filter - Country-aware */}
                <select
                  value={noticesTypeFilter}
                  onChange={(e) => setNoticesTypeFilter(e.target.value)}
                  className="px-4 py-2 bg-black border border-white/20 rounded-lg text-white text-sm focus:outline-none focus:border-white/40"
                >
                  <option value="all">All Types</option>
                  {complianceCategories.map((category) => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
                <button
                  onClick={() => setIsAddNoticeModalOpen(true)}
                  className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm"
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
              <div className="bg-black border border-white/10 rounded-xl p-4">
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
              <div className="bg-black border border-white/10 rounded-xl p-4">
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
              <div className="bg-black border border-white/10 rounded-xl p-4">
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
              <div className="bg-black border border-white/10 rounded-xl p-4">
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
                    className={`bg-black border rounded-xl p-4 cursor-pointer transition-all hover:border-white/40/50 ${selectedNotice?.id === notice.id ? 'border-white/40' : 'border-white/10'
                      }`}
                  >
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${notice.type === 'Income Tax' ? 'bg-blue-500/20 text-blue-400' :
                            notice.type === 'GST' ? 'bg-green-500/20 text-green-400' :
                              notice.type === 'MCA/RoC' ? 'bg-purple-500/20 text-purple-400' :
                                'bg-gray-500/20 text-white'
                          }`}>
                          {notice.type}
                        </span>
                        {notice.priority === 'critical' && (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">Critical</span>
                        )}
                      </div>
                      <span className={`px-2 py-0.5 rounded text-xs ${notice.status === 'pending' ? 'bg-red-500/20 text-red-400' :
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
                {selectedNotice ? (() => {
                  // Detect notice type metadata
                  const noticeMetadata = detectNoticeType(selectedNotice.subject || selectedNotice.id || selectedNotice.subType || '')
                  const authority = getAuthorityForCategory(selectedNotice.type || '')

                  return (
                    <div className="bg-black border border-white/10 rounded-2xl overflow-hidden">
                      {/* Detail Header */}
                      <div className="bg-black p-6 border-b border-white/10">
                        <div className="flex items-start justify-between gap-4 mb-4">
                          <div className="flex items-center gap-3">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedNotice.type === 'Income Tax' ? 'bg-blue-500/20' :
                                selectedNotice.type === 'GST' ? 'bg-green-500/20' :
                                  selectedNotice.type === 'MCA/RoC' ? 'bg-purple-500/20' :
                                    'bg-gray-500/20'
                              }`}>
                              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={
                                selectedNotice.type === 'Income Tax' ? '#3B82F6' :
                                  selectedNotice.type === 'GST' ? '#22C55E' :
                                    selectedNotice.type === 'MCA/RoC' ? '#A855F7' :
                                      '#9CA3AF'
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
                          <span className={`px-3 py-1 rounded-lg text-sm font-medium ${selectedNotice.status === 'pending' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                              selectedNotice.status === 'responded' ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
                                'bg-green-500/20 text-green-400 border border-green-500/30'
                            }`}>
                            {selectedNotice.status.charAt(0).toUpperCase() + selectedNotice.status.slice(1)}
                          </span>
                        </div>

                        {/* Notice Metadata Badges */}
                        {noticeMetadata && (
                          <div className="flex flex-wrap items-center gap-2 mb-3">
                            <span className="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">
                              {noticeMetadata.type}
                            </span>
                            {noticeMetadata.priority && (
                              <span className={`px-2 py-1 rounded text-xs font-medium ${noticeMetadata.priority === 'high' ? 'bg-red-500/20 text-red-400' :
                                  noticeMetadata.priority === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                    'bg-gray-500/20 text-gray-400'
                                }`}>
                                {noticeMetadata.priority.toUpperCase()} Priority
                              </span>
                            )}
                            {noticeMetadata.formCode && (
                              <span className="px-2 py-1 bg-purple-500/20 text-purple-400 rounded text-xs font-medium">
                                {noticeMetadata.formCode}
                              </span>
                            )}
                          </div>
                        )}

                        <h2 className="text-white text-xl mb-2">{selectedNotice.subject}</h2>
                        <div className="flex flex-wrap items-center gap-4 text-sm">
                          {noticeMetadata?.section ? (
                            <span className="text-gray-400">
                              <span className="text-gray-500">Legal Section:</span> <span className="text-white">{noticeMetadata.section}</span>
                            </span>
                          ) : selectedNotice.section ? (
                            <span className="text-gray-400">
                              <span className="text-gray-500">Section:</span> {selectedNotice.section}
                            </span>
                          ) : null}
                          {authority && (
                            <span className="text-gray-400">
                              <span className="text-gray-500">Authority:</span> <span className="text-white">{authority}</span>
                            </span>
                          )}
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
                        {/* Notice Type Description */}
                        {noticeMetadata?.description && (
                          <div>
                            <h4 className="text-gray-400 text-sm font-medium mb-2">Notice Type Information</h4>
                            <p className="text-white text-sm leading-relaxed bg-blue-500/10 border border-blue-500/20 p-4 rounded-lg">
                              {noticeMetadata.description}
                            </p>
                          </div>
                        )}

                        {/* Description */}
                        <div>
                          <h4 className="text-gray-400 text-sm font-medium mb-2">Notice Description</h4>
                          <p className="text-white text-sm leading-relaxed bg-black border border-white/10 p-4 rounded-lg">
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
                                  <div className={`w-3 h-3 rounded-full ${idx === 0 ? 'bg-white' : 'bg-gray-600'}`}></div>
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
                          <div className="border-t border-white/10 pt-6">
                            <h4 className="text-gray-400 text-sm font-medium mb-3">Submit Response</h4>
                            <textarea
                              value={noticeResponse}
                              onChange={(e) => setNoticeResponse(e.target.value)}
                              placeholder="Enter your response or remarks..."
                              rows={4}
                              className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors resize-none"
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
                                className="px-6 py-2 bg-white text-black rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                          <div className="border-t border-white/10 pt-6 flex items-center gap-3">
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
                  )
                })() : (
                  <div className="bg-black border border-white/10 rounded-2xl h-full flex flex-col items-center justify-center py-20">
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
            <div className="bg-black border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              {/* Modal Header */}
              <div className="sticky top-0 bg-black border-b border-white/10 p-6 flex items-center justify-between z-10">
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
                      className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                    >
                      {/* Country-aware notice types based on compliance categories */}
                      {countryConfig?.compliance?.defaultCategories?.map(category => (
                        <option key={category} value={category}>{category}</option>
                      )) || (
                          <>
                            <option value="Income Tax">Income Tax</option>
                            <option value="GST">GST</option>
                            <option value="MCA/RoC">MCA/RoC</option>
                            <option value="Labour Law">Labour Law</option>
                            <option value="Other">Other</option>
                          </>
                        )}
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
                      className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
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
                      className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Priority
                    </label>
                    <select
                      value={newNoticeForm.priority}
                      onChange={(e) => setNewNoticeForm({ ...newNoticeForm, priority: e.target.value })}
                      className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
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
                    className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
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
                      className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
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
                        className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors cursor-pointer pr-10"
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
                        className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors cursor-pointer pr-10"
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
                    className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors resize-none"
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
                        className="flex-1 px-4 py-2 bg-black border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
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
                        className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-2"
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
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
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
                    className="px-6 py-2.5 bg-white text-black rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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

        {/* Compliance Details Modal */}
        {complianceDetailsModal && (() => {
          const req = complianceDetailsModal
          const formFreq = getFormFrequency(req.requirement)
          const legalSections = getRelevantLegalSections(req.requirement, req.category)
          const authority = getAuthorityForCategory(req.category)

          // Get all relevant forms for this category (country-aware)
          const categoryForms = countryConfig?.regulatory?.commonForms?.filter(form => {
            const formLower = form.toLowerCase()
            const categoryLower = req.category.toLowerCase()

            if (countryCode === 'IN') {
              // India-specific patterns
              if (categoryLower === 'gst' && (formLower.includes('gstr') || formLower.includes('gst') || formLower.includes('cmp') || formLower.includes('itc') || formLower.includes('iff'))) return true
              if (categoryLower === 'income tax' && (formLower.includes('itr') || formLower.includes('form 24') || formLower.includes('form 26') || formLower.includes('form 27'))) return true
              if ((categoryLower === 'roc' || categoryLower === 'mca') && (formLower.includes('mgt') || formLower.includes('aoc') || formLower.includes('dir') || formLower.includes('pas') || formLower.includes('ben') || formLower.includes('inc') || formLower.includes('adt') || formLower.includes('cra') || formLower.includes('llp'))) return true
              if ((categoryLower === 'payroll' || categoryLower === 'labour law') && (formLower.includes('ecr') || formLower.includes('form 5a') || formLower.includes('form 2') || formLower.includes('form 10') || formLower.includes('form 19'))) return true
            } else if (['AE', 'SA', 'OM', 'QA', 'BH'].includes(countryCode || '')) {
              // GCC countries
              if ((categoryLower === 'vat' || categoryLower === 'tax') && (formLower.includes('vat') || formLower.includes('tax return') || formLower.includes('corporate tax') || formLower.includes('zakat'))) return true
              if (categoryLower === 'corporate' && (formLower.includes('trade license') || formLower.includes('commercial registration') || formLower.includes('cr'))) return true
            } else if (countryCode === 'US') {
              // USA
              if ((categoryLower === 'federal tax' || categoryLower === 'state tax') && (formLower.includes('tax') || formLower.includes('return') || formLower.includes('ein'))) return true
              if (categoryLower === 'business license' && (formLower.includes('license') || formLower.includes('registration') || formLower.includes('report'))) return true
            }

            return false
          }) || []

          const formFrequency = countryConfig?.regulatory?.formFrequencies

          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
              <div className="bg-black border border-white/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
                {/* Modal Header */}
                <div className="sticky top-0 bg-black border-b border-white/10 p-6 flex items-center justify-between z-10">
                  <div>
                    <h2 className="text-2xl font-light text-white mb-1">Compliance Details</h2>
                    <p className="text-gray-400 text-sm">{req.requirement}</p>
                  </div>
                  <button
                    onClick={() => setComplianceDetailsModal(null)}
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
                  {/* Basic Information */}
                  <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                    <h3 className="text-white font-medium mb-3">Basic Information</h3>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start justify-between">
                        <span className="text-gray-400">Category:</span>
                        <span className="text-white font-medium">{req.category}</span>
                      </div>
                      {req.description && (
                        <div className="flex items-start justify-between">
                          <span className="text-gray-400">Description:</span>
                          <span className="text-white text-right max-w-[70%]">{req.description}</span>
                        </div>
                      )}
                      <div className="flex items-start justify-between">
                        <span className="text-gray-400">Due Date:</span>
                        <span className="text-white">{(req as any).due_date || (req as any).dueDate}</span>
                      </div>
                      <div className="flex items-start justify-between">
                        <span className="text-gray-400">Status:</span>
                        <span className={`px-2 py-1 rounded text-xs font-medium ${req.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                            req.status === 'overdue' ? 'bg-red-500/20 text-red-400' :
                              req.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                                'bg-gray-500/20 text-gray-400'
                          }`}>
                          {req.status.toUpperCase()}
                        </span>
                      </div>
                      {formFreq && (
                        <div className="flex items-start justify-between">
                          <span className="text-gray-400">Filing Frequency:</span>
                          <span className={`px-2 py-1 rounded text-xs font-medium ${formFreq === 'monthly' ? 'bg-blue-500/20 text-blue-400' :
                              formFreq === 'quarterly' ? 'bg-purple-500/20 text-purple-400' :
                                formFreq === 'annual' ? 'bg-green-500/20 text-green-400' :
                                  'bg-gray-500/20 text-gray-400'
                            }`}>
                            {formFreq.toUpperCase()}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Regulatory Authority */}
                  {authority && (
                    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                      <h3 className="text-white font-medium mb-3">Regulatory Authority</h3>
                      <p className="text-gray-300 text-sm">{authority}</p>
                    </div>
                  )}

                  {/* Legal Sections */}
                  {legalSections.length > 0 && (
                    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                      <h3 className="text-white font-medium mb-3">Legal References</h3>
                      <div className="space-y-3">
                        {legalSections.map((section, idx) => (
                          <div key={idx} className="border-l-2 border-blue-500/50 pl-3">
                            <div className="text-white font-medium text-sm">
                              {section.act} - {section.section}
                            </div>
                            <div className="text-gray-400 text-xs mt-1">{section.description}</div>
                            {section.relevance && (
                              <div className="text-gray-500 text-xs mt-1 italic">Relevance: {section.relevance}</div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Relevant Forms */}
                  {categoryForms.length > 0 && (
                    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                      <h3 className="text-white font-medium mb-3">Relevant Forms</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {categoryForms.map((form) => (
                          <div key={form} className="flex items-center justify-between p-2 bg-gray-800 rounded border border-gray-700">
                            <span className="text-white text-sm">{form}</span>
                            {formFrequency?.[form] && (
                              <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${formFrequency[form] === 'monthly' ? 'bg-blue-500/20 text-blue-400' :
                                  formFrequency[form] === 'quarterly' ? 'bg-purple-500/20 text-purple-400' :
                                    formFrequency[form] === 'annual' ? 'bg-green-500/20 text-green-400' :
                                      'bg-gray-500/20 text-gray-400'
                                }`}>
                                {formFrequency[form].toUpperCase()}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Penalty Information */}
                  {req.penalty && (
                    <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                      <h3 className="text-white font-medium mb-3">Penalty Information</h3>
                      <p className="text-gray-300 text-sm">{req.penalty}</p>
                      {(() => {
                        const dueDateStr = req.due_date || (req as any).dueDate || ''
                        const daysDelayed = calculateDelayMemoized(dueDateStr, req.status)
                        const calculatedPenalty = calculatePenaltyMemoized(req.penalty || '', daysDelayed || 0, req.penalty_base_amount || null)
                        if (calculatedPenalty !== '-' && !calculatedPenalty.includes('Cannot calculate')) {
                          return (
                            <div className="mt-2 pt-2 border-t border-gray-700">
                              <div className="flex items-center justify-between">
                                <span className="text-gray-400 text-sm">Calculated Penalty:</span>
                                <span className="text-red-400 font-semibold">{calculatedPenalty}</span>
                              </div>
                            </div>
                          )
                        }
                        return null
                      })()}
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="sticky bottom-0 bg-black border-t border-white/10 p-6 flex items-center justify-end">
                  <button
                    onClick={() => setComplianceDetailsModal(null)}
                    className="px-6 py-2.5 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

        {activeTab === 'gst' && countryCode === 'IN' && (
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
                      <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-black text-sm font-bold">1</div>
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
                        className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors font-mono tracking-wider"
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
                        className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
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
                      By connecting, you agree to share your GST data securely with Finacra
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
                      <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-black text-sm font-bold">2</div>
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
                        className="w-full px-4 py-4 bg-gray-900 border border-gray-700 rounded-lg text-white text-center text-2xl font-mono tracking-[0.5em] placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                      />
                      <p className="mt-2 text-center text-xs text-gray-500">
                        OTP expires in <span className="text-white">5:00</span> minutes
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

                    <button className="w-full text-center text-sm text-white hover:text-white/80 transition-colors">
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
                        className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-white/40"
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
                      className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${gstActiveSection === tab.id
                          ? 'bg-white text-black'
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
                        <div className="w-10 h-10 bg-gray-500/20 rounded-lg flex items-center justify-center">
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
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

                      <div className="bg-white/5 border border-white/40/30 rounded-xl p-6">
                        <h4 className="text-gray-400 text-sm mb-4">Tax Paid</h4>
                        <p className="text-3xl font-light text-white mb-2">₹{gstData.gstr3b.taxPaid.toLocaleString('en-IN')}</p>
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
                    className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-md transition-colors flex items-center gap-1 sm:gap-2 text-xs sm:text-sm ${trackerView === 'list'
                        ? 'bg-white text-black'
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
                    className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-md transition-colors flex items-center gap-1 sm:gap-2 text-xs sm:text-sm ${trackerView === 'calendar'
                        ? 'bg-white text-black'
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
                        penalty_base_amount: null,
                        is_critical: false,
                        financial_year: selectedTrackerFY || '',
                        status: 'not_started',
                        compliance_type: 'one-time',
                        year: new Date().getFullYear().toString()
                      })
                      setIsCreateModalOpen(true)
                    }}
                    className="bg-white text-black px-3 sm:px-6 py-2 sm:py-3 rounded-lg hover:bg-gray-700 transition-colors flex items-center gap-1.5 sm:gap-2 font-medium text-xs sm:text-base"
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
                <button
                  onClick={async () => {
                    if (user?.id && currentCompany?.id) {
                      // Generate calendar file (ICS format)
                      const icsContent = generateICSFile(regulatoryRequirements)
                      const blob = new Blob([icsContent], { type: 'text/calendar' })
                      const url = URL.createObjectURL(blob)
                      const link = document.createElement('a')
                      link.href = url
                      link.download = `${currentCompany.name}-compliance-calendar.ics`
                      document.body.appendChild(link)
                      link.click()
                      document.body.removeChild(link)
                      URL.revokeObjectURL(url)

                      // Track calendar sync
                      await trackCalendarSync(user.id, currentCompany.id).catch(err => {
                        console.error('Failed to track calendar sync:', err)
                      })
                    }
                  }}
                  className="bg-primary-dark-card border border-gray-700 text-white px-3 sm:px-6 py-2 sm:py-3 rounded-lg hover:border-white/40/50 transition-colors flex items-center gap-1.5 sm:gap-2 font-medium text-xs sm:text-base"
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

            {/* Country Indicator */}
            {currentCompany && (
              <div className="mb-3 flex items-center gap-2 text-sm text-gray-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Country: <span className="text-white font-medium">{countryConfig.name}</span></span>
                <span className="text-gray-600">•</span>
                <span className="text-xs">Categories and templates are country-specific</span>
              </div>
            )}

            {/* Super Filters - Stack on Mobile */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
              {/* Financial Year Dropdown with Context */}
              <div className="relative flex-1 sm:flex-initial">
                <div className="relative">
                  <select
                    value={selectedTrackerFY}
                    onChange={(e) => {
                      const newFY = e.target.value
                      setSelectedTrackerFY(newFY)
                      // Clear month/quarter when FY changes to avoid confusion
                      if (newFY) {
                        setSelectedMonth(null)
                        setSelectedQuarter(null)
                      }
                    }}
                    className={`w-full sm:w-auto px-3 sm:px-4 py-2 rounded-lg border-2 transition-colors text-sm sm:text-base focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 appearance-none cursor-pointer bg-gray-900 ${selectedTrackerFY
                        ? 'border-white/40 bg-white/10 text-white'
                        : 'border-gray-700 text-white hover:border-gray-600'
                      }`}
                    title={selectedTrackerFY ? `Includes months: ${getFinancialYearMonths(countryCode, selectedTrackerFY).join(', ')}` : 'Select financial year'}
                  >
                    <option value="" className="bg-gray-900 text-white">All Years</option>
                    {financialYears.map((fy) => (
                      <option key={fy} value={fy} className="bg-gray-900 text-white">
                        {fy}
                      </option>
                    ))}
                  </select>
                  {selectedTrackerFY && (
                    <div className="absolute top-full left-0 mt-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 z-10 whitespace-nowrap shadow-lg">
                      Months: {getFinancialYearMonths(countryCode, selectedTrackerFY).slice(0, 4).join(', ')}...
                    </div>
                  )}
                </div>
              </div>

              {/* Monthly Dropdown */}
              <div className="relative flex-1 sm:flex-initial">
                <button
                  onClick={() => {
                    setIsMonthDropdownOpen(!isMonthDropdownOpen)
                    setIsQuarterDropdownOpen(false)
                  }}
                  className={`w-full sm:w-auto px-3 sm:px-4 py-2 rounded-lg border-2 transition-colors flex items-center justify-between sm:justify-start gap-2 text-sm sm:text-base ${selectedMonth
                      ? 'border-white/40 bg-white/10 text-white'
                      : 'border-gray-700 bg-primary-dark-card text-white hover:border-gray-600'
                    }`}
                >
                  <span>{selectedMonth || 'All Months'}</span>
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
                {isMonthDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsMonthDropdownOpen(false)}
                    />
                    <div className="absolute top-full left-0 mt-2 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-20 min-w-[200px] max-h-64 overflow-y-auto">
                      {/* All Months option */}
                      <button
                        onClick={() => {
                          setSelectedMonth(null)
                          setIsMonthDropdownOpen(false)
                        }}
                        className={`w-full px-4 py-2 text-left hover:bg-gray-800 transition-colors text-sm ${selectedMonth === null
                            ? 'bg-white/10 text-white font-medium'
                            : 'text-gray-200'
                          }`}
                      >
                        All Months
                      </button>
                      <div className="border-t border-gray-700" />
                      {months.map((month) => (
                        <button
                          key={month}
                          onClick={() => {
                            setSelectedMonth(month)
                            setIsMonthDropdownOpen(false)
                            setSelectedQuarter(null) // Clear quarter when month is selected
                          }}
                          className={`w-full px-4 py-2 text-left hover:bg-gray-800 transition-colors text-sm ${selectedMonth === month
                              ? 'bg-white/10 text-white font-medium'
                              : 'text-gray-200'
                            }`}
                        >
                          {month}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Quarters Dropdown */}
              <div className="relative flex-1 sm:flex-initial">
                <button
                  onClick={() => {
                    setIsQuarterDropdownOpen(!isQuarterDropdownOpen)
                    setIsMonthDropdownOpen(false)
                  }}
                  className={`w-full sm:w-auto px-3 sm:px-4 py-2 rounded-lg border-2 transition-colors flex items-center justify-between sm:justify-start gap-2 text-sm sm:text-base ${selectedQuarter
                      ? 'border-white/40 bg-white/10 text-white'
                      : 'border-gray-700 bg-primary-dark-card text-white hover:border-gray-600'
                    }`}
                >
                  <span>{selectedQuarter ? quarters.find(q => q.value === selectedQuarter)?.label.split(' - ')[0] : 'All Quarters'}</span>
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
                {isQuarterDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsQuarterDropdownOpen(false)}
                    />
                    <div className="absolute top-full left-0 mt-2 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-20 min-w-[200px]">
                      {/* All Quarters option */}
                      <button
                        onClick={() => {
                          setSelectedQuarter(null)
                          setIsQuarterDropdownOpen(false)
                        }}
                        className={`w-full px-4 py-2 text-left hover:bg-gray-800 transition-colors text-sm ${selectedQuarter === null
                            ? 'bg-white/10 text-white font-medium'
                            : 'text-gray-200'
                          }`}
                      >
                        All Quarters
                      </button>
                      <div className="border-t border-gray-700" />
                      {quarters.map((quarter) => (
                        <button
                          key={quarter.value}
                          onClick={() => {
                            setSelectedQuarter(quarter.value)
                            setIsQuarterDropdownOpen(false)
                            setSelectedMonth(null) // Clear month when quarter is selected
                          }}
                          className={`w-full px-4 py-2 text-left hover:bg-gray-800 transition-colors text-sm ${selectedQuarter === quarter.value
                              ? 'bg-white/10 text-white font-medium'
                              : 'text-gray-200'
                            }`}
                        >
                          {quarter.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Category Dropdown */}
              <div className="relative flex-1 sm:flex-initial">
                <button
                  onClick={() => {
                    setIsCategoryDropdownOpen(!isCategoryDropdownOpen)
                    setIsMonthDropdownOpen(false)
                    setIsQuarterDropdownOpen(false)
                  }}
                  className={`w-full sm:w-auto px-3 sm:px-4 py-2 rounded-lg border-2 transition-colors flex items-center justify-between sm:justify-start gap-2 text-sm sm:text-base ${selectedCategory !== 'all'
                      ? 'border-white/40 bg-white/10 text-white'
                      : 'border-gray-700 bg-primary-dark-card text-white hover:border-gray-600'
                    }`}
                >
                  <span>{selectedCategory === 'all' ? 'All Categories' : selectedCategory}</span>
                  <svg
                    width="14"
                    height="14"
                    className={`sm:w-4 sm:h-4 flex-shrink-0 transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`}
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
                {isCategoryDropdownOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setIsCategoryDropdownOpen(false)}
                    />
                    <div className="absolute top-full left-0 mt-2 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-20 min-w-[200px] max-h-64 overflow-y-auto">
                      {/* All Categories option */}
                      <button
                        onClick={() => {
                          setSelectedCategory('all')
                          setIsCategoryDropdownOpen(false)
                        }}
                        className={`w-full px-4 py-2 text-left hover:bg-gray-800 transition-colors text-sm ${selectedCategory === 'all'
                            ? 'bg-white/10 text-white font-medium'
                            : 'text-gray-200'
                          }`}
                      >
                        All Categories
                      </button>
                      <div className="border-t border-gray-700" />
                      {/* Get unique categories from requirements */}
                      {(() => {
                        const allCategories = Array.from(new Set((regulatoryRequirements || []).map(req => req.category).filter(Boolean)))
                        const preferredOrder = complianceCategories.length > 0 ? complianceCategories : ['Income Tax', 'GST', 'Payroll', 'RoC', 'Renewals', 'Prof.Tax', 'Other', 'Others']
                        const categoryOrder = [
                          ...preferredOrder.filter(cat => allCategories.includes(cat)),
                          ...allCategories.filter(cat => !preferredOrder.includes(cat) && cat).sort()
                        ]
                        return categoryOrder.map((category) => (
                          <button
                            key={category}
                            onClick={() => {
                              setSelectedCategory(category)
                              setIsCategoryDropdownOpen(false)
                            }}
                            className={`w-full px-4 py-2 text-left hover:bg-gray-800 transition-colors text-sm ${selectedCategory === category
                                ? 'bg-white/10 text-white font-medium'
                                : 'text-gray-200'
                              }`}
                          >
                            {category}
                          </button>
                        ))
                      })()}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Search and Bulk Actions Bar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 mb-4">
              {/* Search Input */}
              <div className="relative flex-1">
                <input
                  type="text"
                  placeholder="Search requirements, categories, descriptions..."
                  value={trackerSearchQuery}
                  onChange={(e) => setTrackerSearchQuery(e.target.value)}
                  className="w-full px-4 py-2.5 pl-10 bg-black border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 text-sm sm:text-base"
                />
                <svg
                  width="16"
                  height="16"
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                {trackerSearchQuery && (
                  <button
                    onClick={() => setTrackerSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Bulk Actions */}
              {canEdit && selectedRequirements.size > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-400 whitespace-nowrap">
                    {selectedRequirements.size} selected
                  </span>
                  <button
                    onClick={() => {
                      setBulkActionType('status')
                      setIsBulkActionModalOpen(true)
                    }}
                    className="px-3 py-2 bg-blue-500/20 border border-blue-500 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors text-sm flex items-center gap-2"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                    Update Status
                  </button>
                  <button
                    onClick={() => {
                      setBulkActionType('delete')
                      setIsBulkActionModalOpen(true)
                    }}
                    className="px-3 py-2 bg-red-500/20 border border-red-500 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-sm flex items-center gap-2"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    Delete
                  </button>
                  <button
                    onClick={() => setSelectedRequirements(new Set())}
                    className="px-3 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors text-sm"
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>

            {/* Category Filters - Scrollable on Mobile */}
            <div className="flex items-center gap-2 flex-wrap overflow-x-auto pb-2 -mx-3 sm:mx-0 px-3 sm:px-0 scrollbar-hide">
              {['all', 'critical', 'pending', 'upcoming', 'completed'].map((filter) => (
                <button
                  key={filter}
                  onClick={() => setCategoryFilter(filter)}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg border-2 transition-colors capitalize text-xs sm:text-sm whitespace-nowrap flex-shrink-0 ${categoryFilter === filter
                      ? 'border-white/40 bg-white/10 text-white'
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
            <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden">
              {isLoadingRequirements ? (
                <div className="py-8 sm:py-12 flex flex-col items-center justify-center">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-white/40 border-t-transparent rounded-full animate-spin mb-4"></div>
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
                  {trackerSearchQuery || selectedTrackerFY || selectedMonth || selectedQuarter || categoryFilter !== 'all' || selectedCategory !== 'all' ? (
                    <>
                      <p className="text-gray-400 text-sm sm:text-base font-medium mb-2">No requirements match your filters</p>
                      <p className="text-gray-500 text-xs sm:text-sm mb-4 text-center px-4">
                        Try adjusting your search or filters to see more results
                      </p>
                      <button
                        onClick={() => {
                          setTrackerSearchQuery('')
                          setSelectedTrackerFY('')
                          setSelectedMonth(null)
                          setSelectedQuarter(null)
                          setCategoryFilter('all')
                          setSelectedCategory('all')
                        }}
                        className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
                      >
                        Clear All Filters
                      </button>
                    </>
                  ) : displayRequirements.length === 0 && regulatoryRequirements.length === 0 ? (
                    <>
                      <p className="text-gray-400 text-sm sm:text-base font-medium mb-2">No regulatory requirements yet</p>
                      <p className="text-gray-500 text-xs sm:text-sm mb-4 text-center px-4">
                        {canEdit
                          ? "Get started by adding your first compliance requirement. Requirements are automatically generated based on your company profile, or you can add custom ones."
                          : "No compliance requirements have been set up for this company yet."}
                      </p>
                      {canEdit && (
                        <button
                          onClick={() => {
                            setRequirementForm({
                              category: '',
                              requirement: '',
                              description: '',
                              due_date: '',
                              penalty: '',
                              penalty_base_amount: null,
                              is_critical: false,
                              financial_year: selectedTrackerFY || '',
                              status: 'not_started',
                              compliance_type: 'one-time',
                              year: new Date().getFullYear().toString()
                            })
                            setIsCreateModalOpen(true)
                          }}
                          className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium flex items-center gap-2"
                        >
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          Add First Requirement
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="text-gray-500 text-sm sm:text-base">No regulatory requirements found</p>
                  )}
                </div>
              ) : (
                <div className="sm:overflow-x-auto scrollbar-hide">
                  {(() => {
                    // Get all unique categories from ALL requirements (before filtering) - dynamic, not hardcoded
                    const allCategories = Array.from(new Set((displayRequirements || []).map(req => req.category).filter(Boolean)))
                    // Use country-specific categories as preferred order, fallback to dynamic categories
                    const preferredOrder = complianceCategories.length > 0 ? complianceCategories : ['Income Tax', 'GST', 'Payroll', 'RoC', 'Renewals', 'Prof.Tax', 'Other', 'Others']
                    const categoryOrder = [
                      ...preferredOrder.filter(cat => allCategories.includes(cat)),
                      ...allCategories.filter(cat => !preferredOrder.includes(cat) && cat).sort((a, b) => {
                        const catA = a || ''
                        const catB = b || ''
                        if (!catA && !catB) return 0
                        if (!catA) return 1
                        if (!catB) return -1
                        return catA.localeCompare(catB)
                      })
                    ]

                    // Helper function to parse date and get month/quarter
                    const getMonthFromDate = (dateStr: string | null | undefined) => {
                      if (!dateStr) return -1
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

                    // Improved date parsing with multiple format support and normalization
                    const parseDate = (dateStr: string): Date | null => {
                      if (!dateStr) return null

                      // Use the normalized date function for consistency
                      return normalizeDate(dateStr)
                    }

                    // Use memoized functions for performance
                    const calculateDelay = calculateDelayMemoized
                    const calculatePenalty = (penaltyStr: string | null, daysDelayed: number | null, penaltyBaseAmount?: number | null) => {
                      return calculatePenaltyMemoized(penaltyStr, daysDelayed, penaltyBaseAmount)
                    }

                    // Legacy calculatePenalty function kept for reference but replaced above
                    const _calculatePenaltyLegacy = (penaltyStr: string | null, daysDelayed: number | null): string => {
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
                          return formatCurrency(Math.round(dailyRate * daysDelayed), countryCode)
                        }
                      }

                      // Complex format with max cap: "100|500000" (daily|max)
                      if (/^\d+\|\d+$/.test(penalty)) {
                        const [dailyRateStr, maxCapStr] = penalty.split('|')
                        const dailyRate = parseInt(dailyRateStr, 10)
                        const maxCap = parseInt(maxCapStr, 10)

                        if (!isNaN(dailyRate) && dailyRate > 0) {
                          let calculated = dailyRate * daysDelayed
                          const isCapped = !isNaN(maxCap) && maxCap > 0 && calculated > maxCap
                          if (isCapped) {
                            calculated = maxCap
                            return `${formatCurrency(Math.round(calculated), countryCode)} (capped at ${formatCurrency(maxCap, countryCode)})`
                          }
                          return formatCurrency(Math.round(calculated), countryCode)
                        }
                      }

                      // ============================================
                      // Handle REMAINING TEXT FORMATS (fallback)
                      // ============================================

                      // Extract daily rate from penalty string (e.g., "₹100/day", "100/day")
                      // Handle "50/day (NIL: 20/day)" - extract first number
                      // Use country-specific currency symbol
                      const currencySymbol = countryConfig.currency.symbol
                      const currencySymbolEscaped = currencySymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                      let dailyRateMatch = penalty.match(/(\d+)\/day\s*\([^)]*NIL[^)]*\)/i)
                      if (!dailyRateMatch) {
                        dailyRateMatch = penalty.match(new RegExp(`(?:${currencySymbolEscaped})?[\\d,]+(?:\\.[\\d]+)?\\/day`, 'i'))
                      }
                      if (dailyRateMatch) {
                        const rateStr = dailyRateMatch[1] || dailyRateMatch[0].replace(new RegExp(currencySymbolEscaped, 'gi'), '').replace(/\/day/gi, '').replace(/,/g, '')
                        const dailyRate = parseFloat(rateStr.replace(/,/g, ''))
                        if (!isNaN(dailyRate) && dailyRate > 0) {
                          let calculatedPenalty = dailyRate * daysDelayed

                          // Check for maximum limit
                          const maxMatch = penalty.match(new RegExp(`max\\s*(?:${currencySymbolEscaped})?[\\d,]+(?:\\.[\\d]+)?`, 'i'))
                          if (maxMatch) {
                            const maxStr = maxMatch[0].replace(new RegExp(`max\\s*(?:${currencySymbolEscaped})?`, 'gi'), '').replace(/,/g, '')
                            const maxAmount = parseFloat(maxStr)
                            if (!isNaN(maxAmount) && maxAmount > 0) {
                              const isCapped = calculatedPenalty > maxAmount
                              calculatedPenalty = Math.min(calculatedPenalty, maxAmount)
                              if (isCapped) {
                                return `${formatCurrency(calculatedPenalty, countryCode)} (capped at ${formatCurrency(maxAmount, countryCode)})`
                              }
                            }
                          }

                          return formatCurrency(calculatedPenalty, countryCode)
                        }
                      }

                      // Handle "200/day + 10000-100000" - extract daily rate before the +
                      const dailyWithRangeMatch = penalty.match(/(\d+)\/day\s*\+\s*[\d-]+/i)
                      if (dailyWithRangeMatch) {
                        const dailyRate = parseFloat(dailyWithRangeMatch[1].replace(/,/g, ''))
                        if (!isNaN(dailyRate) && dailyRate > 0) {
                          return formatCurrency(Math.round(dailyRate * daysDelayed), countryCode)
                        }
                      }

                      // Handle "2%/month + 5/day" - extract daily rate after the +
                      const interestPlusDailyMatch = penalty.match(/[\d.]+%[^+]*\+\s*(\d+)\/day/i)
                      if (interestPlusDailyMatch) {
                        const dailyRate = parseFloat(interestPlusDailyMatch[1].replace(/,/g, ''))
                        if (!isNaN(dailyRate) && dailyRate > 0) {
                          return formatCurrency(Math.round(dailyRate * daysDelayed), countryCode)
                        }
                      }

                      // Handle range formats like "25000-300000" - extract minimum
                      const rangeMatch = penalty.match(/(\d+)\s*-\s*(\d+)/)
                      if (rangeMatch && !penalty.includes('%') && !penalty.includes('/day')) {
                        const minAmount = parseFloat(rangeMatch[1].replace(/,/g, ''))
                        if (!isNaN(minAmount) && minAmount > 0) {
                          return `${formatCurrency(Math.round(minAmount), countryCode)} (minimum)`
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
                              return formatCurrency(numAmount, countryCode)
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
                          return formatCurrency(calculatedPenalty, countryCode)
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

                    // Filter by date (Financial Year, Month, Quarter - all independent/loosely coupled)
                    let dateFilteredRequirements = displayRequirements

                    // Helper to check if date falls within a financial year (country-aware)
                    const isInFinancialYear = (reqDate: Date | null, fyStr: string): boolean => {
                      if (!reqDate || !fyStr) return false
                      return isInFinancialYearUtil(reqDate, fyStr, countryCode)
                    }

                    // Filter by Financial Year (if selected) - with null safety
                    if (selectedTrackerFY) {
                      try {
                        dateFilteredRequirements = dateFilteredRequirements.filter((req) => {
                          if (!req.dueDate) return false
                          const reqDate = parseDate(req.dueDate)
                          return isInFinancialYear(reqDate, selectedTrackerFY)
                        })
                      } catch (error) {
                        console.error('Error filtering by financial year:', error)
                        // Fallback: don't filter if parsing fails
                      }
                    }

                    // Filter by Month (if selected) - works independently but shows relationship
                    if (selectedMonth) {
                      const monthIndex = months.indexOf(selectedMonth)
                      dateFilteredRequirements = dateFilteredRequirements.filter((req) => {
                        const reqDate = parseDate(req.dueDate)
                        if (!reqDate) return false
                        return reqDate.getUTCMonth() === monthIndex
                      })
                    }

                    // Filter by Quarter (if selected) - works independently but shows relationship
                    if (selectedQuarter) {
                      dateFilteredRequirements = dateFilteredRequirements.filter((req) => {
                        const reqDate = parseDate(req.dueDate)
                        if (!reqDate) return false
                        const reqMonth = reqDate.getUTCMonth()
                        const reqQuarter = reqMonth >= 3 && reqMonth <= 5 ? 'q1' : // Apr-Jun
                          reqMonth >= 6 && reqMonth <= 8 ? 'q2' : // Jul-Sep
                            reqMonth >= 9 && reqMonth <= 11 ? 'q3' : // Oct-Dec
                              'q4' // Jan-Mar
                        return reqQuarter === selectedQuarter
                      })
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

                      // Search filter
                      if (trackerSearchQuery.trim()) {
                        const query = trackerSearchQuery.toLowerCase().trim()
                        const searchableText = [
                          req.category,
                          req.requirement,
                          req.description,
                          req.status,
                          req.compliance_type,
                          req.financial_year
                        ].filter(Boolean).join(' ').toLowerCase()
                        if (!searchableText.includes(query)) return false
                      }

                      return true
                    })

                    const groupedByCategory = categoryOrder.map((category) => {
                      const items = filteredRequirements
                        .filter((req) => req.category === category)
                        .sort((a, b) => {
                          const dateA = a.dueDate || ''
                          const dateB = b.dueDate || ''
                          if (!dateA && !dateB) return 0
                          if (!dateA) return 1
                          if (!dateB) return -1
                          return dateA.localeCompare(dateB)
                        })
                      return { category, items }
                    }).filter((group) => group.items.length > 0)

                    // Calendar view helper functions - use improved parseDate for consistency and null safety
                    const parseDateForCalendar = (dateStr: string | null | undefined): Date | null => {
                      if (!dateStr) return null
                      return parseDate(dateStr)
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
                                  className={`min-h-[60px] sm:min-h-[120px] border border-gray-700 rounded sm:rounded-lg p-1 sm:p-2 bg-gray-900/50 ${isToday ? 'ring-1 sm:ring-2 ring-white/40' : ''
                                    }`}
                                >
                                  <div className={`text-xs sm:text-sm mb-1 sm:mb-2 font-medium ${isToday ? 'text-white font-bold' : 'text-gray-300'}`}>
                                    {day}
                                  </div>
                                  <div className="space-y-1 sm:space-y-1.5 overflow-y-auto max-h-[45px] sm:max-h-[90px]">
                                    {dayRequirements.map((req) => {
                                      const isOverdue = req.status === 'overdue' || (parseDateForCalendar(req.dueDate) && parseDateForCalendar(req.dueDate)! < new Date())
                                      const daysDelayed = calculateDelay(req.dueDate, req.status)
                                      const calculatedPenalty = calculatePenalty(req.penalty, daysDelayed, req.penalty_base_amount)

                                      return (
                                        <div
                                          key={req.id}
                                          className={`text-[10px] sm:text-xs p-1 sm:p-2 rounded border cursor-pointer hover:opacity-80 transition-opacity ${isOverdue
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
                                            <span className={`px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] font-medium ${req.status === 'completed' ? 'bg-green-500/30 text-green-300' :
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
                                <h3 className="text-white font-semibold text-base">
                                  {group.category}
                                </h3>
                                {groupIndex > 0 && (
                                  <div className="h-0.5 bg-gradient-to-r from-transparent via-white/30 to-transparent my-2"></div>
                                )}
                              </div>
                              {/* Category Items as Cards */}
                              <div className="space-y-3">
                                {group.items.map((req) => {
                                  const daysDelayed = calculateDelay(req.dueDate, req.status)
                                  const calculatedPenalty = calculatePenalty(req.penalty, daysDelayed)
                                  const complianceType = req.compliance_type
                                  const formFreq = getFormFrequency(req.requirement)
                                  const legalSections = getRelevantLegalSections(req.requirement, req.category)
                                  const authority = getAuthorityForCategory(req.category)

                                  return (
                                    <div key={req.id} className="bg-black border border-white/10 rounded-lg p-3 space-y-2">
                                      {/* Requirement Header with Checkbox */}
                                      <div className="flex items-start gap-2">
                                        {canEdit && (
                                          <input
                                            type="checkbox"
                                            checked={selectedRequirements.has(req.id)}
                                            onChange={(e) => {
                                              const newSelected = new Set(selectedRequirements)
                                              if (e.target.checked) {
                                                newSelected.add(req.id)
                                              } else {
                                                newSelected.delete(req.id)
                                              }
                                              setSelectedRequirements(newSelected)
                                            }}
                                            className="mt-1 w-4 h-4 rounded border-gray-600 bg-gray-800 text-white focus:ring-white/40 focus:ring-2 cursor-pointer"
                                          />
                                        )}
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
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <div className="text-white font-medium text-sm break-words">{req.requirement}</div>
                                            {formFreq && (
                                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${formFreq === 'monthly' ? 'bg-blue-500/20 text-blue-400' :
                                                  formFreq === 'quarterly' ? 'bg-purple-500/20 text-purple-400' :
                                                    formFreq === 'annual' ? 'bg-green-500/20 text-green-400' :
                                                      'bg-gray-500/20 text-gray-400'
                                                }`}>
                                                {formFreq.toUpperCase()}
                                              </span>
                                            )}
                                          </div>
                                          {req.description && (
                                            <div className="text-gray-400 text-xs break-words mt-1">{req.description}</div>
                                          )}
                                          {(formFreq || authority || legalSections.length > 0) && (
                                            <button
                                              onClick={() => setComplianceDetailsModal(req)}
                                              className="mt-2 text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 transition-colors"
                                            >
                                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="12" y1="16" x2="12" y2="12" />
                                                <line x1="12" y1="8" x2="12.01" y2="8" />
                                              </svg>
                                              View Details
                                            </button>
                                          )}
                                        </div>
                                      </div>

                                      {/* Status and Type Row */}
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {canEdit ? (
                                          <select
                                            value={req.status}
                                            onChange={(e) => handleStatusChange(req.id, e.target.value as any)}
                                            className={`px-2 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${req.status === 'completed'
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
                                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${req.status === 'completed'
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
                                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${complianceType === 'one-time' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                              complianceType === 'annual' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                                complianceType === 'monthly' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                                  complianceType === 'quarterly' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                                                    'bg-gray-500/20 text-white border border-gray-500/30'
                                            }`} title={
                                              complianceType === 'one-time' ? 'One-time: happens once, no recurring' :
                                                complianceType === 'annual' ? 'Annual: recurs every year' :
                                                  complianceType === 'monthly' ? 'Monthly: recurs every month' :
                                                    complianceType === 'quarterly' ? 'Quarterly: recurs every quarter' :
                                                      ''
                                            }>
                                            {complianceType === 'one-time' ? 'ONE-TIME' :
                                              complianceType === 'annual' ? 'ANNUAL' :
                                                complianceType.toUpperCase()}
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

                                      {/* Audit Trail */}
                                      {((req as any).filed_on || (req as any).filed_by || (req as any).status_reason) && (
                                        <div className="pt-2 border-t border-white/10 space-y-1.5">
                                          {(req as any).filed_on && (
                                            <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <circle cx="12" cy="12" r="10" />
                                                <polyline points="12 6 12 12 16 14" />
                                              </svg>
                                              <span>Filed on: {new Date((req as any).filed_on).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                            </div>
                                          )}
                                          {(req as any).filed_by && (
                                            <div className="flex items-center gap-1.5 text-xs text-gray-400">
                                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                                <circle cx="12" cy="7" r="4" />
                                              </svg>
                                              <span>Filed by: {((req as any).filed_by_name || 'User')}</span>
                                            </div>
                                          )}
                                          {(req as any).status_reason && (
                                            <div className="flex items-start gap-1.5 text-xs text-gray-400">
                                              <svg width="12" height="12" className="mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <circle cx="12" cy="12" r="10" />
                                                <line x1="12" y1="16" x2="12" y2="12" />
                                                <line x1="12" y1="8" x2="12.01" y2="8" />
                                              </svg>
                                              <span>Reason: {(req as any).status_reason}</span>
                                            </div>
                                          )}
                                        </div>
                                      )}

                                      {/* Actions */}
                                      {canEdit && (
                                        <div className="flex items-center gap-2 pt-2 border-t border-white/10">
                                          <button
                                            onClick={() => {
                                              const originalReq = (regulatoryRequirements || []).find(r => r.id === req.id)
                                              if (originalReq) {
                                                setEditingRequirement(originalReq)
                                                setRequirementForm({
                                                  category: originalReq.category,
                                                  requirement: originalReq.requirement,
                                                  description: originalReq.description || '',
                                                  due_date: originalReq.due_date,
                                                  penalty: originalReq.penalty || '',
                                                  penalty_base_amount: originalReq.penalty_base_amount || null,
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
                                              if (!confirm(`Are you sure you want to remove "${req.requirement}" from this company? This will hide it from the tracker and exclude it from penalty calculations and reports, but it won't be deleted.`)) return
                                              if (!currentCompany) return

                                              try {
                                                const result = await hideComplianceForCompany(currentCompany.id, req.id)
                                                if (result.success) {
                                                  // Update hidden compliances set
                                                  setHiddenCompliances(prev => {
                                                    const newSet = new Set(prev)
                                                    newSet.add(req.id)
                                                    return newSet
                                                  })
                                                  showToast(`"${req.requirement}" removed from tracker`, 'success')
                                                } else {
                                                  showToast(result.error || 'Failed to remove compliance', 'error')
                                                }
                                              } catch (error: any) {
                                                console.error('Error hiding compliance:', error)
                                                showToast('Failed to remove compliance', 'error')
                                              }
                                            }}
                                            className="p-1.5 text-orange-400 hover:text-orange-300 hover:bg-orange-500/20 rounded-lg transition-colors"
                                            title="Remove from this company (hide from tracker)"
                                          >
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                              <path d="M18 6L6 18M6 6l12 12" />
                                            </svg>
                                          </button>
                                          <button
                                            onClick={async () => {
                                              if (!confirm('Are you sure you want to delete this compliance requirement permanently?')) return
                                              if (!currentCompany) return

                                              try {
                                                const result = await deleteRequirement(req.id, currentCompany.id)
                                                if (result.success) {
                                                  const refreshResult = await getRegulatoryRequirements(currentCompany.id)
                                                  if (refreshResult.success && refreshResult.requirements) {
                                                    setRegulatoryRequirements(refreshResult.requirements)
                                                  }
                                                  showToast('Requirement deleted successfully', 'success')
                                                } else {
                                                  showToast(result.error || 'Failed to delete', 'error')
                                                }
                                              } catch (error: any) {
                                                console.error('Error deleting requirement:', error)
                                                showToast(error.message || 'Error deleting requirement', 'error')
                                              }
                                            }}
                                            className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                                            title="Delete permanently"
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
                          <thead className="bg-black border-b border-white/10">
                            <tr>
                              {canEdit && (
                                <th className="px-4 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider w-12">
                                  <input
                                    type="checkbox"
                                    checked={filteredRequirements.length > 0 && filteredRequirements.every(req => selectedRequirements.has(req.id))}
                                    onChange={(e) => {
                                      if (e.target.checked) {
                                        setSelectedRequirements(new Set(filteredRequirements.map(req => req.id)))
                                      } else {
                                        setSelectedRequirements(new Set())
                                      }
                                    }}
                                    className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-white focus:ring-white/40 focus:ring-2 cursor-pointer"
                                  />
                                </th>
                              )}
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
                                DOCUMENTS
                              </th>
                              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                                FILED ON
                              </th>
                              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden xl:table-cell">
                                FILED BY
                              </th>
                              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden xl:table-cell">
                                STATUS REASON
                              </th>
                              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                                PENALTY
                              </th>
                              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden lg:table-cell">
                                CALC PENALTY
                              </th>
                              <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase tracking-wider hidden xl:table-cell">
                                LEGAL ACTION
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
                                    <td colSpan={canEdit ? 13 : 12} className="px-0 py-0">
                                      <div className="h-0.5 bg-gradient-to-r from-transparent via-white/30 to-transparent my-2"></div>
                                    </td>
                                  </tr>
                                )}
                                {/* Category Items */}
                                {group.items.map((req, itemIndex) => {
                                  const formFreq = getFormFrequency(req.requirement)
                                  const legalSections = getRelevantLegalSections(req.requirement, req.category)
                                  const authority = getAuthorityForCategory(req.category)

                                  return (
                                    <tr key={req.id} className="hover:bg-black/50 transition-colors border-t border-white/10">
                                      {canEdit && (
                                        <td className="px-4 py-4">
                                          <input
                                            type="checkbox"
                                            checked={selectedRequirements.has(req.id)}
                                            onChange={(e) => {
                                              const newSelected = new Set(selectedRequirements)
                                              if (e.target.checked) {
                                                newSelected.add(req.id)
                                              } else {
                                                newSelected.delete(req.id)
                                              }
                                              setSelectedRequirements(newSelected)
                                            }}
                                            className="w-4 h-4 rounded border-gray-600 bg-gray-800 text-white focus:ring-white/40 focus:ring-2 cursor-pointer"
                                          />
                                        </td>
                                      )}
                                      {itemIndex === 0 && (
                                        <td
                                          className="px-6 py-4 border-r-0 border-l-0 border-t-0 border-b-0 align-top"
                                          rowSpan={group.items.length}
                                        >
                                          <span className="text-white font-semibold text-2xl block">
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
                                            <div className="flex items-center gap-2 flex-wrap">
                                              <div className="text-white font-medium text-base break-words">{req.requirement}</div>
                                              {formFreq && (
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${formFreq === 'monthly' ? 'bg-blue-500/20 text-blue-400' :
                                                    formFreq === 'quarterly' ? 'bg-purple-500/20 text-purple-400' :
                                                      formFreq === 'annual' ? 'bg-green-500/20 text-green-400' :
                                                        'bg-gray-500/20 text-gray-400'
                                                  }`}>
                                                  {formFreq.toUpperCase()}
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-gray-400 text-sm break-words">{req.description}</div>
                                            {(formFreq || authority || legalSections.length > 0) && (
                                              <button
                                                onClick={() => setComplianceDetailsModal(req)}
                                                className="mt-2 text-blue-400 hover:text-blue-300 text-xs flex items-center gap-1 transition-colors"
                                              >
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                  <circle cx="12" cy="12" r="10" />
                                                  <line x1="12" y1="16" x2="12" y2="12" />
                                                  <line x1="12" y1="8" x2="12.01" y2="8" />
                                                </svg>
                                                View Details
                                              </button>
                                            )}
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-6 py-4">
                                        {(() => {
                                          const complianceType = req.compliance_type
                                          if (!complianceType) return <span className="text-gray-500 text-sm">-</span>
                                          return (
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${complianceType === 'one-time' ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' :
                                                complianceType === 'annual' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                                                  complianceType === 'monthly' ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30' :
                                                    complianceType === 'quarterly' ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30' :
                                                      'bg-gray-500/20 text-white border border-gray-500/30'
                                              }`} title={
                                                complianceType === 'one-time' ? 'One-time: happens once, no recurring' :
                                                  complianceType === 'annual' ? 'Annual: recurs every year' :
                                                    complianceType === 'monthly' ? 'Monthly: recurs every month' :
                                                      complianceType === 'quarterly' ? 'Quarterly: recurs every quarter' :
                                                        ''
                                              }>
                                              {complianceType === 'one-time' ? 'ONE-TIME' :
                                                complianceType === 'annual' ? 'ANNUAL' :
                                                  complianceType.toUpperCase()}
                                            </span>
                                          )
                                        })()}
                                      </td>
                                      <td className="px-6 py-4">
                                        {canEdit ? (
                                          <select
                                            value={req.status}
                                            onChange={(e) => handleStatusChange(req.id, e.target.value as any)}
                                            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${req.status === 'completed'
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
                                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${req.status === 'completed'
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
                                        {(() => {
                                          const daysDelayed = calculateDelay(req.dueDate, req.status)
                                          return (
                                            <div className="flex flex-col">
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
                                              {daysDelayed !== null && daysDelayed > 0 && (
                                                <div className="text-red-400 text-xs mt-1 ml-6">
                                                  Delayed by {daysDelayed} {daysDelayed === 1 ? 'day' : 'days'}
                                                </div>
                                              )}
                                            </div>
                                          )
                                        })()}
                                      </td>
                                      <td className="px-6 py-4 hidden md:table-cell">
                                        {/* Documents Required Column */}
                                        {(() => {
                                          const requiredDocs = req.required_documents || []
                                          // Debug logging
                                          if (req.requirement === 'GSTR-3B - Monthly Summary Return' || req.requirement === 'ESI Challan - Monthly ESI Payment') {
                                            console.log('[RENDER] Documents for', req.requirement, ':', {
                                              required_documents: req.required_documents,
                                              type: typeof req.required_documents,
                                              isArray: Array.isArray(req.required_documents),
                                              length: Array.isArray(req.required_documents) ? req.required_documents.length : 'N/A',
                                              parsed: requiredDocs
                                            })
                                          }
                                          if (!Array.isArray(requiredDocs) || requiredDocs.length === 0) {
                                            return <div className="text-gray-500 text-sm">-</div>
                                          }
                                          return (
                                            <div className="flex flex-wrap gap-1">
                                              {requiredDocs.slice(0, 3).map((doc: string, idx: number) => (
                                                <button
                                                  key={idx}
                                                  onClick={() => {
                                                    const requirement = (regulatoryRequirements || []).find(r => r.id === req.id)
                                                    if (requirement) {
                                                      setDocumentUploadModal({
                                                        isOpen: true,
                                                        requirementId: req.id,
                                                        requirement: req.requirement,
                                                        category: req.category,
                                                        documentName: doc,
                                                        complianceType: req.compliance_type || 'one-time',
                                                        dueDate: req.dueDate,
                                                        financialYear: req.financial_year || null,
                                                        allRequiredDocs: requiredDocs
                                                      })
                                                    }
                                                  }}
                                                  className="group px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30 hover:bg-blue-500/30 hover:border-blue-400 transition-colors flex items-center gap-1"
                                                  title={`Click to upload ${doc}`}
                                                >
                                                  <span>{doc.length > 12 ? doc.substring(0, 12) + '...' : doc}</span>
                                                  <svg
                                                    className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                  >
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                                  </svg>
                                                </button>
                                              ))}
                                              {requiredDocs.length > 3 && (
                                                <span className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-400">
                                                  +{requiredDocs.length - 3}
                                                </span>
                                              )}
                                            </div>
                                          )
                                        })()}
                                      </td>
                                      <td className="px-6 py-4 hidden lg:table-cell">
                                        {/* Filed On Column */}
                                        {(() => {
                                          const filedOn = (req as any).filed_on
                                          if (!filedOn) {
                                            return <div className="text-gray-500 text-sm">-</div>
                                          }
                                          return (
                                            <div className="text-green-400 text-sm">
                                              {new Date(filedOn).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                            </div>
                                          )
                                        })()}
                                      </td>
                                      <td className="px-6 py-4 hidden xl:table-cell">
                                        {/* Filed By Column */}
                                        {(() => {
                                          const filedBy = (req as any).filed_by
                                          if (!filedBy) {
                                            return <div className="text-gray-500 text-sm">-</div>
                                          }
                                          return (
                                            <div className="text-blue-400 text-sm">
                                              {(req as any).filed_by_name || 'User'}
                                            </div>
                                          )
                                        })()}
                                      </td>
                                      <td className="px-6 py-4 hidden xl:table-cell">
                                        {/* Status Reason Column */}
                                        {(() => {
                                          const statusReason = (req as any).status_reason
                                          if (!statusReason) {
                                            return <div className="text-gray-500 text-sm">-</div>
                                          }
                                          return (
                                            <div className="text-yellow-400 text-xs max-w-[200px]" title={statusReason}>
                                              {statusReason.length > 30 ? statusReason.substring(0, 30) + '...' : statusReason}
                                            </div>
                                          )
                                        })()}
                                      </td>
                                      <td className="px-6 py-4 hidden lg:table-cell">
                                        <div className="text-gray-300 text-sm break-words max-w-[150px]" title={req.penalty || ''}>
                                          {req.penalty ? (req.penalty.length > 30 ? req.penalty.substring(0, 30) + '...' : req.penalty) : '-'}
                                        </div>
                                      </td>
                                      <td className="px-6 py-4 hidden lg:table-cell">
                                        {(() => {
                                          const daysDelayed = calculateDelay(req.dueDate, req.status)
                                          const calculatedPenalty = calculatePenalty(req.penalty, daysDelayed, req.penalty_base_amount)
                                          if (calculatedPenalty === '-') {
                                            return <div className="text-gray-500 text-sm">-</div>
                                          }
                                          if (calculatedPenalty.includes('Needs')) {
                                            return (
                                              <button
                                                onClick={() => {
                                                  // TODO: Open modal to add base amount
                                                  alert('Feature coming soon: Add base amount for penalty calculation')
                                                }}
                                                className="text-yellow-400 text-xs underline hover:text-yellow-300"
                                                title="Click to add required amount"
                                              >
                                                {calculatedPenalty}
                                              </button>
                                            )
                                          }
                                          if (calculatedPenalty.startsWith('Cannot calculate') || calculatedPenalty.startsWith('Refer')) {
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
                                      <td className="px-6 py-4 hidden xl:table-cell">
                                        {/* Possible Legal Action Column */}
                                        {(() => {
                                          const legalAction = (req as any).possible_legal_action
                                          if (!legalAction) {
                                            return <div className="text-gray-500 text-sm">-</div>
                                          }
                                          return (
                                            <div className="text-white text-xs max-w-[150px]" title={legalAction}>
                                              {legalAction.length > 40 ? legalAction.substring(0, 40) + '...' : legalAction}
                                            </div>
                                          )
                                        })()}
                                      </td>
                                      {canEdit && (
                                        <td className="px-6 py-4">
                                          <div className="flex items-center gap-2">
                                            <button
                                              onClick={() => {
                                                const originalReq = (regulatoryRequirements || []).find(r => r.id === req.id)
                                                if (originalReq) {
                                                  setEditingRequirement(originalReq)
                                                  setRequirementForm({
                                                    category: originalReq.category,
                                                    requirement: originalReq.requirement,
                                                    description: originalReq.description || '',
                                                    due_date: originalReq.due_date,
                                                    penalty: originalReq.penalty || '',
                                                    penalty_base_amount: originalReq.penalty_base_amount || null,
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
                                                if (!confirm(`Are you sure you want to remove "${req.requirement}" from this company? This will hide it from the tracker and exclude it from penalty calculations and reports, but it won't be deleted.`)) return
                                                if (!currentCompany) return

                                                try {
                                                  const result = await hideComplianceForCompany(currentCompany.id, req.id)
                                                  if (result.success) {
                                                    // Update hidden compliances set
                                                    setHiddenCompliances(prev => {
                                                      const newSet = new Set(prev)
                                                      newSet.add(req.id)
                                                      return newSet
                                                    })
                                                    showToast(`"${req.requirement}" removed from tracker`, 'success')
                                                  } else {
                                                    showToast(result.error || 'Failed to remove compliance', 'error')
                                                  }
                                                } catch (error: any) {
                                                  console.error('Error hiding compliance:', error)
                                                  showToast('Failed to remove compliance', 'error')
                                                }
                                              }}
                                              className="p-2 text-orange-400 hover:text-orange-300 hover:bg-orange-500/20 rounded-lg transition-colors"
                                              title="Remove from this company (hide from tracker)"
                                            >
                                              <svg width="16" height="16" className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M18 6L6 18M6 6l12 12" />
                                              </svg>
                                            </button>
                                            <button
                                              onClick={async () => {
                                                if (!confirm('Are you sure you want to delete this compliance requirement permanently?')) return
                                                if (!currentCompany) return

                                                try {
                                                  const result = await deleteRequirement(req.id, currentCompany.id)
                                                  if (result.success) {
                                                    // Refresh requirements
                                                    const refreshResult = await getRegulatoryRequirements(currentCompany.id)
                                                    if (refreshResult.success && refreshResult.requirements) {
                                                      setRegulatoryRequirements(refreshResult.requirements)
                                                    }
                                                    showToast('Requirement deleted successfully', 'success')
                                                  } else {
                                                    showToast(result.error || 'Failed to delete', 'error')
                                                  }
                                                } catch (error: any) {
                                                  console.error('Error deleting requirement:', error)
                                                  showToast(error.message || 'Error deleting requirement', 'error')
                                                }
                                              }}
                                              className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/20 rounded-lg transition-colors"
                                              title="Delete permanently"
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
                                  )
                                })}
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
                  <div className="p-6 border-b border-white/10">
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
                            penalty_base_amount: null,
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
                        className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                      >
                        <option value="">Select Category</option>
                        {/* Country-specific categories */}
                        {complianceCategories.map((cat) => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                        {/* Dynamic categories from existing requirements (if not in default list) */}
                        {(() => {
                          const allCategories = Array.from(new Set((regulatoryRequirements || []).map(req => req.category).filter(Boolean)))
                          const defaultCats = new Set(complianceCategories)
                          const additionalCats = allCategories.filter(cat => cat && !defaultCats.has(cat)).sort()
                          return additionalCats.length > 0 ? (
                            <>
                              {additionalCats.length > 0 && <option disabled>--- Other Categories ---</option>}
                              {additionalCats.map((cat) => (
                                <option key={cat} value={cat}>{cat}</option>
                              ))}
                            </>
                          ) : null
                        })()}
                      </select>
                      <p className="text-xs text-gray-400 mt-1">
                        Categories are specific to {countryConfig.name}
                      </p>
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
                        className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                        placeholder={
                          countryCode === 'IN'
                            ? 'e.g., TDS Payment - Monthly'
                            : countryCode === 'US'
                              ? 'e.g., Federal Tax Return - Quarterly'
                              : ['AE', 'SA', 'OM', 'QA', 'BH'].includes(countryCode || '')
                                ? 'e.g., VAT Return - Monthly'
                                : 'e.g., Tax Return - Monthly'
                        }
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
                        className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
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
                        className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
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
                            className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
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
                        className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        Date format: {countryConfig.dateFormat}
                        {requirementForm.compliance_type !== 'one-time' && (
                          <span className="block mt-1">
                            For {requirementForm.compliance_type} compliances, this is the base due date. The system will generate requirements for all applicable periods.
                          </span>
                        )}
                      </p>
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
                        className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                        placeholder={`e.g., Late fee ${countryConfig.currency.symbol}200/day or Interest @ 1%/month`}
                      />
                      <p className="text-xs text-gray-400 mt-1">
                        {countryCode === 'IN'
                          ? 'For interest-based penalties, include the rate (e.g., "Interest @ 1%/month" or "u/s 234B & 234C")'
                          : `For interest-based penalties, include the rate (e.g., "Interest @ 1%/month"). Use ${countryConfig.currency.symbol} for amounts.`
                        }
                      </p>
                    </div>

                    {/* Base Amount for Interest Calculations - Show when penalty includes "Interest" */}
                    {(requirementForm.penalty.toLowerCase().includes('interest') ||
                      requirementForm.penalty.includes('234B') ||
                      requirementForm.penalty.includes('234C') ||
                      requirementForm.penalty.includes('u/s 234')) && (
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">
                            Base Amount (Principal) <span className="text-yellow-400">*</span>
                          </label>
                          <input
                            type="number"
                            value={requirementForm.penalty_base_amount || ''}
                            onChange={(e) => {
                              const value = e.target.value === '' ? null : parseFloat(e.target.value)
                              setRequirementForm(prev => ({ ...prev, penalty_base_amount: value }))
                            }}
                            className="w-full px-4 py-3 bg-black border border-yellow-500/30 rounded-lg text-white focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-colors"
                            placeholder="e.g., 100000"
                            min="0"
                            step="0.01"
                          />
                          <p className="text-xs text-yellow-400 mt-1">
                            Required for interest calculation. Enter the principal amount on which interest is calculated (e.g., unpaid tax amount).
                          </p>
                        </div>
                      )}

                    {/* Financial Year */}
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Financial Year
                      </label>
                      <select
                        value={requirementForm.financial_year}
                        onChange={(e) => setRequirementForm(prev => ({ ...prev, financial_year: e.target.value }))}
                        className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
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
                          className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
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
                        className="w-4 h-4 text-white bg-gray-900 border-gray-700 rounded focus:ring-white/40"
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
                                penalty_base_amount: null,
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
                        className="flex-1 bg-white text-black px-6 py-3 rounded-lg hover:bg-gray-700 transition-colors font-medium"
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
                            penalty_base_amount: null,
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

        {activeTab === 'dsc-din' && (
          <div className="space-y-4 sm:space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-light text-white mb-1 sm:mb-2">DSC & DIN Management</h2>
                <p className="text-gray-400 text-sm sm:text-base">Manage Digital Signature Certificates (DSC) and Director Identification Numbers (DIN) for directors.</p>
              </div>
            </div>

            {/* Directors List */}
            {entityDetails && entityDetails.directors && entityDetails.directors.length > 0 ? (
              <div className="space-y-4">
                {entityDetails.directors.map((director) => {
                  const directorId = director.id
                  const directorData = directorDscDinData[directorId] || {
                    dscFile: null,
                    dinFile: null,
                    dscFilePath: null,
                    dinFilePath: null,
                    portalEmail: '',
                    portalPassword: '',
                    hasCredentials: false,
                    expiryDate: (() => {
                      // Default to September 30 of current year, or next year if we've passed September
                      const now = new Date()
                      const currentYear = now.getFullYear()
                      const currentMonth = now.getMonth() // 0-11, where 8 = September
                      const year = currentMonth >= 8 ? currentYear + 1 : currentYear
                      return `${year}-09-30`
                    })(),
                    reminderEnabled: false
                  }

                  const directorName = `${director.firstName} ${director.middleName ? director.middleName + ' ' : ''}${director.lastName}`.trim()
                  const isExpiringSoon = (() => {
                    if (!directorData.expiryDate) return false
                    const expiry = new Date(directorData.expiryDate)
                    const now = new Date()
                    const daysUntilExpiry = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
                    return daysUntilExpiry <= 30 && daysUntilExpiry > 0
                  })()
                  const isExpired = (() => {
                    if (!directorData.expiryDate) return false
                    return new Date(directorData.expiryDate) < new Date()
                  })()

                  return (
                    <div key={directorId} className="bg-black border border-gray-800 rounded-xl p-4 sm:p-6 space-y-4 sm:space-y-6">
                      {/* Director Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-4 border-b border-gray-800">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 flex items-center justify-center text-white font-medium text-lg sm:text-xl">
                            {directorName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <h3 className="text-lg sm:text-xl font-medium text-white">{directorName}</h3>
                            {director.din && (
                              <p className="text-sm text-gray-400">DIN: {director.din}</p>
                            )}
                            {director.designation && (
                              <p className="text-xs text-gray-500">{director.designation}</p>
                            )}
                          </div>
                        </div>
                        {directorData.expiryDate && (
                          <div className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                            isExpired
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : isExpiringSoon
                                ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                                : 'bg-green-500/20 text-green-400 border border-green-500/30'
                          }`}>
                            {isExpired ? 'Expired' : isExpiringSoon ? 'Expiring Soon' : 'Valid'}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                        {/* DSC Certificate Section */}
                        <div className="space-y-3">
                          <h4 className="text-base sm:text-lg font-medium text-white flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                            DSC Certificate
                          </h4>
                          
                          {directorData.dscFilePath ? (
                            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <span className="text-sm text-gray-300">DSC Certificate Uploaded</span>
                                </div>
                                <button
                                  onClick={() => {
                                    setDirectorDscDinData(prev => ({
                                      ...prev,
                                      [directorId]: { ...prev[directorId], dscFile: null, dscFilePath: null }
                                    }))
                                  }}
                                  className="text-red-400 hover:text-red-300 text-sm"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-white/40 transition-colors bg-gray-900/50">
                              <div className="flex flex-col items-center justify-center pt-4 pb-4 px-4">
                                <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <p className="mb-1 text-xs sm:text-sm text-white font-medium text-center">
                                  Click to upload DSC certificate
                                </p>
                                <p className="text-[10px] sm:text-xs text-gray-400 text-center">
                                  PDF, DOC, DOCX (max. 10MB)
                                </p>
                              </div>
                              <input
                                type="file"
                                className="hidden"
                                accept=".pdf,.doc,.docx"
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    setDirectorDscDinData(prev => ({
                                      ...prev,
                                      [directorId]: { ...prev[directorId] || {
                                        dscFile: null,
                                        dinFile: null,
                                        dscFilePath: null,
                                        dinFilePath: null,
                                        portalEmail: '',
                                        portalPassword: '',
                                        hasCredentials: false,
                                        expiryDate: (() => {
                                          const now = new Date()
                                          const currentYear = now.getFullYear()
                                          const currentMonth = now.getMonth()
                                          const year = currentMonth >= 8 ? currentYear + 1 : currentYear
                                          return `${year}-09-30`
                                        })(),
                                        reminderEnabled: false
                                      }, dscFile: file }
                                    }))
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>

                        {/* DIN Certificate Section */}
                        <div className="space-y-3">
                          <h4 className="text-base sm:text-lg font-medium text-white flex items-center gap-2">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                            </svg>
                            DIN Certificate
                          </h4>
                          
                          {directorData.dinFilePath ? (
                            <div className="bg-gray-900/50 rounded-lg p-3 border border-gray-800">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  <span className="text-sm text-gray-300">DIN Certificate Uploaded</span>
                                </div>
                                <button
                                  onClick={() => {
                                    setDirectorDscDinData(prev => ({
                                      ...prev,
                                      [directorId]: { ...prev[directorId], dinFile: null, dinFilePath: null }
                                    }))
                                  }}
                                  className="text-red-400 hover:text-red-300 text-sm"
                                >
                                  Remove
                                </button>
                              </div>
                            </div>
                          ) : (
                            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-white/40 transition-colors bg-gray-900/50">
                              <div className="flex flex-col items-center justify-center pt-4 pb-4 px-4">
                                <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <p className="mb-1 text-xs sm:text-sm text-white font-medium text-center">
                                  Click to upload DIN certificate
                                </p>
                                <p className="text-[10px] sm:text-xs text-gray-400 text-center">
                                  PDF, DOC, DOCX (max. 10MB)
                                </p>
                              </div>
                              <input
                                type="file"
                                className="hidden"
                                accept=".pdf,.doc,.docx"
                                onChange={(e) => {
                                  const file = e.target.files?.[0]
                                  if (file) {
                                    setDirectorDscDinData(prev => ({
                                      ...prev,
                                      [directorId]: { ...prev[directorId] || {
                                        dscFile: null,
                                        dinFile: null,
                                        dscFilePath: null,
                                        dinFilePath: null,
                                        portalEmail: '',
                                        portalPassword: '',
                                        hasCredentials: false,
                                        expiryDate: (() => {
                                          const now = new Date()
                                          const currentYear = now.getFullYear()
                                          const currentMonth = now.getMonth()
                                          const year = currentMonth >= 8 ? currentYear + 1 : currentYear
                                          return `${year}-09-30`
                                        })(),
                                        reminderEnabled: false
                                      }, dinFile: file }
                                    }))
                                  }
                                }}
                              />
                            </label>
                          )}
                        </div>
                      </div>

                      {/* Portal Credentials Section */}
                      <div className="space-y-3 pt-4 border-t border-gray-800">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={directorData.hasCredentials}
                            onChange={(e) => {
                              setDirectorDscDinData(prev => ({
                                ...prev,
                                [directorId]: { ...prev[directorId] || {
                                  dscFile: null,
                                  dinFile: null,
                                  dscFilePath: null,
                                  dinFilePath: null,
                                  portalEmail: '',
                                  portalPassword: '',
                                  hasCredentials: false,
                                  expiryDate: (() => {
                                    const now = new Date()
                                    const currentYear = now.getFullYear()
                                    const currentMonth = now.getMonth()
                                    const year = currentMonth >= 8 ? currentYear + 1 : currentYear
                                    return `${year}-09-30`
                                  })(),
                                  reminderEnabled: false
                                }, hasCredentials: e.target.checked }
                              }))
                            }}
                            className="w-4 h-4 text-white bg-gray-800 border-gray-600 rounded focus:ring-white/40 focus:ring-2"
                          />
                          <span className="text-sm sm:text-base text-white font-medium">Store Portal Credentials</span>
                        </label>

                        {directorData.hasCredentials && (
                          <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
                            <div>
                              <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-1.5">
                                Portal Email
                              </label>
                              <input
                                type="email"
                                value={directorData.portalEmail}
                                onChange={(e) => {
                                  setDirectorDscDinData(prev => ({
                                    ...prev,
                                    [directorId]: { ...prev[directorId] || {
                                      dscFile: null,
                                      dinFile: null,
                                      dscFilePath: null,
                                      dinFilePath: null,
                                      portalEmail: '',
                                      portalPassword: '',
                                      hasCredentials: false,
                                      expiryDate: (() => {
                                        const now = new Date()
                                        const currentYear = now.getFullYear()
                                        const currentMonth = now.getMonth()
                                        const year = currentMonth >= 8 ? currentYear + 1 : currentYear
                                        return `${year}-09-30`
                                      })(),
                                      reminderEnabled: false
                                    }, portalEmail: e.target.value }
                                  }))
                                }}
                                placeholder="portal@example.com"
                                className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-xs sm:text-sm placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                              />
                            </div>
                            <div>
                              <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-1.5">
                                Portal Password
                              </label>
                              <input
                                type="password"
                                value={directorData.portalPassword}
                                onChange={(e) => {
                                  setDirectorDscDinData(prev => ({
                                    ...prev,
                                    [directorId]: { ...prev[directorId] || {
                                      dscFile: null,
                                      dinFile: null,
                                      dscFilePath: null,
                                      dinFilePath: null,
                                      portalEmail: '',
                                      portalPassword: '',
                                      hasCredentials: false,
                                      expiryDate: (() => {
                                        const now = new Date()
                                        const currentYear = now.getFullYear()
                                        const currentMonth = now.getMonth()
                                        const year = currentMonth >= 8 ? currentYear + 1 : currentYear
                                        return `${year}-09-30`
                                      })(),
                                      reminderEnabled: false
                                    }, portalPassword: e.target.value }
                                  }))
                                }}
                                placeholder="Enter password"
                                className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-xs sm:text-sm placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Expiry Date and Reminder Section */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-gray-800">
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-1.5">
                            Expiry Date
                          </label>
                          <input
                            type="date"
                            value={directorData.expiryDate}
                            onChange={(e) => {
                              setDirectorDscDinData(prev => ({
                                ...prev,
                                [directorId]: { ...prev[directorId] || {
                                  dscFile: null,
                                  dinFile: null,
                                  dscFilePath: null,
                                  dinFilePath: null,
                                  portalEmail: '',
                                  portalPassword: '',
                                  hasCredentials: false,
                                  expiryDate: (() => {
                                    const now = new Date()
                                    const currentYear = now.getFullYear()
                                    const currentMonth = now.getMonth()
                                    const year = currentMonth >= 8 ? currentYear + 1 : currentYear
                                    return `${year}-09-30`
                                  })(),
                                  reminderEnabled: false
                                }, expiryDate: e.target.value }
                              }))
                            }}
                            className="w-full px-3 py-2 bg-black border border-gray-700 rounded-lg text-white text-xs sm:text-sm focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                          />
                          <p className="text-[10px] sm:text-xs text-gray-500 mt-1">Default: September 30 (yearly)</p>
                        </div>
                        <div>
                          <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-1.5">
                            Reminder Settings
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer mt-2">
                            <input
                              type="checkbox"
                              checked={directorData.reminderEnabled}
                              onChange={(e) => {
                                setDirectorDscDinData(prev => ({
                                  ...prev,
                                  [directorId]: { ...prev[directorId] || {
                                    dscFile: null,
                                    dinFile: null,
                                    dscFilePath: null,
                                    dinFilePath: null,
                                    portalEmail: '',
                                    portalPassword: '',
                                    hasCredentials: false,
                                    expiryDate: (() => {
                                      const now = new Date()
                                      const currentYear = now.getFullYear()
                                      const currentMonth = now.getMonth()
                                      const year = currentMonth >= 8 ? currentYear + 1 : currentYear
                                      return `${year}-09-30`
                                    })(),
                                    reminderEnabled: false
                                  }, reminderEnabled: e.target.checked }
                                }))
                              }}
                              className="w-4 h-4 text-white bg-gray-800 border-gray-600 rounded focus:ring-white/40 focus:ring-2"
                            />
                            <span className="text-xs sm:text-sm text-gray-300">Enable reminder 1 month before expiry</span>
                          </label>
                        </div>
                      </div>

                      {/* Save Button */}
                      <div className="pt-4 border-t border-gray-800">
                        <button
                          onClick={async () => {
                            // In a real implementation, this would save to the database
                            showToast('DSC/DIN data saved successfully for ' + directorName, 'success')
                          }}
                          className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors font-medium text-sm sm:text-base"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="bg-black border border-gray-800 rounded-xl p-8 sm:p-12 text-center">
                <svg className="w-12 h-12 sm:w-16 sm:h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <p className="text-gray-400 text-sm sm:text-base mb-2">No directors found</p>
                <p className="text-gray-500 text-xs sm:text-sm">Directors will appear here once they are added to the company.</p>
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
                  onClick={() => setIsBulkUploadModalOpen(true)}
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
                </button>
                <button
                  onClick={() => setIsUploadModalOpen(true)}
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
                  <option value="expiring">Expiring Soon (≤30 days)</option>
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

            {/* Expand/Collapse All Controls */}
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="text-sm text-gray-400">
                {documentFolders.length} folders • {expandedFolders.size} expanded
                {expandedDocumentVersions.size > 0 && ` • ${expandedDocumentVersions.size} document versions shown`}
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
                {documentFolders.map((folderName) => {
                  const filteredVaultDocs = (vaultDocuments || []).filter(doc => {
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

                  // Use new version grouping system
                  const versionGroups = groupDocumentsByVersion(uploadedDocs)

                  // Combine predefined and uploaded docs
                  const folderDocs: any[] = []

                  predefinedNames.forEach((name: string) => {
                    const versionGroup = versionGroups.find(g => g.documentType === name)
                    if (!versionGroup) {
                      // No uploaded version, show as pending
                      folderDocs.push({ document_type: name, status: 'pending', id: `pending-${name}`, folder_name: folderName })
                    } else {
                      // Create version group document
                      folderDocs.push({
                        ...versionGroup.latestVersion,
                        status: 'uploaded',
                        versionGroup: versionGroup,
                        isVersionGroup: true,
                        folder_name: folderName
                      })
                    }
                  })

                  // Add any uploaded docs that aren't in the predefined list
                  versionGroups.forEach(group => {
                    if (!predefinedNames.includes(group.documentType)) {
                      folderDocs.push({
                        ...group.latestVersion,
                        status: 'uploaded',
                        versionGroup: group,
                        isVersionGroup: true,
                        folder_name: folderName
                      })
                    }
                  })

                  // Apply search filter
                  let filteredFolderDocs = folderDocs
                  if (searchQuery.trim()) {
                    filteredFolderDocs = folderDocs.filter(doc => {
                      if (doc.status === 'pending') {
                        // For pending docs, search by document_type
                        return (doc.document_type || '').toLowerCase().includes(searchQuery.toLowerCase())
                      }
                      // For uploaded docs, use the matchesSearch helper
                      return matchesSearch(doc, searchQuery)
                    })
                  }

                  // Apply expiry filter
                  if (expiringSoonFilter !== 'all') {
                    filteredFolderDocs = filteredFolderDocs.filter(doc => {
                      if (doc.status === 'pending') return false // Pending docs don't have expiry
                      const docStatus = getDocumentStatus(doc)
                      if (expiringSoonFilter === 'expiring') {
                        return docStatus === 'expiring' || docStatus === 'expired'
                      } else if (expiringSoonFilter === 'expired') {
                        return docStatus === 'expired'
                      }
                      return true
                    })
                  }

                  // Apply sorting
                  if (sortOption === 'name-asc' || sortOption === 'name-desc') {
                    filteredFolderDocs.sort((a, b) => {
                      const nameA = (a.document_type || '').toLowerCase()
                      const nameB = (b.document_type || '').toLowerCase()
                      return sortOption === 'name-asc'
                        ? nameA.localeCompare(nameB)
                        : nameB.localeCompare(nameA)
                    })
                  } else if (sortOption === 'date-newest' || sortOption === 'date-oldest') {
                    filteredFolderDocs.sort((a, b) => {
                      const dateA = a.period_key || a.created_at || ''
                      const dateB = b.period_key || b.created_at || ''
                      if (!dateA && !dateB) return 0
                      if (!dateA) return 1
                      if (!dateB) return -1
                      return sortOption === 'date-newest'
                        ? dateB.localeCompare(dateA)
                        : dateA.localeCompare(dateB)
                    })
                  } else if (sortOption === 'expiry') {
                    filteredFolderDocs.sort((a, b) => {
                      const expiryA = a.expiry_date || ''
                      const expiryB = b.expiry_date || ''
                      if (!expiryA && !expiryB) return 0
                      if (!expiryA) return 1
                      if (!expiryB) return -1
                      return expiryA.localeCompare(expiryB)
                    })
                  } else {
                    // Default: Sort by period_key if available (newest first)
                    filteredFolderDocs.sort((a, b) => {
                      if (a.period_key && b.period_key) {
                        return b.period_key.localeCompare(a.period_key)
                      }
                      if (a.period_key) return -1
                      if (b.period_key) return 1
                      return 0
                    })
                  }

                  const iconColor = folderName === 'Constitutional Documents' ? 'bg-gray-500' :
                    folderName === 'Financials and licenses' ? 'bg-purple-500' :
                      folderName === 'Taxation & GST Compliance' ? 'bg-green-500' : 'bg-blue-500'

                  const isExpanded = expandedFolders.has(folderName)
                  const uploadedCount = filteredFolderDocs.filter((d: any) => d.status === 'uploaded').length
                  const pendingCount = filteredFolderDocs.filter((d: any) => d.status === 'pending').length

                  return (
                    <div key={folderName} className="bg-black border border-white/10 rounded-xl sm:rounded-2xl overflow-hidden">
                      {/* Folder Header - Clickable to expand/collapse */}
                      <button
                        onClick={() => {
                          setExpandedFolders(prev => {
                            const newSet = new Set(prev)
                            if (newSet.has(folderName)) {
                              newSet.delete(folderName)
                            } else {
                              newSet.add(folderName)
                            }
                            return newSet
                          })
                        }}
                        className="w-full flex items-center gap-2 sm:gap-3 p-4 sm:p-6 hover:bg-gray-900/50 transition-colors text-left"
                      >
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
                          <p className="text-gray-400 text-xs sm:text-sm">
                            {uploadedCount} uploaded
                            {pendingCount > 0 && ` • ${pendingCount} pending`}
                            {searchQuery && filteredFolderDocs.length !== folderDocs.length && (
                              <span className="ml-2 text-gray-500">
                                ({filteredFolderDocs.length} of {folderDocs.length} shown)
                              </span>
                            )}
                          </p>
                        </div>
                        <svg
                          className={`w-5 h-5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>

                      {/* Folder Content - Collapsible */}
                      {isExpanded && (
                        <div className="px-4 sm:px-6 pb-4 sm:pb-6">
                          <div className="space-y-1.5 sm:space-y-2">
                            {isLoadingVaultDocuments ? (
                              // Skeleton loaders
                              Array.from({ length: 3 }).map((_, idx) => (
                                <div key={`skeleton-${idx}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border border-gray-800 bg-gray-900 animate-pulse">
                                  <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                    <div className="w-4 h-4 sm:w-5 sm:h-5 bg-gray-700 rounded flex-shrink-0"></div>
                                    <div className="min-w-0 flex-1 space-y-2">
                                      <div className="h-4 bg-gray-700 rounded w-3/4"></div>
                                      <div className="h-3 bg-gray-800 rounded w-1/2"></div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <div className="h-8 bg-gray-700 rounded w-16"></div>
                                    <div className="h-8 bg-gray-700 rounded w-16"></div>
                                  </div>
                                </div>
                              ))
                            ) : filteredFolderDocs.length > 0 ? filteredFolderDocs.map((doc: any) => {
                              // Handle version groups with tree structure
                              if (doc.isVersionGroup && doc.versionGroup) {
                                const versionGroup = doc.versionGroup as VersionGroup
                                const docKey = `${folderName}-${doc.document_type}`
                                const isVersionsExpanded = expandedDocumentVersions.has(docKey)
                                const latestVersion = versionGroup.latestVersion
                                const latestDocStatus = getDocumentStatus(latestVersion)

                                return (
                                  <div key={docKey} className="space-y-2">
                                    {/* Parent Document Card - Latest Version Preview */}
                                    <div className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-3 sm:p-4 rounded-lg border transition-colors ${latestDocStatus === 'expired'
                                        ? 'bg-red-900/20 border-red-500/30 hover:border-red-500/50'
                                        : latestDocStatus === 'expiring'
                                          ? 'bg-yellow-900/20 border-yellow-500/30 hover:border-yellow-500/50'
                                          : 'bg-gray-900 border-gray-800 hover:border-white/40/50'
                                      }`}>
                                      <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                        <div className={`flex-shrink-0 mt-0.5 sm:mt-0 ${latestDocStatus === 'expired' ? 'text-red-400' :
                                            latestDocStatus === 'expiring' ? 'text-yellow-400' :
                                              latestDocStatus === 'valid' ? 'text-green-400' :
                                                'text-gray-400'
                                          }`}>
                                          {getFileTypeIcon(latestVersion.file_name || latestVersion.document_type)}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                          <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm sm:text-base break-words font-medium text-white">
                                              {latestVersion.document_type}
                                            </span>
                                            <span className="px-2 py-0.5 text-xs rounded-full border bg-green-500/20 text-green-400 border-green-500/30 font-medium">
                                              Latest
                                            </span>
                                            <span className="px-1.5 py-0.5 text-xs rounded bg-gray-800 text-gray-400">
                                              {versionGroup.totalVersions} version{versionGroup.totalVersions !== 1 ? 's' : ''}
                                            </span>
                                            {formatPeriodInfo(latestVersion) && (
                                              <span className={`px-1.5 py-0.5 text-xs rounded border ${getPeriodBadgeColor(latestVersion.period_type)}`}>
                                                {formatPeriodInfo(latestVersion)}
                                              </span>
                                            )}
                                            {latestDocStatus && (
                                              <span className={`px-1.5 py-0.5 text-xs rounded border font-medium ${getStatusBadgeColor(latestDocStatus)}`}>
                                                {latestDocStatus === 'expired' ? 'Expired' :
                                                  latestDocStatus === 'expiring' ? 'Expiring' :
                                                    latestDocStatus === 'valid' ? 'Valid' : 'No Expiry'}
                                              </span>
                                            )}
                                          </div>
                                          <div className="text-xs mt-1 flex items-center gap-3 text-gray-500">
                                            {latestVersion.created_at && (
                                              <span>Uploaded {formatRelativeTime(latestVersion.created_at)}</span>
                                            )}
                                            {latestVersion.file_size && (
                                              <span>{formatFileSize(latestVersion.file_size)}</span>
                                            )}
                                            {latestVersion.expiry_date && (
                                              <span>Expires: {formatDateForDisplay(latestVersion.expiry_date)}</span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                        <button
                                          onClick={() => handlePreview(latestVersion)}
                                          className="text-white hover:text-white/80 font-medium text-xs sm:text-sm border border-white/40/30 px-2 sm:px-3 py-1 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0 flex items-center gap-1"
                                          title="Preview document"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                          </svg>
                                          Preview
                                        </button>
                                        <button
                                          onClick={() => handleView(latestVersion.file_path)}
                                          className="text-white hover:text-white/80 font-medium text-xs sm:text-sm border border-white/40/30 px-2 sm:px-3 py-1 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
                                        >
                                          View
                                        </button>
                                        <button
                                          onClick={() => handleExport(latestVersion.file_path, latestVersion.file_name)}
                                          className="text-white hover:text-white/80 font-medium text-xs sm:text-sm border border-white/40/30 px-2 sm:px-3 py-1 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
                                        >
                                          Export
                                        </button>
                                        <button
                                          onClick={() => {
                                            setExpandedDocumentVersions(prev => {
                                              const newSet = new Set(prev)
                                              if (newSet.has(docKey)) {
                                                newSet.delete(docKey)
                                              } else {
                                                newSet.add(docKey)
                                              }
                                              return newSet
                                            })
                                          }}
                                          className="text-gray-400 hover:text-white font-medium text-xs sm:text-sm border border-gray-700 px-2 sm:px-3 py-1 rounded-lg hover:bg-gray-800 transition-colors flex-shrink-0 flex items-center gap-1"
                                        >
                                          <svg className={`w-3 h-3 transition-transform ${isVersionsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                          </svg>
                                          Versions
                                        </button>
                                      </div>
                                    </div>

                                    {/* Collapsible Yearly Versions Section */}
                                    {isVersionsExpanded && (
                                      <div className="ml-4 sm:ml-6 pl-4 sm:pl-6 border-l-2 border-gray-800 space-y-2">
                                        {Array.from(versionGroup.yearlyVersions.entries())
                                          .sort(([fyA], [fyB]) => {
                                            // Sort years: newest first, "Other" last
                                            if (fyA === 'Other') return 1
                                            if (fyB === 'Other') return -1
                                            return fyB.localeCompare(fyA)
                                          })
                                          .map(([financialYear, versions]) => {
                                            const yearKey = `${docKey}-${financialYear}`
                                            const isYearExpanded = expandedYearGroups[docKey]?.has(financialYear) ?? false
                                            const latestInYear = versions[0] // Already sorted newest first

                                            return (
                                              <div key={yearKey} className="space-y-1.5">
                                                {/* Year Group Header */}
                                                <button
                                                  onClick={() => {
                                                    setExpandedYearGroups(prev => {
                                                      const docGroups = prev[docKey] || new Set()
                                                      const newSet = new Set(docGroups)
                                                      if (newSet.has(financialYear)) {
                                                        newSet.delete(financialYear)
                                                      } else {
                                                        newSet.add(financialYear)
                                                      }
                                                      return { ...prev, [docKey]: newSet }
                                                    })
                                                  }}
                                                  className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-gray-900/50 transition-colors text-left"
                                                >
                                                  <div className="flex items-center gap-2">
                                                    <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                                    </svg>
                                                    <span className="text-sm font-medium text-gray-300">{financialYear}</span>
                                                    <span className="text-xs text-gray-500">({versions.length} version{versions.length !== 1 ? 's' : ''})</span>
                                                  </div>
                                                  <svg className={`w-4 h-4 text-gray-500 transition-transform ${isYearExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                                  </svg>
                                                </button>

                                                {/* Versions in Year - Collapsible */}
                                                {isYearExpanded && (
                                                  <div className="ml-2 space-y-1.5">
                                                    {versions.map((version: any, idx: number) => {
                                                      const versionStatus = getDocumentStatus(version)
                                                      const isLatestInYear = idx === 0

                                                      return (
                                                        <div
                                                          key={version.id}
                                                          className={`flex items-center justify-between gap-2 p-2 rounded-lg border transition-colors ${isLatestInYear
                                                              ? 'bg-gray-900/50 border-gray-700'
                                                              : 'bg-gray-900/30 border-gray-800/50'
                                                            }`}
                                                        >
                                                          <div className="flex items-center gap-2 min-w-0 flex-1">
                                                            {/* Timeline connector */}
                                                            <div className="flex flex-col items-center">
                                                              <div className={`w-2 h-2 rounded-full ${isLatestInYear ? 'bg-green-400' : 'bg-gray-600'
                                                                }`}></div>
                                                              {idx < versions.length - 1 && (
                                                                <div className="w-0.5 h-4 bg-gray-700 mt-0.5"></div>
                                                              )}
                                                            </div>

                                                            <div className="min-w-0 flex-1">
                                                              <div className="flex items-center gap-2 flex-wrap">
                                                                <span className="text-xs text-gray-400">v{versions.length - idx}</span>
                                                                {isLatestInYear && (
                                                                  <span className="px-1.5 py-0.5 text-xs rounded border bg-blue-500/20 text-blue-400 border-blue-500/30">
                                                                    Latest in {financialYear}
                                                                  </span>
                                                                )}
                                                                {formatPeriodInfo(version) && (
                                                                  <span className={`px-1.5 py-0.5 text-xs rounded border ${getPeriodBadgeColor(version.period_type)}`}>
                                                                    {formatPeriodInfo(version)}
                                                                  </span>
                                                                )}
                                                                {versionStatus && (
                                                                  <span className={`px-1.5 py-0.5 text-xs rounded border font-medium ${getStatusBadgeColor(versionStatus)}`}>
                                                                    {versionStatus === 'expired' ? 'Expired' :
                                                                      versionStatus === 'expiring' ? 'Expiring' :
                                                                        versionStatus === 'valid' ? 'Valid' : 'No Expiry'}
                                                                  </span>
                                                                )}
                                                              </div>
                                                              <div className="text-xs mt-0.5 text-gray-500 flex items-center gap-2">
                                                                {version.created_at && (
                                                                  <span>{formatRelativeTime(version.created_at)}</span>
                                                                )}
                                                                {version.file_size && (
                                                                  <span>• {formatFileSize(version.file_size)}</span>
                                                                )}
                                                              </div>
                                                            </div>
                                                          </div>
                                                          <div className="flex items-center gap-1 flex-shrink-0">
                                                            <button
                                                              onClick={() => handlePreview(version)}
                                                              className="text-gray-400 hover:text-white p-1.5 rounded hover:bg-gray-800 transition-colors"
                                                              title="Preview"
                                                            >
                                                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                              </svg>
                                                            </button>
                                                            <button
                                                              onClick={() => handleView(version.file_path)}
                                                              className="text-gray-400 hover:text-white p-1.5 rounded hover:bg-gray-800 transition-colors"
                                                              title="View"
                                                            >
                                                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                                              </svg>
                                                            </button>
                                                            <button
                                                              onClick={() => handleExport(version.file_path, version.file_name)}
                                                              className="text-gray-400 hover:text-white p-1.5 rounded hover:bg-gray-800 transition-colors"
                                                              title="Export"
                                                            >
                                                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                                              </svg>
                                                            </button>
                                                          </div>
                                                        </div>
                                                      )
                                                    })}
                                                  </div>
                                                )}
                                              </div>
                                            )
                                          })}
                                      </div>
                                    )}
                                  </div>
                                )
                              }

                              // Handle pending documents
                              if (doc.status === 'pending') {
                                return (
                                  <div key={doc.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border border-dashed bg-yellow-900/10 border-yellow-500/20">
                                    <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                      <svg
                                        width="16"
                                        height="16"
                                        className="sm:w-5 sm:h-5 flex-shrink-0 mt-0.5 sm:mt-0 text-yellow-500"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                      >
                                        <circle cx="12" cy="12" r="10" />
                                        <line x1="12" y1="8" x2="12" y2="12" />
                                        <line x1="12" y1="16" x2="12.01" y2="16" />
                                      </svg>
                                      <div className="min-w-0 flex-1">
                                        <span className="text-sm sm:text-base break-words font-medium text-yellow-400 italic">
                                          {doc.document_type} (Pending Upload)
                                        </span>
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <button
                                        onClick={async () => {
                                          if (!currentCompany) return
                                          
                                          const confirmed = window.confirm(
                                            `Are you sure you want to remove "${doc.document_type}" from this company's compliance vault? This will hide it from view but won't delete any uploaded documents.`
                                          )
                                          
                                          if (confirmed) {
                                            try {
                                              const result = await hideDocumentTemplateForCompany(
                                                currentCompany.id,
                                                doc.document_type,
                                                folderName
                                              )
                                              
                                              if (result.success) {
                                                // Update hidden templates set
                                                setHiddenTemplates(prev => {
                                                  const newSet = new Set(prev)
                                                  newSet.add(`${folderName}:${doc.document_type}`)
                                                  return newSet
                                                })
                                                showToast(`"${doc.document_type}" removed from vault`, 'success')
                                              } else {
                                                showToast(result.error || 'Failed to remove document', 'error')
                                              }
                                            } catch (error) {
                                              console.error('Error hiding template:', error)
                                              showToast('Failed to remove document', 'error')
                                            }
                                          }
                                        }}
                                        className="text-red-400 hover:text-red-300 font-medium text-xs sm:text-sm border border-red-500/40 px-3 sm:px-4 py-1.5 rounded-lg hover:bg-red-500/20 transition-colors w-full sm:w-auto flex items-center gap-1.5 justify-center"
                                        title="Remove this document type (not applicable for this company)"
                                      >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                        </svg>
                                        Remove
                                      </button>
                                    <button
                                      onClick={() => {
                                        setUploadFormData(prev => ({
                                          ...prev,
                                          folder: folderName,
                                          documentName: doc.document_type
                                        }))
                                        setIsUploadModalOpen(true)
                                      }}
                                      className="text-white hover:text-white font-medium text-xs sm:text-sm border border-white/40 px-3 sm:px-4 py-1.5 rounded-lg hover:bg-white/20 transition-colors w-full sm:w-auto"
                                    >
                                      Upload Now
                                    </button>
                                    </div>
                                  </div>
                                )
                              }

                              // Handle single version documents (no version group)
                              const docStatus = getDocumentStatus(doc)
                              return (
                                <div key={doc.id} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-2.5 sm:p-3 rounded-lg border transition-colors ${docStatus === 'expired'
                                    ? 'bg-red-900/20 border-red-500/30 hover:border-red-500/50'
                                    : docStatus === 'expiring'
                                      ? 'bg-yellow-900/20 border-yellow-500/30 hover:border-yellow-500/50'
                                      : 'bg-gray-900 border-gray-800 hover:border-white/40/50'
                                  }`}>
                                  <div className="flex items-start sm:items-center gap-2 sm:gap-3 min-w-0 flex-1">
                                    <div className={`flex-shrink-0 mt-0.5 sm:mt-0 ${docStatus === 'expired' ? 'text-red-400' :
                                        docStatus === 'expiring' ? 'text-yellow-400' :
                                          docStatus === 'valid' ? 'text-green-400' :
                                            'text-gray-400'
                                      }`}>
                                      {getFileTypeIcon(doc.file_name || doc.document_type)}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className={`text-sm break-words font-medium ${docStatus === 'expired' ? 'text-red-400' :
                                            docStatus === 'expiring' ? 'text-yellow-400' :
                                              'text-white'
                                          }`}>
                                          {doc.document_type}
                                        </span>
                                        {formatPeriodInfo(doc) && (
                                          <span className={`px-1.5 py-0.5 text-xs rounded border ${getPeriodBadgeColor(doc.period_type)}`}>
                                            {formatPeriodInfo(doc)}
                                          </span>
                                        )}
                                        {docStatus && (
                                          <span className={`px-1.5 py-0.5 text-xs rounded border font-medium ${getStatusBadgeColor(docStatus)}`}>
                                            {docStatus === 'expired' ? 'Expired' :
                                              docStatus === 'expiring' ? 'Expiring' :
                                                docStatus === 'valid' ? 'Valid' : 'No Expiry'}
                                          </span>
                                        )}
                                      </div>
                                      <div className={`text-xs mt-0.5 break-words flex items-center gap-2 flex-wrap ${docStatus === 'expired' ? 'text-red-400/80' :
                                          docStatus === 'expiring' ? 'text-yellow-400/80' :
                                            'text-gray-500'
                                        }`}>
                                        {doc.created_at && (
                                          <span>Uploaded {formatRelativeTime(doc.created_at)}</span>
                                        )}
                                        {doc.file_size && (
                                          <span>• {formatFileSize(doc.file_size)}</span>
                                        )}
                                        {doc.expiry_date && (
                                          <span>• Expires: {formatDateForDisplay(doc.expiry_date)}</span>
                                        )}
                                        {doc.requirement_id && (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              router.push(`/data-room?tab=tracker&requirement_id=${doc.requirement_id}`)
                                            }}
                                            className="text-blue-400 hover:text-blue-300 underline flex items-center gap-1"
                                          >
                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                                            </svg>
                                            Tracker
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                                    <button
                                      onClick={() => handlePreview(doc)}
                                      className="text-white hover:text-white/80 font-medium text-xs sm:text-sm border border-white/40/30 px-2 sm:px-3 py-1 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0 flex items-center gap-1"
                                      title="Preview document"
                                    >
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                      </svg>
                                      Preview
                                    </button>
                                    <button
                                      onClick={() => handleView(doc.file_path)}
                                      className="text-white hover:text-white/80 font-medium text-xs sm:text-sm border border-white/40/30 px-2 sm:px-3 py-1 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
                                    >
                                      View
                                    </button>
                                    <button
                                      onClick={() => handleExport(doc.file_path, doc.file_name)}
                                      className="text-white hover:text-white/80 font-medium text-xs sm:text-sm border border-white/40/30 px-2 sm:px-3 py-1 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
                                    >
                                      Export
                                    </button>
                                    <button
                                      onClick={() => handleRemove(doc.id, doc.file_path)}
                                      className="text-red-400 hover:text-red-300 font-medium text-xs sm:text-sm border border-red-500/30 px-2 sm:px-3 py-1 rounded-lg hover:bg-red-500/10 transition-colors flex-shrink-0"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                              )
                            }) : (
                              <div className="p-6 sm:p-8 text-center bg-gray-900/50 rounded-lg border border-dashed border-gray-800">
                                <p className="text-gray-500 text-xs sm:text-sm">No documents defined for this folder.</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
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
                                                • {authority.split('(')[0].trim()}
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

                      {/* Document Name */}
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                          Document Name <span className="text-red-500">*</span>
                        </label>
                        <div className="relative">
                          <input
                            type="text"
                            value={uploadFormData.documentName}
                            onChange={(e) => {
                              setUploadFormData((prev) => ({ ...prev, documentName: e.target.value }))
                            }}
                            placeholder="Enter document name"
                            className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                          />
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
                                  setUploadFormData((prev) => ({ ...prev, frequency: e.target.value }))
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
                                              [fileKey]: { ...prev[fileKey], frequency: e.target.value }
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
                              showToast('Please select a folder and at least one file.', 'warning')
                              return
                            }

                            // Validate that all files have document names
                            const filesWithoutNames = bulkUploadFiles.filter(file => {
                              const fileOptions = bulkUploadFileOptions[file.name]
                              return !fileOptions || !fileOptions.documentName || fileOptions.documentName.trim() === ''
                            })

                            if (filesWithoutNames.length > 0) {
                              showToast(`Please provide document names for all files. ${filesWithoutNames.length} file(s) missing document name.`, 'warning')
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

                                  // Upload to Storage
                                  const { error: uploadError } = await supabase.storage
                                    .from('company-documents')
                                    .upload(filePath, file)

                                  if (uploadError) throw uploadError

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
                                } catch (error: any) {
                                  console.error(`Error uploading ${file.name}:`, error)
                                  failCount++
                                }

                                setBulkUploadProgress({ current: i + 1, total: bulkUploadFiles.length })
                              }

                              await fetchVaultDocuments()

                              if (successCount > 0) {
                                showToast(`Successfully uploaded ${successCount} file(s)${failCount > 0 ? `. ${failCount} failed.` : ''}`, successCount === bulkUploadFiles.length ? 'success' : 'warning')
                              } else {
                                showToast('Failed to upload files. Please try again.', 'error')
                              }

                              setIsBulkUploadModalOpen(false)
                              setBulkUploadFiles([])
                              setBulkUploadProgress({ current: 0, total: 0 })
                              setBulkUploadFileOptions({})
                              setExpandedBulkFileOptions(new Set())
                              setOpenDocumentNameDropdown(null)
                            } catch (error: any) {
                              console.error('Bulk upload failed:', error)
                              showToast('Bulk upload failed: ' + error.message, 'error')
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
                                  showToast('No documents found to export. Please check your selection and financial year filter.', 'warning')
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
                                    showToast(`Downloaded ${successCount} file(s) successfully. ${failCount} file(s) failed.`, 'warning')
                                  } else {
                                    showToast(`Successfully downloaded ${successCount} file(s)`, 'success')
                                  }
                                } else {
                                  showToast('Failed to download files. Please try again or check your browser settings.', 'error')
                                }

                                setIsExportModalOpen(false)
                                setSelectedDocuments(new Set())
                              } catch (error: any) {
                                console.error('Export failed:', error)
                                showToast('Export failed: ' + (error.message || 'Unknown error'), 'error')
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
                          value={emailData.content}
                          onChange={(e) =>
                            setEmailData((prev) => ({ ...prev, content: e.target.value }))
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
                              content: 'Please find the attached documents from our Compliance Vault.',
                            })
                          }}
                          className="px-6 py-3 bg-transparent border border-white/20 text-white rounded-lg hover:border-white/40 hover:text-white transition-colors"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={async () => {
                            if (!emailData.recipients.trim() || !emailData.subject.trim() || !emailData.content.trim()) {
                              return
                            }
                            if (!currentCompany) {
                              showToast('No company selected', 'error')
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
                                showToast('Please enter valid email addresses', 'warning')
                                return
                              }

                              const result = await sendDocumentsEmail({
                                companyId: currentCompany.id,
                                companyName: currentCompany.name,
                                documentIds: Array.from(selectedDocumentsToSend),
                                recipients,
                                subject: emailData.subject,
                                message: emailData.content,
                              })

                              if (result.success) {
                                showToast(result.message || 'Documents sent successfully!', 'success')
                                setIsEmailTemplateOpen(false)
                                setSelectedDocumentsToSend(new Set())
                                setEmailData({
                                  recipients: '',
                                  subject: 'Document Sharing - Compliance Vault',
                                  content: 'Please find the attached documents from our Compliance Vault.',
                                })
                              } else {
                                showToast('Failed to send: ' + (result.error || 'Unknown error'), 'error')
                              }
                            } catch (error: any) {
                              console.error('Error sending documents:', error)
                              showToast('Error sending documents: ' + error.message, 'error')
                            } finally {
                              setIsSendingEmail(false)
                            }
                          }}
                          disabled={
                            isSendingEmail ||
                            !emailData.recipients.trim() ||
                            !emailData.subject.trim() ||
                            !emailData.content.trim()
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
          </div>
        )}
      </div>
      {/* Document Upload Modal from Tracker - Enhanced */}
      {documentUploadModal && (
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
                    if (!uploadingDocument) {
                      setDocumentUploadModal(null)
                      setUploadFile(null)
                      setUploadProgress(0)
                      setUploadStage('')
                      setPreviewFileUrl(null)
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
                  {(() => {
                    // Get relevant forms for this category (country-aware)
                    const categoryForms = countryConfig?.regulatory?.commonForms?.filter(form => {
                      const formLower = form.toLowerCase()
                      const categoryLower = documentUploadModal.category.toLowerCase()

                      if (countryCode === 'IN') {
                        // India-specific patterns
                        if (categoryLower === 'gst' && (formLower.includes('gstr') || formLower.includes('gst') || formLower.includes('cmp') || formLower.includes('itc') || formLower.includes('iff'))) return true
                        if (categoryLower === 'income tax' && (formLower.includes('itr') || formLower.includes('form 24') || formLower.includes('form 26') || formLower.includes('form 27'))) return true
                        if ((categoryLower === 'roc' || categoryLower === 'mca') && (formLower.includes('mgt') || formLower.includes('aoc') || formLower.includes('dir') || formLower.includes('pas') || formLower.includes('ben') || formLower.includes('inc') || formLower.includes('adt') || formLower.includes('cra') || formLower.includes('llp'))) return true
                        if ((categoryLower === 'payroll' || categoryLower === 'labour law') && (formLower.includes('ecr') || formLower.includes('form 5a') || formLower.includes('form 2') || formLower.includes('form 10') || formLower.includes('form 19'))) return true
                      } else if (['AE', 'SA', 'OM', 'QA', 'BH'].includes(countryCode || '')) {
                        // GCC countries
                        if ((categoryLower === 'vat' || categoryLower === 'tax') && (formLower.includes('vat') || formLower.includes('tax return') || formLower.includes('corporate tax') || formLower.includes('zakat'))) return true
                        if (categoryLower === 'corporate' && (formLower.includes('trade license') || formLower.includes('commercial registration') || formLower.includes('cr'))) return true
                      } else if (countryCode === 'US') {
                        // USA
                        if ((categoryLower === 'federal tax' || categoryLower === 'state tax') && (formLower.includes('tax') || formLower.includes('return') || formLower.includes('ein'))) return true
                        if (categoryLower === 'business license' && (formLower.includes('license') || formLower.includes('registration') || formLower.includes('report'))) return true
                      }

                      return false
                    }) || []

                    const formFrequency = countryConfig?.regulatory?.formFrequencies

                    if (categoryForms.length > 0) {
                      return (
                        <div className="mt-3 pt-3 border-t border-gray-700">
                          <label className="block text-xs font-medium text-gray-400 mb-2">Relevant Forms for {documentUploadModal.category}</label>
                          <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                            {categoryForms.slice(0, 10).map((form) => (
                              <div key={form} className="px-2 py-1 bg-gray-800 rounded text-xs">
                                <div className="text-white">{form}</div>
                                {formFrequency?.[form] && (
                                  <div className={`text-[10px] mt-0.5 ${formFrequency[form] === 'monthly' ? 'text-blue-400' :
                                      formFrequency[form] === 'quarterly' ? 'text-purple-400' :
                                        formFrequency[form] === 'annual' ? 'text-green-400' :
                                          'text-gray-400'
                                    }`}>
                                    {formFrequency[form].toUpperCase()}
                                  </div>
                                )}
                              </div>
                            ))}
                            {categoryForms.length > 10 && (
                              <div className="px-2 py-1 bg-gray-800 rounded text-xs text-gray-400">
                                +{categoryForms.length - 10} more
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    }
                    return null
                  })()}
                </div>
              </div>

              {/* File Upload Area with Drag & Drop */}
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
                    if (file && (file.type.startsWith('image/') || file.type === 'application/pdf' || file.name.endsWith('.doc') || file.name.endsWith('.docx'))) {
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
                          if (file) {
                            setUploadFile(file)
                          }
                        }}
                        className="hidden"
                        id="file-upload-input"
                      />
                      <label
                        htmlFor="file-upload-input"
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
                        <button
                          onClick={() => setUploadFile(null)}
                          disabled={uploadingDocument}
                          className="text-gray-400 hover:text-red-400 transition-colors disabled:opacity-50 ml-2"
                        >
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>

                      {/* File Preview */}
                      {previewFileUrl && (
                        <div className="mt-3 border border-gray-700 rounded-lg overflow-hidden bg-gray-900">
                          {uploadFile.type.startsWith('image/') ? (
                            <img
                              src={previewFileUrl}
                              alt="Preview"
                              className="w-full max-h-48 object-contain"
                            />
                          ) : uploadFile.type === 'application/pdf' ? (
                            <div className="p-4 text-center">
                              <svg className="w-16 h-16 mx-auto text-red-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                              <p className="text-gray-400 text-sm">PDF Preview not available</p>
                              <p className="text-gray-500 text-xs mt-1">File will be uploaded as-is</p>
                            </div>
                          ) : (
                            <div className="p-4 text-center">
                              <svg className="w-16 h-16 mx-auto text-blue-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                              </svg>
                              <p className="text-gray-400 text-sm">{uploadFile.name}</p>
                              <p className="text-gray-500 text-xs mt-1">Document file</p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Upload Progress */}
              {uploadingDocument && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{uploadStage}</span>
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

              {/* Upload History */}
              {requirementUploadHistory.length > 0 && !uploadingDocument && (
                <div className="border-t border-gray-800 pt-4">
                  <h4 className="text-sm font-medium text-gray-300 mb-3">Previous Uploads</h4>
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {requirementUploadHistory.slice(0, 5).map((doc: any, idx: number) => (
                      <div key={doc.id || idx} className="flex items-center justify-between p-2 bg-gray-900/50 rounded border border-gray-800">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                          <div className="min-w-0 flex-1">
                            <p className="text-white text-sm truncate">{doc.file_name || doc.document_type}</p>
                            <p className="text-gray-500 text-xs">
                              {doc.created_at ? formatRelativeTime(doc.created_at) : 'Unknown date'}
                            </p>
                          </div>
                        </div>
                        {doc.file_path && (
                          <button
                            onClick={() => handlePreview(doc)}
                            className="text-blue-400 hover:text-blue-300 p-1.5 rounded hover:bg-blue-500/20 transition-colors"
                            title="Preview"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {requirementUploadHistory.length > 5 && (
                    <p className="text-gray-500 text-xs mt-2 text-center">
                      Showing 5 of {requirementUploadHistory.length} previous uploads
                    </p>
                  )}
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-4 border-t border-gray-800 flex justify-end gap-3">
                <button
                  onClick={() => {
                    if (!uploadingDocument) {
                      setDocumentUploadModal(null)
                      setUploadFile(null)
                      setUploadProgress(0)
                      setUploadStage('')
                      setPreviewFileUrl(null)
                    }
                  }}
                  disabled={uploadingDocument}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleTrackerDocumentUpload}
                  disabled={!uploadFile || uploadingDocument}
                  className="px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-medium"
                >
                  {uploadingDocument ? (
                    <>
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                      {uploadStage || 'Uploading...'}
                    </>
                  ) : uploadProgress === 100 ? (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Success!
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

      {/* Bulk Action Modal */}
      {isBulkActionModalOpen && bulkActionType && (
        <>
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            onClick={() => {
              setIsBulkActionModalOpen(false)
              setBulkActionType(null)
            }}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/10">
                <h3 className="text-xl font-light text-white">
                  {bulkActionType === 'status' ? 'Update Status' : 'Delete Requirements'}
                </h3>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-gray-300">
                  {bulkActionType === 'status'
                    ? `Update status for ${selectedRequirements.size} requirement(s)?`
                    : `Are you sure you want to delete ${selectedRequirements.size} requirement(s)? This action cannot be undone.`}
                </p>
                {bulkActionType === 'status' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-2">New Status</label>
                    <select
                      id="bulkStatusSelect"
                      className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-white/40"
                    >
                      <option value="not_started">Not Started</option>
                      <option value="upcoming">Upcoming</option>
                      <option value="pending">Pending</option>
                      <option value="overdue">Overdue</option>
                      <option value="completed">Completed</option>
                    </select>
                  </div>
                )}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-800">
                  <button
                    onClick={() => {
                      setIsBulkActionModalOpen(false)
                      setBulkActionType(null)
                    }}
                    className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      if (!currentCompany) return

                      if (bulkActionType === 'status') {
                        const statusSelect = document.getElementById('bulkStatusSelect') as HTMLSelectElement
                        const newStatus = statusSelect.value as 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed'

                        try {
                          let successCount = 0
                          let failCount = 0

                          for (const reqId of selectedRequirements) {
                            const result = await updateRequirementStatus(reqId, currentCompany.id, newStatus)
                            if (result.success) {
                              successCount++
                            } else {
                              failCount++
                            }
                          }

                          if (successCount > 0) {
                            showToast(`Updated ${successCount} requirement(s)`, 'success')
                            const refreshResult = await getRegulatoryRequirements(currentCompany.id)
                            if (refreshResult.success && refreshResult.requirements) {
                              setRegulatoryRequirements(refreshResult.requirements)
                            }
                          }
                          if (failCount > 0) {
                            showToast(`Failed to update ${failCount} requirement(s)`, 'error')
                          }

                          setSelectedRequirements(new Set())
                          setIsBulkActionModalOpen(false)
                          setBulkActionType(null)
                        } catch (error: any) {
                          showToast(`Error: ${error.message}`, 'error')
                        }
                      } else if (bulkActionType === 'delete') {
                        if (!confirm(`Are you absolutely sure you want to delete ${selectedRequirements.size} requirement(s)? This cannot be undone.`)) {
                          return
                        }

                        try {
                          let successCount = 0
                          let failCount = 0

                          for (const reqId of selectedRequirements) {
                            const result = await deleteRequirement(reqId, currentCompany.id)
                            if (result.success) {
                              successCount++
                            } else {
                              failCount++
                            }
                          }

                          if (successCount > 0) {
                            showToast(`Deleted ${successCount} requirement(s)`, 'success')
                            const refreshResult = await getRegulatoryRequirements(currentCompany.id)
                            if (refreshResult.success && refreshResult.requirements) {
                              setRegulatoryRequirements(refreshResult.requirements)
                            }
                          }
                          if (failCount > 0) {
                            showToast(`Failed to delete ${failCount} requirement(s)`, 'error')
                          }

                          setSelectedRequirements(new Set())
                          setIsBulkActionModalOpen(false)
                          setBulkActionType(null)
                        } catch (error: any) {
                          showToast(`Error: ${error.message}`, 'error')
                        }
                      }
                    }}
                    className={`px-4 py-2 rounded-lg transition-colors ${bulkActionType === 'delete'
                        ? 'bg-red-500 text-white hover:bg-red-600'
                        : 'bg-white text-black hover:bg-gray-700'
                      }`}
                  >
                    {bulkActionType === 'status' ? 'Update' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Compliance Score Explanation Modal */}
      {isComplianceScoreModalOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            onClick={() => setIsComplianceScoreModalOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="bg-black border border-white/10 rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 border-b border-white/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-light text-white">Compliance Score Explained</h3>
                  <button
                    onClick={() => setIsComplianceScoreModalOpen(false)}
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
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                  <h4 className="text-white font-medium mb-2">How is the Compliance Score Calculated?</h4>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    The compliance score is calculated based on the status of all your compliance requirements:
                  </p>
                  <ul className="mt-3 space-y-2 text-sm text-gray-300">
                    <li className="flex items-start gap-2">
                      <span className="text-green-400 mt-1">✓</span>
                      <span><strong>Completed:</strong> +10 points per requirement</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-yellow-400 mt-1">⏳</span>
                      <span><strong>Pending:</strong> +5 points per requirement</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-blue-400 mt-1">○</span>
                      <span><strong>Upcoming:</strong> +2 points per requirement</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-gray-400 mt-1">○</span>
                      <span><strong>Not Started:</strong> 0 points</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-red-400 mt-1">!</span>
                      <span><strong>Overdue:</strong> -15 points per requirement</span>
                    </li>
                  </ul>
                </div>
                <div className="bg-gray-900 rounded-lg p-4 border border-gray-800">
                  <h4 className="text-white font-medium mb-2">Score Interpretation</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-green-500"></div>
                      <span className="text-gray-300"><strong>80-100:</strong> Excellent compliance health</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                      <span className="text-gray-300"><strong>60-79:</strong> Good, but room for improvement</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                      <span className="text-gray-300"><strong>40-59:</strong> Needs attention</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500"></div>
                      <span className="text-gray-300"><strong>Below 40:</strong> Critical - immediate action required</span>
                    </div>
                  </div>
                </div>
                <div className="pt-4 border-t border-white/10">
                  <button
                    onClick={() => setIsComplianceScoreModalOpen(false)}
                    className="w-full px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    Got it
                  </button>
                </div>
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
                    <h2 className="text-lg sm:text-xl font-light text-white truncate">{previewDocument.document_type}</h2>
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
                    {previewDocument.previewUrl && (
                      <iframe
                        src={previewDocument.previewUrl}
                        className="w-full h-full min-h-[500px] border border-gray-800 rounded-lg"
                        title="Document Preview"
                      />
                    )}
                  </div>
                ) : (
                  (() => {
                    const requirement = (previewDocument as any).requirement_id
                      ? (regulatoryRequirements || []).find((r: any) => r.id === (previewDocument as any).requirement_id)
                      : null

                    const folderName = previewDocument.folder_name
                    const documentName = previewDocument.document_type
                    const legalSections = getLegalSectionsForDocument(documentName, folderName)
                    const authority = getAuthorityForFolder(folderName)

                    return (
                      <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
                        {/* Related Requirement */}
                        {requirement && (
                          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                            <h4 className="text-white font-medium mb-3">Related Compliance Requirement</h4>
                            <div className="space-y-2">
                              <div className="text-white text-sm sm:text-base">{requirement.requirement}</div>
                              {requirement.description && (
                                <div className="text-gray-400 text-xs sm:text-sm">{requirement.description}</div>
                              )}
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2 py-1 rounded text-xs font-medium ${requirement.status === 'completed' ? 'bg-green-500/20 text-green-400' :
                                    requirement.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                                      requirement.status === 'overdue' ? 'bg-red-500/20 text-red-400' :
                                        'bg-gray-500/20 text-gray-400'
                                  }`}>
                                  {requirement.status.toUpperCase()}
                                </span>
                                {requirement.due_date && (
                                  <span className="text-gray-400 text-xs">
                                    Due: {requirement.due_date}
                                  </span>
                                )}
                              </div>
                              <button
                                onClick={() => {
                                  setIsPreviewModalOpen(false)
                                  setPreviewDocument(null)
                                  setPreviewModalTab('preview')
                                  setActiveTab('tracker')
                                  // Scroll to requirement in tracker could be added here
                                }}
                                className="text-blue-400 hover:text-blue-300 text-xs sm:text-sm flex items-center gap-1 transition-colors"
                              >
                                View in Tracker
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polyline points="9 18 15 12 9 6" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Legal Sections */}
                        {legalSections.length > 0 && (
                          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                            <h4 className="text-white font-medium mb-3">Legal References</h4>
                            <div className="space-y-3">
                              {legalSections.map((section, idx) => (
                                <div key={idx} className="border-l-2 border-blue-500/50 pl-3">
                                  <div className="text-white text-sm font-medium">{section.act} - {section.section}</div>
                                  <div className="text-gray-400 text-xs sm:text-sm mt-1">{section.description}</div>
                                  {section.relevance && (
                                    <div className="text-gray-500 text-xs mt-1 italic">Relevance: {section.relevance}</div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Authority */}
                        {authority && (
                          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-800">
                            <h4 className="text-white font-medium mb-2">Regulatory Authority</h4>
                            <p className="text-gray-300 text-sm">{authority}</p>
                          </div>
                        )}

                        {/* Show message if no compliance info */}
                        {!requirement && legalSections.length === 0 && !authority && (
                          <div className="text-center py-8">
                            <p className="text-gray-400 text-sm">No compliance information available for this document.</p>
                          </div>
                        )}
                      </div>
                    )
                  })()
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* Storage Breakdown Modal */}
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
                    {documentFolders.map((folder) => {
                      const folderDocs = vaultDocuments.filter(d => d.folder_name === folder)
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
                      .sort((a, b) => (b.file_size || 0) - (a.file_size || 0))
                      .slice(0, 5)
                      .map((doc) => (
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
                    <li>• Review expired documents for deletion</li>
                    <li>• Archive old financial year documents</li>
                    <li>• Remove duplicate files</li>
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

      <ToastContainer />
    </div>
  )
}

export default function DataRoomPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-primary-dark flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/40 border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <DataRoomPageInner />
    </Suspense>
  )
}



