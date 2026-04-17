'use client'

import React from 'react'
import {
  createContext,
  useContext,
  useState,
  useMemo,
  useEffect,
  type ReactNode,
} from 'react'
import { EMPTY_REQUIREMENT_FORM, type RequirementForm } from '@/app/data-room/components/tracker/RequirementFormModal'
import { isInFinancialYear as isInFinancialYearUtil } from '@/lib/utils/financial-year'
import { performanceLogger } from '@/lib/utils/performance-logger'

// ─── External data shape (passed in from page.tsx) ───────────────────────────

export interface TrackerExternalData {
  regulatoryRequirements: any[]
  setRegulatoryRequirements: React.Dispatch<React.SetStateAction<any[]>>
  isLoadingRequirements: boolean
  refreshRequirements: () => void
  hiddenCompliances: Set<string>
  vaultDocuments: any[]
  currentCompany: any
  user: any
  canEdit: boolean
  canManage?: boolean
  isComplianceScoreModalOpen: boolean
  setIsComplianceScoreModalOpen: (v: boolean) => void
  regulatoryService: any
  financialYears: string[]
  setComplianceDetailsModal: (req: any) => void
  handleStatusChange: (id: string, status: 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed') => Promise<void>
  setHiddenCompliances: (updater: (prev: Set<string>) => Set<string>) => void
  handleTrackerDocumentUpload: (() => Promise<void>) | undefined
  // Upload state (owned by page.tsx, passed in so sub-components can open/update the modal)
  documentUploadModal: any
  setDocumentUploadModal: (v: any) => void
  uploadingDocument: boolean
  setUploadingDocument: (v: boolean) => void
  uploadFile: File | null
  setUploadFile: (v: File | null) => void
  uploadProgress: number
  setUploadProgress: (v: number) => void
  uploadStage: string
  setUploadStage: (v: string) => void
  previewFileUrl: string | null
  setPreviewFileUrl: (v: string | null) => void
  countryCode: string
  countryConfig: any
  complianceCategories: string[]
  entityDetails: any
  calculateDelayMemoized: (dueDateStr: string, status: string) => number | null
  calculatePenaltyMemoized: (penaltyStr: string | null | undefined, daysDelayed: number | null, penaltyBaseAmount?: number | null, penaltyConfig?: Record<string, unknown> | null) => string
  normalizeDate: (s: string | Date | null | undefined) => Date | null
  formatDate: (s: string) => string
  getFormFrequency: (...args: any[]) => any
  getRelevantLegalSections: (...args: any[]) => any
  getAuthorityForCategory: (...args: any[]) => any
}

// ─── Full context value (external + internal state + derived) ─────────────────

interface TrackerContextValue extends TrackerExternalData {
  // Filter state
  trackerView: 'list' | 'calendar' | 'filings'
  setTrackerView: (v: 'list' | 'calendar' | 'filings') => void
  sortMode: 'chronological' | 'category'
  setSortMode: (v: 'chronological' | 'category') => void
  selectedTrackerFY: string
  setSelectedTrackerFY: (v: string) => void
  selectedMonth: string | null
  setSelectedMonth: (v: string | null) => void
  isMonthDropdownOpen: boolean
  setIsMonthDropdownOpen: (v: boolean) => void
  selectedQuarter: string | null
  setSelectedQuarter: (v: string | null) => void
  isQuarterDropdownOpen: boolean
  setIsQuarterDropdownOpen: (v: boolean) => void
  categoryFilter: string
  setCategoryFilter: (v: string) => void
  selectedCategory: string
  setSelectedCategory: (v: string) => void
  isCategoryDropdownOpen: boolean
  setIsCategoryDropdownOpen: (v: boolean) => void
  entityTypeFilter: string
  setEntityTypeFilter: (v: string) => void
  industryFilter: string
  setIndustryFilter: (v: string) => void
  industryCategoryFilter: string
  setIndustryCategoryFilter: (v: string) => void
  complianceTypeFilter: string
  setComplianceTypeFilter: (v: string) => void
  trackerSearchQuery: string
  setTrackerSearchQuery: (v: string) => void
  selectedRequirements: Set<string>
  setSelectedRequirements: (v: Set<string> | ((prev: Set<string>) => Set<string>)) => void
  calendarMonth: number
  setCalendarMonth: (v: number) => void
  calendarYear: number
  setCalendarYear: (v: number) => void

