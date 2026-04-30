'use client'

import React, { useMemo } from 'react'

interface CategoryDashboardProps {
  category: string
  items: Array<{
    id: string
    requirement: string
    status: string
    dueDate: string
    compliance_type: string
    isCritical: boolean
  }>
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bgColor: string; iconColor: string }> = {
  completed: { label: 'Completed', color: 'text-green-400', bgColor: 'bg-green-500/10 border-green-500/30', iconColor: 'text-green-500' },
  overdue: { label: 'Overdue', color: 'text-red-400', bgColor: 'bg-red-500/10 border-red-500/30', iconColor: 'text-red-500' },
  pending: { label: 'Pending', color: 'text-yellow-400', bgColor: 'bg-yellow-500/10 border-yellow-500/30', iconColor: 'text-yellow-500' },
  upcoming: { label: 'Upcoming', color: 'text-blue-400', bgColor: 'bg-blue-500/10 border-blue-500/30', iconColor: 'text-blue-500' },
  not_started: { label: 'Not Started', color: 'text-fg-muted', bgColor: 'bg-bg-hover/10 border-line/40/30', iconColor: 'text-fg-muted' },
}

export default function CategoryDashboard({ category, items }: CategoryDashboardProps) {
  const counts = useMemo(() => {
    const c = { completed: 0, overdue: 0, pending: 0, upcoming: 0, not_started: 0 }
    for (const item of items) {
      const s = item.status as keyof typeof c
      if (s in c) c[s]++
    }
    return c
  }, [items])

  const total = items.length
  const completionRate = total > 0 ? Math.round((counts.completed / total) * 100) : 0

  return (
    <div className="mb-4">
      {/* Category header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-white/90">{category} Dashboard</h3>
        <span className="text-xs text-fg-muted">
          {completionRate}% complete ({counts.completed}/{total})
        </span>
      </div>

      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {(['completed', 'pending', 'overdue', 'not_started'] as const).map((status) => {
          const config = STATUS_CONFIG[status]
          const count = counts[status]
          return (
            <div
              key={status}
              className={`rounded-lg border px-3 py-2.5 ${config.bgColor}`}
            >
              <div className={`text-lg sm:text-xl font-bold ${config.color}`}>
                {count}
              </div>
              <div className="text-xs text-fg-muted mt-0.5">
                {config.label}
              </div>
            </div>
          )
        })}
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 bg-bg-hover rounded-full overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-300"
          style={{ width: `${completionRate}%` }}
        />
      </div>
    </div>
  )
}
