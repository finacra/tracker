'use client'

import React from 'react'
import Button from '@/components/ui/Button'

interface TrackerHeaderProps {
  trackerView: 'list' | 'calendar'
  setTrackerView: (view: 'list' | 'calendar') => void
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
        <h2 className="text-xl sm:text-2xl font-medium text-fg-primary tracking-tight mb-1">Regulatory Timeline</h2>
        <p className="text-fg-muted text-sm">Keep track of upcoming tax and compliance deadlines.</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {/* View Toggle — segmented control */}
        <div className="inline-flex items-center bg-bg-elevated rounded-token-md p-0.5 border border-line/10">
          <button
            type="button"
            onClick={() => setTrackerView('list')}
            className={`px-2.5 sm:px-3 py-1 rounded-token-sm transition-colors duration-token ease-token flex items-center gap-1.5 text-xs ${trackerView === 'list'
                ? 'bg-bg-card text-fg-primary shadow-sm'
                : 'text-fg-muted hover:text-fg-primary'
              }`}
            title="List View"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            type="button"
            onClick={() => setTrackerView('calendar')}
            className={`px-2.5 sm:px-3 py-1 rounded-token-sm transition-colors duration-token ease-token flex items-center gap-1.5 text-xs ${trackerView === 'calendar'
                ? 'bg-bg-card text-fg-primary shadow-sm'
                : 'text-fg-muted hover:text-fg-primary'
              }`}
            title="Calendar View"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span className="hidden sm:inline">Calendar</span>
          </button>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={refreshRequirements}
          disabled={isLoadingRequirements}
          loading={isLoadingRequirements}
          iconLeft={
            !isLoadingRequirements ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
              </svg>
            ) : null
          }
          title="Refresh requirements"
        >
          <span className="hidden sm:inline">Refresh</span>
        </Button>
        {canEdit && (
          <Button
            size="sm"
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
            iconLeft={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            }
          >
            <span className="hidden sm:inline">Add Compliance</span>
            <span className="sm:hidden">Add</span>
          </Button>
        )}
        <Button
          variant="secondary"
          size="sm"
          onClick={handleCalendarSync}
          iconLeft={
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
          }
        >
          <span className="hidden sm:inline">Sync Calendar</span>
          <span className="sm:hidden">Sync</span>
        </Button>
      </div>
    </div>
  )
}
