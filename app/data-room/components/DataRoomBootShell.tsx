'use client'

import React from 'react'
import Header from '@/components/layout/Header'
import SubtleCircuitBackground from '@/components/ui/SubtleCircuitBackground'
import TrackerCategoryAccordionView from './tracker/TrackerCategoryAccordionView'
import { getCountryConfig } from '@/lib/config/countries'

/**
 * Pre-data layout shell for the entire data-room page.
 *
 * Renders the SAME outer DOM structure as the post-boot data-room tree
 * (Header → main container → company card slot → "Data Room" title →
 * tab strip → active-tab content), but with skeletons / shells in each
 * data-dependent slot. When the page-level boot guard flips, the
 * populated tree lands in the exact same DOM positions, so there's no
 * pop-in and no visible layout shift.
 *
 * Why a separate component (not inline in page.tsx): this is rendered
 * during the early-return at the top of page.tsx where most of the page
 * state isn't initialized yet. Keeping it self-contained means it can
 * derive everything it needs (country categories) from a synchronous
 * config without depending on any of the page's hooks.
 *
 * The cinematic "Booting Data Room" banner from the previous boot
 * screen is intentionally removed. It theatrically announced the load
 * but caused the perceived abruptness — by replacing the real layout
 * with a stylized message and then snapping back to the real layout,
 * every section moved when the gate flipped.
 */
