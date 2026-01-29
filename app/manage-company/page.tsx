'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import CircuitBackground from '@/components/CircuitBackground'
import Header from '@/components/Header'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/utils/supabase/client'
import { updateCompany } from '@/app/onboarding/actions'

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

export default function ManageCompanyPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const supabase = createClient()

  const [isLoading, setIsLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

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
      const { data, error } = await supabase
        .from('companies')
        .select('*')
        .eq('user_id', user?.id)
        .limit(1)
        .single()

      if (error) throw error

      if (data) {
        setCompanyId(data.id)
        setFormData({
          companyName: data.name || '',
          companyType: data.type || '',
          panNumber: data.pan || '',
          cinNumber: data.cin || '',
          industry: data.industry || '',
          address: data.address || '',
          city: data.city || '',
          state: data.state || '',
          pinCode: data.pin_code || '',
          phoneNumber: data.phone_number || '',
          email: data.email || '',
          landline: data.landline || '',
          other: data.other_info || '',
          industryCategories: data.industry_categories || [],
          otherIndustryCategory: data.other_industry_category || '',
        })
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!companyId) return

    setIsSubmitting(true)
    try {
      const result = await updateCompany(companyId, formData)
      if (result.success) {
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
        <div className="text-white text-lg text-center">
          <div className="w-8 h-8 border-4 border-primary-orange border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          Loading Company Data...
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      <CircuitBackground />
      <Header />

      <div className="relative z-10 container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-primary-orange rounded-xl flex items-center justify-center shadow-lg shadow-primary-orange/30">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <div>
              <h1 className="text-3xl font-light text-white">Manage Company</h1>
              <p className="text-gray-400 text-sm mt-1">Edit your company profile and compliance details</p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-8 backdrop-blur-sm">
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Company Name</label>
                <input
                  type="text"
                  name="companyName"
                  value={formData.companyName}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">CIN Number (ReadOnly)</label>
                <input
                  type="text"
                  value={formData.cinNumber}
                  readOnly
                  className="w-full px-4 py-3 bg-gray-900/50 border border-gray-800 rounded-lg text-gray-500 cursor-not-allowed"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">PAN Number</label>
                <input
                  type="text"
                  name="panNumber"
                  value={formData.panNumber}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Phone Number</label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                />
              </div>
            </div>

            {/* Address Info */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">Address</label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleInputChange}
                rows={3}
                className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">City</label>
                <input
                  type="text"
                  name="city"
                  value={formData.city}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">State</label>
                <input
                  type="text"
                  name="state"
                  value={formData.state}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">PIN Code</label>
                <input
                  type="text"
                  name="pinCode"
                  value={formData.pinCode}
                  onChange={handleInputChange}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                />
              </div>
            </div>

            {/* Industry Categories */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-3">Category of Industry</label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {INDUSTRY_CATEGORIES.map((category) => (
                  <label
                    key={category}
                    className="flex items-center gap-3 p-3 bg-gray-900 border border-gray-700 rounded-lg cursor-pointer hover:border-primary-orange/50 transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={formData.industryCategories.includes(category)}
                      onChange={() => handleIndustryCategoryChange(category)}
                      className="w-4 h-4 text-primary-orange bg-gray-800 border-gray-600 rounded focus:ring-primary-orange focus:ring-2"
                    />
                    <span className="text-gray-300 text-sm">{category}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Submit Buttons */}
            <div className="flex justify-end gap-4 pt-6 border-t border-gray-800">
              <button
                type="button"
                onClick={() => router.back()}
                className="px-6 py-3 bg-transparent border border-gray-700 text-gray-300 rounded-lg hover:border-gray-600 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
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
