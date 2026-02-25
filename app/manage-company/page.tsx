'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import CircuitBackground from '@/components/CircuitBackground'
import Header from '@/components/Header'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/utils/supabase/client'
import { updateCompany, getCompanyDirectors } from '@/app/onboarding/actions'
import { verifyDIN, type DINDirectorData } from '@/lib/api/cin-din'
import { trackCompanyEdit } from '@/lib/tracking/kpi-tracker'
import { useCompanyCountry } from '@/hooks/useCompanyCountry'
import { useCountryValidator } from '@/hooks/useCountryValidator'
import { ManualVerificationNotice } from '@/components/ManualVerificationNotice'

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
  const supabase = createClient()

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
  const countryValidator = useCountryValidator(countryCode)

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
  })

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
      // Get company_id from URL params if available, otherwise fetch first company
      const companyIdParam = searchParams?.get('company_id') || searchParams?.get('company')

      let companyData: any = null

      if (!companyIdParam) {
        // If no company_id in URL, fetch first company owned by user
        const { data, error } = await supabase
          .from('companies')
          .select('*')
          .eq('user_id', user?.id)
          .limit(1)
          .single()

        if (error) throw error
        companyData = data
      } else {
        // If company_id is provided, check if user has access (owner or via user_roles)
        // First check if user owns the company
        const { data: ownedCompany, error: ownedError } = await supabase
          .from('companies')
          .select('*')
          .eq('id', companyIdParam)
          .eq('user_id', user?.id)
          .single()

        if (!ownedError && ownedCompany) {
          // User owns the company
          companyData = ownedCompany
        } else {
          // Check if user has access via user_roles
          const { data: userRole, error: roleError } = await supabase
            .from('user_roles')
            .select('company_id')
            .eq('user_id', user?.id)
            .eq('company_id', companyIdParam)
            .single()

          if (roleError || !userRole) {
            // User doesn't have access, redirect back
            router.push('/data-room')
            return
          }

          // User has access via role, fetch company details
          const { data, error } = await supabase
            .from('companies')
            .select('*')
            .eq('id', companyIdParam)
            .single()

          if (error) throw error
          companyData = data
        }
      }

      if (companyData) {
        setCompanyId(companyData.id)
        setCurrentCompany({
          id: companyData.id,
          name: companyData.name || '',
          type: companyData.type || '',
          year: new Date(companyData.incorporation_date).getFullYear().toString(),
          country_code: companyData.country_code || 'IN'
        })
        setFormData({
          companyName: companyData.name || '',
          companyType: companyData.type || '',
          panNumber: companyData.tax_id || '',
          cinNumber: companyData.registration_id || '',
          industry: companyData.industry || '',
          address: companyData.address || '',
          city: companyData.city || '',
          state: companyData.state || '',
          pinCode: companyData.pin_code || '',
          phoneNumber: companyData.phone_number || '',
          email: companyData.email || '',
          landline: companyData.landline || '',
          other: companyData.other_info || '',
          industryCategories: companyData.industry_categories || [],
          otherIndustryCategory: companyData.other_industry_category || '',
        })

        // Set ex-directors if available
        if (companyData.ex_directors && Array.isArray(companyData.ex_directors) && companyData.ex_directors.length > 0) {
          setExDirectors(companyData.ex_directors.join(', '))
        }

        // Fetch directors
        const directorsResult = await getCompanyDirectors(companyData.id)
        if (directorsResult.success) {
          setDirectors(directorsResult.directors)
        }
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
    } catch (error: any) {
      console.error('Error updating company:', error)
      alert('Failed to update company: ' + error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="text-white text-lg text-center font-light">
          <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          Loading Company Data...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      <CircuitBackground />
      <Header />

      <div className="relative z-10 container mx-auto px-4 py-8 sm:py-12 max-w-4xl">
        <div className="mb-10">
          <div className="flex items-center gap-4 mb-2">
            <div className="w-12 h-12 bg-gray-800 border border-gray-700 rounded-lg flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-light text-white">Manage Company</h1>
              <p className="text-gray-400 text-sm font-light mt-1">Edit your company profile and compliance details</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 sm:p-10">
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider font-light mb-2">Company Name</label>
                <input
                  type="text"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white font-light focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider font-light mb-2">
                  {countryConfig.labels.registrationId} (ReadOnly)
                </label>
                <input
                  type="text"
                  value={formData.cinNumber}
                  readOnly
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-800 rounded-lg text-gray-500 cursor-not-allowed font-light"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider font-light mb-2">
                  {countryConfig.labels.taxId}
                </label>
                <input
                  type="text"
                  name="panNumber"
                  value={formData.panNumber}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white font-light focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider font-light mb-2">Phone Number</label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white font-light focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors"
                />
              </div>
            </div>

            {/* Address Info */}
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-wider font-light mb-2">Address</label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white font-light focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider font-light mb-2">City</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white font-light focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider font-light mb-2">State</label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white font-light focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 uppercase tracking-wider font-light mb-2">
                  {countryConfig.labels.postalCode}
                </label>
                <input
                  type="text"
                  name="pinCode"
                  value={formData.pinCode}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white font-light focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors"
                />
              </div>
            </div>

            {/* Industry Categories */}
            <div>
              <label className="block text-xs text-gray-500 uppercase tracking-wider font-light mb-3">Category of Industry</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {INDUSTRY_CATEGORIES.map((category) => (
                  <label
                    key={category}
                    className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-700 rounded-lg cursor-pointer hover:border-gray-600 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={formData.industryCategories.includes(category)}
                      onChange={() => handleIndustryCategoryChange(category)}
                      className="w-4 h-4 text-gray-400 bg-gray-800 border-gray-600 rounded focus:ring-gray-500 focus:ring-2"
                    />
                    <span className="text-gray-300 text-sm font-light">{category}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Directors Section */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <label className="block text-xs text-gray-500 uppercase tracking-wider font-light">Directors</label>
                <button
                  type="button"
                  onClick={() => setShowAddDirector(!showAddDirector)}
                  className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors text-sm flex items-center gap-2 font-light"
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
                <div className="mb-4 p-4 bg-gray-900 border border-gray-700 rounded-lg">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDirectorDIN}
                      onChange={(e) => {
                        setNewDirectorDIN(e.target.value)
                        setErrors((prev) => ({ ...prev, newDirectorDIN: '' }))
                      }}
                      placeholder={`Enter ${countryConfig.labels.directorId} number`}
                      className="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 font-light focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors"
                    />
                    <button
                      type="button"
                      onClick={handleAddDirectorByDIN}
                      disabled={!newDirectorDIN.trim() || isVerifyingDIN !== null}
                      className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-light"
                    >
                      {isVerifyingDIN ? 'Verifying...' : 'Verify & Add'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddDirector(false)
                        setNewDirectorDIN('')
                      }}
                      className="px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors text-sm font-light"
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
                      className={`p-4 bg-gray-900/50 border rounded-lg ${director.verified
                          ? 'border-green-500/30 bg-green-500/5'
                          : 'border-gray-800'
                        }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h4 className="text-white font-light text-sm">
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
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-gray-400 font-light">
                            {director.din && (
                              <div><span className="text-gray-500">{countryConfig.labels.directorId}:</span> {director.din}</div>
                            )}
                            {director.designation && (
                              <div><span className="text-gray-500">Designation:</span> {director.designation}</div>
                            )}
                            {director.dob && (
                              <div><span className="text-gray-500">DOB:</span> {formatDateForDisplay(director.dob)}</div>
                            )}
                            {director.pan && (
                              <div><span className="text-gray-500">{countryConfig.labels.taxId}:</span> {director.pan}</div>
                            )}
                            {director.email && (
                              <div><span className="text-gray-500">Email:</span> {director.email}</div>
                            )}
                            {director.mobile && (
                              <div><span className="text-gray-500">Mobile:</span> {director.mobile}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {!director.verified && director.din && countryCode === 'IN' && (
                            <button
                              type="button"
                              onClick={() => handleDINVerification(director.id, director.din)}
                              disabled={isVerifyingDIN === director.id}
                              className="px-3 py-1.5 border border-gray-700 text-gray-300 rounded text-xs hover:border-gray-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-light"
                            >
                              {isVerifyingDIN === director.id ? (
                                <span className="flex items-center gap-1">
                                  <div className="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                                  Verifying...
                                </span>
                              ) : `Verify ${countryConfig.labels.directorId}`}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveDirector(director.id)}
                            className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
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
                <div className="p-6 bg-gray-900/50 border border-gray-800 rounded-lg text-center text-gray-400">
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
              <label className="block text-xs text-gray-500 uppercase tracking-wider font-light mb-2">
                Ex-Directors / Former Directors <span className="text-gray-500 text-xs font-light ml-1 normal-case">(Optional)</span>
              </label>
              <textarea
                value={exDirectors}
                onChange={(e) => setExDirectors(e.target.value)}
                placeholder="Enter ex-director names separated by commas or new lines"
                rows={4}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm placeholder-gray-500 font-light focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors resize-y"
              />
              <p className="mt-1 text-xs text-gray-500 font-light">
                You can enter multiple names separated by commas or one per line.
              </p>
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-4 pt-6 border-t border-gray-800">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-3 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors font-light"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 font-light"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
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
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="text-white text-lg text-center font-light">
          <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          Loading...
        </div>
      </div>
    }>
      <ManageCompanyPageInner />
    </Suspense>
  )
}
