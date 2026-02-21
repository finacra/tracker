'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { verifyCIN, verifyDIN, type CINDirectorData, type DINDirectorData } from '@/lib/api/cin-din'
import { 
  detectEntity, 
  mapEntitySubTypeToFormValue, 
  mapIndustryToCategories 
} from '@/lib/utils/entity-detection'
import { useAuth } from '@/hooks/useAuth'
import { useUserSubscription } from '@/hooks/useCompanyAccess'
import { createClient } from '@/utils/supabase/client'
import { completeOnboarding } from './actions'
import { INDUSTRIES } from '@/lib/compliance/csv-template'
import { useCountryConfig } from '@/hooks/useCountryConfig'
import CountrySelector from '@/components/CountrySelector'

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
  // Memoize supabase client to prevent infinite re-renders
  const supabase = useMemo(() => createClient(), [])
  
  // All hooks must be called before any conditional returns
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [isVerifyingCIN, setIsVerifyingCIN] = useState(false)
  const [isVerifyingDIN, setIsVerifyingDIN] = useState<string | null>(null)
  const [directors, setDirectors] = useState<Director[]>([])
  const [newDirectorDIN, setNewDirectorDIN] = useState('')
  const [showAddDirector, setShowAddDirector] = useState(false)
  const [entityDetection, setEntityDetection] = useState<any>(null)
  const [isCINVerified, setIsCINVerified] = useState(false)
  const [currentStep, setCurrentStep] = useState(1) // 1 = Company Details, 2 = Documents
  const [exDirectors, setExDirectors] = useState<string>('') // Comma-separated or newline-separated names

  const [countryCode, setCountryCode] = useState<string>('IN')
  const { config: countryConfig } = useCountryConfig(countryCode)

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
  })

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

  // Show loading state while checking auth or subscription
  if (loading || subLoading) {
    return (
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
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
        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-gray-800/50 border border-gray-700 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="text-2xl font-light text-white mb-4">Subscription Required</h1>
          <p className="text-gray-400 mb-6 font-light">
            You need an active subscription or trial to create companies. Start with a free 15-day trial!
          </p>
          <button
            onClick={() => router.push('/subscribe')}
            className="w-full border border-gray-700 text-gray-300 px-6 py-3 rounded-lg font-light hover:border-gray-600 hover:text-white transition-colors"
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
        <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-yellow-500/10 border border-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-2xl font-light text-white mb-4">Company Limit Reached</h1>
          <p className="text-gray-400 mb-2 font-light">
            You've created <span className="text-white font-light">{currentCompanyCount}</span> of <span className="text-white font-light">{companyLimit}</span> companies allowed on your plan.
          </p>
          <p className="text-gray-500 text-sm mb-6 font-light">
            Upgrade to a higher plan to add more companies.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => router.push('/subscribe')}
              className="w-full border border-gray-700 text-gray-300 px-6 py-3 rounded-lg font-light hover:border-gray-600 hover:text-white transition-colors"
            >
              Upgrade Plan
            </button>
            <button
              onClick={() => router.push('/data-room')}
              className="w-full border border-gray-700 text-gray-300 px-6 py-3 rounded-lg font-light hover:border-gray-600 hover:text-white transition-colors"
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

    const result = await verifyCIN(formData.cinNumber.trim())
    
    if (!result.success) {
      setErrors((prev) => ({ ...prev, cinNumber: result.error }))
      setIsVerifyingCIN(false)
      return
    }

    const response = result.data
    console.log('CIN Response received:', JSON.stringify(response, null, 2))
    
    if (!response.data?.data?.companyData) {
      setErrors((prev) => ({ ...prev, cinNumber: 'No company data found in response' }))
      setIsVerifyingCIN(false)
      return
    }

    const companyData = response.data.data.companyData
    const directorData = response.data.data.directorData || []
    
    console.log('Company Data:', companyData)
    console.log('Director Data:', directorData)

    // Use entity detection system
    const detection = detectEntity(companyData, true)
    setEntityDetection(detection)
    setIsCINVerified(true)
    
    console.log('Entity Detection Result:', detection)
    
    // Map to form values
    const formCompanyType = mapEntitySubTypeToFormValue(detection.entitySubType)
    const formCategories = mapIndustryToCategories(detection.industryPrimary, detection.entitySubType)
    
    const cin = companyData.cin || formData.cinNumber
    
    // Parse address to extract city, state, PIN
    const address = companyData.registeredaddress || companyData.mcamdscompanyaddress || ''
    const { city, state, pinCode } = parseAddress(address)
    
    // Check for phone/mobile in company data
    const phoneNumber = (companyData as any).mobileNumber || 
                       (companyData as any).phoneNumber || 
                       (companyData as any).contactNumber || 
                       ''
    
    setFormData((prev) => ({
      ...prev,
      companyName: companyData.company || prev.companyName,
      companyType: formCompanyType || prev.companyType,
      // Use industryPrimary directly since it already returns correct industry names
      industries: detection.industryPrimary && INDUSTRIES.includes(detection.industryPrimary as any)
        ? [detection.industryPrimary as any]
        : prev.industries,
      dateOfIncorporation: formatDate(companyData.dateOfIncorporation) || prev.dateOfIncorporation,
      address: address || prev.address,
      city: city || prev.city,
      state: state || prev.state,
      pinCode: pinCode || prev.pinCode,
      phoneNumber: phoneNumber || prev.phoneNumber,
      email: companyData.emailAddress || prev.email,
      cinNumber: cin,
      // Auto-select detected industry categories
      industryCategories: formCategories.length > 0 
        ? formCategories
        : prev.industryCategories,
    }))

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
          verified: false, // Will be verified using DIN
          source: 'cin' as const,
        }
      })
      console.log('Created Directors:', cinDirectors)
      setDirectors(cinDirectors)
    }

    // Check for ex-directors in CIN response (if available)
    const exDirectorData = (response.data?.data as any)?.exDirectorData || 
                          (response.data?.data as any)?.formerDirectorData ||
                          (response.data?.data as any)?.exDirectors ||
                          (response.data?.data as any)?.formerDirectors ||
                          []
    
    if (Array.isArray(exDirectorData) && exDirectorData.length > 0) {
      // Format ex-directors as comma-separated names
      const exDirectorNames = exDirectorData
        .map((exDir: any) => {
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
  }

  const handleDINVerification = async (directorId: string, din: string) => {
    if (!din.trim()) {
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
    // Only allow DIN verification for India
    if (countryCode !== 'IN') {
      return
    }
    
    if (!newDirectorDIN.trim()) {
      setErrors((prev) => ({ ...prev, newDirectorDIN: 'Please enter DIN number' }))
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
    
    // Split by comma and clean up
    const parts = address.split(',').map(p => p.trim()).filter(p => p.length > 0)
    
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
    // PAN number is now optional
    if (formData.panNumber.trim() && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/.test(formData.panNumber.trim().toUpperCase())) {
      // Basic PAN validation if entered
      newErrors.panNumber = 'Invalid PAN format (e.g., ABCDE1234F)'
    }
    if (!formData.cinNumber.trim()) {
      newErrors.cinNumber = 'CIN number is required'
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
      newErrors.state = 'State is required'
    }
    if (!formData.pinCode.trim()) {
      newErrors.pinCode = 'PIN code is required'
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
      return
    }

    setIsSubmitting(true)
    const supabase = createClient()
    
    try {
      // 1. Upload files to Storage first
      const uploadedDocuments: Array<{ type: string; path: string; name: string }> = []
      
      const uploadPromises = Object.entries(formData.documents)
        .filter(([_, file]) => file !== null)
        .map(async ([docType, file]) => {
          const fileObj = file as File
          const fileExt = fileObj.name.split('.').pop()
          const fileName = `${docType.replace(/\s+/g, '_')}_${Date.now()}.${fileExt}`
          // Temporary path, we'll update it or keep it simple. 
          // Best practice is user_id/timestamp/filename
          const filePath = `${user?.id}/${Date.now()}/${fileName}`

          const { error: uploadError } = await supabase.storage
            .from('company-documents')
            .upload(filePath, fileObj)

          if (uploadError) throw uploadError
          
          uploadedDocuments.push({
            type: docType,
            path: filePath,
            name: fileObj.name
          })
        })

      await Promise.all(uploadPromises)

      // 2. Call the Server Action with Service Role privileges
      const result = await completeOnboarding({
        ...formData,
        countryCode: countryCode,
        companyStage: entityDetection?.companyStage,
        confidenceScore: entityDetection?.confidenceScore,
        documents: uploadedDocuments,
        exDirectors: exDirectors.trim() || undefined
      }, directors)

      if (result.success && result.companyId) {
        // Hybrid subscription model:
        // - Enterprise (user-first): If user has active subscription and hasn't reached limit, go to data-room
        // - Starter/Professional (company-first): Always redirect to subscribe (each company needs its own subscription)
        if (hasSubscription && tier === 'enterprise' && canCreateCompany) {
          // Enterprise user with active subscription and room for more companies
          router.push(`/data-room?company_id=${result.companyId}`)
        } else {
          // Starter/Professional: always need to subscribe for new company
          // Enterprise: no subscription or limit reached
          router.push(`/subscribe?company_id=${result.companyId}`)
        }
      }
    } catch (error: any) {
      console.error('Error submitting form:', error)
      alert('Failed to complete onboarding: ' + error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      {/* Content */}
      <div className="relative z-10 container mx-auto px-3 sm:px-4 py-4 sm:py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-4 sm:mb-8">
          <div className="flex items-center gap-2 sm:gap-4 mb-3 sm:mb-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-800 border border-gray-700 rounded-lg sm:rounded-xl flex items-center justify-center flex-shrink-0">
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
              <p className="text-gray-400 text-xs sm:text-sm mt-1 font-light">
                Add another company to your account
              </p>
            </div>
          </div>
        </div>

        {/* Form Card */}
        <form onSubmit={handleSubmit} className="bg-[#1a1a1a] border border-gray-800 rounded-xl sm:rounded-2xl p-4 sm:p-6 md:p-8">
          <div className="space-y-4 sm:space-y-6">
            {/* Step Indicator */}
            <div className="flex items-center justify-center gap-2 mb-4 sm:mb-6">
              <div className={`flex items-center gap-2 ${currentStep === 1 ? 'text-white' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${currentStep === 1 ? 'bg-gray-800 border-gray-600 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
                  1
                </div>
                <span className="text-xs sm:text-sm font-light">Company Details</span>
              </div>
              <div className="w-8 sm:w-12 h-0.5 bg-gray-700"></div>
              <div className={`flex items-center gap-2 ${currentStep === 2 ? 'text-white' : 'text-gray-400'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border ${currentStep === 2 ? 'bg-gray-800 border-gray-600 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
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

                {/* Registration ID / CIN Number */}
                <div>
                  <label className="block text-xs sm:text-sm font-light text-gray-300 mb-2">
                    {countryConfig.labels.registrationId} <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      name="cinNumber"
                      value={formData.cinNumber}
                      onChange={handleInputChange}
                      placeholder={`Enter ${countryConfig.labels.registrationId}`}
                      className="flex-1 px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                    />
                    {countryConfig.onboarding.verificationServices?.registration && (
                      <button
                        type="button"
                        onClick={handleCINVerification}
                        disabled={isVerifyingCIN || !formData.cinNumber.trim()}
                        className="px-4 sm:px-6 py-2 sm:py-3 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base whitespace-nowrap font-light"
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
                </div>

            {/* Company Name */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                Company Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                name="companyName"
                value={formData.companyName}
                onChange={handleInputChange}
                placeholder="Enter company name"
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
              />
              {errors.companyName && (
                <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.companyName}</p>
              )}
            </div>

            {/* Company Type */}
            <div>
              <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                Company Type <span className="text-red-500">*</span>
                {isCINVerified && (
                  <span className="ml-2 text-[10px] sm:text-xs text-gray-400 flex items-center gap-1">
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
                disabled={isCINVerified}
                className={`w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors appearance-none font-light ${
                  isCINVerified ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                }`}
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

            {/* Tax ID / PAN Number */}
              <div>
                <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                  {countryConfig.labels.taxId} <span className="text-gray-500 text-[10px] sm:text-xs font-normal ml-1">(Optional)</span>
                </label>
                <input
                  type="text"
                  name="panNumber"
                  value={formData.panNumber}
                  onChange={handleInputChange}
                  placeholder={`Enter ${countryConfig.labels.taxId}`}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                />
                {errors.panNumber && (
                  <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.panNumber}</p>
                )}
            </div>

            {/* Industries */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-xs sm:text-sm font-medium text-gray-300">
                  Industries <span className="text-red-500">*</span> (Select at least one)
                  {isCINVerified && (
                    <span className="ml-2 text-[10px] sm:text-xs text-gray-400 flex items-center gap-1">
                      <svg width="10" height="10" className="sm:w-3 sm:h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M12 16v-4" />
                        <path d="M12 8h.01" />
                      </svg>
                      Detected from MCA records
                    </span>
                  )}
                </label>
                <label className="flex items-center gap-2 px-2 sm:px-3 py-1 sm:py-1.5 bg-gray-900 border border-gray-700 rounded-lg hover:border-gray-600 transition-colors cursor-pointer">
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
                    className="w-3 h-3 sm:w-4 sm:h-4 text-gray-400 bg-gray-800 border-gray-600 rounded focus:ring-gray-500 focus:ring-2"
                  />
                  <span className="text-gray-300 text-[10px] sm:text-xs font-light">Select All</span>
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 max-h-48 overflow-y-auto">
                {INDUSTRIES.map((industry) => (
                  <label
                    key={industry}
                    className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-gray-900 border border-gray-700 rounded-lg transition-colors cursor-pointer hover:border-gray-600"
                  >
                    <input
                      type="checkbox"
                      checked={formData.industries.includes(industry)}
                      onChange={() => handleIndustryChange(industry)}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 bg-gray-800 border-gray-600 rounded focus:ring-gray-500 focus:ring-2 flex-shrink-0"
                    />
                    <span className="text-gray-300 text-xs sm:text-sm break-words">{industry}</span>
                  </label>
                ))}
              </div>
              {errors.industries && (
                <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.industries}</p>
              )}
            </div>

            {/* Industry Categories */}
            <div>
              <label className="block text-xs sm:text-sm font-light text-gray-300 mb-2 sm:mb-3">
                Category of Industry <span className="text-red-500">*</span>
                {isCINVerified && (
                  <span className="ml-2 text-[10px] sm:text-xs text-gray-400 flex items-center gap-1">
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
                    className="flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3 bg-gray-900 border border-gray-700 rounded-lg transition-colors cursor-pointer hover:border-gray-600"
                  >
                    <input
                      type="checkbox"
                      checked={formData.industryCategories.includes(category)}
                      onChange={() => handleIndustryCategoryChange(category)}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-gray-400 bg-gray-800 border-gray-600 rounded focus:ring-gray-500 focus:ring-2 flex-shrink-0"
                    />
                    <span className="text-gray-300 text-xs sm:text-sm break-words">{category}</span>
                  </label>
                ))}
              </div>
              {errors.industryCategories && (
                <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.industryCategories}</p>
              )}
              
              {/* Other Industry Category Text Input */}
              {formData.industryCategories.includes('Other') && (
                <div className="mt-3 sm:mt-4">
                  <label className="block text-xs sm:text-sm font-light text-gray-300 mb-2">
                    Specify Industry Category <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    name="otherIndustryCategory"
                    value={formData.otherIndustryCategory}
                    onChange={handleInputChange}
                    placeholder="Enter industry category"
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                  />
                  {errors.otherIndustryCategory && (
                    <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.otherIndustryCategory}</p>
                  )}
                </div>
              )}
            </div>

            {/* Date of Incorporation */}
            <div>
              <label className="block text-xs sm:text-sm font-light text-gray-300 mb-2">
                Date of Incorporation <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  readOnly
                  value={formData.dateOfIncorporation ? formatDateForDisplay(formData.dateOfIncorporation) : ''}
                  placeholder="Select date"
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors cursor-pointer pr-10 font-light pointer-events-none"
                />
                <input
                  type="date"
                  id="dateOfIncorporation-hidden"
                  name="dateOfIncorporation"
                  value={formData.dateOfIncorporation}
                  onChange={handleInputChange}
                  className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                  style={{ zIndex: 10 }}
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
              {errors.dateOfIncorporation && (
                <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.dateOfIncorporation}</p>
              )}
            </div>

            {/* Year Type */}
            <div>
              <label className="block text-xs sm:text-sm font-light text-gray-300 mb-2">
                Financial Year Type <span className="text-red-500">*</span>
              </label>
              <select
                name="yearType"
                value={formData.yearType}
                onChange={handleInputChange}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
              >
                <option value="FY">Financial Year (India) - Q1: Apr-Jun, Q2: Jul-Sep, Q3: Oct-Dec, Q4: Jan-Mar</option>
                <option value="CY">Calendar Year (Gulf/USA) - Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec</option>
              </select>
              <p className="mt-1 text-xs text-gray-400">
                Select the year type based on your company's jurisdiction. Indian companies use Financial Year (FY).
              </p>
            </div>

            {/* Address */}
            <div>
              <label className="block text-xs sm:text-sm font-light text-gray-300 mb-2">
                Address <span className="text-red-500">*</span>
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                placeholder="Enter complete address"
                rows={3}
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors resize-y font-light"
              />
              {errors.address && (
                <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.address}</p>
              )}
            </div>

            {/* City, State, PIN Code */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              <div>
                <label className="block text-xs sm:text-sm font-light text-gray-300 mb-2">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  placeholder="City"
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                />
                {errors.city && (
                  <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.city}</p>
                )}
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-light text-gray-300 mb-2">
                  {countryConfig.labels.state || 'State'} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleInputChange}
                  placeholder="State"
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                />
                {errors.state && (
                  <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.state}</p>
                )}
              </div>
              <div className="sm:col-span-2 md:col-span-1">
                <label className="block text-xs sm:text-sm font-light text-gray-300 mb-2">
                  {countryConfig.labels.postalCode} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  name="pinCode"
                  value={formData.pinCode}
                  onChange={handleInputChange}
                  placeholder={countryConfig.labels.postalCode}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                />
                {errors.pinCode && (
                  <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.pinCode}</p>
                )}
              </div>
            </div>

            {/* Company Stage (Read-only info) */}
            {entityDetection && (
              <div>
                <label className="block text-xs sm:text-sm font-light text-gray-300 mb-2">
                  Company Stage
                </label>
                <div className="px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <span className="text-white text-sm sm:text-base">{entityDetection.companyStage}</span>
                    <span className="text-[10px] sm:text-xs text-gray-400 bg-gray-800 border border-gray-700 px-2 py-0.5 rounded w-fit font-light">
                      {entityDetection.confidenceScore} Confidence
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Phone Number, Email, and Landline */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
              <div>
                <label className="block text-xs sm:text-sm font-light text-gray-300 mb-2">
                  Phone Number <span className="text-gray-500 text-[10px] sm:text-xs font-normal ml-1">(Optional)</span>
                </label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                />
                {errors.phoneNumber && (
                  <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.phoneNumber}</p>
                )}
              </div>
              <div>
                <label className="block text-xs sm:text-sm font-light text-gray-300 mb-2">
                  Email Address
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  placeholder="company@example.com"
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                />
                {errors.email && (
                  <p className="mt-1 text-xs sm:text-sm text-red-400">{errors.email}</p>
                )}
              </div>
              <div className="sm:col-span-2 md:col-span-1">
                <label className="block text-xs sm:text-sm font-light text-gray-300 mb-2">
                  Landline
                </label>
                <input
                  type="tel"
                  name="landline"
                  value={formData.landline}
                  onChange={handleInputChange}
                  placeholder="Enter landline number"
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                />
              </div>
            </div>

            {/* Other Field */}
            <div>
              <label className="block text-xs sm:text-sm font-light text-gray-300 mb-2">
                Other
              </label>
              <input
                type="text"
                name="other"
                value={formData.other}
                onChange={handleInputChange}
                placeholder="Enter any other information"
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
              />
            </div>

            {/* Directors Section */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0 mb-4">
                <label className="block text-xs sm:text-sm font-light text-gray-300">
                  Directors
                </label>
                <button
                  type="button"
                  onClick={() => setShowAddDirector(!showAddDirector)}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors text-xs sm:text-sm flex items-center justify-center gap-2 w-full sm:w-auto font-light"
                >
                  <svg width="14" height="14" className="sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span className="hidden sm:inline">Add Director{countryConfig.onboarding.verificationServices?.director ? ' by DIN' : ''}</span>
                  <span className="sm:hidden">Add Director</span>
                </button>
              </div>

              {/* Add Director by DIN (only for India) */}
              {showAddDirector && countryConfig.onboarding.verificationServices?.director && (
                <div className="mb-4 p-3 sm:p-4 bg-gray-900 border border-gray-700 rounded-lg">
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={newDirectorDIN}
                      onChange={(e) => {
                        setNewDirectorDIN(e.target.value)
                        setErrors((prev) => ({ ...prev, newDirectorDIN: '' }))
                      }}
                      placeholder="Enter DIN number"
                      className="flex-1 px-3 sm:px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors font-light"
                    />
                    <button
                      type="button"
                      onClick={handleAddDirectorByDIN}
                      disabled={!newDirectorDIN.trim()}
                      className="px-3 sm:px-4 py-2 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base font-light"
                    >
                      Verify & Add
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddDirector(false)
                        setNewDirectorDIN('')
                      }}
                      className="px-3 sm:px-4 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors text-sm sm:text-base"
                    >
                      Cancel
                    </button>
                  </div>
                  {errors.newDirectorDIN && (
                    <p className="mt-2 text-xs sm:text-sm text-red-400">{errors.newDirectorDIN}</p>
                  )}
                </div>
              )}

              {/* Directors List */}
              {directors.length > 0 ? (
                <div className="space-y-2 sm:space-y-3">
                  {directors.map((director) => (
                    <div
                      key={director.id}
                      className={`p-3 sm:p-4 bg-gray-900 border rounded-lg ${
                        director.verified
                          ? 'border-green-500/50 bg-green-500/5'
                          : 'border-gray-700'
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
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 text-xs sm:text-sm text-gray-400">
                            {director.din && (
                              <div className="break-words">
                                <span className="text-gray-500">DIN:</span> {director.din}
                              </div>
                            )}
                            {director.designation && (
                              <div className="break-words">
                                <span className="text-gray-500">Designation:</span> {director.designation}
                              </div>
                            )}
                            {director.dob && (
                              <div className="break-words">
                                <span className="text-gray-500">DOB:</span> {formatDateForDisplay(director.dob)}
                              </div>
                            )}
                            {director.pan && (
                              <div className="break-words">
                                <span className="text-gray-500">PAN:</span> {director.pan}
                              </div>
                            )}
                            {director.email && (
                              <div className="break-words">
                                <span className="text-gray-500">Email:</span> {director.email}
                              </div>
                            )}
                            {director.mobile && (
                              <div className="break-words">
                                <span className="text-gray-500">Mobile:</span> {director.mobile}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 sm:ml-4 flex-shrink-0">
                          {director.source === 'cin' && !director.verified && director.din && (
                            <button
                              type="button"
                              onClick={() => handleDINVerification(director.id, director.din)}
                              disabled={isVerifyingDIN === director.id}
                              className="px-2 sm:px-3 py-1 sm:py-1.5 border border-gray-700 text-gray-300 rounded text-xs sm:text-sm hover:border-gray-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 font-light"
                            >
                              {isVerifyingDIN === director.id ? (
                                <>
                                  <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
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
                <div className="p-4 sm:p-6 bg-gray-900 border border-gray-700 rounded-lg text-center text-gray-400">
                  <p className="text-sm sm:text-base">No directors added yet.</p>
                  <p className="text-xs sm:text-sm mt-1">Verify CIN to auto-add directors or add manually using DIN.</p>
                </div>
              )}
            </div>

            {/* Ex-Directors Section */}
            <div>
              <label className="block text-xs sm:text-sm font-light text-gray-300 mb-2">
                Ex-Directors / Former Directors <span className="text-gray-500 text-[10px] sm:text-xs font-normal ml-1">(Optional)</span>
                {isCINVerified && exDirectors && (
                  <span className="ml-2 text-[10px] sm:text-xs text-gray-400 flex items-center gap-1">
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
                className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors resize-y font-light"
              />
              <p className="mt-1 text-[10px] sm:text-xs text-gray-500">
                You can enter multiple names separated by commas or one per line. This information will be stored for reference.
              </p>
            </div>

              </>
            ) : (
              <>
                {/* Document Uploads - Step 2 */}
            <div>
              <label className="block text-xs sm:text-sm font-light text-gray-300 mb-2 sm:mb-3">
                Required Documents <span className="text-gray-500 text-[10px] sm:text-xs font-normal ml-1">(Optional)</span>
              </label>
              <div className="space-y-3 sm:space-y-4">
                {countryConfig.onboarding.documentTypes.map((docType) => (
                  <div key={docType}>
                    <label className="block text-xs sm:text-sm text-gray-400 mb-1.5 sm:mb-2 font-light">
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
                          className={`px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border rounded-lg transition-colors flex items-center justify-between ${
                            formData.documents[docType]
                              ? 'border-gray-600 text-white'
                              : 'border-gray-700 text-gray-400 hover:border-gray-600'
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
                              className="sm:w-5 sm:h-5 flex-shrink-0 text-gray-500"
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
            <div className="flex flex-col-reverse sm:flex-row justify-end gap-2 sm:gap-4 pt-4 sm:pt-6 border-t border-gray-800">
              {currentStep === 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => router.back()}
                    className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-transparent border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors text-sm sm:text-base"
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
                    className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors flex items-center justify-center gap-2 text-sm sm:text-base font-light"
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
                    className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-transparent border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors text-sm sm:text-base"
                  >
                    Back
                  </button>
              <button
                type="button"
                onClick={() => router.back()}
                className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 bg-transparent border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto px-4 sm:px-6 py-2.5 sm:py-3 border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm sm:text-base font-light"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Creating...
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
