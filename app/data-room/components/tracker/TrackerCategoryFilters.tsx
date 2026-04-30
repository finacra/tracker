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
    <div className="flex items-center gap-1 flex-wrap overflow-x-auto pb-2 -mx-3 sm:mx-0 px-3 sm:px-0 scrollbar-hide">
      {(['all', 'overdue', 'critical', 'pending', 'upcoming', 'completed'] as const).map((filter) => {
        const count = counts[filter]
        const labels: Record<string, string> = {
          all: 'All',
          overdue: 'Overdue',
          critical: 'Critical',
          pending: 'Pending',
          upcoming: 'Upcoming',
          completed: 'Completed',
        }
        const isActive = categoryFilter === filter
        return (
          <button
            key={filter}
            type="button"
            onClick={() => setCategoryFilter(filter)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-token-md text-xs transition-colors duration-token ease-token whitespace-nowrap flex-shrink-0 ${
              isActive
                ? 'bg-bg-elevated text-fg-primary border border-line/15'
                : 'text-fg-muted hover:text-fg-primary hover:bg-bg-hover border border-transparent'
            }`}
          >
            <span>{labels[filter] || filter}</span>
            {count > 0 && (
              <span
                className={`text-[10px] font-mono tabular-nums px-1.5 py-px rounded-full ${
                  isActive ? 'bg-bg-card text-fg-secondary' : 'bg-bg-elevated text-fg-muted'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
