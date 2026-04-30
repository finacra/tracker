'use client'

import React from 'react'
import { useRotatingLoadingMessage } from '@/hooks/useRotatingLoadingMessage'
import { COMPLIANCE_TRACKER_LOADING_MESSAGES } from '@/lib/ui/loading-messages'

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
    return <TrackerLoadingState />
  }

  if (displayRequirements.length === 0) {
    const hasActiveFilters = trackerSearchQuery || selectedTrackerFY || selectedMonth || selectedQuarter || categoryFilter !== 'all' || selectedCategory !== 'all'
    const hasNoRequirements = displayRequirements.length === 0 && regulatoryRequirements.length === 0

    return (
      <div className="py-12 sm:py-16 flex flex-col items-center justify-center">
        <div className="w-14 h-14 border border-line/15 bg-bg-card rounded-full flex items-center justify-center mb-4">
          <svg
            width="22"
            height="22"
            className="text-fg-muted"
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
            <p className="text-fg-primary text-sm font-medium mb-1.5">No requirements match your filters</p>
            <p className="text-fg-muted text-xs mb-5 text-center px-4">
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
              className="px-4 py-2 bg-bg-card border border-line/15 text-fg-secondary hover:border-line/30 hover:text-fg-primary rounded-token-md transition-colors duration-token ease-token text-xs font-medium"
            >
              Clear all filters
            </button>
          </>
        ) : hasNoRequirements ? (
          <>
            <p className="text-fg-primary text-sm font-medium mb-1.5">No regulatory requirements yet</p>
            <p className="text-fg-muted text-xs mb-5 text-center max-w-md px-4 leading-relaxed">
              {canEdit
                ? 'Get started by adding your first compliance requirement. Requirements are automatically generated based on your company profile, or you can add custom ones.'
                : 'No compliance requirements have been set up for this company yet.'}
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
                className="px-4 py-2 bg-accent-brand text-white rounded-token-md hover:opacity-90 shadow-sm shadow-accent-brand/20 transition-opacity duration-token ease-token text-xs font-medium flex items-center gap-2"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add first requirement
              </button>
            )}
          </>
        ) : (
          <p className="text-fg-muted text-sm">No regulatory requirements found</p>
        )}
      </div>
    )
  }

  return null
}

function TrackerLoadingState() {
  const message = useRotatingLoadingMessage({
    active: true,
    messages: COMPLIANCE_TRACKER_LOADING_MESSAGES,
  })
  return (
    <div className="py-12 sm:py-16 flex flex-col items-center justify-center">
      <div className="relative mb-5">
        <div className="w-10 h-10 border-2 border-accent-brand/30 border-t-accent-brand rounded-full animate-spin" />
      </div>
      <p className="text-fg-primary text-sm font-medium mb-1">Loading compliance tracker</p>
      <p className="text-fg-muted text-xs" key={message}>{message}</p>
    </div>
  )
}
