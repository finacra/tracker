'use client'

import React from 'react'
import Button from '@/components/ui/Button'

interface TrackerSearchAndActionsProps {
  trackerSearchQuery: string
  setTrackerSearchQuery: (query: string) => void
  canEdit: boolean
  selectedRequirements: Set<string>
  setBulkActionType: (type: 'status' | 'delete') => void
  setIsBulkActionModalOpen: (open: boolean) => void
  setSelectedRequirements: (updater: (prev: Set<string>) => Set<string>) => void
}

export default function TrackerSearchAndActions({
  trackerSearchQuery,
  setTrackerSearchQuery,
  canEdit,
  selectedRequirements,
  setBulkActionType,
  setIsBulkActionModalOpen,
  setSelectedRequirements
}: TrackerSearchAndActionsProps) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 mb-4">
      {/* Search Input — hairline border, indigo focus ring */}
      <div className="relative flex-1">
        <input
          type="text"
          placeholder="Search requirements, categories, descriptions…"
          value={trackerSearchQuery}
          onChange={(e) => setTrackerSearchQuery(e.target.value)}
          className="w-full px-4 py-2.5 pl-10 bg-bg-card border border-line/15 rounded-token-md text-fg-primary placeholder:text-fg-muted text-sm focus:outline-none focus:border-accent-brand/60 focus:ring-2 focus:ring-accent-brand/25 transition-colors duration-token ease-token"
        />
        <svg
          width="15"
          height="15"
          className="absolute left-3 top-1/2 -translate-y-1/2 text-fg-muted pointer-events-none"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        {trackerSearchQuery && (
          <button
            type="button"
            onClick={() => setTrackerSearchQuery('')}
            aria-label="Clear search"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-fg-muted hover:text-fg-primary transition-colors duration-token ease-token"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      {/* Bulk Actions */}
      {canEdit && selectedRequirements.size > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-fg-muted whitespace-nowrap">
            <span className="font-mono tabular-nums text-fg-primary">{selectedRequirements.size}</span> selected
          </span>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setBulkActionType('status')
              setIsBulkActionModalOpen(true)
            }}
            iconLeft={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            }
          >
            Update Status
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => {
              setBulkActionType('delete')
              setIsBulkActionModalOpen(true)
            }}
            iconLeft={
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            }
          >
            Delete
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedRequirements(() => new Set())}>
            Clear
          </Button>
        </div>
      )}
    </div>
  )
}
