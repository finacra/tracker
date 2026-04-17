'use client'

import React from 'react'
import { getFinancialYearMonths } from '@/lib/utils/financial-year'
import { useTrackerContext } from '@/contexts/TrackerContext'
import { useCalendarSync } from '../../hooks/useCalendarSync'
import RequirementFormModal, { EMPTY_REQUIREMENT_FORM } from './RequirementFormModal'
import RequirementMobileCardView from './RequirementMobileCardView'
import RequirementDesktopTableView from './RequirementDesktopTableView'
import TrackerFilterControls from './TrackerFilterControls'
import TrackerHeader from './TrackerHeader'
import TrackerSearchAndActions from './TrackerSearchAndActions'
import TrackerCategoryFilters from './TrackerCategoryFilters'
import TrackerEmptyState from './TrackerEmptyState'
import TrackerCalendarView from './TrackerCalendarView'
import ComplianceIntelligencePanel from './ComplianceIntelligencePanel'
import CategoryDashboard from './CategoryDashboard'
import ComplianceFilingView from './ComplianceFilingView'

export default function TrackerTab() {
  const {
    // External data
    regulatoryRequirements,
    setRegulatoryRequirements,
    isLoadingRequirements,
    refreshRequirements,
    currentCompany,
    user,
    canEdit,
    canManage,
    vaultDocuments,
    regulatoryService,
    financialYears,
    setComplianceDetailsModal,
    handleStatusChange,
    setHiddenCompliances,
    countryCode,
    countryConfig,
    complianceCategories,
    entityDetails,
    calculateDelayMemoized,
    calculatePenaltyMemoized,
    normalizeDate,
    formatDate,
    getFormFrequency,
    getRelevantLegalSections,
    getAuthorityForCategory,
    // Filter state (managed by context)
    trackerView,
    setTrackerView,
    selectedTrackerFY,
    setSelectedTrackerFY,
    selectedMonth,
    setSelectedMonth,
    isMonthDropdownOpen,
    setIsMonthDropdownOpen,
    selectedQuarter,
    setSelectedQuarter,
    isQuarterDropdownOpen,
    setIsQuarterDropdownOpen,
    categoryFilter,
    setCategoryFilter,
    selectedCategory,
    setSelectedCategory,
    isCategoryDropdownOpen,
    setIsCategoryDropdownOpen,
    entityTypeFilter,
    setEntityTypeFilter,
    industryFilter,
    setIndustryFilter,
    industryCategoryFilter,
    setIndustryCategoryFilter,
    complianceTypeFilter,
    setComplianceTypeFilter,
    trackerSearchQuery,
    setTrackerSearchQuery,
    selectedRequirements,
    setSelectedRequirements,
    calendarMonth,
    setCalendarMonth,
    calendarYear,
    setCalendarYear,
    // Modal state (managed by context)
    isCreateModalOpen,
    setIsCreateModalOpen,
    isEditModalOpen,
    setIsEditModalOpen,
    isBulkActionModalOpen,
    setIsBulkActionModalOpen,
    bulkActionType,
    setBulkActionType,
    editingRequirement,
    setEditingRequirement,
    requirementForm,
    setRequirementForm,
    // Upload state (owned by page.tsx, passed through context)
    setDocumentUploadModal,
    // Derived values
    displayRequirements,
    filteredRequirements,
    groupedByCategory,
    requirementsByDate,
  } = useTrackerContext()

  const { handleCalendarSync } = useCalendarSync({
    user,
    currentCompany,
    regulatoryRequirements,
  })

  const months = selectedTrackerFY && countryCode
    ? getFinancialYearMonths(countryCode, selectedTrackerFY)
    : ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December']

  const quarters = [
    { value: 'Q1', label: 'Q1 - Apr to Jun' },
    { value: 'Q2', label: 'Q2 - Jul to Sep' },
    { value: 'Q3', label: 'Q3 - Oct to Dec' },
    { value: 'Q4', label: 'Q4 - Jan to Mar' },
  ]

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header with Title and Actions */}
      <TrackerHeader
        trackerView={trackerView}
        setTrackerView={setTrackerView}
        isLoadingRequirements={isLoadingRequirements}
        refreshRequirements={refreshRequirements}
        canEdit={canEdit}
        selectedTrackerFY={selectedTrackerFY}
        setRequirementForm={setRequirementForm}
        setIsCreateModalOpen={setIsCreateModalOpen}
        handleCalendarSync={handleCalendarSync}
      />

      {/* Country Indicator */}
      {currentCompany && (
        <div className="mb-3 flex items-center gap-2 text-sm text-gray-400">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Country: <span className="text-white font-medium">{countryConfig.name}</span></span>
          <span className="text-gray-600">·</span>
          <span className="text-xs">Categories and templates are country-specific</span>
        </div>
      )}

      {/* AI Compliance Intelligence */}
      {currentCompany && (
        <ComplianceIntelligencePanel
          companyId={currentCompany.id}
          companyName={currentCompany.name}
          hasNicCode={!!currentCompany.nic_code}
          canEdit={canEdit}
          hasExistingRequirements={regulatoryRequirements.length > 0}
          incorporationDate={currentCompany.incorporation_date || null}
          onRequirementsApproved={refreshRequirements}
        />
      )}

      {/* Super Filters */}
      <TrackerFilterControls
        selectedTrackerFY={selectedTrackerFY}
        setSelectedTrackerFY={setSelectedTrackerFY}
        selectedMonth={selectedMonth}
        setSelectedMonth={setSelectedMonth}
        selectedQuarter={selectedQuarter}
        setSelectedQuarter={setSelectedQuarter}
        selectedCategory={selectedCategory}
        setSelectedCategory={setSelectedCategory}
        isMonthDropdownOpen={isMonthDropdownOpen}
        setIsMonthDropdownOpen={setIsMonthDropdownOpen}
        isQuarterDropdownOpen={isQuarterDropdownOpen}
        setIsQuarterDropdownOpen={setIsQuarterDropdownOpen}
        isCategoryDropdownOpen={isCategoryDropdownOpen}
        setIsCategoryDropdownOpen={setIsCategoryDropdownOpen}
        financialYears={financialYears}
        months={months}
        quarters={quarters}
        countryCode={countryCode}
        regulatoryRequirements={regulatoryRequirements}
        complianceCategories={complianceCategories}
      />

      {/* Search and Bulk Actions Bar */}
      <TrackerSearchAndActions
        trackerSearchQuery={trackerSearchQuery}
        setTrackerSearchQuery={setTrackerSearchQuery}
        canEdit={canEdit}
        selectedRequirements={selectedRequirements}
        setBulkActionType={setBulkActionType}
        setIsBulkActionModalOpen={setIsBulkActionModalOpen}
        setSelectedRequirements={setSelectedRequirements}
      />

      {/* Category Filters */}
      <TrackerCategoryFilters
        categoryFilter={categoryFilter}
        setCategoryFilter={setCategoryFilter}
        requirements={displayRequirements}
      />

      {/* Category Dashboard — shown when a specific category is selected */}
      {selectedCategory !== 'all' && filteredRequirements.length > 0 && (
        <CategoryDashboard
          category={selectedCategory}
          items={filteredRequirements}
        />
      )}

      {/* Regulatory Requirements Table */}
      <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden">
        {isLoadingRequirements || displayRequirements.length === 0 ? (
          <TrackerEmptyState
            isLoadingRequirements={isLoadingRequirements}
            displayRequirements={displayRequirements}
            regulatoryRequirements={regulatoryRequirements}
            trackerSearchQuery={trackerSearchQuery}
            selectedTrackerFY={selectedTrackerFY}
            selectedMonth={selectedMonth}
            selectedQuarter={selectedQuarter}
            categoryFilter={categoryFilter}
            selectedCategory={selectedCategory}
            canEdit={canEdit}
            setTrackerSearchQuery={setTrackerSearchQuery}
            setSelectedTrackerFY={setSelectedTrackerFY}
            setSelectedMonth={setSelectedMonth}
            setSelectedQuarter={setSelectedQuarter}
            setCategoryFilter={setCategoryFilter}
            setSelectedCategory={setSelectedCategory}
            setRequirementForm={setRequirementForm}
            setIsCreateModalOpen={setIsCreateModalOpen}
          />
        ) : (
          <div className="sm:overflow-x-auto scrollbar-hide">
            {trackerView === 'calendar' ? (
              <TrackerCalendarView
                calendarMonth={calendarMonth}
                calendarYear={calendarYear}
                setCalendarMonth={setCalendarMonth}
                setCalendarYear={setCalendarYear}
                months={months}
                selectedTrackerFY={selectedTrackerFY}
                requirementsByDate={requirementsByDate}
                calculateDelay={calculateDelayMemoized}
                calculatePenalty={calculatePenaltyMemoized}
                parseDateForCalendar={(dateStr: string | null | undefined) => {
                  if (!dateStr) return null
                  return normalizeDate(dateStr)
                }}
              />
            ) : (
              <>
                {/* Mobile Card View */}
                <RequirementMobileCardView
                  groupedByCategory={groupedByCategory}
                  canEdit={canEdit}
                  canManage={canManage}
                  selectedRequirements={selectedRequirements}
                  setSelectedRequirements={setSelectedRequirements}
                  handleStatusChange={handleStatusChange}
                  regulatoryService={regulatoryService}
                  currentCompany={currentCompany}
                  setHiddenCompliances={setHiddenCompliances}
                  setRegulatoryRequirements={setRegulatoryRequirements}
                  regulatoryRequirements={regulatoryRequirements}
                  setEditingRequirement={setEditingRequirement}
                  setRequirementForm={setRequirementForm}
                  setIsEditModalOpen={setIsEditModalOpen}
                  setComplianceDetailsModal={setComplianceDetailsModal}
                  calculateDelay={calculateDelayMemoized}
                  calculatePenalty={calculatePenaltyMemoized}
                  getFormFrequency={getFormFrequency}
                  getRelevantLegalSections={getRelevantLegalSections}
                  getAuthorityForCategory={getAuthorityForCategory}
                />

                {/* Desktop Table View */}
                <RequirementDesktopTableView
                  groupedByCategory={groupedByCategory}
                  filteredRequirements={filteredRequirements}
                  canEdit={canEdit}
                  canManage={canManage}
                  vaultDocuments={vaultDocuments}
                  selectedRequirements={selectedRequirements}
                  setSelectedRequirements={setSelectedRequirements}
                  handleStatusChange={handleStatusChange}
                  regulatoryService={regulatoryService}
                  currentCompany={currentCompany}
                  setHiddenCompliances={setHiddenCompliances}
                  setRegulatoryRequirements={setRegulatoryRequirements}
                  regulatoryRequirements={regulatoryRequirements}
                  setEditingRequirement={setEditingRequirement}
                  setRequirementForm={setRequirementForm}
                  setIsEditModalOpen={setIsEditModalOpen}
                  setComplianceDetailsModal={setComplianceDetailsModal}
                  setDocumentUploadModal={setDocumentUploadModal}
                  calculateDelay={calculateDelayMemoized}
                  calculatePenalty={calculatePenaltyMemoized}
                  getFormFrequency={getFormFrequency}
                  getRelevantLegalSections={getRelevantLegalSections}
                  getAuthorityForCategory={getAuthorityForCategory}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* Filing register — inline in list view. Shows per-period Payable/Paid,
          auto-calc interest, document upload, and inline questions for
          uncertain rules. Deliberately NOT a separate tab. */}
      {trackerView === 'list' && currentCompany && selectedTrackerFY && (
        <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl shadow-2xl overflow-hidden p-4 sm:p-6">
          <div className="mb-4">
            <h3 className="text-lg font-light text-white">Filing details</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              Enter the amount payable and paid for each period. We compute delay, short deduction, and interest automatically. Upload the challan or filing acknowledgement to mark it done.
            </p>
          </div>
          <ComplianceFilingView
            companyId={currentCompany.id}
            financialYear={selectedTrackerFY}
            categoryFilter={selectedCategory !== 'all' ? selectedCategory : undefined}
          />
        </div>
      )}

      {/* Create/Edit Compliance Modal */}
      <RequirementFormModal
        isOpen={isCreateModalOpen || isEditModalOpen}
        isEdit={isEditModalOpen}
        requirementForm={requirementForm}
        setRequirementForm={setRequirementForm}
        onClose={() => {
          setIsCreateModalOpen(false)
          setIsEditModalOpen(false)
          setEditingRequirement(null)
          setRequirementForm({ ...EMPTY_REQUIREMENT_FORM, year: new Date().getFullYear().toString() })
        }}
        onSuccess={() => {
          setIsCreateModalOpen(false)
          setIsEditModalOpen(false)
          setEditingRequirement(null)
          setRequirementForm({ ...EMPTY_REQUIREMENT_FORM, year: new Date().getFullYear().toString() })
        }}
        regulatoryService={regulatoryService}
        currentCompany={currentCompany}
        complianceCategories={complianceCategories}
        regulatoryRequirements={regulatoryRequirements}
        financialYears={financialYears}
        countryCode={countryCode}
        countryConfig={countryConfig}
        editingRequirement={editingRequirement}
        setRegulatoryRequirements={setRegulatoryRequirements}
      />
    </div>
  )
}
