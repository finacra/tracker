'use client'

import React from 'react'

interface Requirement {
  id: string
  requirement: string
  description?: string | null
  category?: string | null
  status: string
  dueDate: string | null | undefined
  penalty?: string | null
  penalty_base_amount?: number | null
  compliance_type?: string | null
  [key: string]: any
}

interface TrackerCalendarViewProps {
  calendarMonth: number
  calendarYear: number
  setCalendarMonth: (month: number) => void
  setCalendarYear: (year: number) => void
  months: string[]
  selectedTrackerFY: string
  requirementsByDate: Map<string, Requirement[]>
  calculateDelay: (dueDate: string, status: string) => number | null
  calculatePenalty: (penaltyStr: string | null, daysDelayed: number | null, penaltyBaseAmount?: number | null) => any
  parseDateForCalendar: (dateStr: string | null | undefined) => Date | null
}

export default function TrackerCalendarView({
  calendarMonth,
  calendarYear,
  setCalendarMonth,
  setCalendarYear,
  months,
  selectedTrackerFY,
  requirementsByDate,
  calculateDelay,
  calculatePenalty,
  parseDateForCalendar
}: TrackerCalendarViewProps) {
  // Calculate calendar month details
  const firstDay = new Date(calendarYear, calendarMonth, 1)
  const lastDay = new Date(calendarYear, calendarMonth + 1, 0)
  const daysInMonth = lastDay.getDate()
  const startingDayOfWeek = firstDay.getDay()

  return (
    <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl p-3 sm:p-6">
      {/* Calendar Header with Navigation - Stack on Mobile */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex-1">
          <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-4">
            <button
              onClick={() => setCalendarYear(calendarYear - 1)}
              className="p-1.5 sm:p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
              title="Previous Year"
            >
              <svg width="16" height="16" className="sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="11 17 6 12 11 7" />
                <polyline points="18 17 13 12 18 7" />
              </svg>
            </button>
            <button
              onClick={() => {
                if (calendarMonth === 0) {
                  setCalendarMonth(11)
                  setCalendarYear(calendarYear - 1)
                } else {
                  setCalendarMonth(calendarMonth - 1)
                }
              }}
              className="p-1.5 sm:p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
              title="Previous Month"
            >
              <svg width="16" height="16" className="sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <h3 className="text-base sm:text-xl font-semibold text-white min-w-[140px] sm:min-w-[200px] text-center">
              {months[calendarMonth]} {calendarYear}
            </h3>
            <button
              onClick={() => {
                if (calendarMonth === 11) {
                  setCalendarMonth(0)
                  setCalendarYear(calendarYear + 1)
                } else {
                  setCalendarMonth(calendarMonth + 1)
                }
              }}
              className="p-1.5 sm:p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
              title="Next Month"
            >
              <svg width="16" height="16" className="sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <button
              onClick={() => setCalendarYear(calendarYear + 1)}
              className="p-1.5 sm:p-2 hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-white"
              title="Next Year"
            >
              <svg width="16" height="16" className="sm:w-5 sm:h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="13 17 18 12 13 7" />
                <polyline points="6 17 11 12 6 7" />
              </svg>
            </button>
          </div>
          {selectedTrackerFY && (
            <p className="text-gray-400 text-xs sm:text-sm mt-2 text-center sm:text-left">{selectedTrackerFY}</p>
          )}
        </div>
      </div>
      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-1 sm:gap-2">
        {/* Day headers */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="text-center text-[10px] sm:text-xs font-medium text-gray-400 py-1 sm:py-2">
            {day}
          </div>
        ))}
        {/* Empty cells for days before month starts */}
        {Array.from({ length: startingDayOfWeek }).map((_, i) => (
          <div key={`empty-${i}`} className="aspect-square"></div>
        ))}
        {/* Calendar days */}
        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1
          const dateKey = `${calendarYear}-${String(calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
          const dayRequirements = requirementsByDate.get(dateKey) || []
          const isToday = new Date().toDateString() === new Date(calendarYear, calendarMonth, day).toDateString()

          return (
            <div
              key={day}
              className={`min-h-[60px] sm:min-h-[120px] border border-gray-700 rounded sm:rounded-lg p-1 sm:p-2 bg-gray-900/50 ${isToday ? 'ring-1 sm:ring-2 ring-white/40' : ''
                }`}
            >
              <div className={`text-xs sm:text-sm mb-1 sm:mb-2 font-medium ${isToday ? 'text-white font-bold' : 'text-gray-300'}`}>
                {day}
              </div>
              <div className="space-y-1 sm:space-y-1.5 overflow-y-auto max-h-[45px] sm:max-h-[90px]">
                {dayRequirements.map((req: Requirement) => {
                  const dueDate = req.dueDate || ''
                  const isOverdue = req.status === 'overdue' || (parseDateForCalendar(dueDate) && parseDateForCalendar(dueDate)! < new Date())
                  const daysDelayed = calculateDelay(dueDate, req.status)
                  const calculatedPenalty = calculatePenalty(req.penalty || null, daysDelayed, req.penalty_base_amount)

                  return (
                    <div
                      key={req.id}
                      className={`text-[10px] sm:text-xs p-1 sm:p-2 rounded border cursor-pointer hover:opacity-80 transition-opacity ${isOverdue
                          ? 'bg-red-500/20 text-red-400 border-red-500/30'
                          : req.status === 'completed'
                            ? 'bg-green-500/20 text-green-400 border-green-500/30'
                            : req.status === 'pending'
                              ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                              : 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                        }`}
                      title={`${req.category} - ${req.requirement}\n${req.description || ''}\nStatus: ${req.status}\nPenalty: ${req.penalty}\nCalculated: ${calculatedPenalty}`}
                    >
                      <div className="font-semibold truncate">{req.requirement}</div>
                      <div className="text-[8px] sm:text-[10px] text-gray-400 truncate mt-0.5 hidden sm:block">{req.category}</div>
                      <div className="flex items-center gap-0.5 sm:gap-1 mt-0.5 sm:mt-1">
                        <span className={`px-1 sm:px-1.5 py-0.5 rounded text-[8px] sm:text-[10px] font-medium ${req.status === 'completed' ? 'bg-green-500/30 text-green-300' :
                            req.status === 'overdue' ? 'bg-red-500/30 text-red-300' :
                              req.status === 'pending' ? 'bg-yellow-500/30 text-yellow-300' :
                                'bg-gray-700 text-gray-300'
                          }`}>
                          {req.status === 'completed' ? '✓' : req.status === 'overdue' ? '!' : req.status === 'pending' ? '⏳' : '○'}
                        </span>
                        {req.compliance_type && (
                          <span className="text-[8px] sm:text-[10px] text-gray-400 hidden sm:inline">
                            {req.compliance_type.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      {calculatedPenalty !== '-' && (
                        <div className="text-[8px] sm:text-[10px] text-red-400 mt-0.5 font-medium truncate">
                          {calculatedPenalty}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