  // Modal state
  isCreateModalOpen: boolean
  setIsCreateModalOpen: (v: boolean) => void
  isEditModalOpen: boolean
  setIsEditModalOpen: (v: boolean) => void
  isBulkActionModalOpen: boolean
  setIsBulkActionModalOpen: (v: boolean) => void
  bulkActionType: 'status' | 'delete' | null
  setBulkActionType: (v: 'status' | 'delete' | null) => void
  editingRequirement: any
  setEditingRequirement: (v: any) => void
  requirementForm: RequirementForm
  setRequirementForm: (v: RequirementForm | ((prev: RequirementForm) => RequirementForm)) => void

  // Derived / computed
  displayRequirements: any[]
  filteredRequirements: any[]
  groupedByCategory: { category: string; items: any[] }[]
  requirementsByDate: Map<string, any[]>
}

// ─── Context ──────────────────────────────────────────────────────────────────

const TrackerContext = createContext<TrackerContextValue | null>(null)

export function useTrackerContext(): TrackerContextValue {
  const ctx = useContext(TrackerContext)
  if (!ctx) throw new Error('useTrackerContext must be used within TrackerContextProvider')
  return ctx
}

// ─── Provider ─────────────────────────────────────────────────────────────────

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function TrackerContextProvider({
  children,
  ...external
}: { children: ReactNode } & TrackerExternalData) {
  const {
    regulatoryRequirements,
    hiddenCompliances,
    complianceCategories,
    entityDetails,
    countryCode,
    formatDate,
    normalizeDate,
  } = external

  // ── Filter state ────────────────────────────────────────────────────────────
  const [trackerView, setTrackerView] = useState<'list' | 'calendar' | 'filings'>('list')
  const [sortMode, setSortMode] = useState<'chronological' | 'category'>('chronological')
  const [selectedTrackerFY, setSelectedTrackerFY] = useState('')
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const [isMonthDropdownOpen, setIsMonthDropdownOpen] = useState(false)
  const [selectedQuarter, setSelectedQuarter] = useState<string | null>(null)
  const [isQuarterDropdownOpen, setIsQuarterDropdownOpen] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false)
  const [entityTypeFilter, setEntityTypeFilter] = useState('all')
  const [industryFilter, setIndustryFilter] = useState('all')
  const [industryCategoryFilter, setIndustryCategoryFilter] = useState('all')
  const [complianceTypeFilter, setComplianceTypeFilter] = useState('all')
  const [trackerSearchQuery, setTrackerSearchQuery] = useState('')
  const [selectedRequirements, setSelectedRequirements] = useState<Set<string>>(new Set())
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth())
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear())

  // ── Default FY to current financial year on mount ───────────────────────────
  const { financialYears } = external
  useEffect(() => {
    if (!selectedTrackerFY && financialYears.length > 0) {
      setSelectedTrackerFY(financialYears[0])
    }
  }, [financialYears]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Modal / form state ──────────────────────────────────────────────────────
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isEditModalOpen, setIsEditModalOpen] = useState(false)
  const [isBulkActionModalOpen, setIsBulkActionModalOpen] = useState(false)
  const [bulkActionType, setBulkActionType] = useState<'status' | 'delete' | null>(null)
  const [editingRequirement, setEditingRequirement] = useState<any>(null)
  const [requirementForm, setRequirementForm] = useState<RequirementForm>({ ...EMPTY_REQUIREMENT_FORM })

  // ── Derived: displayRequirements ─────────────────────────────────────────────
  const displayRequirements = useMemo(() => {
    if (!regulatoryRequirements || regulatoryRequirements.length === 0) return []

    const startTime = performance.now()
    const hasHiddenCompliances = hiddenCompliances.size > 0
    const categoryFilterActive = selectedCategory !== 'all'

    const result = regulatoryRequirements
      .filter((req) => {
        if (hasHiddenCompliances && hiddenCompliances.has(req.id)) return false
        if (categoryFilterActive && req.category !== selectedCategory) return false
        return true
      })
      .map((req) => ({
        id: req.id,
        template_id: req.template_id ?? null,
        category: req.category,
        requirement: req.requirement,
        description: req.description || '',
        status: req.status,
        dueDate: formatDate(req.due_date),
        penalty: req.penalty || '',
        isCritical: req.is_critical,
        financial_year: req.financial_year,
        entity_type: req.entity_type,
        industry: req.industry,
        industry_category: req.industry_category,
        compliance_type: req.compliance_type,
        required_documents: req.required_documents || [],
        possible_legal_action: req.possible_legal_action,
        penalty_config: req.penalty_config,
        penalty_base_amount: req.penalty_base_amount,
        filed_on: req.filed_on,
        filed_by: req.filed_by,
        status_reason: req.status_reason,
      }))

    const duration = performance.now() - startTime
    if (duration > 0.5 || result.length > 0) {
      performanceLogger.log('TrackerContext', 'displayRequirements_compute', duration, {
        inputCount: regulatoryRequirements.length,
        outputCount: result.length,
        hasHiddenCompliances,
        selectedCategory,
      })
    }
    return result
  }, [regulatoryRequirements, hiddenCompliances, selectedCategory, formatDate])

  // ── Derived: filteredRequirements ────────────────────────────────────────────
  const filteredRequirements = useMemo(() => {
    if (displayRequirements.length === 0) return []

    const startTime = performance.now()

    const parseDate = (dateStr: string): Date | null => {
      if (!dateStr) return null
      return normalizeDate(dateStr)
    }

    const isInFY = (reqDate: Date | null, fyStr: string): boolean => {
      if (!reqDate || !fyStr) return false
      return isInFinancialYearUtil(reqDate, fyStr, countryCode)
    }

    let filtered = displayRequirements

    if (selectedTrackerFY) {
      try {
        filtered = filtered.filter((req) => {
          if (!req.dueDate) return false
          return isInFY(parseDate(req.dueDate), selectedTrackerFY)
        })
      } catch {
        // Fallback: don't filter if parsing fails
      }
    }

    if (selectedMonth) {
      const monthIndex = MONTHS.indexOf(selectedMonth)
      filtered = filtered.filter((req) => {
        const d = parseDate(req.dueDate)
        return d ? d.getUTCMonth() === monthIndex : false
      })
    }

    if (selectedQuarter) {
      filtered = filtered.filter((req) => {
        const d = parseDate(req.dueDate)
        if (!d) return false
        const m = d.getUTCMonth()
        const q = m >= 3 && m <= 5 ? 'q1' : m >= 6 && m <= 8 ? 'q2' : m >= 9 && m <= 11 ? 'q3' : 'q4'
        return q === selectedQuarter
      })
    }

    const result = filtered.filter((req) => {
      if (categoryFilter !== 'all') {
        if (categoryFilter === 'critical' && !req.isCritical) return false
        if (categoryFilter === 'overdue' && req.status !== 'overdue') return false
        if (categoryFilter === 'pending' && req.status !== 'pending') return false
        if (categoryFilter === 'upcoming' && req.status !== 'upcoming') return false
        if (categoryFilter === 'completed' && req.status !== 'completed') return false
      }
      if (entityTypeFilter !== 'all') {
        const et = req.entity_type || entityDetails?.type
        if (et !== entityTypeFilter) return false
      }
      if (industryFilter !== 'all') {
        const ind = req.industry || entityDetails?.industryCategory
        if (ind !== industryFilter) return false
      }
      if (industryCategoryFilter !== 'all') {
        const ic = req.industry_category || entityDetails?.industryCategory
        if (ic !== industryCategoryFilter) return false
      }
      if (complianceTypeFilter !== 'all') {
        if (req.compliance_type !== complianceTypeFilter) return false
      }
      if (trackerSearchQuery.trim()) {
        const q = trackerSearchQuery.toLowerCase().trim()
        const text = [req.category, req.requirement, req.description, req.status, req.compliance_type, req.financial_year]
          .filter(Boolean).join(' ').toLowerCase()
        if (!text.includes(q)) return false
      }
      return true
    })

    // Always sort chronologically by due date (ascending)
    result.sort((a, b) => {
      const dateA = normalizeDate(a.dueDate)
      const dateB = normalizeDate(b.dueDate)
      if (!dateA && !dateB) return 0
      if (!dateA) return 1
      if (!dateB) return -1
      return dateA.getTime() - dateB.getTime()
    })

    const duration = performance.now() - startTime
    performanceLogger.log('TrackerContext', 'filteredRequirements_compute', duration, {
      inputCount: displayRequirements.length,
      outputCount: result.length,
    })
    return result
  }, [
    displayRequirements,
    selectedTrackerFY,
    selectedMonth,
    selectedQuarter,
    categoryFilter,
    entityTypeFilter,
    industryFilter,
    industryCategoryFilter,
    complianceTypeFilter,
    trackerSearchQuery,
    entityDetails,
    countryCode,
    normalizeDate,
  ])

  // ── Derived: categoryOrder ────────────────────────────────────────────────────
  const categoryOrder = useMemo(() => {
    const allCategories = Array.from(new Set(displayRequirements.map((r) => r.category).filter(Boolean)))
    const preferred = complianceCategories.length > 0
      ? complianceCategories
      : ['Income Tax', 'GST', 'Payroll', 'RoC', 'Renewals', 'Prof.Tax', 'Other', 'Others']
    return [
      ...preferred.filter((c) => allCategories.includes(c)),
      ...allCategories.filter((c) => !preferred.includes(c) && c).sort((a, b) => (a || '').localeCompare(b || '')),
    ]
  }, [displayRequirements, complianceCategories])

  // ── Derived: groupedByCategory ────────────────────────────────────────────────
  const groupedByCategory = useMemo(() => {
    if (filteredRequirements.length === 0) return []
    return categoryOrder
      .map((category) => ({
        category,
        items: filteredRequirements
          .filter((r) => r.category === category)
          .sort((a, b) => {
            const da = normalizeDate(a.dueDate)
            const db = normalizeDate(b.dueDate)
            if (!da && !db) return 0
            if (!da) return 1
            if (!db) return -1
            return da.getTime() - db.getTime()
          }),
      }))
      .filter((g) => g.items.length > 0)
  }, [filteredRequirements, categoryOrder, normalizeDate])

  // ── Derived: requirementsByDate ──────────────────────────────────────────────
  const requirementsByDate = useMemo(() => {
    const map = new Map<string, typeof filteredRequirements>()
    filteredRequirements.forEach((req) => {
      if (!req.dueDate) return
      const d = normalizeDate(req.dueDate)
      if (!d) return
      const key = d.toISOString().split('T')[0]
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(req)
    })
    return map
  }, [filteredRequirements, normalizeDate])

  const value: TrackerContextValue = {
    // External (pass-through)
    ...external,
    // Override selectedCategory with the internal one
    selectedCategory,

    // Filter state
    trackerView, setTrackerView,
    sortMode, setSortMode,
    selectedTrackerFY, setSelectedTrackerFY,
    selectedMonth, setSelectedMonth,
    isMonthDropdownOpen, setIsMonthDropdownOpen,
    selectedQuarter, setSelectedQuarter,
    isQuarterDropdownOpen, setIsQuarterDropdownOpen,
    categoryFilter, setCategoryFilter,
    setSelectedCategory,
    isCategoryDropdownOpen, setIsCategoryDropdownOpen,
    entityTypeFilter, setEntityTypeFilter,
    industryFilter, setIndustryFilter,
    industryCategoryFilter, setIndustryCategoryFilter,
    complianceTypeFilter, setComplianceTypeFilter,
    trackerSearchQuery, setTrackerSearchQuery,
    selectedRequirements, setSelectedRequirements,
    calendarMonth, setCalendarMonth,
    calendarYear, setCalendarYear,

    // Modal state
    isCreateModalOpen, setIsCreateModalOpen,
    isEditModalOpen, setIsEditModalOpen,
    isBulkActionModalOpen, setIsBulkActionModalOpen,
    bulkActionType, setBulkActionType,
    editingRequirement, setEditingRequirement,
    requirementForm, setRequirementForm,

    // Derived
    displayRequirements,
    filteredRequirements,
    groupedByCategory,
    requirementsByDate,
  }

  return <TrackerContext.Provider value={value}>{children}</TrackerContext.Provider>
}
