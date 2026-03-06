'use client'

import React from 'react'

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
      {/* Search Input */}
      <div className="relative flex-1">
        <input
          type="text"
          placeholder="Search requirements, categories, descriptions..."
          value={trackerSearchQuery}
          onChange={(e) => setTrackerSearchQuery(e.target.value)}
          className="w-full px-4 py-2.5 pl-10 bg-black border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 text-sm sm:text-base"
        />
        <svg
          width="16"
          height="16"
          className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500"
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
            onClick={() => setTrackerSearchQuery('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>
      {/* Bulk Actions */}
      {canEdit && selectedRequirements.size > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400 whitespace-nowrap">
            {selectedRequirements.size} selected
          </span>
          <button
            onClick={() => {
              setBulkActionType('status')
              setIsBulkActionModalOpen(true)
            }}
            className="px-3 py-2 bg-blue-500/20 border border-blue-500 text-blue-400 rounded-lg hover:bg-blue-500/30 transition-colors text-sm flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            Update Status
          </button>
          <button
            onClick={() => {
              setBulkActionType('delete')
              setIsBulkActionModalOpen(true)
            }}
            className="px-3 py-2 bg-red-500/20 border border-red-500 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-sm flex items-center gap-2"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete
          </button>
          <button
            onClick={() => setSelectedRequirements(() => new Set())}
            className="px-3 py-2 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors text-sm"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  )
}
