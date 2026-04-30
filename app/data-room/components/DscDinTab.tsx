'use client'

import { useState } from 'react'
import { showToast } from '@/components/ui/Toast'

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

interface DirectorDscDinData {
  dscFile: File | null
  dinFile: File | null
  dscFilePath: string | null
  dinFilePath: string | null
  portalEmail: string
  portalPassword: string
  hasCredentials: boolean
  expiryDate: string
  reminderEnabled: boolean
}

interface DscDinTabProps {
  entityDetails: EntityDetails | null
}

export default function DscDinTab({ entityDetails }: DscDinTabProps) {
  const [directorDscDinData, setDirectorDscDinData] = useState<Record<string, DirectorDscDinData>>({})

  // Helper function to get default expiry date
  const getDefaultExpiryDate = (): string => {
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() // 0-11, where 8 = September
    const year = currentMonth >= 8 ? currentYear + 1 : currentYear
    return `${year}-09-30`
  }

  // Helper function to get default director data
  const getDefaultDirectorData = (): DirectorDscDinData => ({
    dscFile: null,
    dinFile: null,
    dscFilePath: null,
    dinFilePath: null,
    portalEmail: '',
    portalPassword: '',
    hasCredentials: false,
    expiryDate: getDefaultExpiryDate(),
    reminderEnabled: false
  })

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-light text-fg-primary mb-1 sm:mb-2">DSC & DIN Management</h2>
          <p className="text-fg-muted text-sm sm:text-base">Manage Digital Signature Certificates (DSC) and Director Identification Numbers (DIN) for directors.</p>
        </div>
      </div>

      {/* Directors List */}
      {entityDetails && entityDetails.directors && entityDetails.directors.length > 0 ? (
        <div className="space-y-4">
          {entityDetails.directors.map((director) => {
            const directorId = director.id
            const directorData = directorDscDinData[directorId] || getDefaultDirectorData()

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
              <div key={directorId} className="bg-black border border-line/10 rounded-xl p-4 sm:p-6 space-y-4 sm:space-y-6">
                {/* Director Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 pb-4 border-b border-line/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/10 flex items-center justify-center text-fg-primary font-medium text-lg sm:text-xl">
                      {directorName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-lg sm:text-xl font-medium text-fg-primary">{directorName}</h3>
                      {director.din && (
                        <p className="text-sm text-fg-muted">DIN: {director.din}</p>
                      )}
                      {director.designation && (
                        <p className="text-xs text-fg-muted">{director.designation}</p>
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
                    <h4 className="text-base sm:text-lg font-medium text-fg-primary flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      DSC Certificate
                    </h4>
                    
                    {directorData.dscFilePath ? (
                      <div className="bg-bg-card/50 rounded-lg p-3 border border-line/10">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-sm text-fg-secondary">DSC Certificate Uploaded</span>
                          </div>
                          <button
                            onClick={() => {
                              setDirectorDscDinData(prev => ({
                                ...prev,
                                [directorId]: { ...prev[directorId] || getDefaultDirectorData(), dscFile: null, dscFilePath: null }
                              }))
                            }}
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-line/15 rounded-lg cursor-pointer hover:border-white/40 transition-colors bg-bg-card/50">
                        <div className="flex flex-col items-center justify-center pt-4 pb-4 px-4">
                          <svg className="w-8 h-8 text-fg-muted mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <p className="mb-1 text-xs sm:text-sm text-fg-primary font-medium text-center">
                            Click to upload DSC certificate
                          </p>
                          <p className="text-[10px] sm:text-xs text-fg-muted text-center">
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
                                [directorId]: { ...prev[directorId] || getDefaultDirectorData(), dscFile: file }
                              }))
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>

                  {/* DIN Certificate Section */}
                  <div className="space-y-3">
                    <h4 className="text-base sm:text-lg font-medium text-fg-primary flex items-center gap-2">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" />
                      </svg>
                      DIN Certificate
                    </h4>
                    
                    {directorData.dinFilePath ? (
                      <div className="bg-bg-card/50 rounded-lg p-3 border border-line/10">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span className="text-sm text-fg-secondary">DIN Certificate Uploaded</span>
                          </div>
                          <button
                            onClick={() => {
                              setDirectorDscDinData(prev => ({
                                ...prev,
                                [directorId]: { ...prev[directorId] || getDefaultDirectorData(), dinFile: null, dinFilePath: null }
                              }))
                            }}
                            className="text-red-400 hover:text-red-300 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-line/15 rounded-lg cursor-pointer hover:border-white/40 transition-colors bg-bg-card/50">
                        <div className="flex flex-col items-center justify-center pt-4 pb-4 px-4">
                          <svg className="w-8 h-8 text-fg-muted mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          <p className="mb-1 text-xs sm:text-sm text-fg-primary font-medium text-center">
                            Click to upload DIN certificate
                          </p>
                          <p className="text-[10px] sm:text-xs text-fg-muted text-center">
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
                                [directorId]: { ...prev[directorId] || getDefaultDirectorData(), dinFile: file }
                              }))
                            }
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>

                {/* Portal Credentials Section */}
                <div className="space-y-3 pt-4 border-t border-line/10">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={directorData.hasCredentials}
                      onChange={(e) => {
                        setDirectorDscDinData(prev => ({
                          ...prev,
                          [directorId]: { ...prev[directorId] || getDefaultDirectorData(), hasCredentials: e.target.checked }
                        }))
                      }}
                      className="w-4 h-4 text-fg-primary bg-bg-elevated border-line/30 rounded focus:ring-white/40 focus:ring-2"
                    />
                    <span className="text-sm sm:text-base text-fg-primary font-medium">Store Portal Credentials</span>
                  </label>

                  {directorData.hasCredentials && (
                    <div className="bg-white/5 border border-white/10 rounded-lg p-4 space-y-3">
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-fg-secondary mb-1.5">
                          Portal Email
                        </label>
                        <input
                          type="email"
                          value={directorData.portalEmail}
                          onChange={(e) => {
                            setDirectorDscDinData(prev => ({
                              ...prev,
                              [directorId]: { ...prev[directorId] || getDefaultDirectorData(), portalEmail: e.target.value }
                            }))
                          }}
                          placeholder="portal@example.com"
                          className="w-full px-3 py-2 bg-black border border-line/15 rounded-lg text-fg-primary text-xs sm:text-sm placeholder:text-fg-muted focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs sm:text-sm font-medium text-fg-secondary mb-1.5">
                          Portal Password
                        </label>
                        <input
                          type="password"
                          value={directorData.portalPassword}
                          onChange={(e) => {
                            setDirectorDscDinData(prev => ({
                              ...prev,
                              [directorId]: { ...prev[directorId] || getDefaultDirectorData(), portalPassword: e.target.value }
                            }))
                          }}
                          placeholder="Enter password"
                          className="w-full px-3 py-2 bg-black border border-line/15 rounded-lg text-fg-primary text-xs sm:text-sm placeholder:text-fg-muted focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Expiry Date and Reminder Section */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-line/10">
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-fg-secondary mb-1.5">
                      Expiry Date
                    </label>
                    <input
                      type="date"
                      value={directorData.expiryDate}
                      onChange={(e) => {
                        setDirectorDscDinData(prev => ({
                          ...prev,
                          [directorId]: { ...prev[directorId] || getDefaultDirectorData(), expiryDate: e.target.value }
                        }))
                      }}
                      className="w-full px-3 py-2 bg-black border border-line/15 rounded-lg text-fg-primary text-xs sm:text-sm focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                    />
                    <p className="text-[10px] sm:text-xs text-fg-muted mt-1">Default: September 30 (yearly)</p>
                  </div>
                  <div>
                    <label className="block text-xs sm:text-sm font-medium text-fg-secondary mb-1.5">
                      Reminder Settings
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer mt-2">
                      <input
                        type="checkbox"
                        checked={directorData.reminderEnabled}
                        onChange={(e) => {
                          setDirectorDscDinData(prev => ({
                            ...prev,
                            [directorId]: { ...prev[directorId] || getDefaultDirectorData(), reminderEnabled: e.target.checked }
                          }))
                        }}
                        className="w-4 h-4 text-fg-primary bg-bg-elevated border-line/30 rounded focus:ring-white/40 focus:ring-2"
                      />
                      <span className="text-xs sm:text-sm text-fg-secondary">Enable reminder 1 month before expiry</span>
                    </label>
                  </div>
                </div>

                {/* Save Button */}
                <div className="pt-4 border-t border-line/10">
                  <button
                    onClick={async () => {
                      // In a real implementation, this would save to the database
                      showToast('DSC/DIN data saved successfully for ' + directorName, 'success')
                    }}
                    className="w-full sm:w-auto px-4 sm:px-6 py-2 sm:py-3 bg-white text-black rounded-lg hover:bg-bg-elevated transition-colors font-medium text-sm sm:text-base"
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="bg-black border border-line/10 rounded-xl p-8 sm:p-12 text-center">
          <svg className="w-12 h-12 sm:w-16 sm:h-16 text-fg-muted/60 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <p className="text-fg-muted text-sm sm:text-base mb-2">No directors found</p>
          <p className="text-fg-muted text-xs sm:text-sm">Directors will appear here once they are added to the company.</p>
        </div>
      )}
    </div>
  )
}
