'use client'

import React from 'react'

interface TrackerCategoryFiltersProps {
  categoryFilter: string
  setCategoryFilter: (filter: string) => void
}

export default function TrackerCategoryFilters({
  categoryFilter,
  setCategoryFilter
}: TrackerCategoryFiltersProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap overflow-x-auto pb-2 -mx-3 sm:mx-0 px-3 sm:px-0 scrollbar-hide">
      {['all', 'critical', 'pending', 'upcoming', 'completed'].map((filter) => (
        <button
          key={filter}
          onClick={() => setCategoryFilter(filter)}
          className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg border-2 transition-colors capitalize text-xs sm:text-sm whitespace-nowrap flex-shrink-0 ${categoryFilter === filter
              ? 'border-white/40 bg-white/10 text-white'
              : 'border-gray-700 bg-primary-dark-card text-white hover:border-gray-600'
            }`}
        >
          {filter === 'all'
            ? 'All'
            : filter === 'critical'
              ? (
                <>
                  <span className="sm:hidden">Critical</span>
                  <span className="hidden sm:inline">Passed Due Date (Critical)</span>
                </>
              )
              : filter}
        </button>
      ))}
    </div>
  )
}
