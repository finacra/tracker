'use client'

import React from 'react'

interface TrackerEmptyStateProps {
  isLoadingRequirements: boolean
  displayRequirements: any[]
  regulatoryRequirements: any[]
  trackerSearchQuery: string
  selectedTrackerFY: string
  selectedMonth: string | null
  selectedQuarter: string | null
  categoryFilter: string
  selectedCategory: string
  canEdit: boolean
  setTrackerSearchQuery: (query: string) => void
  setSelectedTrackerFY: (fy: string) => void
  setSelectedMonth: (month: string | null) => void
  setSelectedQuarter: (quarter: string | null) => void
  setCategoryFilter: (filter: string) => void
  setSelectedCategory: (category: string) => void
  setRequirementForm: (form: any) => void
  setIsCreateModalOpen: (open: boolean) => void
}

export default function TrackerEmptyState({
  isLoadingRequirements,
  displayRequirements,
  regulatoryRequirements,
  trackerSearchQuery,
  selectedTrackerFY,
  selectedMonth,
  selectedQuarter,
  categoryFilter,
  selectedCategory,
  canEdit,
  setTrackerSearchQuery,
  setSelectedTrackerFY,
  setSelectedMonth,
  setSelectedQuarter,
  setCategoryFilter,
  setSelectedCategory,
  setRequirementForm,
  setIsCreateModalOpen
}: TrackerEmptyStateProps) {
  if (isLoadingRequirements) {
    return (
      <div className="py-8 sm:py-12 flex flex-col items-center justify-center">
        <div className="relative mb-6">
          <div className="w-12 h-12 sm:w-14 sm:h-14 border-4 border-white/30 border-t-transparent rounded-full animate-spin"></div>
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 bg-gradient-to-br from-blue-500/30 to-purple-500/30 rounded-full animate-pulse"></div>
          </div>
        </div>
        <p className="text-gray-300 text-sm sm:text-base font-medium mb-1">Loading Compliance Tracker</p>
        <p className="text-gray-500 text-xs sm:text-sm">Fetching regulatory requirements and status updates...</p>
      </div>
    )
  }

  if (displayRequirements.length === 0) {
    const hasActiveFilters = trackerSearchQuery || selectedTrackerFY || selectedMonth || selectedQuarter || categoryFilter !== 'all' || selectedCategory !== 'all'
    const hasNoRequirements = displayRequirements.length === 0 && regulatoryRequirements.length === 0

    return (
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
        {hasActiveFilters ? (
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
        ) : hasNoRequirements ? (
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
    )
  }

  return null
}
