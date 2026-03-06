'use client'

import React from 'react'
import { getFinancialYearMonths } from '@/lib/utils/financial-year'

interface TrackerFilterControlsProps {
  selectedTrackerFY: string
  setSelectedTrackerFY: (fy: string) => void
  selectedMonth: string | null
  setSelectedMonth: (month: string | null) => void
  selectedQuarter: string | null
  setSelectedQuarter: (quarter: string | null) => void
  selectedCategory: string
  setSelectedCategory: (category: string) => void
  isMonthDropdownOpen: boolean
  setIsMonthDropdownOpen: (open: boolean) => void
  isQuarterDropdownOpen: boolean
  setIsQuarterDropdownOpen: (open: boolean) => void
  isCategoryDropdownOpen: boolean
  setIsCategoryDropdownOpen: (open: boolean) => void
  financialYears: string[]
  months: string[]
  quarters: Array<{ value: string; label: string }>
  countryCode: string
  regulatoryRequirements: any[]
  complianceCategories: string[]
}

export default function TrackerFilterControls({
  selectedTrackerFY,
  setSelectedTrackerFY,
  selectedMonth,
  setSelectedMonth,
  selectedQuarter,
  setSelectedQuarter,
  selectedCategory,
  setSelectedCategory,
  isMonthDropdownOpen,
  setIsMonthDropdownOpen,
  isQuarterDropdownOpen,
  setIsQuarterDropdownOpen,
  isCategoryDropdownOpen,
  setIsCategoryDropdownOpen,
  financialYears,
  months,
  quarters,
  countryCode,
  regulatoryRequirements,
  complianceCategories
}: TrackerFilterControlsProps) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
      {/* Financial Year Dropdown with Context */}
      <div className="relative flex-1 sm:flex-initial">
        <div className="relative">
          <select
            value={selectedTrackerFY}
            onChange={(e) => {
              const newFY = e.target.value
              setSelectedTrackerFY(newFY)
              // Clear month/quarter when FY changes to avoid confusion
              if (newFY) {
                setSelectedMonth(null)
                setSelectedQuarter(null)
              }
            }}
            className={`w-full sm:w-auto px-3 sm:px-4 py-2 rounded-lg border-2 transition-colors text-sm sm:text-base focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 appearance-none cursor-pointer bg-gray-900 ${selectedTrackerFY
                ? 'border-white/40 bg-white/10 text-white'
                : 'border-gray-700 text-white hover:border-gray-600'
              }`}
            title={selectedTrackerFY ? `Includes months: ${getFinancialYearMonths(countryCode, selectedTrackerFY).join(', ')}` : 'Select financial year'}
          >
            <option value="" className="bg-gray-900 text-white">All Years</option>
            {financialYears.map((fy) => (
              <option key={fy} value={fy} className="bg-gray-900 text-white">
                {fy}
              </option>
            ))}
          </select>
          {selectedTrackerFY && (
            <div className="absolute top-full left-0 mt-1 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-xs text-gray-300 z-10 whitespace-nowrap shadow-lg">
              Months: {getFinancialYearMonths(countryCode, selectedTrackerFY).slice(0, 4).join(', ')}...
            </div>
          )}
        </div>
      </div>
      {/* Monthly Dropdown */}
      <div className="relative flex-1 sm:flex-initial">
        <button
          onClick={() => {
            setIsMonthDropdownOpen(!isMonthDropdownOpen)
            setIsQuarterDropdownOpen(false)
          }}
          className={`w-full sm:w-auto px-3 sm:px-4 py-2 rounded-lg border-2 transition-colors flex items-center justify-between sm:justify-start gap-2 text-sm sm:text-base ${selectedMonth
              ? 'border-white/40 bg-white/10 text-white'
              : 'border-gray-700 bg-primary-dark-card text-white hover:border-gray-600'
            }`}
        >
          <span>{selectedMonth || 'All Months'}</span>
          <svg
            width="14"
            height="14"
            className={`sm:w-4 sm:h-4 flex-shrink-0 transition-transform ${isMonthDropdownOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {isMonthDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsMonthDropdownOpen(false)}
            />
            <div className="absolute top-full left-0 mt-2 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-20 min-w-[200px] max-h-64 overflow-y-auto">
              {/* All Months option */}
              <button
                onClick={() => {
                  setSelectedMonth(null)
                  setIsMonthDropdownOpen(false)
                }}
                className={`w-full px-4 py-2 text-left hover:bg-gray-800 transition-colors text-sm ${selectedMonth === null
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-200'
                  }`}
              >
                All Months
              </button>
              <div className="border-t border-gray-700" />
              {months.map((month) => (
                <button
                  key={month}
                  onClick={() => {
                    setSelectedMonth(month)
                    setIsMonthDropdownOpen(false)
                    setSelectedQuarter(null) // Clear quarter when month is selected
                  }}
                  className={`w-full px-4 py-2 text-left hover:bg-gray-800 transition-colors text-sm ${selectedMonth === month
                      ? 'bg-white/10 text-white font-medium'
                      : 'text-gray-200'
                    }`}
                >
                  {month}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {/* Quarters Dropdown */}
      <div className="relative flex-1 sm:flex-initial">
        <button
          onClick={() => {
            setIsQuarterDropdownOpen(!isQuarterDropdownOpen)
            setIsMonthDropdownOpen(false)
          }}
          className={`w-full sm:w-auto px-3 sm:px-4 py-2 rounded-lg border-2 transition-colors flex items-center justify-between sm:justify-start gap-2 text-sm sm:text-base ${selectedQuarter
              ? 'border-white/40 bg-white/10 text-white'
              : 'border-gray-700 bg-primary-dark-card text-white hover:border-gray-600'
            }`}
        >
          <span>{selectedQuarter ? quarters.find(q => q.value === selectedQuarter)?.label.split(' - ')[0] : 'All Quarters'}</span>
          <svg
            width="14"
            height="14"
            className={`sm:w-4 sm:h-4 flex-shrink-0 transition-transform ${isQuarterDropdownOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {isQuarterDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsQuarterDropdownOpen(false)}
            />
            <div className="absolute top-full left-0 mt-2 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-20 min-w-[200px]">
              {/* All Quarters option */}
              <button
                onClick={() => {
                  setSelectedQuarter(null)
                  setIsQuarterDropdownOpen(false)
                }}
                className={`w-full px-4 py-2 text-left hover:bg-gray-800 transition-colors text-sm ${selectedQuarter === null
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-200'
                  }`}
              >
                All Quarters
              </button>
              <div className="border-t border-gray-700" />
              {quarters.map((quarter) => (
                <button
                  key={quarter.value}
                  onClick={() => {
                    setSelectedQuarter(quarter.value)
                    setIsQuarterDropdownOpen(false)
                    setSelectedMonth(null) // Clear month when quarter is selected
                  }}
                  className={`w-full px-4 py-2 text-left hover:bg-gray-800 transition-colors text-sm ${selectedQuarter === quarter.value
                      ? 'bg-white/10 text-white font-medium'
                      : 'text-gray-200'
                    }`}
                >
                  {quarter.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      {/* Category Dropdown */}
      <div className="relative flex-1 sm:flex-initial">
        <button
          onClick={() => {
            setIsCategoryDropdownOpen(!isCategoryDropdownOpen)
            setIsMonthDropdownOpen(false)
            setIsQuarterDropdownOpen(false)
          }}
          className={`w-full sm:w-auto px-3 sm:px-4 py-2 rounded-lg border-2 transition-colors flex items-center justify-between sm:justify-start gap-2 text-sm sm:text-base ${selectedCategory !== 'all'
              ? 'border-white/40 bg-white/10 text-white'
              : 'border-gray-700 bg-primary-dark-card text-white hover:border-gray-600'
            }`}
        >
          <span>{selectedCategory === 'all' ? 'All Categories' : selectedCategory}</span>
          <svg
            width="14"
            height="14"
            className={`sm:w-4 sm:h-4 flex-shrink-0 transition-transform ${isCategoryDropdownOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        {isCategoryDropdownOpen && (
          <>
            <div
              className="fixed inset-0 z-10"
              onClick={() => setIsCategoryDropdownOpen(false)}
            />
            <div className="absolute top-full left-0 mt-2 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-20 min-w-[200px] max-h-64 overflow-y-auto">
              {/* All Categories option */}
              <button
                onClick={() => {
                  setSelectedCategory('all')
                  setIsCategoryDropdownOpen(false)
                }}
                className={`w-full px-4 py-2 text-left hover:bg-gray-800 transition-colors text-sm ${selectedCategory === 'all'
                    ? 'bg-white/10 text-white font-medium'
                    : 'text-gray-200'
                  }`}
              >
                All Categories
              </button>
              <div className="border-t border-gray-700" />
              {/* Get unique categories from requirements */}
              {(() => {
                const allCategories = Array.from(new Set((regulatoryRequirements || []).map(req => req.category).filter(Boolean)))
                const preferredOrder = complianceCategories.length > 0 ? complianceCategories : ['Income Tax', 'GST', 'Payroll', 'RoC', 'Renewals', 'Prof.Tax', 'Other', 'Others']
                const categoryOrder = [
                  ...preferredOrder.filter((cat: string) => allCategories.includes(cat)),
                  ...allCategories.filter((cat: string) => !preferredOrder.includes(cat) && cat).sort()
                ]
                return categoryOrder.map((category) => (
                  <button
                    key={category}
                    onClick={() => {
                      setSelectedCategory(category)
                      setIsCategoryDropdownOpen(false)
                    }}
                    className={`w-full px-4 py-2 text-left hover:bg-gray-800 transition-colors text-sm ${selectedCategory === category
                        ? 'bg-white/10 text-white font-medium'
                        : 'text-gray-200'
                      }`}
                  >
                    {category}
                  </button>
                ))
              })()}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