export default function DataRoomBootShell({
  activeTab = 'tracker',
  countryCode = 'IN',
}: {
  activeTab?: string
  countryCode?: string
}) {
  // Static category list for the tracker shell. Sourced synchronously
  // from the country config — no async wait.
  const config = (() => {
    try {
      return getCountryConfig(countryCode)
    } catch {
      return null
    }
  })()
  const shellCategories =
    config?.compliance?.defaultCategories && config.compliance.defaultCategories.length > 0
      ? config.compliance.defaultCategories
      : ['Income Tax', 'GST', 'Payroll', 'RoC', 'Renewals', 'Others']

  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      <SubtleCircuitBackground />
      <Header />

      <div className="relative z-10 container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Company Selector slot — matches post-boot dimensions */}
        <div className="mb-4 sm:mb-6">
          <h2 className="text-gray-400 text-sm font-medium mb-2 sm:mb-3">My companies</h2>
          <div className="h-[72px] sm:h-[84px] rounded-xl border border-white/10 bg-white/[0.03] animate-pulse" />
        </div>

        {/* Page Title — real, no shell */}
        <h1 className="text-2xl sm:text-4xl font-light text-white mb-4 sm:mb-6">Data Room</h1>

        {/* Tab strip — visually matches the real tabs (rounded buttons,
            border, padding) so dimensions are identical when the real
            tabs render. Inert during shell. */}
        <div className="flex items-center gap-2 mb-4 sm:mb-8 overflow-x-auto pb-2 -mx-3 sm:mx-0 px-3 sm:px-0 scrollbar-hide">
          {['Overview', 'Tracker', 'Documents', 'Reports', 'DSC & DIN', 'Notices'].map((label) => (
            <div
              key={label}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-6 py-2 sm:py-3 rounded-lg border-2 whitespace-nowrap flex-shrink-0 ${
                label.toLowerCase() === activeTab
                  ? 'border-white/40 bg-white/10 text-white'
                  : 'border-white/20 bg-black text-gray-500'
              }`}
            >
              <div className="w-4 h-4 sm:w-[18px] sm:h-[18px] rounded bg-white/10 animate-pulse" />
              <span className="text-sm sm:text-base">{label}</span>
            </div>
          ))}
        </div>

        {/* Active-tab content shell. We only invest in the tracker
            tab's shell (the user-reported pain). Other tabs get a
            generic block. */}
        {activeTab === 'tracker' ? (
          <TrackerSectionShell shellCategories={shellCategories} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-32 rounded-2xl border border-white/10 bg-white/[0.03] animate-pulse"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Tracker tab content shell — mirrors what TrackerTab renders post-boot:
 *   Regulatory Timeline title row → Compliance Intelligence panel →
 *   Filter strip → Search bar → Status pills → accordion shell.
 * Each slot is sized to the post-boot height so positions are stable.
 */
function TrackerSectionShell({ shellCategories }: { shellCategories: string[] }) {
  return (
    <>
      {/* Title row: "Regulatory Timeline" + view switcher */}
      <div className="flex items-center justify-between mb-4 sm:mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl sm:text-3xl font-light text-white">Regulatory Timeline</h2>
          <p className="text-gray-400 text-sm mt-1">
            Keep track of upcoming tax and compliance deadlines.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {['List', 'Calendar', 'Refresh', 'Add Compliance', 'Sync Calendar'].map((label) => (
            <div
              key={label}
              className="h-9 px-3 sm:px-4 rounded-lg border border-white/10 bg-white/[0.03] flex items-center gap-2"
            >
              <div className="w-3 h-3 rounded bg-white/10 animate-pulse" />
              <span className="text-xs sm:text-sm text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Country line */}
      <div className="text-sm text-gray-500 mb-4">
        <span className="text-gray-600">Country:</span> India
      </div>

      {/* Compliance Intelligence panel slot — matches the real panel's
          ~120px footprint */}
      <div className="mb-4 h-[120px] sm:h-[140px] rounded-2xl border border-white/10 bg-white/[0.02] animate-pulse" />

      {/* Filter strip slot — 4 dropdown placeholders */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {['FY', 'All Months', 'All Quarters', 'All Categories'].map((label) => (
          <div
            key={label}
            className="h-10 px-3 rounded-lg border border-white/10 bg-white/[0.03] flex items-center gap-2"
          >
            <span className="text-sm text-gray-500">{label}</span>
            <div className="w-3 h-3 rounded bg-white/10 animate-pulse" />
          </div>
        ))}
      </div>

      {/* Search bar */}
      <div className="h-12 mb-4 rounded-lg border border-white/10 bg-white/[0.03] flex items-center px-4">
        <span className="text-sm text-gray-600">Search requirements, categories, descriptions…</span>
      </div>

      {/* Status pills strip */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-1">
        {['All', 'Overdue', 'Critical', 'Pending', 'Upcoming', 'Completed'].map((label) => (
          <div
            key={label}
            className="h-8 px-3 rounded-lg border border-white/10 bg-white/[0.03] flex items-center gap-2 flex-shrink-0"
          >
            <span className="text-xs text-gray-500">{label}</span>
            <div className="w-5 h-3 rounded-full bg-white/5 animate-pulse" />
          </div>
        ))}
      </div>

      {/* Tracker accordion — same component as post-boot, status="loading" */}
      <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {/* The shell uses a hidden mobile path so the categories appear
            on every breakpoint — mirrors the post-boot wrapper. */}
        <div className="p-3 sm:p-4">
          <TrackerCategoryAccordionView
            status="loading"
            shellCategories={shellCategories}
            // The remaining props are required by the type but unused
            // when status === 'loading'. Pass safe no-op defaults.
            groupedByCategory={[]}
            filteredRequirements={[]}
            canEdit={false}
            vaultDocuments={[]}
            selectedRequirements={new Set()}
            setSelectedRequirements={() => {}}
            handleStatusChange={async () => {}}
            regulatoryService={null as any}
            currentCompany={null}
            setHiddenCompliances={() => {}}
            setRegulatoryRequirements={() => {}}
            regulatoryRequirements={[]}
            setEditingRequirement={() => {}}
            setRequirementForm={() => {}}
            setIsEditModalOpen={() => {}}
            setComplianceDetailsModal={() => {}}
            setDocumentUploadModal={() => {}}
            calculateDelay={() => null}
            calculatePenalty={() => '-'}
            getFormFrequency={() => null}
            getRelevantLegalSections={() => []}
            getAuthorityForCategory={() => null}
          />
        </div>
      </div>
    </>
  )
}
