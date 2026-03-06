'use client'

import React from 'react'
import { useRouter } from 'next/navigation'

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
  taxId: string
  registrationId: string
  address: string
  phoneNumber: string
  industryCategory: string
  directors: Director[]
}

interface Company {
  id: string
  name: string
  type: string
  year: string
  country_code?: string
  region?: string
}

interface OverviewTabProps {
  // State
  isLoading: boolean
  entityDetails: EntityDetails | null
  selectedDirectorId: string | null
  setSelectedDirectorId: (id: string | null) => void
  
  // Data
  currentCompany: Company | null
  countryConfig: any // Complex object from useCountryConfig hook
  
  // Functions
  formatDateForDisplay: (dateStr: string) => string
}

export default function OverviewTab({
  isLoading,
  entityDetails,
  selectedDirectorId,
  setSelectedDirectorId,
  currentCompany,
  countryConfig,
  formatDateForDisplay,
}: OverviewTabProps) {
  const router = useRouter()

  return (
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
                      {entityDetails.directors.map((director: any) => (
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
                  const director = entityDetails.directors.find((d: any) => d.id === selectedDirectorId)
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
  )
}
