'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { verifyCIN, verifyDIN, lookupGST, lookupCompanyByPerplexity, type CINDirectorData, type DINDirectorData } from '@/lib/api/cin-din'
import {
  detectEntity,
  mapEntitySubTypeToFormValue,
  mapIndustryToCategories
} from '@/lib/utils/entity-detection'
import { parseCIN, type ParsedCIN } from '@/utils/cin-parser'
import { parseGSTN, extractPANFromGSTN } from '@/lib/utils/gstn'
import { useAuth } from '@/hooks/useAuth'
import { useUserSubscription } from '@/hooks/useCompanyAccess'
import { completeOnboarding, uploadFileToStorage } from './actions'
import { showToast } from '@/components/ui/Toast'
import { INDUSTRIES } from '@/lib/compliance/csv-template'
import { useCountryConfig } from '@/hooks/useCountryConfig'
import { useCountryAPISupport } from '@/hooks/useCountryValidator'
import { useCountryValidator } from '@/hooks/useCountryValidator'
import CountrySelector from '@/components/features/CountrySelector'
import { ManualVerificationNotice } from '@/components/features/ManualVerificationNotice'
import { useRotatingLoadingMessage } from '@/hooks/useRotatingLoadingMessage'
import { CREATE_COMPANY_LOADING_MESSAGES } from '@/lib/ui/loading-messages'
import MagicalIntake, { type MagicalIntakePayload } from './MagicalIntake'

interface Director {
  id: string
  firstName: string
  lastName: string
  middleName: string
  din: string
  designation: string
  dob: string
  pan?: string
  email?: string
  mobile?: string
  verified: boolean
  source: 'cin' | 'din' | 'manual'
}

