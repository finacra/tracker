'use client'

import React, { useState, useMemo, useEffect } from 'react'

interface Notice {
  id: string
  type: string
  subType: string
  section?: string
  subject: string
  issuedBy: string
  issuedDate: string
  dueDate: string
  status: 'pending' | 'responded' | 'resolved'
  priority: 'low' | 'medium' | 'high' | 'critical'
  description: string
  documents: string[]
  timeline: Array<{
    date: string
    action: string
    by: string
  }>
}

interface NoticesTabProps {
  // Data
  countryConfig: any
  complianceCategories: string[]
  
  // Functions
  formatDateForDisplay: (dateStr: string) => string
}

export default function NoticesTab({
  countryConfig,
  complianceCategories,
  formatDateForDisplay,
}: NoticesTabProps) {
  // State
  const [noticesFilter, setNoticesFilter] = useState<'all' | 'pending' | 'responded' | 'resolved'>('all')
  const [noticesTypeFilter, setNoticesTypeFilter] = useState<string>('all')
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null)
  const [isAddNoticeModalOpen, setIsAddNoticeModalOpen] = useState(false)
  const [noticeResponse, setNoticeResponse] = useState('')
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false)
  const [demoNotices, setDemoNotices] = useState<Notice[]>([])
  const [newNoticeForm, setNewNoticeForm] = useState({
    type: 'Income Tax',
    subType: '',
    section: '',
    subject: '',
    issuedBy: '',
    issuedDate: new Date().toISOString().split('T')[0],
    dueDate: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'critical',
    description: '',
    documents: [] as string[]
  })
  const [newDocument, setNewDocument] = useState('')
  const [isSubmittingNotice, setIsSubmittingNotice] = useState(false)

  // Helper function: Detect notice type metadata
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
      const formCodeLower = (notice as any).formCode.toLowerCase()
      if (docLower.includes(formCodeLower) || docLower.includes(key.toLowerCase())) {
        return {
          type: (notice as any).type,
          formCode: (notice as any).formCode,
          section: (notice as any).section,
          priority: (notice as any).priority,
          description: (notice as any).description
        }
      }
    }

    // Check for section-based notices (e.g., Section 142, Section 143)
    for (const [key, notice] of Object.entries(noticeTypes)) {
      if ((notice as any).section) {
        const sectionLower = (notice as any).section.toLowerCase()
        if (docLower.includes(sectionLower)) {
          return {
            type: (notice as any).type,
            formCode: (notice as any).formCode,
            section: (notice as any).section,
            priority: (notice as any).priority,
            description: (notice as any).description
          }
        }
      }
    }

    return null
  }

  // Helper function: Get authority for category
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

  // Filtered notices
  const filteredNotices = useMemo(() => {
    return demoNotices.filter(notice => {
      const matchesStatus = noticesFilter === 'all' || notice.status === noticesFilter
      const matchesType = noticesTypeFilter === 'all' || notice.type === noticesTypeFilter
      return matchesStatus && matchesType
    })
  }, [demoNotices, noticesFilter, noticesTypeFilter])

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-light text-fg-primary mb-1">Government Notices</h2>
            <p className="text-fg-muted">Track and respond to regulatory notices from various departments</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {/* Status Filter */}
            <select
              value={noticesFilter}
              onChange={(e) => setNoticesFilter(e.target.value as any)}
              className="px-4 py-2 bg-black border border-line/20 rounded-lg text-fg-primary text-sm focus:outline-none focus:border-line/40"
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
              className="px-4 py-2 bg-black border border-line/20 rounded-lg text-fg-primary text-sm focus:outline-none focus:border-line/40"
            >
              <option value="all">All Types</option>
              {complianceCategories.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            <button
              onClick={() => setIsAddNoticeModalOpen(true)}
              className="px-4 py-2 bg-accent-brand text-white rounded-lg hover:bg-bg-hover transition-colors flex items-center gap-2 text-sm"
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
          <div className="bg-bg-card border border-line/10 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-500/20 rounded-lg flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-light text-fg-primary">{demoNotices.filter(n => n.status === 'pending').length}</p>
                <p className="text-fg-muted text-xs">Pending Response</p>
              </div>
            </div>
          </div>
          <div className="bg-bg-card border border-line/10 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-yellow-500/20 rounded-lg flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#EAB308" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-light text-fg-primary">{demoNotices.filter(n => n.status === 'responded').length}</p>
                <p className="text-fg-muted text-xs">Awaiting Decision</p>
              </div>
            </div>
          </div>
          <div className="bg-bg-card border border-line/10 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                  <polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-light text-fg-primary">{demoNotices.filter(n => n.status === 'resolved').length}</p>
                <p className="text-fg-muted text-xs">Resolved</p>
              </div>
            </div>
          </div>
          <div className="bg-bg-card border border-line/10 rounded-xl p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
              </div>
              <div>
                <p className="text-2xl font-light text-fg-primary">{demoNotices.length}</p>
                <p className="text-fg-muted text-xs">Total Notices</p>
              </div>
            </div>
          </div>
        </div>

        {/* Main Content - List and Detail View */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Notices List */}
          <div className="lg:col-span-1 space-y-3">
            <p className="text-fg-muted text-sm mb-2">{filteredNotices.length} notices found</p>
            {filteredNotices.map((notice) => (
              <div
                key={notice.id}
                onClick={() => setSelectedNotice(notice)}
                className={`bg-black border rounded-xl p-4 cursor-pointer transition-all hover:border-line/40 ${selectedNotice?.id === notice.id ? 'border-line/40' : 'border-line/10'
                  }`}
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${notice.type === 'Income Tax' ? 'bg-blue-500/20 text-blue-400' :
                        notice.type === 'GST' ? 'bg-green-500/20 text-green-400' :
                          notice.type === 'MCA/RoC' ? 'bg-purple-500/20 text-purple-400' :
                            'bg-bg-hover/20 text-fg-primary'
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
                <h4 className="text-fg-primary text-sm font-medium mb-1 line-clamp-2">{notice.subject}</h4>
                <div className="flex items-center justify-between text-xs text-fg-muted">
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
                <div className="bg-bg-card border border-line/10 rounded-2xl overflow-hidden">
                  {/* Detail Header */}
                  <div className="bg-black p-6 border-b border-line/10">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${selectedNotice.type === 'Income Tax' ? 'bg-blue-500/20' :
                            selectedNotice.type === 'GST' ? 'bg-green-500/20' :
                              selectedNotice.type === 'MCA/RoC' ? 'bg-purple-500/20' :
                                'bg-bg-hover/20'
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
                          <p className="text-fg-muted text-sm">{selectedNotice.id}</p>
                          <h3 className="text-fg-primary text-lg font-medium">{selectedNotice.subType}</h3>
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
                                'bg-bg-hover/20 text-fg-muted'
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

                    <h2 className="text-fg-primary text-xl mb-2">{selectedNotice.subject}</h2>
                    <div className="flex flex-wrap items-center gap-4 text-sm">
                      {noticeMetadata?.section ? (
                        <span className="text-fg-muted">
                          <span className="text-fg-muted">Legal Section:</span> <span className="text-fg-primary">{noticeMetadata.section}</span>
                        </span>
                      ) : selectedNotice.section ? (
                        <span className="text-fg-muted">
                          <span className="text-fg-muted">Section:</span> {selectedNotice.section}
                        </span>
                      ) : null}
                      {authority && (
                        <span className="text-fg-muted">
                          <span className="text-fg-muted">Authority:</span> <span className="text-fg-primary">{authority}</span>
                        </span>
                      )}
                      <span className="text-fg-muted">
                        <span className="text-fg-muted">Issued:</span> {new Date(selectedNotice.issuedDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                      <span className={`${new Date(selectedNotice.dueDate) < new Date() && selectedNotice.status === 'pending' ? 'text-red-400' : 'text-fg-muted'}`}>
                        <span className="text-fg-muted">Due:</span> {new Date(selectedNotice.dueDate).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                  </div>

                  {/* Detail Body */}
                  <div className="p-6 space-y-6">
                    {/* Notice Type Description */}
                    {noticeMetadata?.description && (
                      <div>
                        <h4 className="text-fg-muted text-sm font-medium mb-2">Notice Type Information</h4>
                        <p className="text-white text-sm leading-relaxed bg-blue-500/10 border border-blue-500/20 p-4 rounded-lg">
                          {noticeMetadata.description}
                        </p>
                      </div>
                    )}

                    {/* Description */}
                    <div>
                      <h4 className="text-fg-muted text-sm font-medium mb-2">Notice Description</h4>
                      <p className="text-fg-primary text-sm leading-relaxed bg-bg-card border border-line/10 p-4 rounded-lg">
                        {selectedNotice.description}
                      </p>
                    </div>

                    {/* Required Documents */}
                    <div>
                      <h4 className="text-fg-muted text-sm font-medium mb-2">Required Documents</h4>
                      <div className="flex flex-wrap gap-2">
                        {selectedNotice.documents.map((doc: string, idx: number) => (
                          <span key={idx} className="px-3 py-1.5 bg-bg-elevated text-fg-secondary rounded-lg text-sm flex items-center gap-2">
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
                      <h4 className="text-fg-muted text-sm font-medium mb-3">Activity Timeline</h4>
                      <div className="space-y-3">
                        {selectedNotice.timeline.map((event: any, idx: number) => (
                          <div key={idx} className="flex items-start gap-3">
                            <div className="flex flex-col items-center">
                              <div className={`w-3 h-3 rounded-full ${idx === 0 ? 'bg-white' : 'bg-bg-hover'}`}></div>
                              {idx < selectedNotice.timeline.length - 1 && (
                                <div className="w-0.5 h-8 bg-bg-hover"></div>
                              )}
                            </div>
                            <div className="flex-1 pb-2">
                              <div className="flex items-center justify-between">
                                <p className="text-fg-primary text-sm">{event.action}</p>
                                <span className="text-fg-muted text-xs">{new Date(event.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                              </div>
                              <p className="text-fg-muted text-xs">by {event.by}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Response Section (only for pending notices) */}
                    {selectedNotice.status === 'pending' && (
                      <div className="border-t border-line/10 pt-6">
                        <h4 className="text-fg-muted text-sm font-medium mb-3">Submit Response</h4>
                        <textarea
                          value={noticeResponse}
                          onChange={(e) => setNoticeResponse(e.target.value)}
                          placeholder="Enter your response or remarks..."
                          rows={4}
                          className="w-full px-4 py-3 bg-black border border-line/20 rounded-lg text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-line/40 focus:ring-1 focus:ring-white/40 transition-colors resize-none"
                        />
                        <div className="flex items-center justify-between mt-4">
                          <button className="px-4 py-2 bg-bg-elevated text-fg-secondary rounded-lg hover:bg-bg-hover transition-colors flex items-center gap-2 text-sm">
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
                            className="px-6 py-2 bg-accent-brand text-white rounded-lg hover:bg-bg-hover transition-colors flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                      <div className="border-t border-line/10 pt-6 flex items-center gap-3">
                        <button className="px-4 py-2 bg-bg-elevated text-fg-secondary rounded-lg hover:bg-bg-hover transition-colors flex items-center gap-2 text-sm">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                          Download Notice
                        </button>
                        <button className="px-4 py-2 bg-bg-elevated text-fg-secondary rounded-lg hover:bg-bg-hover transition-colors flex items-center gap-2 text-sm">
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
              <div className="bg-bg-card border border-line/10 rounded-2xl h-full flex flex-col items-center justify-center py-20">
                <div className="w-20 h-20 bg-bg-elevated rounded-full flex items-center justify-center mb-6">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                </div>
                <h3 className="text-fg-primary text-lg font-medium mb-2">Select a Notice</h3>
                <p className="text-fg-muted text-sm">Click on a notice from the list to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Notice Modal */}
      {isAddNoticeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-black border-b border-line/10 p-6 flex items-center justify-between z-10">
              <div>
                <h2 className="text-2xl font-light text-fg-primary mb-1">Add New Notice</h2>
                <p className="text-fg-muted text-sm">Enter the details of the government notice received</p>
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
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-bg-elevated transition-colors"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fg-muted">
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
                  <label className="block text-sm font-medium text-fg-secondary mb-2">
                    Notice Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newNoticeForm.type}
                    onChange={(e) => setNewNoticeForm({ ...newNoticeForm, type: e.target.value })}
                    className="w-full px-4 py-3 bg-black border border-line/20 rounded-lg text-fg-primary focus:outline-none focus:border-line/40 focus:ring-1 focus:ring-white/40 transition-colors"
                  >
                    {/* Country-aware notice types based on compliance categories */}
                    {countryConfig?.compliance?.defaultCategories?.map((category: string) => (
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
                  <label className="block text-sm font-medium text-fg-secondary mb-2">
                    Sub Type <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newNoticeForm.subType}
                    onChange={(e) => setNewNoticeForm({ ...newNoticeForm, subType: e.target.value })}
                    placeholder="e.g., Scrutiny Notice, Show Cause Notice"
                    className="w-full px-4 py-3 bg-black border border-line/20 rounded-lg text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-line/40 focus:ring-1 focus:ring-white/40 transition-colors"
                  />
                </div>
              </div>

              {/* Section & Subject */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-2">
                    Section/Act <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newNoticeForm.section}
                    onChange={(e) => setNewNoticeForm({ ...newNoticeForm, section: e.target.value })}
                    placeholder="e.g., Section 143(2), Section 73"
                    className="w-full px-4 py-3 bg-black border border-line/20 rounded-lg text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-line/40 focus:ring-1 focus:ring-white/40 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-2">
                    Priority
                  </label>
                  <select
                    value={newNoticeForm.priority}
                    onChange={(e) => setNewNoticeForm({ ...newNoticeForm, priority: e.target.value as any })}
                    className="w-full px-4 py-3 bg-black border border-line/20 rounded-lg text-fg-primary focus:outline-none focus:border-line/40 focus:ring-1 focus:ring-white/40 transition-colors"
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
                <label className="block text-sm font-medium text-fg-secondary mb-2">
                  Subject <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newNoticeForm.subject}
                  onChange={(e) => setNewNoticeForm({ ...newNoticeForm, subject: e.target.value })}
                  placeholder="Enter the notice subject/title"
                  className="w-full px-4 py-3 bg-bg-card border border-line/15 rounded-lg text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-line/40 focus:ring-1 focus:ring-white/40 transition-colors"
                />
              </div>

              {/* Issued By & Dates */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-2">
                    Issued By <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newNoticeForm.issuedBy}
                    onChange={(e) => setNewNoticeForm({ ...newNoticeForm, issuedBy: e.target.value })}
                    placeholder="e.g., Income Tax Department"
                    className="w-full px-4 py-3 bg-black border border-line/20 rounded-lg text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-line/40 focus:ring-1 focus:ring-white/40 transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-2">
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
                      className="w-full px-4 py-3 bg-black border border-line/20 rounded-lg text-fg-primary focus:outline-none focus:border-line/40 focus:ring-1 focus:ring-white/40 transition-colors cursor-pointer pr-10"
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
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fg-muted">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-fg-secondary mb-2">
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
                      className="w-full px-4 py-3 bg-black border border-line/20 rounded-lg text-fg-primary focus:outline-none focus:border-line/40 focus:ring-1 focus:ring-white/40 transition-colors cursor-pointer pr-10"
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
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-fg-muted">
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
                <label className="block text-sm font-medium text-fg-secondary mb-2">
                  Description <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={newNoticeForm.description}
                  onChange={(e) => setNewNoticeForm({ ...newNoticeForm, description: e.target.value })}
                  placeholder="Enter the full notice description and requirements..."
                  rows={5}
                  className="w-full px-4 py-3 bg-black border border-line/20 rounded-lg text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-line/40 focus:ring-1 focus:ring-white/40 transition-colors resize-none"
                />
              </div>

              {/* Required Documents */}
              <div>
                <label className="block text-sm font-medium text-fg-secondary mb-2">
                  Required Documents
                </label>
                <div className="space-y-3">
                  {/* Existing Documents */}
                  {newNoticeForm.documents.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {newNoticeForm.documents.map((doc, idx) => (
                        <span key={idx} className="px-3 py-1.5 bg-bg-elevated text-fg-secondary rounded-lg text-sm flex items-center gap-2">
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
                      className="flex-1 px-4 py-2 bg-black border border-line/20 rounded-lg text-fg-primary placeholder:text-fg-muted focus:outline-none focus:border-line/40 focus:ring-1 focus:ring-white/40 transition-colors"
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
                      className="px-4 py-2 bg-accent-brand text-white rounded-lg hover:bg-bg-hover transition-colors flex items-center gap-2"
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
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-line/10">
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
                  className="px-6 py-2.5 bg-bg-elevated text-fg-secondary rounded-lg hover:bg-bg-hover transition-colors"
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
                    const newNotice: Notice = {
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
                  className="px-6 py-2.5 bg-accent-brand text-white rounded-lg hover:bg-bg-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
    </>
  )
}
