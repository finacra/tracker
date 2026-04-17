'use client'

import React from 'react'

interface TrackerHeaderProps {
  trackerView: 'list' | 'calendar' | 'filings'
  setTrackerView: (view: 'list' | 'calendar' | 'filings') => void
  isLoadingRequirements: boolean
  refreshRequirements: () => void
  canEdit: boolean
  selectedTrackerFY: string
  setRequirementForm: (form: any) => void
  setIsCreateModalOpen: (open: boolean) => void
  handleCalendarSync: () => void
}

export default function TrackerHeader({
  trackerView,
  setTrackerView,
  isLoadingRequirements,
  refreshRequirements,
  canEdit,
  selectedTrackerFY,
  setRequirementForm,
  setIsCreateModalOpen,
  handleCalendarSync
}: TrackerHeaderProps) {
  return (
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
          <button
            onClick={() => setTrackerView('filings')}
            className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-md transition-colors flex items-center gap-1 sm:gap-2 text-xs sm:text-sm ${trackerView === 'filings'
                ? 'bg-white text-black'
                : 'text-gray-400 hover:text-white'
              }`}
            title="Filing Register"
          >
            <svg width="14" height="14" className="sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
            </svg>
            <span className="hidden sm:inline">Register</span>
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
          onClick={handleCalendarSync}
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
  )
}