export default function OnboardingPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const { hasSubscription, isTrial, trialDaysRemaining, companyLimit, currentCompanyCount, canCreateCompany, tier, isLoading: subLoading } = useUserSubscription()
  
  // All hooks must be called before any conditional returns
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitStatusMessage = useRotatingLoadingMessage({
    active: isSubmitting,
    messages: CREATE_COMPANY_LOADING_MESSAGES,
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isVerifyingCIN, setIsVerifyingCIN] = useState(false)
  const [isVerifyingDIN, setIsVerifyingDIN] = useState<string | null>(null)
  const [directors, setDirectors] = useState<Director[]>([])
  const [newDirectorDIN, setNewDirectorDIN] = useState('')
  const [showAddDirector, setShowAddDirector] = useState(false)
  const [entityDetection, setEntityDetection] = useState<any>(null)
  const [isCINVerified, setIsCINVerified] = useState(false)
  const [isLookingUpGST, setIsLookingUpGST] = useState(false)
  const [currentStep, setCurrentStep] = useState(1) // 1 = Company Details, 2 = Documents
  const [exDirectors, setExDirectors] = useState<string>('') // Comma-separated or newline-separated names
  // PR-2.5: Magical CIN→PAN intake gate. Shown by default for India; for
  // non-India countries (no CIN concept) it auto-skips. Users can also
  // skip manually (sole-prop/partnership). Once skipped or completed,
  // the existing form renders unchanged so every legacy feature
  // (DIN-per-director verify, document upload step, ex-directors,
  // subscription gating) keeps working.
  const [showMagicalIntake, setShowMagicalIntake] = useState<boolean>(true)

  const [countryCode, setCountryCode] = useState<string>('IN')
  const { config: countryConfig } = useCountryConfig(countryCode)
  const hasAPISupport = useCountryAPISupport(countryCode)
  const countryValidator = useCountryValidator(countryCode)
  const dateInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState({
    companyName: '',
    companyType: '',
    panNumber: '',
    cinNumber: '',
    industries: [] as string[],
    address: '',
    city: '',
    state: '',
    pinCode: '',
    phoneNumber: '',
    email: '',
    landline: '',
    other: '',
    dateOfIncorporation: '',
    industryCategories: [] as string[],
    otherIndustryCategory: '',
    yearType: 'FY' as 'FY' | 'CY',
    countryCode: 'IN',
    documents: {} as Record<string, File | null>,
    // Compliance intelligence fields
    employeeCount: '',
    annualTurnover: '',
    isGstRegistered: false,
    gstNumber: '',
    // Multiple GSTINs — each row carries its own state (derived from the
    // first two digits of the GSTIN). "Within state" vs "outside state" is
    // computed at read time by comparing each row's state to formData.state.
    gstRegistrations: [] as Array<{ gstin: string; state: string }>,
    netWorth: '',
    isMsme: '',
    msmeCategory: '',
    hasImportsExports: false,
    isStartupDpiit: false,
    // CIN API fields (auto-populated)
    authorisedCapital: '',
    paidUpCapital: '',
    subscribedCapital: '',
    companyCategory: '',
    companySubcategory: '',
    classOfCompany: '',
    rocName: '',
    companyStatus: '',
    dateOfLastAgm: '',
    balanceSheetDate: '',
  })

  // Auto-parse CIN whenever cinNumber changes — drives the NIC classification card
  const parsedCIN = useMemo(() => {
    if (!formData.cinNumber || countryCode !== 'IN') return null
    const result = parseCIN(formData.cinNumber.trim())
    return result.isValid ? result : null
  }, [formData.cinNumber, countryCode])

  // Sole proprietorships and (general, non-LLP) partnerships in India
  // are not registered with MCA and have no CIN. Sole props are
  // identified solely by the proprietor's PAN; partnership firms by
  // their Registrar of Firms registration which lives outside the
  // MCA database. Don't force users to invent a fake CIN to onboard.
  const ENTITY_TYPES_WITHOUT_CIN = ['sole-proprietorship', 'partnership']
  const requiresCIN = !ENTITY_TYPES_WITHOUT_CIN.includes(formData.companyType)

  // When the user switches to an entity type that has no CIN, blank
  // out any previously-entered CIN. Prevents stale data being saved
  // (e.g. user typed a CIN, then realised it's a proprietorship and
  // changed the dropdown — the stale CIN would otherwise still hit
  // the server).
  useEffect(() => {
    if (!requiresCIN && formData.cinNumber) {
      setFormData((prev) => ({ ...prev, cinNumber: '' }))
      // Clear any stale CIN error from a previous validation pass.
      setErrors((prev) => ({ ...prev, cinNumber: '' }))
    }
  }, [requiresCIN, formData.cinNumber])

  // Redirect to login if not authenticated
  // Allow users to access onboarding even if they have companies (to create new companies)
  useEffect(() => {
    if (!loading && !user) {
      router.push('/')
      return
    }
    // Removed redirect for users with existing companies - they should be able to create new companies
  }, [user, loading, router])

  // Update yearType when country changes - MUST be before conditional returns
  useEffect(() => {
    setFormData((prev) => ({
      ...prev,
      yearType: countryConfig.financialYear.type,
      countryCode: countryCode,
    }))
  }, [countryCode, countryConfig])

  // PR-2.5: The magical intake gate is India-only (CIN doesn't exist
  // elsewhere). The moment a user picks a non-IN country, drop the gate
  // so they land directly on the existing manual form.
  useEffect(() => {
    if (countryCode !== 'IN') {
      setShowMagicalIntake(false)
    }
  }, [countryCode])

  // Show loading state while checking auth or subscription
  if (loading || subLoading) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-line/30 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Don't render if not authenticated (will redirect)
  if (!user) {
    return null
  }

  // Check if user needs to subscribe first (no subscription or trial at all)
  // Allow access if user has subscription OR trial
  const hasActiveAccess = hasSubscription || (isTrial && trialDaysRemaining > 0)

  if (!hasActiveAccess && currentCompanyCount === 0) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center px-4">
        <div className="bg-bg-card border border-line/10 rounded-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-bg-elevated/50 border border-line/15 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-light text-white mb-4">Subscription Required</h1>
          <p className="text-fg-muted mb-6 font-light">
            You need an active subscription or trial to create companies. Start with a free 15-day trial!
          </p>
          <button
            onClick={() => router.push('/subscribe')}
            className="w-full border border-line/15 text-fg-secondary px-6 py-3 rounded-lg font-light hover:border-line/30 hover:text-white transition-colors"
          >
            Choose a Plan
          </button>
        </div>
      </div>
    )
  }

  // Check if user has reached company limit (only check if they have active access)
  if (hasActiveAccess && !canCreateCompany) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center px-4">
        <div className="bg-bg-card border border-line/10 rounded-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-yellow-500/10 border border-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-light text-white mb-4">Company Limit Reached</h1>
          <p className="text-fg-muted mb-2 font-light">
            You've created <span className="text-white font-light">{currentCompanyCount}</span> of <span className="text-white font-light">{companyLimit}</span> companies allowed on your plan.
          </p>
          <p className="text-fg-muted text-sm mb-6 font-light">
            Upgrade to a higher plan to add more companies.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.push('/subscribe')}
              className="w-full border border-line/15 text-fg-secondary px-6 py-3 rounded-lg font-light hover:border-line/30 hover:text-white transition-colors"
            >
              Upgrade Plan
            </button>
            <button
              onClick={() => router.push('/data-room')}
              className="w-full border border-line/15 text-fg-secondary px-6 py-3 rounded-lg font-light hover:border-line/30 hover:text-white transition-colors"
            >
              Go to Data Room
            </button>
          </div>
        </div>
      </div>
    )
  }

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
  }

  // Handle country change
  const handleCountryChange = (newCountryCode: string) => {
    setCountryCode(newCountryCode)
    setFormData((prev) => ({
      ...prev,
      countryCode: newCountryCode,
      yearType: countryConfig.financialYear.type,
      // Reset CIN/DIN related fields if switching away from India
      ...(newCountryCode !== 'IN' && {
        cinNumber: '',
        panNumber: '',
      }),
    }))
  }

  const handleCINVerification = async () => {
    // Only allow CIN verification for India
    if (countryCode !== 'IN') {
      return
    }

    if (!formData.cinNumber.trim()) {
      setErrors((prev) => ({ ...prev, cinNumber: `Please enter ${countryConfig.labels.registrationId}` }))
      return
    }

    setIsVerifyingCIN(true)
    setErrors((prev) => ({ ...prev, cinNumber: '' }))

    // parsedCIN is auto-computed via useMemo — use it directly
    const parsed = parseCIN(formData.cinNumber.trim())

    // Try KYC API first
    let result = await verifyCIN(formData.cinNumber.trim())

    // Check if KYC API returned usable data
    let response = result.success ? result.data : null
    let companyData: any = response?.data?.data?.companyData || {}
    let directorData: any[] = response?.data?.data?.directorData || []
    let hasApiData = companyData && Object.keys(companyData).length > 0 && companyData.company

    // Fallback: If KYC API failed or returned empty data, try Perplexity
    if (!hasApiData) {
      console.log('[CIN] KYC API returned no data, falling back to Perplexity AI...')
      const aiResult = await lookupCompanyByPerplexity({
        cin: formData.cinNumber.trim(),
        companyName: formData.companyName || undefined,
      })

      if (aiResult.success) {
        response = aiResult.data
        companyData = response?.data?.data?.companyData || {}
        directorData = response?.data?.data?.directorData || []
        hasApiData = companyData && Object.keys(companyData).length > 0 && companyData.company

        if (hasApiData) {
          showToast('Company details found via AI search', 'success')
        }
      }
    }

    // If still no data after both attempts, use parsed CIN data only
    if (!hasApiData) {
      if (parsed.isValid) {
        setIsCINVerified(true)
        applyParsedCINData(parsed, null, [])
        showToast('Company verified from CIN structure. Some fields may need manual entry.', 'info')
      } else {
        setErrors((prev) => ({ ...prev, cinNumber: 'No company data found. Please check the CIN and try again.' }))
      }
      setIsVerifyingCIN(false)
      return
    }

    console.log('Company Data:', companyData)
    console.log('Director Data:', directorData)
    console.log('Parsed CIN:', parsed)

    // Use entity detection system (with API data if available)
    const detection = detectEntity(hasApiData ? companyData : { cin: formData.cinNumber.trim() }, true)
    setEntityDetection(detection)
    setIsCINVerified(true)

    console.log('Entity Detection Result:', detection)

    applyParsedCINData(parsed, hasApiData ? companyData : null, directorData)

    // Add directors from CIN response
    if (directorData.length > 0) {
      const cinDirectors: Director[] = directorData.map((dir, index) => {
        console.log('Processing director:', dir)
        return {
          id: `cin-${Date.now()}-${index}`,
          firstName: dir.firstName || (dir as any).FirstName || '',
          lastName: dir.lastName || (dir as any).LastName || '',
          middleName: dir.middleName || (dir as any).MiddleName || '',
          din: dir.din || (dir as any).DIN || dir.dinOrPAN || (dir as any).DINOrPAN || '',
          designation: dir.designation || (dir as any).Designation || '',
          dob: formatDate(dir.dob || (dir as any).DOB) || '',
          verified: false,
          source: 'cin' as const,
        }
      })
      console.log('Created Directors:', cinDirectors)
      setDirectors(cinDirectors)
    }

    // Check for ex-directors in CIN response (if available)
    const exDirectorData = (response?.data?.data as any)?.exDirectorData ||
                          (response?.data?.data as any)?.formerDirectorData ||
                          (response?.data?.data as any)?.exDirectors ||
                          (response?.data?.data as any)?.formerDirectors ||
                          []

    if (Array.isArray(exDirectorData) && exDirectorData.length > 0) {
      const exDirectorNames = exDirectorData
        .map((exDir: any) => {
          // Handle both string format (from Perplexity) and object format (from KYC API)
          if (typeof exDir === 'string') return exDir.trim()
          const firstName = exDir.firstName || exDir.FirstName || exDir.first_name || ''
          const middleName = exDir.middleName || exDir.MiddleName || exDir.middle_name || ''
          const lastName = exDir.lastName || exDir.LastName || exDir.last_name || ''
          return [firstName, middleName, lastName].filter(Boolean).join(' ').trim()
        })
        .filter((name: string) => name.length > 0)

      if (exDirectorNames.length > 0) {
        setExDirectors(exDirectorNames.join(', '))
      }
    }

    setIsVerifyingCIN(false)

    // Auto-lookup GST numbers via Perplexity (non-blocking, runs in background).
    // Populates every discovered GSTIN + state into the registrations list; the
    // first row mirrors to the legacy gstNumber field for downstream callers.
    const companyNameForGST = companyData?.company || formData.companyName
    const panForGST = formData.panNumber || (parsed?.isValid ? '' : '')
    if (companyNameForGST && formData.gstRegistrations.length === 0) {
      lookupGST({
        companyName: companyNameForGST,
        cin: formData.cinNumber.trim(),
        pan: panForGST || undefined,
      }).then((gstResult) => {
        if (gstResult.found && gstResult.gstNumbers && gstResult.gstNumbers.length > 0) {
          const registrations = gstResult.gstNumbers.map(g => ({ gstin: g.gstn, state: g.state }))
          setFormData(prev => ({
            ...prev,
            isGstRegistered: true,
            gstRegistrations: registrations,
            gstNumber: registrations[0].gstin,
            ...((!prev.panNumber && gstResult.pan) ? { panNumber: gstResult.pan } : {}),
          }))
          const stateCount = new Set(registrations.map(r => r.state)).size
          showToast(
            registrations.length > 1
              ? `Found ${registrations.length} GSTINs across ${stateCount} state${stateCount > 1 ? 's' : ''}`
              : `GST number found: ${registrations[0].gstin} (${registrations[0].state})`,
            'success',
          )
        }
      }).catch(() => {
        // Non-critical — silently ignore GST lookup failures
      })
    }
  }

  /** Apply parsed CIN + optional API data to form fields */
  const applyParsedCINData = (parsed: ParsedCIN, companyData: any | null, directorData: any[]) => {
    // Map to form values using entity detection
    const detection = companyData
      ? detectEntity(companyData, true)
      : detectEntity({ cin: parsed.raw }, true)

    const formCompanyType = mapEntitySubTypeToFormValue(detection.entitySubType)
    const formCategories = mapIndustryToCategories(detection.industryPrimary, detection.entitySubType)

    // Parse address from API data
    const address = companyData?.registeredaddress || companyData?.mcamdscompanyaddress || ''
    const { city: apiCity, state: apiState, pinCode: apiPinCode } = parseAddress(address)

    // Use parsed CIN state as fallback when API doesn't return address
    const fallbackState = parsed.stateName || ''

    const phoneNumber = companyData?.mobileNumber || companyData?.phoneNumber || companyData?.contactNumber || ''

    // Determine industry from NIC code (parsed CIN) or entity detection.
    // Principle: if the API/NIC gave us ANY signal about what this
    // company does, fill the fields. If the signal doesn't match a
    // predefined option, select "Other" and stash the raw description
    // in otherIndustryCategory so nothing is left blank.
    const rawApiDescription = companyData?.principalBusinessActivity ||
                              companyData?.industrialClass ||
                              companyData?.mainDivision ||
                              parsed.nicDetails?.description ||
                              detection.industryPrimary || ''

    const nicIndustry = detection.industryPrimary
    const isKnownIndustry = !!nicIndustry && INDUSTRIES.includes(nicIndustry as any)
    const haveAnyIndustrySignal = Boolean(
      (nicIndustry && nicIndustry !== 'Other') || rawApiDescription.trim()
    )
    const selectedIndustries: string[] = isKnownIndustry
      ? [nicIndustry as any]
      : haveAnyIndustrySignal
        ? ['Other']
        : []

    // Categories: same fallback — if the mapper returned nothing but
    // we have a description, mark Other so the form doesn't stay empty.
    const finalCategories: string[] = formCategories.length > 0
      ? formCategories
      : haveAnyIndustrySignal
        ? ['Other']
        : []

    // otherIndustryCategory is shown whenever either list contains
    // Other. We always write the raw description when it's available,
    // even if the mapping managed to find a known category — so the
    // user sees the agent's actual finding, not just a generic label.
    const needsOtherCategoryText =
      selectedIndustries.includes('Other') || finalCategories.includes('Other')

    // Use parsed CIN year as fallback for date of incorporation
    const apiDate = companyData?.dateOfIncorporation ? formatDate(companyData.dateOfIncorporation) : ''
    const fallbackDate = parsed.yearOfIncorporation ? `${parsed.yearOfIncorporation}-01-01` : ''

    setFormData((prev) => ({
      ...prev,
      companyName: companyData?.company || prev.companyName,
      companyType: formCompanyType || prev.companyType,
      industries: selectedIndustries.length > 0 ? selectedIndustries : prev.industries,
      dateOfIncorporation: apiDate || fallbackDate || prev.dateOfIncorporation,
      address: address || prev.address,
      city: apiCity || prev.city,
      state: apiState || fallbackState || prev.state,
      pinCode: apiPinCode || prev.pinCode,
      phoneNumber: phoneNumber || prev.phoneNumber,
      email: companyData?.emailAddress || prev.email,
      cinNumber: companyData?.cin || formData.cinNumber,
      industryCategories: finalCategories.length > 0 ? finalCategories : prev.industryCategories,
      otherIndustryCategory:
        needsOtherCategoryText && rawApiDescription.trim()
          ? rawApiDescription.trim()
          : prev.otherIndustryCategory,
      // CIN API fields
      authorisedCapital: companyData?.authorisedCapital || prev.authorisedCapital,
      paidUpCapital: companyData?.paidUpCapital || prev.paidUpCapital,
      subscribedCapital: companyData?.subscribedCapital || prev.subscribedCapital,
      companyCategory: companyData?.companyCategory || prev.companyCategory,
      companySubcategory: companyData?.companySubcategory || prev.companySubcategory,
      classOfCompany: companyData?.classOfCompany || prev.classOfCompany,
      rocName: companyData?.rocName || prev.rocName,
      companyStatus: companyData?.llpStatus || prev.companyStatus,
      dateOfLastAgm: companyData?.dateOfLastAGM || prev.dateOfLastAgm,
      balanceSheetDate: companyData?.balanceSheetDate || prev.balanceSheetDate,
    }))
  }

  /**
   * PR-2.5: Apply MagicalIntake's payload to the form, then drop the gate.
   *
   * MagicalIntake fetches MCA + GST in its own UI. We reuse the existing
   * applyParsedCINData (single source of truth for company prefill) plus
   * mirror the director and GST setter snippets from handleCINVerification
   * so the user lands on the existing form fully populated and ready to
   * edit. Optional fields (employeeCount, MSME, DPIIT, etc.) stay empty
   * until the user fills them — exactly the "below the fold" plan.
   */
  const handleMagicalIntakeComplete = (payload: MagicalIntakePayload) => {
    // Mark CIN as verified so the existing CIN-verify button doesn't ask
    // the user to verify again.
    setIsCINVerified(true)

    // Run entity detection (sets the entity-detection card on the form).
    const detection = detectEntity(
      payload.companyData && payload.companyData.cin
        ? payload.companyData
        : { cin: payload.cin },
      true,
    )
    setEntityDetection(detection)

    // Apply company prefill via the SAME helper the legacy flow uses.
    applyParsedCINData(payload.parsed, payload.companyData, payload.directorData)

    // Seed cin/pan AFTER applyParsedCINData so this write lands LAST in
    // the React batch and wins. Putting it first caused the CIN field to
    // end up empty: applyParsedCINData reads `formData.cinNumber` from a
    // stale closure, and when companyData.cin was missing (Perplexity
    // fallback path), it overrode our just-set value with an empty
    // string. Putting our setter last guarantees the user's typed CIN
    // is preserved on the form.
    setFormData((prev) => ({
      ...prev,
      cinNumber: payload.cin,
      panNumber: payload.pan,
    }))

    // Directors — mirror handleCINVerification's mapping so verification
    // status, IDs, and source labels stay consistent with the legacy flow.
    if (payload.directorData.length > 0) {
      const cinDirectors: Director[] = payload.directorData.map((dir, index) => ({
        id: `cin-${Date.now()}-${index}`,
        firstName: dir.firstName || (dir as any).FirstName || '',
        lastName: dir.lastName || (dir as any).LastName || '',
        middleName: dir.middleName || (dir as any).MiddleName || '',
        din: dir.din || (dir as any).DIN || dir.dinOrPAN || (dir as any).DINOrPAN || '',
        designation: dir.designation || (dir as any).Designation || '',
        dob: formatDate(dir.dob || (dir as any).DOB) || '',
        verified: false,
        source: 'cin' as const,
      }))
      setDirectors(cinDirectors)
    }

    // GST registrations — same shape the legacy GST callback writes.
    const gst = payload.gstResult
    if (gst?.found && gst.gstNumbers && gst.gstNumbers.length > 0) {
      const registrations = gst.gstNumbers.map((g) => ({ gstin: g.gstn, state: g.state }))
      setFormData((prev) => ({
        ...prev,
        isGstRegistered: true,
        gstRegistrations: registrations,
        gstNumber: registrations[0].gstin,
        ...((!prev.panNumber && gst.pan) ? { panNumber: gst.pan } : {}),
      }))
    }

    // Toast quantifies the magic — count populated company fields.
    const filledCount = [
      payload.companyData?.company,
      payload.companyData?.dateOfIncorporation,
      payload.companyData?.registeredaddress,
      payload.companyData?.authorisedCapital,
      payload.companyData?.rocName,
      payload.directorData.length > 0,
      gst?.gstNumbers && gst.gstNumbers.length > 0,
    ].filter(Boolean).length
    showToast(
      `✨ Pre-filled ${filledCount} fields from MCA${gst?.found ? ' + GSTN' : ''}`,
      'success',
    )

    // Drop the gate — existing form now renders, fully populated.
    setShowMagicalIntake(false)
  }

  const handleDINVerification = async (directorId: string, din: string) => {
    if (!din.trim()) {
      return
    }

    // Only allow DIN verification for India (has API support)
    if (countryCode !== 'IN' || !hasAPISupport) {
      // For non-India countries, just validate format
      if (countryValidator?.validateDirectorId) {
        const validation = countryValidator.validateDirectorId(din)
        if (!validation.isValid) {
          setErrors((prev) => ({
            ...prev,
            [`director_${directorId}`]: validation.error || 'Invalid director ID format',
          }))
          return
        }
      }
      // Format is valid, but no API verification available
      setDirectors((prev) =>
        prev.map((dir) =>
          dir.id === directorId
            ? { ...dir, verified: false, source: 'manual' as const }
            : dir
        )
      )
      return
    }

    setIsVerifyingDIN(directorId)
    setErrors((prev) => ({ ...prev, [`director_${directorId}`]: '' }))

    const result = await verifyDIN(din.trim())
    
    if (!result.success) {
      setErrors((prev) => ({
        ...prev,
        [`director_${directorId}`]: result.error,
      }))
      setIsVerifyingDIN(null)
      return
    }

    const response = result.data
    if (!response.data?.directorData || response.data.directorData.length === 0) {
      setErrors((prev) => ({
        ...prev,
        [`director_${directorId}`]: 'No director data found in response',
      }))
      setIsVerifyingDIN(null)
      return
    }

    const dinData = response.data.directorData[0]

    // Update director with verified information
    setDirectors((prev) =>
      prev.map((dir) =>
        dir.id === directorId
          ? {
              ...dir,
              firstName: dinData.firstName || dir.firstName,
              lastName: dinData.lastName || dir.lastName,
              middleName: dinData.middleName || dir.middleName,
              dob: formatDate(dinData.dob) || dir.dob,
              pan: dinData.pan || dir.pan,
              email: dinData.emailAddress || dir.email,
              mobile: dinData.mobileNumber || dir.mobile,
              verified: true,
              source: dir.source === 'cin' ? 'cin' : 'din',
            }
          : dir
      )
    )

    setIsVerifyingDIN(null)
  }

  const handleAddDirectorByDIN = async () => {
    if (!newDirectorDIN.trim()) {
      const dinLabel = countryConfig.labels.directorId || 'Director ID'
      setErrors((prev) => ({ ...prev, newDirectorDIN: `Please enter ${dinLabel}` }))
      return
    }
    
    // Validate format using country validator
    if (countryValidator?.validateDirectorId) {
      const validation = countryValidator.validateDirectorId(newDirectorDIN)
      if (!validation.isValid) {
        setErrors((prev) => ({ 
          ...prev, 
          newDirectorDIN: validation.error || 'Invalid director ID format' 
        }))
        return
      }
    }

    // Only allow API verification for India
    if (countryCode !== 'IN' || !hasAPISupport) {
      // For non-India countries, add director with manual verification
      const newDirector: Director = {
        id: `manual-${Date.now()}`,
        firstName: '',
        lastName: '',
        middleName: '',
        din: newDirectorDIN.trim(),
        designation: '',
        dob: '',
        verified: false,
        source: 'manual',
      }
      setDirectors((prev) => [...prev, newDirector])
      setNewDirectorDIN('')
      setShowAddDirector(false)
      return
    }

    const directorId = `din-${Date.now()}`
    const din = newDirectorDIN.trim()

    setIsVerifyingDIN(directorId)
    setErrors((prev) => ({ ...prev, newDirectorDIN: '' }))

    const result = await verifyDIN(din)
    
    if (!result.success) {
      setErrors((prev) => ({
        ...prev,
        newDirectorDIN: result.error,
      }))
      setIsVerifyingDIN(null)
      return
    }

    const response = result.data
    if (!response.data?.directorData || response.data.directorData.length === 0) {
      setErrors((prev) => ({
        ...prev,
        newDirectorDIN: 'No director data found for this DIN',
      }))
      setIsVerifyingDIN(null)
      return
    }

    const dinData = response.data.directorData[0]

    // Add director with verified information
    const newDirector: Director = {
      id: directorId,
      firstName: dinData.firstName || '',
      lastName: dinData.lastName || '',
      middleName: dinData.middleName || '',
      din: din,
      designation: '',
      dob: formatDate(dinData.dob) || '',
      pan: dinData.pan || '',
      email: dinData.emailAddress || '',
      mobile: dinData.mobileNumber || '',
      verified: true,
      source: 'din',
    }

    setDirectors((prev) => [...prev, newDirector])
    setNewDirectorDIN('')
    setShowAddDirector(false)
    setIsVerifyingDIN(null)
  }

  const handleRemoveDirector = (directorId: string) => {
    setDirectors((prev) => prev.filter((dir) => dir.id !== directorId))
  }


  // Format date for display (shows month name)
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

  // Format date for database (YYYY-MM-DD)
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return ''
    try {
      // Handle MM/DD/YYYY format (e.g., "03/03/2025")
      if (dateStr.includes('/')) {
        const parts = dateStr.split('/')
        if (parts.length === 3) {
          const [month, day, year] = parts
          // Return as YYYY-MM-DD for date input
          return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
        }
      }
      
      // Handle other formats
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return ''
      return date.toISOString().split('T')[0]
    } catch {
      return ''
    }
  }

  const parseAddress = (address: string): { city: string; state: string; pinCode: string } => {
    if (!address) return { city: '', state: '', pinCode: '' }
    
    // Try to extract PIN code (6 digits at the end)
    const pinMatch = address.match(/\b(\d{6})\b(?!.*\d)/)
    const pinCode = pinMatch ? pinMatch[1] : ''
    
    // Split by comma, or if no commas, treat as a single part for city/state extraction
    let parts = address.split(',').map(p => p.trim()).filter(p => p.length > 0)
    // If no commas found (single part), split by spaces and try to find city/state from words
    if (parts.length <= 1) {
      // Try city-state mapping on the full address first (handled below)
      parts = []
    }
    
    let city = ''
    let state = ''
    
    // Common Indian states list
    const indianStates = [
      'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
      'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
      'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
      'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
      'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
      'Delhi', 'Jammu and Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh'
    ]
    
    // Find state (usually one of the last parts before country/PIN)
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i]
      // Check if it's a known state
      const matchedState = indianStates.find(s => 
        part.toLowerCase().includes(s.toLowerCase()) || 
        s.toLowerCase().includes(part.toLowerCase())
      )
      if (matchedState) {
        state = matchedState
        // City is usually the part before state
        if (i > 0) {
          // Take the part before state, but skip if it's "India" or similar
          const cityCandidate = parts[i - 1]
          if (cityCandidate && !cityCandidate.toLowerCase().includes('india') && 
              !cityCandidate.toLowerCase().includes('h.o') && 
              !cityCandidate.toLowerCase().includes('head office')) {
            city = cityCandidate.replace(/H\.o/i, '').trim()
          }
        }
        break
      }
    }
    
    // If state not found but we have parts, try to infer
    if (!state && parts.length > 0) {
      // Look for state-like patterns (capitalized words)
      for (let i = parts.length - 2; i >= 0; i--) {
        const part = parts[i]
        if (part && part.length > 2 && /^[A-Z]/.test(part)) {
          // Check if it matches a state
          const matchedState = indianStates.find(s => 
            part.toLowerCase() === s.toLowerCase() ||
            part.toLowerCase().includes(s.toLowerCase().split(' ')[0])
          )
          if (matchedState) {
            state = matchedState
            if (i > 0) {
              city = parts[i - 1].replace(/H\.o/i, '').trim()
            }
            break
          }
        }
      }
    }
    
    // If no state found, try to detect city and infer state from known city-state mapping
    const cityStateMap: Record<string, string> = {
      'mumbai': 'Maharashtra', 'pune': 'Maharashtra', 'nagpur': 'Maharashtra', 'thane': 'Maharashtra', 'nashik': 'Maharashtra',
      'delhi': 'Delhi', 'new delhi': 'Delhi', 'noida': 'Uttar Pradesh', 'gurgaon': 'Haryana', 'gurugram': 'Haryana', 'faridabad': 'Haryana', 'ghaziabad': 'Uttar Pradesh',
      'bangalore': 'Karnataka', 'bengaluru': 'Karnataka', 'mysore': 'Karnataka', 'mangalore': 'Karnataka',
      'hyderabad': 'Telangana', 'secunderabad': 'Telangana',
      'chennai': 'Tamil Nadu', 'coimbatore': 'Tamil Nadu', 'madurai': 'Tamil Nadu',
      'kolkata': 'West Bengal', 'howrah': 'West Bengal',
      'ahmedabad': 'Gujarat', 'surat': 'Gujarat', 'vadodara': 'Gujarat', 'rajkot': 'Gujarat',
      'jaipur': 'Rajasthan', 'udaipur': 'Rajasthan', 'jodhpur': 'Rajasthan',
      'lucknow': 'Uttar Pradesh', 'kanpur': 'Uttar Pradesh', 'agra': 'Uttar Pradesh', 'varanasi': 'Uttar Pradesh',
      'bhopal': 'Madhya Pradesh', 'indore': 'Madhya Pradesh',
      'chandigarh': 'Chandigarh', 'ludhiana': 'Punjab', 'amritsar': 'Punjab',
      'kochi': 'Kerala', 'thiruvananthapuram': 'Kerala', 'trivandrum': 'Kerala',
      'patna': 'Bihar', 'ranchi': 'Jharkhand', 'bhubaneswar': 'Odisha',
      'dehradun': 'Uttarakhand', 'shimla': 'Himachal Pradesh', 'jammu': 'Jammu and Kashmir', 'srinagar': 'Jammu and Kashmir',
      'goa': 'Goa', 'panaji': 'Goa', 'guwahati': 'Assam', 'imphal': 'Manipur',
      'raipur': 'Chhattisgarh', 'visakhapatnam': 'Andhra Pradesh', 'vijayawada': 'Andhra Pradesh',
      'pondicherry': 'Puducherry', 'puducherry': 'Puducherry',
    }

    if (!state || !city) {
      const addrLower = address.toLowerCase()
      for (const [knownCity, knownState] of Object.entries(cityStateMap)) {
        if (addrLower.includes(knownCity)) {
          if (!city) city = knownCity.charAt(0).toUpperCase() + knownCity.slice(1)
          if (!state) state = knownState
          break
        }
      }
    }

    // Clean up city name (remove common suffixes)
    if (city) {
      city = city.replace(/\s*H\.o\.?\s*/i, '').trim()
      city = city.replace(/\s*Head\s*Office\s*/i, '').trim()
    }

    console.log('Parsed Address:', { address, city, state, pinCode })

    return { city, state, pinCode }
  }

  const handleFileChange = (documentType: string, file: File | null) => {
    setFormData((prev) => ({
      ...prev,
      documents: { ...prev.documents, [documentType]: file },
    }))
    if (errors[`document_${documentType}`]) {
      setErrors((prev) => ({ ...prev, [`document_${documentType}`]: '' }))
    }
  }

  const handleIndustryChange = (industry: string) => {
    setFormData((prev) => {
      const isCurrentlySelected = prev.industries.includes(industry)
      const industries = isCurrentlySelected
        ? prev.industries.filter((i) => i !== industry)
        : [...prev.industries, industry]
      
      return { ...prev, industries }
    })
  }

  const handleIndustryCategoryChange = (category: string) => {
    setFormData((prev) => {
      const isCurrentlySelected = prev.industryCategories.includes(category)
      const categories = isCurrentlySelected
        ? prev.industryCategories.filter((c) => c !== category)
        : [...prev.industryCategories, category]
      
      // Clear otherIndustryCategory if "Other" is being unselected
      const otherIndustryCategory = category === 'Other' && isCurrentlySelected
        ? ''
        : prev.otherIndustryCategory
      
      return { ...prev, industryCategories: categories, otherIndustryCategory }
    })
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}

    if (!formData.companyName.trim()) {
      newErrors.companyName = 'Company name is required'
    }
    if (!formData.companyType) {
      newErrors.companyType = 'Please select a company type'
    }
    // Tax ID (PAN) — required for Indian companies per PRD v1.1 §1.1/1.4.
    // The `companies.tax_id` column holds PAN; downstream compliance rules
    // (TDS, ITR, advance tax) require it to derive the Income Tax portal ID.
    if (!formData.panNumber.trim()) {
      newErrors.panNumber = `${countryConfig.labels.taxId || 'PAN'} is required`
    } else if (countryValidator) {
      const taxValidation = countryValidator.validateTaxId(formData.panNumber)
      if (!taxValidation.isValid) {
        newErrors.panNumber = taxValidation.error || 'Invalid tax ID format'
      }
    }
    
    // Registration ID validation — skipped for sole proprietorships and
    // partnerships, neither of which has a CIN.
    if (requiresCIN && !formData.cinNumber.trim()) {
      newErrors.cinNumber = `${countryConfig.labels.registrationId} is required`
    }
    if (formData.industries.length === 0) {
      newErrors.industries = 'Please select at least one industry'
    }
    if (!formData.address.trim()) {
      newErrors.address = 'Address is required'
    }
    if (!formData.city.trim()) {
      newErrors.city = 'City is required'
    }
    if (!formData.state.trim()) {
      const stateLabel = countryConfig.labels.state || 'State'
      newErrors.state = `${stateLabel} is required`
    }
    if (!formData.pinCode.trim()) {
      newErrors.pinCode = `${countryConfig.labels.postalCode} is required`
    } else if (countryValidator?.validatePostalCode) {
      const postalValidation = countryValidator.validatePostalCode(formData.pinCode)
      if (!postalValidation.isValid) {
        newErrors.pinCode = postalValidation.error || `Invalid ${countryConfig.labels.postalCode} format`
      }
    }
    // Phone number is now optional
    if (formData.phoneNumber.trim() && !/^[0-9+\s-]{10,15}$/.test(formData.phoneNumber.trim())) {
      newErrors.phoneNumber = 'Invalid phone number format'
    }
    if (!formData.dateOfIncorporation) {
      newErrors.dateOfIncorporation = 'Date of incorporation is required'
    }
    if (formData.industries.length === 0) {
      newErrors.industries = 'Please select at least one industry'
    }
    if (formData.industryCategories.length === 0) {
      newErrors.industryCategories = 'Please select at least one industry category'
    }
    if (formData.industryCategories.includes('Other') && !formData.otherIndustryCategory.trim()) {
      newErrors.otherIndustryCategory = 'Please specify the industry category'
    }

    // Required documents are now optional - removing document check

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validateForm()) {
      // Surface the failure: previously we returned silently — no
      // toast, no scroll, no spinner — so users assumed the button
      // was broken and clicked again. Now we toast + scroll to the
      // first errored field so the user knows what's missing.
      const newErrors: Record<string, string> = {}
      // Re-derive the error map (validateForm just set state; React
      // hasn't flushed yet, so we mirror its work locally to find the
      // first errored field deterministically).
      if (!formData.companyName.trim()) newErrors.companyName = 'required'
      if (!formData.companyType) newErrors.companyType = 'required'
      if (formData.industries.length === 0) newErrors.industries = 'required'
      if (formData.industryCategories.length === 0) newErrors.industryCategories = 'required'
      if (formData.industryCategories.includes('Other') && !formData.otherIndustryCategory.trim()) {
        newErrors.otherIndustryCategory = 'required'
      }
      const firstErrorField = Object.keys(newErrors)[0]
      showToast('Please fill the highlighted required fields.', 'error')
      if (firstErrorField) {
        const el = document.querySelector(`[name="${firstErrorField}"], [data-field="${firstErrorField}"], #${firstErrorField}`)
        if (el && 'scrollIntoView' in el) {
          (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
          if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
            el.focus()
          }
        }
      }
      return
    }

    setIsSubmitting(true)
    console.log('[onboarding:submit] starting', {
      companyName: formData.companyName,
      docCount: Object.values(formData.documents).filter(f => f !== null).length,
      directorCount: directors.length,
    })

    try {
      // 1. Upload files to Storage first
      const uploadedDocuments: Array<{ type: string; path: string; name: string }> = []

      const uploadPromises = Object.entries(formData.documents)
        .filter(([_, file]) => file !== null)
        .map(async ([docType, file]) => {
          const fileObj = file as File
          const fileExt = fileObj.name.split('.').pop()
          const fileName = `${docType.replace(/\s+/g, '_')}_${Date.now()}.${fileExt}`
          const filePath = `${user?.id}/${Date.now()}/${fileName}`

          console.log('[onboarding:submit] uploading', { docType, filePath, size: fileObj.size })
          const fileArrayBuffer = await fileObj.arrayBuffer()
          const uploadResult = await uploadFileToStorage(filePath, fileArrayBuffer, fileObj.type)

          if (!uploadResult.success) {
            const msg = 'error' in uploadResult ? uploadResult.error : 'Upload failed'
            console.error('[onboarding:submit] upload failed', { docType, filePath, error: msg })
            throw new Error(`Upload failed for ${docType}: ${msg}`)
          }

          uploadedDocuments.push({
            type: docType,
            path: filePath,
            name: fileObj.name
          })
        })

      await Promise.all(uploadPromises)
      console.log('[onboarding:submit] all uploads done', { count: uploadedDocuments.length })

      // 2. Call the Server Action with Service Role privileges
      console.log('[onboarding:submit] calling completeOnboarding…')
      const result = await completeOnboarding({
        ...formData,
        countryCode: countryCode,
        companyStage: entityDetection?.companyStage,
        confidenceScore: entityDetection?.confidenceScore,
        documents: uploadedDocuments,
        exDirectors: exDirectors.trim() || undefined
      }, directors)
      console.log('[onboarding:submit] completeOnboarding returned', result)

      if (result.success && result.companyId) {
        // Hybrid subscription model. The server tells us whether the
        // new company already has active access — from an enterprise
        // user sub, a pre-existing company sub, or the trial it just
        // auto-created for Starter/Professional users. If so, skip the
        // /subscribe gate and land on /data-room directly.
        //
        // Previously this only checked (tier === 'enterprise'), which
        // dumped trial-eligible users into the subscribe page even
        // after the server had already granted them a trial on the
        // new company.
        const newCompanyHasAccess = (result as any).hasActiveAccess === true
        const enterpriseCoversIt = hasSubscription && tier === 'enterprise' && canCreateCompany
        if (newCompanyHasAccess || enterpriseCoversIt) {
          router.push(`/data-room?company_id=${result.companyId}`)
        } else {
          // No access path succeeded → user needs to pick a plan
          router.push(`/subscribe?company_id=${result.companyId}`)
        }
      } else {
        // Server returned {success: false} — previously this branch
        // was empty: button stopped spinning, no toast, no log. User
        // had no way to know anything went wrong. Now we surface the
        // exact server error.
        const errMsg = (result as any)?.error || 'Company creation failed — server returned no error message'
        console.error('[onboarding:submit] server returned failure', result)
        showToast(errMsg, 'error')
      }
    } catch (error) {
      console.error('[onboarding:submit] threw',
        error instanceof Error ? error.message : String(error),
        error instanceof Error ? error.stack : '')
      const msg = error instanceof Error
        ? `${error.message}${error.stack ? `\n${error.stack.split('\n').slice(0, 3).join('\n')}` : ''}`
        : String(error)
      showToast(msg, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  // PR-2.5: Magical CIN→PAN gate. Shown by default for India users; auto-
  // skipped for other countries (see useEffect above). When the user
  // skips manually, the existing form renders with empty fields just
  // like before — no behavior change for that path.
  if (showMagicalIntake) {
    return (
      <MagicalIntake
        onComplete={handleMagicalIntakeComplete}
        onSkip={() => setShowMagicalIntake(false)}
      />
    )
  }

  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      {/* Content */}
      <div className="relative z-10 container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-4 sm:mb-8">
          <div className="flex items-center gap-2 sm:gap-4 mb-3 sm:mb-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-bg-elevated border border-line/15 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
              <svg
                width="20"
                height="20"
                className="sm:w-6 sm:h-6"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  d="M19 21H5C4.46957 21 3.96086 20.7893 3.58579 20.4142C3.21071 20.0391 3 19.5304 3 19V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V19C21 19.5304 20.7893 20.0391 20.4142 20.4142C20.0391 20.7893 19.5304 21 19 21Z"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 7H15"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 12H15"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <path
                  d="M9 17H13"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl md:text-3xl font-light text-white">Create New Company</h1>
              <p className="text-fg-muted text-xs sm:text-sm mt-1 font-light">
                Add another company to your account
              </p>
            </div>
          </div>
        </div>

        {/* Form Card */}
        <form onSubmit={handleSubmit} className="bg-bg-card border border-line/10 rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8">
          <div className="space-y-4 sm:space-y-6">
            {/* Step Indicator */}
            <div className="flex items-center justify-center gap-2 mb-4 sm:mb-6">
              <div className={`flex items-center gap-2 ${currentStep === 1 ? 'text-white' : 'text-fg-muted'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${currentStep === 1 ? 'bg-bg-elevated border-line/30 text-white' : 'bg-bg-card border-line/15 text-fg-muted'}`}>
                  1
                </div>
                <span className="text-xs sm:text-sm font-light">Company Details</span>
              </div>
              <div className="w-8 sm:w-12 h-0.5 bg-bg-hover"></div>
              <div className={`flex items-center gap-2 ${currentStep === 2 ? 'text-white' : 'text-fg-muted'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${currentStep === 2 ? 'bg-bg-elevated border-line/30 text-white' : 'bg-bg-card border-line/15 text-fg-muted'}`}>
                  2
                </div>
                <span className="text-xs sm:text-sm font-light">Documents</span>
              </div>
            </div>

            {currentStep === 1 ? (
              <>
                {/* Country Selector - FIRST FIELD */}
                <CountrySelector
                  value={countryCode}
                  onChange={handleCountryChange}
                />

                {/* Registration ID / CIN Number — required for registered
                    entities (Pvt Ltd, Public Ltd, LLP, OPC, Section 8).
                    Optional for sole proprietorships and partnerships
                    which have no MCA registration. */}
                <div>
                  <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">
                    {countryConfig.labels.registrationId}
                    {requiresCIN
                      ? <span className="text-red-500">{' '}*</span>
                      : <span className="text-fg-muted ml-2 text-[11px]">(not applicable for {formData.companyType.replace('-', ' ')})</span>
                    }
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      name="cinNumber"
                      value={formData.cinNumber}
                      onChange={handleInputChange}
                      placeholder={requiresCIN
                        ? `Enter ${countryConfig.labels.registrationId}`
                        : 'Leave blank — not registered with MCA'
                      }
                      disabled={!requiresCIN}
                      className={`flex-1 px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base placeholder:text-fg-muted focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors font-light ${!requiresCIN ? 'opacity-40 cursor-not-allowed' : ''}`}
                    />
                    {hasAPISupport && requiresCIN && (
                    <button
                      type="button"
                      onClick={handleCINVerification}
                      disabled={isVerifyingCIN || !formData.cinNumber.trim()}
                      className="px-4 sm:px-6 py-2 sm:py-3 border border-line/15 text-fg-secondary rounded-lg hover:border-line/30 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base whitespace-nowrap font-light"
                    >
                      {isVerifyingCIN ? (
                        <>
                          <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                          Verifying...
                        </>
                      ) : (
                        <>
                          <svg width="14" height="14" className="sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                            <polyline points="22 4 12 14.01 9 11.01" />
                          </svg>
                            <span className="hidden sm:inline">Verify {countryConfig.labels.registrationId}</span>
                          <span className="sm:hidden">Verify</span>
                        </>
                      )}
                    </button>
                    )}
                  </div>
                  {errors.cinNumber && (
                    <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.cinNumber}</p>
                  )}
                  {/* Manual Verification Notice for non-India countries */}
                  {!hasAPISupport && formData.cinNumber.trim() && (
                    <ManualVerificationNotice
                      countryCode={countryCode}
                      fieldType="registration"
                      value={formData.cinNumber}
                    />
                  )}

                  {/* NIC Classification Card — shown when CIN format is valid */}
                  {parsedCIN && (
                    <div className="mt-3 p-3 sm:p-4 bg-bg-card/80 border border-line/15 rounded-lg space-y-2">
                      <div className="flex items-center gap-2 mb-2">
                        <svg width="14" height="14" className="sm:w-4 sm:h-4 text-emerald-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                          <polyline points="22 4 12 14.01 9 11.01" />
                        </svg>
                        <span className="text-xs sm:text-sm font-medium text-emerald-400">CIN Decoded</span>
                      </div>

                      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:text-sm">
                        <div className="text-fg-muted">Listing Status</div>
                        <div className="text-fg-secondary">{parsedCIN.isListed ? 'Listed' : 'Unlisted'}</div>

                        <div className="text-fg-muted">State of Registration</div>
                        <div className="text-fg-secondary">{parsedCIN.stateName || parsedCIN.stateCode || '—'}</div>

                        <div className="text-fg-muted">Year of Incorporation</div>
                        <div className="text-fg-secondary">{parsedCIN.yearOfIncorporation || '—'}</div>

                        <div className="text-fg-muted">Company Type</div>
                        <div className="text-fg-secondary">{parsedCIN.companyTypeName || parsedCIN.companyTypeCode || '—'}</div>
                      </div>

                      {parsedCIN.nicDetails && (
                        <>
                          <div className="border-t border-line/15/60 my-2"></div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs sm:text-sm font-medium text-fg-secondary">Industry Classification (NIC 2008)</span>
                          </div>
                          <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs sm:text-sm">
                            <span className="text-fg-muted">Section</span>
                            <span className="text-fg-secondary">{parsedCIN.nicDetails.section} — {parsedCIN.nicDetails.sectionName}</span>

                            <span className="text-fg-muted">Division</span>
                            <span className="text-fg-secondary">{parsedCIN.nicDetails.divisionCode} — {parsedCIN.nicDetails.divisionName}</span>

                            <span className="text-fg-muted">Group</span>
                            <span className="text-fg-secondary">{parsedCIN.nicDetails.groupCode} — {parsedCIN.nicDetails.groupName}</span>

                            <span className="text-fg-muted">Class</span>
                            <span className="text-fg-secondary">{parsedCIN.nicDetails.classCode} — {parsedCIN.nicDetails.className}</span>

                            <span className="text-fg-muted">Sub-class</span>
                            <span className="text-fg-secondary">{parsedCIN.nicDetails.code} — {parsedCIN.nicDetails.description}</span>
                          </div>
                        </>
                      )}

                      {parsedCIN.nicCode && !parsedCIN.nicDetails && (
                        <div className="text-xs text-amber-400/80 mt-1">
                          NIC code {parsedCIN.nicCode} not found in NIC 2008 classification
                        </div>
                      )}
                    </div>
                  )}
                </div>

            {/* Company Name */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-fg-secondary mb-2">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="companyName"
                value={formData.companyName}
                onChange={handleInputChange}
                placeholder="Enter company name"
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base placeholder:text-fg-muted focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
              />
              {errors.companyName && (
                <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.companyName}</p>
              )}
            </div>

            {/* Company Type */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-fg-secondary mb-2">
                Company Type <span className="text-red-500">*</span>
                {isCINVerified && (
                  <span className="ml-2 text-[10px] sm:text-xs text-fg-muted flex items-center gap-1">
                    <svg width="10" height="10" className="sm:w-3 sm:h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                    Detected from MCA records
                  </span>
                )}
              </label>
              <select
                name="companyType"
                value={formData.companyType}
                onChange={handleInputChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors appearance-none font-light cursor-pointer"
              >
                <option value="">Select company type</option>
                {countryConfig.onboarding.entityTypes.map((entityType) => (
                  <option key={entityType} value={entityType.toLowerCase().replace(/\s+/g, '-')}>
                    {entityType}
                  </option>
                ))}
              </select>
              {errors.companyType && (
                <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.companyType}</p>
              )}
            </div>

            {/* Tax ID / PAN Number — mandatory per PRD §1.1 */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-fg-secondary mb-2">
                  {countryConfig.labels.taxId} <span className="text-red-400 ml-0.5">*</span>
                </label>
                <input
                  type="text"
                  name="panNumber"
                  value={formData.panNumber}
                  onChange={handleInputChange}
                  placeholder={`Enter ${countryConfig.labels.taxId}`}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base placeholder:text-fg-muted focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                />
                {errors.panNumber && (
                  <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.panNumber}</p>
                )}
            </div>

            {/* Industries */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs sm:text-sm font-medium text-fg-secondary">
                  Industries <span className="text-red-500">*</span> (Select at least one)
                  {isCINVerified && (
                    <span className="ml-2 text-[10px] sm:text-xs text-fg-muted flex items-center gap-1">
                      <svg width="10" height="10" className="sm:w-3 sm:h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4" />
                        <path d="M12 8h.01" />
                      </svg>
                      Detected from MCA records
                    </span>
                  )}
                </label>
                <label className="flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-bg-card border border-line/15 rounded-lg hover:border-line/30 transition-colors cursor-pointer">
                  <input
                    type="checkbox"
                    checked={INDUSTRIES.every(industry => formData.industries.includes(industry))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData(prev => ({ ...prev, industries: [...INDUSTRIES] }))
                      } else {
                        setFormData(prev => ({ ...prev, industries: [] }))
                      }
                    }}
                    className="w-3 h-3 sm:w-4 sm:h-4 text-fg-muted bg-bg-elevated border-line/30 rounded focus:ring-gray-500 focus:ring-2"
                  />
                  <span className="text-fg-secondary text-[10px] sm:text-xs font-light">Select All</span>
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 max-h-48 overflow-y-auto">
                {INDUSTRIES.map((industry) => (
                  <label
                    key={industry}
                    className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-bg-card border border-line/15 rounded-lg transition-colors cursor-pointer hover:border-line/30"
                  >
                    <input
                      type="checkbox"
                      checked={formData.industries.includes(industry)}
                      onChange={() => handleIndustryChange(industry)}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-fg-muted bg-bg-elevated border-line/30 rounded focus:ring-gray-500 focus:ring-2 flex-shrink-0"
                    />
                    <span className="text-fg-secondary text-xs sm:text-sm break-words">{industry}</span>
                  </label>
                ))}
              </div>
              {errors.industries && (
                <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.industries}</p>
              )}
            </div>

            {/* Industry Categories */}
            <div>
              <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2 sm:mb-3">
                Category of Industry <span className="text-red-500">*</span>
                {isCINVerified && (
                  <span className="ml-2 text-[10px] sm:text-xs text-fg-muted flex items-center gap-1">
                    <svg width="10" height="10" className="sm:w-3 sm:h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                    Detected from MCA records
                  </span>
                )}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {[...countryConfig.onboarding.industryCategories, ...(countryConfig.onboarding.industryCategories.includes('Other') ? [] : ['Other'])].map((category) => (
                  <label
                    key={category}
                    className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-bg-card border border-line/15 rounded-lg transition-colors cursor-pointer hover:border-line/30"
                  >
                    <input
                      type="checkbox"
                      checked={formData.industryCategories.includes(category)}
                      onChange={() => handleIndustryCategoryChange(category)}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-fg-muted bg-bg-elevated border-line/30 rounded focus:ring-gray-500 focus:ring-2 flex-shrink-0"
                    />
                    <span className="text-fg-secondary text-xs sm:text-sm break-words">{category}</span>
                  </label>
                ))}
              </div>
              {errors.industryCategories && (
                <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.industryCategories}</p>
              )}
              
              {/* Other Industry Category Text Input */}
              {formData.industryCategories.includes('Other') && (
                <div className="mt-3 sm:mt-4">
                  <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">
                    Specify Industry Category <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="otherIndustryCategory"
                    value={formData.otherIndustryCategory}
                    onChange={handleInputChange}
                    placeholder="Enter industry category"
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base placeholder:text-fg-muted focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                  />
                  {errors.otherIndustryCategory && (
                    <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.otherIndustryCategory}</p>
                  )}
                </div>
              )}
            </div>

            {/* Date of Incorporation */}
            <div>
              <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">
                Date of Incorporation <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={formData.dateOfIncorporation ? formatDateForDisplay(formData.dateOfIncorporation) : ''}
                  placeholder="Select date"
                  onClick={() => {
                    // Trigger click on the hidden date input
                    if (dateInputRef.current) {
                      dateInputRef.current.focus();
                      dateInputRef.current.click();
                      // Try showPicker if available
                      if (typeof dateInputRef.current.showPicker === 'function') {
                      try {
                          dateInputRef.current.showPicker();
                        } catch (err) {
                          // Fallback to native click if showPicker fails
                        }
                      }
                    }
                  }}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors cursor-pointer pr-10 font-light"
                />
              <input
                type="date"
                  ref={dateInputRef}
                  id="dateOfIncorporation-hidden"
                name="dateOfIncorporation"
                value={formData.dateOfIncorporation}
                  onChange={(e) => {
                    handleInputChange(e);
                  }}
                  onClick={(e) => {
                    // Try to show picker programmatically for better browser support
                    const dateInput = e.currentTarget as HTMLInputElement;
                    if (typeof dateInput.showPicker === 'function') {
                      try {
                        dateInput.showPicker();
                      } catch (err) {
                        // Fallback to native click if showPicker fails
                      }
                    }
                  }}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  style={{ zIndex: 20, pointerEvents: 'auto' }}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none z-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fg-muted">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
              </div>
              {errors.dateOfIncorporation && (
                <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.dateOfIncorporation}</p>
              )}
            </div>

            {/* Year Type */}
            <div>
              <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">
                Financial Year Type <span className="text-red-500">*</span>
              </label>
              <select
                name="yearType"
                value={formData.yearType}
                onChange={handleInputChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
              >
                <option value="FY">Financial Year (India) - Q1: Apr-Jun, Q2: Jul-Sep, Q3: Oct-Dec, Q4: Jan-Mar</option>
                <option value="CY">Calendar Year (Gulf/USA) - Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec</option>
              </select>
              <p className="mt-1 text-xs text-fg-muted">
                Select the year type based on your company's jurisdiction. Indian companies use Financial Year (FY).
              </p>
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">
                Address <span className="text-red-500">*</span>
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                placeholder="Enter complete address"
                rows={3}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base placeholder:text-fg-muted focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors resize-y font-light"
              />
              {errors.address && (
                <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.address}</p>
              )}
            </div>

            {/* City, State, PIN Code */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              <div>
                <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  placeholder="City"
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base placeholder:text-fg-muted focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                />
                {errors.city && (
                  <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.city}</p>
                )}
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">
                  {countryConfig.labels.state || 'State'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleInputChange}
                  placeholder="State"
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base placeholder:text-fg-muted focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                />
                {errors.state && (
                  <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.state}</p>
                )}
              </div>
              <div className="sm:col-span-2 md:col-span-1">
                <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">
                  {countryConfig.labels.postalCode} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="pinCode"
                  value={formData.pinCode}
                  onChange={handleInputChange}
                  placeholder={countryConfig.labels.postalCode}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base placeholder:text-fg-muted focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                />
                {errors.pinCode && (
                  <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.pinCode}</p>
                )}
              </div>
            </div>

            {/* Company Stage (Read-only info) */}
            {entityDetection && (
              <div>
                <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">
                  Company Stage
                </label>
                <div className="px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span className="text-white text-sm sm:text-base">{entityDetection.companyStage}</span>
                    <span className="text-[10px] sm:text-xs text-fg-muted bg-bg-elevated border border-line/15 px-2 py-0.5 rounded w-fit font-light">
                      {entityDetection.confidenceScore} Confidence
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Phone Number, Email, and Landline */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              <div>
                <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">
                  Phone Number <span className="text-fg-muted text-[10px] sm:text-xs font-normal ml-1">(Optional)</span>
                </label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                />
                {errors.phoneNumber && (
                  <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.phoneNumber}</p>
                )}
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="company@example.com"
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base placeholder:text-fg-muted focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                />
                {errors.email && (
                  <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.email}</p>
                )}
              </div>
              <div className="sm:col-span-2 md:col-span-1">
                <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">
                  Landline
                </label>
                <input
                  type="tel"
                  name="landline"
                  value={formData.landline}
                  onChange={handleInputChange}
                  placeholder="Enter landline number"
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base placeholder:text-fg-muted focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                />
              </div>
            </div>

            {/* Other Field */}
            <div>
              <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">
                Other
              </label>
              <input
                type="text"
                name="other"
                value={formData.other}
                onChange={handleInputChange}
                placeholder="Enter any other information"
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base placeholder:text-fg-muted focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
              />
            </div>

            {/* Compliance Profile Section */}
            <div className="space-y-4 pt-2">
              <div className="border-t border-line/15/60 pt-4">
                <h4 className="text-white font-medium text-sm mb-1">Compliance Profile</h4>
                <p className="text-fg-muted text-xs mb-4">These fields help determine which regulatory compliances apply to your company. Fill what you can — you can update later.</p>
              </div>

              {/* Row 1: Employee Count + Annual Turnover */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">Employee Count</label>
                  <input
                    type="number"
                    name="employeeCount"
                    value={formData.employeeCount}
                    onChange={handleInputChange}
                    placeholder="e.g. 25"
                    min="0"
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base placeholder:text-fg-muted focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                  />
                  <p className="text-fg-muted/60 text-[10px] mt-1">Determines PF (20+), ESI (10+), POSH (10+), Gratuity (10+)</p>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">Annual Turnover (in Lakhs)</label>
                  <input
                    type="number"
                    name="annualTurnover"
                    value={formData.annualTurnover}
                    onChange={handleInputChange}
                    placeholder="e.g. 500 for 5 Crore"
                    min="0"
                    step="0.01"
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base placeholder:text-fg-muted focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                  />
                  <p className="text-fg-muted/60 text-[10px] mt-1">Determines Tax Audit (100L+), E-Invoicing (500L+), GST Audit (500L+)</p>
                </div>
              </div>

              {/* Row 2: Net Worth + GST */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">Net Worth (in Crores)</label>
                  <input
                    type="number"
                    name="netWorth"
                    value={formData.netWorth}
                    onChange={handleInputChange}
                    placeholder="e.g. 10"
                    min="0"
                    step="0.01"
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base placeholder:text-fg-muted focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                  />
                  <p className="text-fg-muted/60 text-[10px] mt-1">Determines CSR (500Cr+), CARO thresholds</p>
                </div>
                <div>
                  <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">GSTINs</label>

                  <div className="flex items-center gap-3 mb-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.isGstRegistered}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          isGstRegistered: e.target.checked,
                          // Seed a first row when toggling on; clear list when toggling off.
                          gstRegistrations: e.target.checked
                            ? (prev.gstRegistrations.length > 0 ? prev.gstRegistrations : [{ gstin: '', state: '' }])
                            : [],
                          gstNumber: e.target.checked ? prev.gstNumber : '',
                        }))}
                        className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-fg-muted bg-bg-elevated border-line/30 rounded focus:ring-gray-500"
                      />
                      <span className="text-fg-muted text-xs">GST Registered</span>
                    </label>

                    {formData.isGstRegistered && formData.gstRegistrations.length === 0 && formData.companyName && (
                      <button
                        type="button"
                        disabled={isLookingUpGST}
                        onClick={async () => {
                          setIsLookingUpGST(true)
                          try {
                            const result = await lookupGST({
                              companyName: formData.companyName,
                              cin: formData.cinNumber || undefined,
                              pan: formData.panNumber || undefined,
                            })
                            if (result.found && result.gstNumbers && result.gstNumbers.length > 0) {
                              const registrations = result.gstNumbers.map(g => ({ gstin: g.gstn, state: g.state }))
                              const firstPan = extractPANFromGSTN(registrations[0].gstin)
                              setFormData(prev => ({
                                ...prev,
                                gstRegistrations: registrations,
                                gstNumber: registrations[0].gstin,
                                ...(!prev.panNumber && (result.pan || firstPan) ? { panNumber: result.pan || firstPan || '' } : {}),
                              }))
                              const stateCount = new Set(registrations.map(r => r.state)).size
                              showToast(
                                registrations.length > 1
                                  ? `Found ${registrations.length} GSTINs across ${stateCount} state${stateCount > 1 ? 's' : ''}`
                                  : `GST found: ${registrations[0].gstin} (${registrations[0].state})`,
                                'success',
                              )
                            } else {
                              showToast('No GST registration found for this company', 'info')
                            }
                          } catch {
                            showToast('GST lookup failed', 'error')
                          }
                          setIsLookingUpGST(false)
                        }}
                        className="px-3 py-2 bg-bg-elevated border border-line/30 rounded-lg text-fg-secondary text-xs hover:bg-bg-hover hover:text-white transition-colors whitespace-nowrap disabled:opacity-50"
                      >
                        {isLookingUpGST ? (
                          <span className="flex items-center gap-1.5">
                            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                            Looking up...
                          </span>
                        ) : (
                          <>Find GST</>
                        )}
                      </button>
                    )}
                  </div>

                  {formData.isGstRegistered && (
                    <div className="space-y-2">
                      {formData.gstRegistrations.map((reg, idx) => {
                        const homeState = formData.state?.trim()
                        const isWithin = homeState && reg.state && reg.state.toLowerCase() === homeState.toLowerCase()
                        return (
                          <div key={idx} className="flex items-center gap-2">
                            <input
                              type="text"
                              value={reg.gstin}
                              onChange={(e) => {
                                const gstin = e.target.value.toUpperCase().trim().slice(0, 15)
                                const parsed = parseGSTN(gstin)
                                setFormData(prev => {
                                  const next = [...prev.gstRegistrations]
                                  next[idx] = { gstin, state: parsed?.stateName || next[idx].state }
                                  const panUpdate = (!prev.panNumber && gstin.length === 15)
                                    ? { panNumber: extractPANFromGSTN(gstin) || '' }
                                    : {}
                                  return {
                                    ...prev,
                                    gstRegistrations: next,
                                    // Keep legacy single gstNumber mirrored with the first row for
                                    // downstream compatibility until callers migrate.
                                    gstNumber: idx === 0 ? gstin : prev.gstNumber,
                                    ...panUpdate,
                                  }
                                })
                              }}
                              placeholder="22AAAAA0000A1Z5"
                              maxLength={15}
                              className="flex-1 px-3 py-2 bg-bg-card border border-line/15 rounded-lg text-white text-sm font-light focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors uppercase"
                            />
                            <div className="w-40 px-3 py-2 bg-bg-card/50 border border-line/10 rounded-lg text-fg-muted text-xs flex items-center justify-between">
                              <span className="truncate">{reg.state || '—'}</span>
                              {reg.state && (
                                <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded ${isWithin ? 'bg-emerald-900/40 text-emerald-300' : 'bg-amber-900/40 text-amber-300'}`}>
                                  {isWithin ? 'Within' : 'Outside'}
                                </span>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setFormData(prev => {
                                const next = prev.gstRegistrations.filter((_, i) => i !== idx)
                                return {
                                  ...prev,
                                  gstRegistrations: next,
                                  gstNumber: next[0]?.gstin || '',
                                }
                              })}
                              className="p-2 text-fg-muted hover:text-red-400 transition-colors"
                              title="Remove"
                              aria-label={`Remove GSTIN row ${idx + 1}`}
                            >
                              ×
                            </button>
                          </div>
                        )
                      })}
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          gstRegistrations: [...prev.gstRegistrations, { gstin: '', state: '' }],
                        }))}
                        className="text-xs text-fg-muted hover:text-white transition-colors"
                      >
                        + Add another GSTIN
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Row 3: MSME + Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">MSME Status</label>
                  <select
                    name="isMsme"
                    value={formData.isMsme}
                    onChange={handleInputChange}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors appearance-none font-light cursor-pointer"
                  >
                    <option value="">Not sure / Not applicable</option>
                    <option value="yes">Yes — MSME Registered</option>
                    <option value="no">No</option>
                  </select>
                </div>
                {formData.isMsme === 'yes' && (
                  <div>
                    <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">MSME Category</label>
                    <select
                      name="msmeCategory"
                      value={formData.msmeCategory}
                      onChange={handleInputChange}
                      className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors appearance-none font-light cursor-pointer"
                    >
                      <option value="">Select category</option>
                      <option value="micro">Micro</option>
                      <option value="small">Small</option>
                      <option value="medium">Medium</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Row 4: Boolean flags */}
              <div className="flex flex-wrap gap-3 sm:gap-4">
                <label className="flex items-center gap-2 p-2.5 sm:p-3 bg-bg-card border border-line/15 rounded-lg cursor-pointer hover:border-line/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.hasImportsExports}
                    onChange={(e) => setFormData(prev => ({ ...prev, hasImportsExports: e.target.checked }))}
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-fg-muted bg-bg-elevated border-line/30 rounded focus:ring-gray-500"
                  />
                  <span className="text-fg-secondary text-xs sm:text-sm font-light">Has Imports / Exports</span>
                </label>
                <label className="flex items-center gap-2 p-2.5 sm:p-3 bg-bg-card border border-line/15 rounded-lg cursor-pointer hover:border-line/30 transition-colors">
                  <input
                    type="checkbox"
                    checked={formData.isStartupDpiit}
                    onChange={(e) => setFormData(prev => ({ ...prev, isStartupDpiit: e.target.checked }))}
                    className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-fg-muted bg-bg-elevated border-line/30 rounded focus:ring-gray-500"
                  />
                  <span className="text-fg-secondary text-xs sm:text-sm font-light">DPIIT-Recognized Startup</span>
                </label>
              </div>
            </div>

            {/* Directors Section */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4">
                <label className="block text-xs sm:text-sm font-light text-fg-secondary">
                  Directors
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddDirector(!showAddDirector)}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 border border-line/15 text-fg-secondary rounded-lg hover:border-line/30 hover:text-white transition-colors text-xs sm:text-sm flex items-center justify-center gap-2 w-full sm:w-auto font-light"
                >
                  <svg width="14" height="14" className="sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span className="hidden sm:inline">Add Director{countryConfig.onboarding.verificationServices?.director ? ' by DIN' : ''}</span>
                  <span className="sm:hidden">Add Director</span>
                </button>
              </div>

              {/* Add Director by DIN/Director ID */}
              {showAddDirector && countryConfig.labels.directorId && (
                <div className="mb-4 p-3 sm:p-4 bg-bg-card border border-line/15 rounded-lg">
                  <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">
                    {countryConfig.labels.directorId}
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={newDirectorDIN}
                      onChange={(e) => {
                        setNewDirectorDIN(e.target.value)
                        setErrors((prev) => ({ ...prev, newDirectorDIN: '' }))
                      }}
                      placeholder={`Enter ${countryConfig.labels.directorId}`}
                      className="flex-1 px-3 sm:px-4 py-2 bg-bg-elevated border border-line/15 rounded-lg text-white text-sm sm:text-base placeholder:text-fg-muted focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                    />
                    <button
                      type="button"
                      onClick={handleAddDirectorByDIN}
                      disabled={!newDirectorDIN.trim()}
                      className="px-3 sm:px-4 py-2 border border-line/15 text-fg-secondary rounded-lg hover:border-line/30 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base font-light"
                    >
                      {hasAPISupport ? 'Verify & Add' : 'Add'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddDirector(false)
                        setNewDirectorDIN('')
                      }}
                      className="px-3 sm:px-4 py-2 bg-bg-elevated border border-line/15 text-fg-secondary rounded-lg hover:bg-bg-hover transition-colors text-sm sm:text-base"
                    >
                      Cancel
                    </button>
                  </div>
                  {errors.newDirectorDIN && (
                    <p className="mt-2 text-xs sm:text-sm text-red-400">{errors.newDirectorDIN}</p>
                  )}
                  {/* Manual Verification Notice for non-India countries */}
                  {!hasAPISupport && newDirectorDIN.trim() && (
                    <ManualVerificationNotice
                      countryCode={countryCode}
                      fieldType="director"
                      value={newDirectorDIN}
                    />
                  )}
                </div>
              )}

              {/* Directors List */}
              {directors.length > 0 ? (
                <div className="space-y-2 sm:space-y-3">
                  {directors.map((director) => (
                    <div
                      key={director.id}
                      className={`p-3 sm:p-4 bg-bg-card border rounded-lg ${
                        director.verified
                          ? 'border-green-500/50 bg-green-500/5'
                          : 'border-line/15'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-2 sm:mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h4 className="text-white font-light text-sm sm:text-base break-words">
                              {director.firstName} {director.middleName} {director.lastName}
                            </h4>
                            {director.verified && (
                              <span className="px-1.5 sm:px-2 py-0.5 bg-green-500/20 text-green-400 text-[10px] sm:text-xs rounded flex items-center gap-1 flex-shrink-0">
                                <svg width="10" height="10" className="sm:w-3 sm:h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                  <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                                Verified
                              </span>
                            )}
                            {director.source === 'cin' && !director.verified && (
                              <span className="px-1.5 sm:px-2 py-0.5 bg-yellow-500/20 text-yellow-400 text-[10px] sm:text-xs rounded flex-shrink-0">
                                From CIN
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 text-xs sm:text-sm text-fg-muted">
                            {director.din && (
                              <div className="break-words">
                                <span className="text-fg-muted">DIN:</span> {director.din}
                              </div>
                            )}
                            {director.designation && (
                              <div className="break-words">
                                <span className="text-fg-muted">Designation:</span> {director.designation}
                              </div>
                            )}
                            {director.dob && (
                              <div className="break-words">
                                <span className="text-fg-muted">DOB:</span> {formatDateForDisplay(director.dob)}
                              </div>
                            )}
                            {director.pan && (
                              <div className="break-words">
                                <span className="text-fg-muted">PAN:</span> {director.pan}
                              </div>
                            )}
                            {director.email && (
                              <div className="break-words">
                                <span className="text-fg-muted">Email:</span> {director.email}
                              </div>
                            )}
                            {director.mobile && (
                              <div className="break-words">
                                <span className="text-fg-muted">Mobile:</span> {director.mobile}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:ml-4 flex-shrink-0">
                          {director.source === 'cin' && !director.verified && director.din && hasAPISupport && (
                            <button
                              type="button"
                              onClick={() => handleDINVerification(director.id, director.din)}
                              disabled={isVerifyingDIN === director.id}
                              className="px-2 sm:px-3 py-1 sm:py-1.5 border border-line/15 text-fg-secondary rounded text-xs sm:text-sm hover:border-line/30 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 font-light"
                            >
                              {isVerifyingDIN === director.id ? (
                                <>
                                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-line/30 border-t-transparent rounded-full animate-spin"></div>
                                  <span className="hidden sm:inline">Verifying...</span>
                                </>
                              ) : (
                                <>
                                  <svg width="12" height="12" className="sm:w-[14px] sm:h-[14px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                    <polyline points="22 4 12 14.01 9 11.01" />
                                  </svg>
                                  <span className="hidden sm:inline">Verify DIN</span>
                                  <span className="sm:hidden">Verify</span>
                                </>
                              )}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveDirector(director.id)}
                            className="p-1 sm:p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
                          >
                            <svg width="16" height="16" className="sm:w-[18px] sm:h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6L18 18" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      {errors[`director_${director.id}`] && (
                        <p className="mt-2 text-xs sm:text-sm text-red-400">{errors[`director_${director.id}`]}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 sm:p-6 bg-bg-card border border-line/15 rounded-lg text-center text-fg-muted">
                  <p className="text-sm sm:text-base">No directors added yet.</p>
                  <p className="text-xs sm:text-sm mt-1">Verify CIN to auto-add directors or add manually using DIN.</p>
                </div>
              )}
            </div>

            {/* Ex-Directors Section */}
            <div>
              <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2">
                Ex-Directors / Former Directors <span className="text-fg-muted text-[10px] sm:text-xs font-normal ml-1">(Optional)</span>
                {isCINVerified && exDirectors && (
                  <span className="ml-2 text-[10px] sm:text-xs text-fg-muted flex items-center gap-1">
                    <svg width="10" height="10" className="sm:w-3 sm:h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                    Auto-filled from MCA records
                  </span>
                )}
              </label>
              <textarea
                value={exDirectors}
                onChange={(e) => setExDirectors(e.target.value)}
                placeholder="Enter ex-director names separated by commas or new lines (e.g., John Doe, Jane Smith or one per line)"
                rows={4}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border border-line/15 rounded-lg text-white text-sm sm:text-base placeholder:text-fg-muted focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors resize-y font-light"
              />
              <p className="mt-1 text-[10px] sm:text-xs text-fg-muted">
                You can enter multiple names separated by commas or one per line. This information will be stored for reference.
              </p>
            </div>

              </>
            ) : (
              <>
                {/* Document Uploads - Step 2 */}
            <div>
              <label className="block text-xs sm:text-sm font-light text-fg-secondary mb-2 sm:mb-3">
                Required Documents <span className="text-fg-muted text-[10px] sm:text-xs font-normal ml-1">(Optional)</span>
              </label>
              <div className="space-y-3 sm:space-y-4">
                {countryConfig.onboarding.documentTypes.map((docType) => (
                  <div key={docType}>
                    <label className="block text-xs sm:text-sm text-fg-muted mb-1.5 sm:mb-2 font-light">
                      {docType}
                    </label>
                    <div className="flex items-center gap-2 sm:gap-4">
                      <label className="flex-1 cursor-pointer min-w-0">
                        <input
                          type="file"
                          onChange={(e) =>
                            handleFileChange(docType, e.target.files?.[0] || null)
                          }
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                        />
                        <div
                          className={`px-3 sm:px-4 py-2 sm:py-3 bg-bg-card border rounded-lg transition-colors flex items-center justify-between ${
                            formData.documents[docType]
                              ? 'border-line/30 text-white'
                              : 'border-line/15 text-fg-muted hover:border-line/30'
                          }`}
                        >
                          <span className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
                            {formData.documents[docType] ? (
                              <>
                                <svg
                                  width="14"
                                  height="14"
                                  className="sm:w-4 sm:h-4 flex-shrink-0 text-white"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                >
                                  <path
                                    d="M9 12L11 14L15 10"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                  <path
                                    d="M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  />
                                </svg>
                                <span className="text-white text-xs sm:text-sm truncate">
                                  {formData.documents[docType]?.name}
                                </span>
                              </>
                            ) : (
                              <span className="text-xs sm:text-sm">Choose file</span>
                            )}
                          </span>
                          {formData.documents[docType] ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                handleFileChange(docType, null)
                              }}
                              className="text-red-400 hover:text-red-300 transition-colors flex-shrink-0 ml-2"
                            >
                              <svg
                                width="16"
                                height="16"
                                className="sm:w-[18px] sm:h-[18px]"
                                viewBox="0 0 24 24"
                                fill="none"
                              >
                                <path
                                  d="M18 6L6 18M6 6L18 18"
                                  stroke="currentColor"
                                  strokeWidth="2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </button>
                          ) : (
                            <svg
                              width="16"
                              height="16"
                              className="sm:w-5 sm:h-5 flex-shrink-0 text-fg-muted"
                              viewBox="0 0 24 24"
                              fill="none"
                            >
                              <path
                                d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                              <path
                                d="M14 2V8H20"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          )}
                        </div>
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </div>
              </>
            )}

            {/* Submit Buttons */}
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-4 pt-4 sm:pt-6 border-t border-line/10">
              {currentStep === 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-transparent border border-line/15 text-fg-secondary rounded-lg hover:border-line/30 hover:text-white transition-colors text-sm sm:text-base"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      // Validate step 1 fields
                      const newErrors: Record<string, string> = {}
                      if (!formData.companyName.trim()) {
                        newErrors.companyName = 'Company name is required'
                      }
                      if (!formData.companyType) {
                        newErrors.companyType = 'Please select a company type'
                      }
                      if (!formData.cinNumber.trim()) {
                        newErrors.cinNumber = 'CIN number is required'
                      }
                      if (formData.industries.length === 0) {
                        newErrors.industries = 'Please select at least one industry'
                      }
                      if (!formData.dateOfIncorporation) {
                        newErrors.dateOfIncorporation = 'Date of incorporation is required'
                      }
                      if (formData.industryCategories.length === 0) {
                        newErrors.industryCategories = 'Please select at least one industry category'
                      }
                      if (formData.industryCategories.includes('Other') && !formData.otherIndustryCategory.trim()) {
                        newErrors.otherIndustryCategory = 'Please specify industry category'
                      }
                      if (!formData.address.trim()) {
                        newErrors.address = 'Address is required'
                      }
                      if (!formData.city.trim()) {
                        newErrors.city = 'City is required'
                      }
                      if (!formData.state.trim()) {
                        newErrors.state = 'State is required'
                      }
                      if (!formData.pinCode.trim()) {
                        newErrors.pinCode = 'PIN code is required'
                      }

                      setErrors(newErrors)
                      if (Object.keys(newErrors).length === 0) {
                        setCurrentStep(2)
                      }
                    }}
                    className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 border border-line/15 text-fg-secondary rounded-lg hover:border-line/30 hover:text-white transition-colors flex items-center justify-center gap-2 text-sm sm:text-base font-light"
                  >
                    Update and Next
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(1)}
                    className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-transparent border border-line/15 text-fg-secondary rounded-lg hover:border-line/30 hover:text-white transition-colors text-sm sm:text-base"
                  >
                    Back
                  </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-transparent border border-line/15 text-fg-secondary rounded-lg hover:border-line/30 hover:text-white transition-colors text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 border border-line/15 text-fg-secondary rounded-lg hover:border-line/30 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base font-light min-w-[260px]"
                title={isSubmitting ? submitStatusMessage : undefined}
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
                    <span className="truncate" key={submitStatusMessage}>{submitStatusMessage}</span>
                  </>
                ) : (
                  'Create Company'
                )}
              </button>
                </>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}
