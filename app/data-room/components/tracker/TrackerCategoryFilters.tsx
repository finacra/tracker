'use client'

import React, { useMemo } from 'react'

interface TrackerCategoryFiltersProps {
  categoryFilter: string
  setCategoryFilter: (filter: string) => void
  requirements?: Array<{ status: string; isCritical?: boolean }>
}

export default function TrackerCategoryFilters({
  categoryFilter,
  setCategoryFilter,
  requirements = [],
}: TrackerCategoryFiltersProps) {
  const counts = useMemo(() => {
    const c = { all: requirements.length, overdue: 0, critical: 0, pending: 0, upcoming: 0, completed: 0 }
    for (const r of requirements) {
      if (r.status === 'overdue') c.overdue++
      if (r.isCritical) c.critical++
      if (r.status === 'pending') c.pending++
      if (r.status === 'upcoming') c.upcoming++
      if (r.status === 'completed') c.completed++
    }
    return c
  }, [requirements])

  return (
    <div className="flex items-center gap-2 flex-wrap overflow-x-auto pb-2 -mx-3 sm:mx-0 px-3 sm:px-0 scrollbar-hide">
      {(['all', 'overdue', 'critical', 'pending', 'upcoming', 'completed'] as const).map((filter) => {
        const count = counts[filter]
        const labels: Record<string, { short: string; long: string }> = {
          all: { short: 'All', long: 'All' },
          overdue: { short: 'Overdue', long: 'Overdue' },
          critical: { short: 'Critical', long: 'Critical' },
          pending: { short: 'Pending', long: 'Pending' },
          upcoming: { short: 'Upcoming', long: 'Upcoming' },
          completed: { short: 'Completed', long: 'Completed' },
        }
        return (
          <button
            key={filter}
            onClick={() => setCategoryFilter(filter)}
            className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg border-2 transition-colors text-xs sm:text-sm whitespace-nowrap flex-shrink-0 ${categoryFilter === filter
                ? 'border-white/40 bg-white/10 text-white'
                : 'border-gray-700 bg-primary-dark-card text-white hover:border-gray-600'
              }`}
          >
            <span className="capitalize">
              {labels[filter]?.long || filter}
            </span>
            {count > 0 && (
              <span className={`ml-1.5 text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full ${
                categoryFilter === filter
                  ? 'bg-white/20 text-white'
                  : 'bg-gray-700 text-gray-300'
              }`}>
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
