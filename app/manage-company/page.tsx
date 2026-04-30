'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import CircuitBackground from '@/components/ui/CircuitBackground'
import Header from '@/components/layout/Header'
import { useAuth } from '@/hooks/useAuth'
import { updateCompany } from '@/app/onboarding/actions'
import { getManageCompanyData } from '@/app/manage-company/actions'
import { verifyDIN } from '@/lib/api/cin-din'
import { trackCompanyEdit } from '@/lib/tracking/kpi-tracker'
import { useCompanyCountry } from '@/hooks/useCompanyCountry'
import { parseCIN } from '@/utils/cin-parser'
import { parseGSTN, extractPANFromGSTN } from '@/lib/utils/gstn'

const INDUSTRY_CATEGORIES = [
  'Startups & MSMEs',
  'Large Enterprises',
  'NGOs & Section 8 Companies',
  'Healthcare & Education',
  'Real Estate & Construction',
  'IT & Technology Services',
  'Retail & Manufacturing',
  'Other',
]

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

function ManageCompanyPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user, loading: authLoading } = useAuth()

  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [currentCompany, setCurrentCompany] = useState<{ id: string; name: string; type: string; year: string; country_code?: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [directors, setDirectors] = useState<Director[]>([])
  const [newDirectorDIN, setNewDirectorDIN] = useState('')
  const [showAddDirector, setShowAddDirector] = useState(false)
  const [isVerifyingDIN, setIsVerifyingDIN] = useState<string | null>(null)
  const [exDirectors, setExDirectors] = useState<string>('')

  // Get country configuration
  const { countryCode, countryConfig } = useCompanyCountry(currentCompany)

  const [formData, setFormData] = useState({
    companyName: '',
    companyType: '',
    panNumber: '',
    cinNumber: '',
    industry: '',
    address: '',
    city: '',
    state: '',
    pinCode: '',
    phoneNumber: '',
    email: '',
    landline: '',
    other: '',
    industryCategories: [] as string[],
    otherIndustryCategory: '',
    // Compliance intelligence fields
    employeeCount: '',
    annualTurnover: '',
    isGstRegistered: false,
    gstNumber: '',
    gstRegistrations: [] as Array<{ gstin: string; state: string }>,
    netWorth: '',
    isMsme: '',
    msmeCategory: '',
    hasImportsExports: false,
    isStartupDpiit: false,
  })

  // Parse CIN to extract NIC code and other details
  const cinParsed = useMemo(() => {
    if (!formData.cinNumber || countryCode !== 'IN') return null
    const result = parseCIN(formData.cinNumber)
    return result.isValid ? result : null
  }, [formData.cinNumber, countryCode])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/')
      return
    }

    if (user) {
      fetchCompanyData()
    }
  }, [user, authLoading])

  const fetchCompanyData = async () => {
    try {
      const companyIdParam = searchParams?.get('company_id') || searchParams?.get('company')
      const result = await getManageCompanyData(companyIdParam)

      if (result.redirectTo) {
        router.push(result.redirectTo)
        return
      }

      if (result.data) {
        setCompanyId(result.data.id)
        setCurrentCompany({
          id: result.data.id,
          name: result.data.name,
          type: result.data.type,
          year: result.data.year,
          country_code: result.data.country_code,
        })
        setFormData(result.data.formData)
        setExDirectors(result.data.exDirectors)
        setDirectors(result.data.directors)
      }
    } catch (error) {
      console.error('Error fetching company:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: '' }))
    }
  }

  const handleIndustryCategoryChange = (category: string) => {
    setFormData((prev) => {
      const isCurrentlySelected = prev.industryCategories.includes(category)
      const categories = isCurrentlySelected
        ? prev.industryCategories.filter((c) => c !== category)
        : [...prev.industryCategories, category]

      const otherIndustryCategory = category === 'Other' && isCurrentlySelected
        ? ''
        : prev.otherIndustryCategory

      return { ...prev, industryCategories: categories, otherIndustryCategory }
    })
  }

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return ''
      return date.toISOString().split('T')[0]
    } catch {
      return ''
    }
  }

  const formatDateForDisplay = (dateStr: string | null | undefined): string => {
    if (!dateStr) return ''
    try {
      const date = new Date(dateStr)
      if (isNaN(date.getTime())) return dateStr
      return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    } catch {
      return dateStr
    }
  }

  const handleDINVerification = async (directorId: string, din: string) => {
    // Only allow DIN verification for India
    if (countryCode !== 'IN') {
      return
    }

    if (!din.trim()) return

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
    // Only allow DIN verification for India
    if (countryCode !== 'IN') {
      return
    }

    if (!newDirectorDIN.trim()) {
      setErrors((prev) => ({ ...prev, newDirectorDIN: `Please enter ${countryConfig.labels.directorId} number` }))
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId) return

    setIsSubmitting(true)
    try {
      const result = await updateCompany(companyId, {
        ...formData,
        directors,
        exDirectors: exDirectors.trim() || undefined
      })
      if (result.success) {
        // Track company edit
        if (user?.id) {
          trackCompanyEdit(user.id, companyId)
        }
        router.push('/data-room')
      }
    } catch (error) {
      console.error('Error updating company:', error)
      alert('Failed to update company: ' + (error instanceof Error ? error.message : 'Something went wrong'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="text-fg-primary text-lg text-center font-light">
          <div className="w-8 h-8 border-2 border-line/30 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          Loading Company Data...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg-base relative overflow-hidden">
      <CircuitBackground />
      <Header />

      <div className="relative z-10 container mx-auto px-4 py-8 sm:py-12 max-w-4xl">
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 bg-bg-elevated border border-line/15 rounded-lg flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-light text-fg-primary">Manage Company</h1>
              <p className="text-fg-muted text-sm font-light mt-1">Edit your company profile and compliance details</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-bg-card border border-line/10 rounded-xl p-6 sm:p-10">
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs text-fg-muted uppercase tracking-wider font-light mb-2">Company Name</label>
                <input
                  type="text"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary font-light focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-fg-muted uppercase tracking-wider font-light mb-2">
                  {countryConfig.labels.registrationId} (ReadOnly)
                </label>
                <input
                  type="text"
                  value={formData.cinNumber}
                  readOnly
                  className="w-full px-4 py-3 bg-bg-card/50 border border-line/10 rounded-lg text-fg-muted cursor-not-allowed font-light"
                />

                {/* NIC Classification Card */}
                {cinParsed && (
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
                      <div className="text-fg-secondary">{cinParsed.isListed ? 'Listed' : 'Unlisted'}</div>

                      <div className="text-fg-muted">State of Registration</div>
                      <div className="text-fg-secondary">{cinParsed.stateName || cinParsed.stateCode || '—'}</div>

                      <div className="text-fg-muted">Year of Incorporation</div>
                      <div className="text-fg-secondary">{cinParsed.yearOfIncorporation || '—'}</div>

                      <div className="text-fg-muted">Company Type</div>
                      <div className="text-fg-secondary">{cinParsed.companyTypeName || cinParsed.companyTypeCode || '—'}</div>
                    </div>

                    {cinParsed.nicDetails && (
                      <>
                        <div className="border-t border-line/15/60 my-2"></div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs sm:text-sm font-medium text-fg-secondary">Industry Classification (NIC 2008)</span>
                        </div>
                        <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs sm:text-sm">
                          <span className="text-fg-muted">Section</span>
                          <span className="text-fg-secondary">{cinParsed.nicDetails.section} — {cinParsed.nicDetails.sectionName}</span>

                          <span className="text-fg-muted">Division</span>
                          <span className="text-fg-secondary">{cinParsed.nicDetails.divisionCode} — {cinParsed.nicDetails.divisionName}</span>

                          <span className="text-fg-muted">Group</span>
                          <span className="text-fg-secondary">{cinParsed.nicDetails.groupCode} — {cinParsed.nicDetails.groupName}</span>

                          <span className="text-fg-muted">Class</span>
                          <span className="text-fg-secondary">{cinParsed.nicDetails.classCode} — {cinParsed.nicDetails.className}</span>

                          <span className="text-fg-muted">Sub-class</span>
                          <span className="text-fg-secondary">{cinParsed.nicDetails.code} — {cinParsed.nicDetails.description}</span>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {!formData.panNumber.trim() && countryCode === 'IN' && (
              <div className="mb-5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3">
                <p className="text-sm text-amber-200 font-light">
                  <span className="font-medium">Add your PAN.</span>{' '}
                  PAN is required for compliance tracking (ITR, TDS, advance tax).
                  Fill it below before saving to keep the tracker accurate.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs text-fg-muted uppercase tracking-wider font-light mb-2">
                  {countryConfig.labels.taxId}
                  {countryCode === 'IN' && <span className="text-red-400 ml-1">*</span>}
                </label>
                <input
                  type="text"
                  name="panNumber"
                  value={formData.panNumber}
                  onChange={handleInputChange}
                  required={countryCode === 'IN'}
                  className={`w-full px-4 py-3 bg-bg-card border rounded-lg text-fg-primary font-light focus:outline-none focus:ring-1 transition-colors ${
                    !formData.panNumber.trim() && countryCode === 'IN'
                      ? 'border-amber-500/60 focus:border-amber-400 focus:ring-amber-400'
                      : 'border-line/15 focus:border-line/30 focus:ring-gray-600'
                  }`}
                />
              </div>
              <div>
                <label className="block text-xs text-fg-muted uppercase tracking-wider font-light mb-2">Phone Number</label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary font-light focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors"
                />
              </div>
            </div>

            {/* Address Info */}
            <div>
              <label className="block text-xs text-fg-muted uppercase tracking-wider font-light mb-2">Address</label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary font-light focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs text-fg-muted uppercase tracking-wider font-light mb-2">City</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary font-light focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-fg-muted uppercase tracking-wider font-light mb-2">State</label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary font-light focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-fg-muted uppercase tracking-wider font-light mb-2">
                  {countryConfig.labels.postalCode}
                </label>
                <input
                  type="text"
                  name="pinCode"
                  value={formData.pinCode}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary font-light focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors"
                />
              </div>
            </div>

            {/* Industry Categories */}
            <div>
              <label className="block text-xs text-fg-muted uppercase tracking-wider font-light mb-3">Category of Industry</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {INDUSTRY_CATEGORIES.map((category) => (
                  <label
                    key={category}
                    className="flex items-center gap-3 p-3 bg-bg-card border border-line/15 rounded-lg cursor-pointer hover:border-line/30 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={formData.industryCategories.includes(category)}
                      onChange={() => handleIndustryCategoryChange(category)}
                      className="w-4 h-4 text-fg-muted bg-bg-elevated border-line/30 rounded focus:ring-gray-500 focus:ring-2"
                    />
                    <span className="text-fg-secondary text-sm font-light">{category}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* ── Compliance Profile (for Rules Engine) ── */}
            {countryCode === 'IN' && (
              <div className="border border-line/15/50 rounded-xl p-5 bg-bg-card/30 space-y-5">
                <div>
                  <h4 className="text-fg-primary font-medium text-sm mb-1">Compliance Profile</h4>
                  <p className="text-fg-muted text-xs">These fields help determine which regulatory compliances apply to your company. The more you fill, the more accurate the compliance tracker becomes.</p>
                </div>

                {/* Row 1: Employee Count + Annual Turnover */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs text-fg-muted uppercase tracking-wider font-light mb-2">Employee Count</label>
                    <input
                      type="number"
                      name="employeeCount"
                      value={formData.employeeCount}
                      onChange={handleInputChange}
                      placeholder="e.g. 25"
                      min="0"
                      className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary font-light focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors"
                    />
                    <p className="text-fg-muted/60 text-[10px] mt-1">Determines PF (20+), ESI (10+), POSH (10+), Gratuity (10+)</p>
                  </div>
                  <div>
                    <label className="block text-xs text-fg-muted uppercase tracking-wider font-light mb-2">Annual Turnover (in Lakhs ₹)</label>
                    <input
                      type="number"
                      name="annualTurnover"
                      value={formData.annualTurnover}
                      onChange={handleInputChange}
                      placeholder="e.g. 500 for ₹5 Crore"
                      min="0"
                      step="0.01"
                      className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary font-light focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors"
                    />
                    <p className="text-fg-muted/60 text-[10px] mt-1">Determines Tax Audit (100L+), E-Invoicing (500L+), GST Audit (500L+)</p>
                  </div>
                </div>

                {/* Row 2: Net Worth + GST */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs text-fg-muted uppercase tracking-wider font-light mb-2">Net Worth (in Crores ₹)</label>
                    <input
                      type="number"
                      name="netWorth"
                      value={formData.netWorth}
                      onChange={handleInputChange}
                      placeholder="e.g. 10"
                      min="0"
                      step="0.01"
                      className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary font-light focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors"
                    />
                    <p className="text-fg-muted/60 text-[10px] mt-1">Determines CSR (500Cr+), CARO thresholds</p>
                  </div>
                  <div>
                    <label className="block text-xs text-fg-muted uppercase tracking-wider font-light mb-2">GSTINs</label>

                    <div className="flex items-center gap-3 mb-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={formData.isGstRegistered}
                          onChange={(e) => setFormData(prev => ({
                            ...prev,
                            isGstRegistered: e.target.checked,
                            gstRegistrations: e.target.checked
                              ? (prev.gstRegistrations.length > 0 ? prev.gstRegistrations : [{ gstin: '', state: '' }])
                              : [],
                            gstNumber: e.target.checked ? prev.gstNumber : '',
                          }))}
                          className="w-4 h-4 text-blue-500 bg-bg-elevated border-line/30 rounded focus:ring-gray-500"
                        />
                        <span className="text-fg-muted text-xs">GST Registered</span>
                      </label>
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
                                      gstNumber: idx === 0 ? gstin : prev.gstNumber,
                                      ...panUpdate,
                                    }
                                  })
                                }}
                                placeholder="22AAAAA0000A1Z5"
                                maxLength={15}
                                className="flex-1 px-3 py-2 bg-bg-card border border-line/15 rounded-lg text-fg-primary text-sm font-light focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors uppercase"
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
                          className="text-xs text-fg-muted hover:text-fg-primary transition-colors"
                        >
                          + Add another GSTIN
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Row 3: MSME + Category */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs text-fg-muted uppercase tracking-wider font-light mb-2">MSME Status</label>
                    <select
                      name="isMsme"
                      value={formData.isMsme}
                      onChange={handleInputChange}
                      className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary font-light focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors"
                    >
                      <option value="">Not sure / Not applicable</option>
                      <option value="yes">Yes — MSME Registered</option>
                      <option value="no">No</option>
                    </select>
                  </div>
                  {formData.isMsme === 'yes' && (
                    <div>
                      <label className="block text-xs text-fg-muted uppercase tracking-wider font-light mb-2">MSME Category</label>
                      <select
                        name="msmeCategory"
                        value={formData.msmeCategory}
                        onChange={handleInputChange}
                        className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary font-light focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors"
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
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2 p-3 bg-bg-card border border-line/15 rounded-lg cursor-pointer hover:border-line/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.hasImportsExports}
                      onChange={(e) => setFormData(prev => ({ ...prev, hasImportsExports: e.target.checked }))}
                      className="w-4 h-4 text-blue-500 bg-bg-elevated border-line/30 rounded focus:ring-gray-500"
                    />
                    <span className="text-fg-secondary text-sm font-light">Has Imports / Exports</span>
                  </label>
                  <label className="flex items-center gap-2 p-3 bg-bg-card border border-line/15 rounded-lg cursor-pointer hover:border-line/30 transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.isStartupDpiit}
                      onChange={(e) => setFormData(prev => ({ ...prev, isStartupDpiit: e.target.checked }))}
                      className="w-4 h-4 text-blue-500 bg-bg-elevated border-line/30 rounded focus:ring-gray-500"
                    />
                    <span className="text-fg-secondary text-sm font-light">DPIIT-Recognized Startup</span>
                  </label>
                </div>
              </div>
            )}

            {/* Directors Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="block text-xs text-fg-muted uppercase tracking-wider font-light">Directors</label>
                <button
                  type="button"
                  onClick={() => setShowAddDirector(!showAddDirector)}
                  className="px-4 py-2 border border-line/15 text-fg-secondary rounded-lg hover:border-line/30 hover:text-fg-primary transition-colors text-sm flex items-center gap-2 font-light"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  Add Director by {countryConfig.labels.directorId}
                </button>
              </div>

              {/* Add Director by DIN - Only show for India */}
              {showAddDirector && countryCode === 'IN' && (
                <div className="mb-4 p-4 bg-bg-card border border-line/15 rounded-lg">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDirectorDIN}
                      onChange={(e) => {
                        setNewDirectorDIN(e.target.value)
                        setErrors((prev) => ({ ...prev, newDirectorDIN: '' }))
                      }}
                      placeholder={`Enter ${countryConfig.labels.directorId} number`}
                      className="flex-1 px-4 py-2 bg-bg-elevated border border-line/15 rounded-lg text-fg-primary text-sm placeholder:text-fg-muted font-light focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={handleAddDirectorByDIN}
                      disabled={!newDirectorDIN.trim() || isVerifyingDIN !== null}
                      className="px-4 py-2 border border-line/15 text-fg-secondary rounded-lg hover:border-line/30 hover:text-fg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-light"
                    >
                      {isVerifyingDIN ? 'Verifying...' : 'Verify & Add'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddDirector(false)
                        setNewDirectorDIN('')
                      }}
                      className="px-4 py-2 border border-line/15 text-fg-secondary rounded-lg hover:border-line/30 hover:text-fg-primary transition-colors text-sm font-light"
                    >
                      Cancel
                    </button>
                  </div>
                  {errors.newDirectorDIN && (
                    <p className="mt-2 text-sm text-red-400 font-light">{errors.newDirectorDIN}</p>
                  )}
                </div>
              )}

              {/* Directors List */}
              {directors.length > 0 ? (
                <div className="space-y-3">
                  {directors.map((director) => (
                    <div
                      key={director.id}
                      className={`p-4 bg-bg-card/50 border rounded-lg ${director.verified
                          ? 'border-green-500/30 bg-green-500/5'
                          : 'border-line/10'
                        }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h4 className="text-fg-primary font-light text-sm">
                              {director.firstName} {director.middleName} {director.lastName}
                            </h4>
                            {director.verified && (
                              <span className="px-2 py-0.5 bg-green-500/20 border border-green-500/30 text-green-400 text-xs rounded flex items-center gap-1">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                  <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                                Verified
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-fg-muted font-light">
                            {director.din && (
                              <div><span className="text-fg-muted">{countryConfig.labels.directorId}:</span> {director.din}</div>
                            )}
                            {director.designation && (
                              <div><span className="text-fg-muted">Designation:</span> {director.designation}</div>
                            )}
                            {director.dob && (
                              <div><span className="text-fg-muted">DOB:</span> {formatDateForDisplay(director.dob)}</div>
                            )}
                            {director.pan && (
                              <div><span className="text-fg-muted">{countryConfig.labels.taxId}:</span> {director.pan}</div>
                            )}
                            {director.email && (
                              <div><span className="text-fg-muted">Email:</span> {director.email}</div>
                            )}
                            {director.mobile && (
                              <div><span className="text-fg-muted">Mobile:</span> {director.mobile}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!director.verified && director.din && countryCode === 'IN' && (
                            <button
                              type="button"
                              onClick={() => handleDINVerification(director.id, director.din)}
                              disabled={isVerifyingDIN === director.id}
                              className="px-3 py-1.5 border border-line/15 text-fg-secondary rounded text-xs hover:border-line/30 hover:text-fg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-light"
                            >
                              {isVerifyingDIN === director.id ? (
                                <span className="flex items-center gap-1">
                                  <div className="w-3 h-3 border-2 border-line/30 border-t-transparent rounded-full animate-spin"></div>
                                  Verifying...
                                </span>
                              ) : `Verify ${countryConfig.labels.directorId}`}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveDirector(director.id)}
                            className="p-1.5 text-fg-muted hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                          >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6L18 18" />
                            </svg>
                          </button>
                        </div>
                      </div>
                      {errors[`director_${director.id}`] && (
                        <p className="mt-2 text-xs text-red-400 font-light">{errors[`director_${director.id}`]}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 bg-bg-card/50 border border-line/10 rounded-lg text-center text-fg-muted">
                  <p className="text-sm font-light">No directors added yet.</p>
                  {countryCode === 'IN' ? (
                    <p className="text-xs mt-1 font-light">Add directors manually using {countryConfig.labels.directorId} verification.</p>
                  ) : (
                    <p className="text-xs mt-1 font-light">Add directors manually.</p>
                  )}
                </div>
              )}
            </div>

            {/* Ex-Directors Section */}
            <div>
              <label className="block text-xs text-fg-muted uppercase tracking-wider font-light mb-2">
                Ex-Directors / Former Directors <span className="text-fg-muted text-xs font-light ml-1 normal-case">(Optional)</span>
              </label>
              <textarea
                value={exDirectors}
                onChange={(e) => setExDirectors(e.target.value)}
                placeholder="Enter ex-director names separated by commas or new lines"
                rows={4}
                className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary text-sm placeholder:text-fg-muted font-light focus:outline-none focus:border-line/30 focus:ring-1 focus:ring-gray-600 transition-colors resize-y"
              />
              <p className="mt-1 text-xs text-fg-muted font-light">
                You can enter multiple names separated by commas or one per line.
              </p>
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-4 pt-6 border-t border-line/10">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-3 border border-line/15 text-fg-secondary rounded-lg hover:border-line/30 hover:text-fg-primary transition-colors font-light"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3 border border-line/15 text-fg-secondary rounded-lg hover:border-line/30 hover:text-fg-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-light"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-line/30 border-t-transparent rounded-full animate-spin"></div>
                    Updating...
                  </>
                ) : (
                  'Save Changes'
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function ManageCompanyPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-bg-base flex items-center justify-center">
        <div className="text-fg-primary text-lg text-center font-light">
          <div className="w-8 h-8 border-2 border-line/30 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          Loading...
        </div>
      </div>
    }>
      <ManageCompanyPageInner />
    </Suspense>
  )
}
