'use client'

/**
 * DataRoomContext
 *
 * Provides the data-room page's server state and current-company selection
 * to every tab/child component without prop drilling.
 *
 * What belongs here:
 *  - Derived data from useDataRoomInitQuery (companies list, subscription, roles)
 *  - Current company object + setter (synced with Zustand appStore)
 *  - Document vault, templates, hidden items, regulatory requirements
 *  - Shared loading / error states
 *
 * What does NOT belong here:
 *  - Tab-local UI state (upload modal open/closed, selected row, etc.)
 *    → keep those as useState inside the individual tab components
 *  - Auth user → available via useAuth()
 *  - Notifications → available via useNotificationsQuery()
 */

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { useAppStore } from '@/lib/store/appStore'
import { useDataRoomInitQuery } from '@/hooks/useDataRoomInitQuery'
import type { RegulatoryRequirement } from '@/app/data-room/actions'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Company {
  id: string
  name: string
  type: string
  year: string
  country_code?: string
  region?: string
}

export interface Director {
  id: string
  firstName: string
  lastName: string
  middleName: string
  din?: string
  designation?: string
  dob?: string
  pan?: string
  email?: string
  mobile?: string
  verified: boolean
}

export interface EntityDetails {
  companyName: string
  type: string
  regDate: string
  taxId: string
  registrationId: string
  address: string
  phoneNumber: string
  industryCategory: string
  directors: Director[]
}

export interface InitDataResults {
  companyId: string | null
  hasAnyAccess: boolean
  hasSubscription: boolean
  accessibleCompanyIds: string[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userSubscription: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  companyAccess: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  userRole: any
}

interface DataRoomContextValue {
  // ── Companies ──────────────────────────────────────────────────────────────
  companies: Company[]
  currentCompany: Company | null
  setCurrentCompany: (company: Company | null) => void

  // ── Init data ──────────────────────────────────────────────────────────────
  initDataResults: InitDataResults | null
  entityDetails: EntityDetails | null
  setEntityDetails: (details: EntityDetails | null) => void

  // ── Documents & vault ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  vaultDocuments: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setVaultDocuments: (docs: any[]) => void
  isLoadingVaultDocuments: boolean
  setIsLoadingVaultDocuments: (v: boolean) => void

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  documentTemplates: any[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setDocumentTemplates: (templates: any[]) => void

  hiddenTemplates: Set<string>
  setHiddenTemplates: (s: Set<string>) => void

  // ── Compliance ─────────────────────────────────────────────────────────────
  regulatoryRequirements: RegulatoryRequirement[]
  setRegulatoryRequirements: (reqs: RegulatoryRequirement[]) => void
  isLoadingRequirements: boolean
  setIsLoadingRequirements: (v: boolean) => void

  hiddenCompliances: Set<string>
  setHiddenCompliances: (s: Set<string>) => void

  // ── Loading / error ────────────────────────────────────────────────────────
  isDataRoomInitLoading: boolean
  initError: string | null
}

// ─── Context ──────────────────────────────────────────────────────────────────

const DataRoomContext = createContext<DataRoomContextValue | undefined>(undefined)

// ─── Provider ─────────────────────────────────────────────────────────────────

interface DataRoomProviderProps {
  children: ReactNode
  /**
   * Optional preferred company ID (e.g. from URL search param).
   * Passed straight through to useDataRoomInitQuery.
   */
  preferredCompanyId?: string | null
}

export function DataRoomProvider({ children, preferredCompanyId = null }: DataRoomProviderProps) {
  const { setCurrentCompanyId } = useAppStore()
  const storedCompanyId = useAppStore((s) => s.currentCompanyId)

  // Resolve the query param or fall back to what the store already has
  const resolvedPreferredId = preferredCompanyId ?? storedCompanyId

  // ── Server data ─────────────────────────────────────────────────────────────
  const {
    data: initData,
    isLoading: isDataRoomInitLoading,
    error: initQueryError,
  } = useDataRoomInitQuery({ preferredCompanyId: resolvedPreferredId })

  // ── Derive companies from init data ─────────────────────────────────────────
  const companies: Company[] = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (initData as any)?.companies ?? []
  }, [initData])

  // ── Current company (local state, synced to Zustand) ────────────────────────
  const [currentCompany, setCurrentCompanyLocal] = useState<Company | null>(null)

  const setCurrentCompany = useCallback(
    (company: Company | null) => {
      setCurrentCompanyLocal(company)
      setCurrentCompanyId(company?.id ?? null)
    },
    [setCurrentCompanyId]
  )

  // ── Init data results ────────────────────────────────────────────────────────
  const initDataResults: InitDataResults | null = useMemo(() => {
    if (!initData) return null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = initData as any
    return {
      companyId: d.selectedCompanyId ?? null,
      hasAnyAccess: d.hasAnyAccess ?? false,
      hasSubscription: d.hasSubscription ?? false,
      accessibleCompanyIds: d.accessibleCompanyIds ?? [],
      userSubscription: d.userSubscription ?? null,
      companyAccess: d.companyAccess ?? null,
      userRole: d.userRole ?? null,
    }
  }, [initData])

  // ── Mutable document / vault state ──────────────────────────────────────────
  const [entityDetails, setEntityDetails] = useState<EntityDetails | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [vaultDocuments, setVaultDocuments] = useState<any[]>([])
  const [isLoadingVaultDocuments, setIsLoadingVaultDocuments] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [documentTemplates, setDocumentTemplates] = useState<any[]>([])
  const [hiddenTemplates, setHiddenTemplates] = useState<Set<string>>(new Set())

  // ── Compliance state ────────────────────────────────────────────────────────
  const [regulatoryRequirements, setRegulatoryRequirements] = useState<RegulatoryRequirement[]>([])
  const [isLoadingRequirements, setIsLoadingRequirements] = useState(false)
  const [hiddenCompliances, setHiddenCompliances] = useState<Set<string>>(new Set())

  // ── Context value (stable reference via useMemo) ────────────────────────────
  const value: DataRoomContextValue = useMemo(
    () => ({
      companies,
      currentCompany,
      setCurrentCompany,
      initDataResults,
      entityDetails,
      setEntityDetails,
      vaultDocuments,
      setVaultDocuments,
      isLoadingVaultDocuments,
      setIsLoadingVaultDocuments,
      documentTemplates,
      setDocumentTemplates,
      hiddenTemplates,
      setHiddenTemplates,
      regulatoryRequirements,
      setRegulatoryRequirements,
      isLoadingRequirements,
      setIsLoadingRequirements,
      hiddenCompliances,
      setHiddenCompliances,
      isDataRoomInitLoading,
      initError: initQueryError?.message ?? null,
    }),
    [
      companies,
      currentCompany,
      setCurrentCompany,
      initDataResults,
      entityDetails,
      vaultDocuments,
      isLoadingVaultDocuments,
      documentTemplates,
      hiddenTemplates,
      regulatoryRequirements,
      isLoadingRequirements,
      hiddenCompliances,
      isDataRoomInitLoading,
      initQueryError,
    ]
  )

  return <DataRoomContext.Provider value={value}>{children}</DataRoomContext.Provider>
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useDataRoom(): DataRoomContextValue {
  const ctx = useContext(DataRoomContext)
  if (!ctx) {
    throw new Error('useDataRoom must be used within a <DataRoomProvider>')
  }
  return ctx
}

// ─── Focused selector hooks (avoid re-renders from unrelated state changes) ───

export const useCurrentCompany = () => useDataRoom().currentCompany
export const useCompanies = () => useDataRoom().companies
export const useInitDataResults = () => useDataRoom().initDataResults
export const useVaultDocuments = () => ({
  vaultDocuments: useDataRoom().vaultDocuments,
  isLoadingVaultDocuments: useDataRoom().isLoadingVaultDocuments,
  setVaultDocuments: useDataRoom().setVaultDocuments,
  setIsLoadingVaultDocuments: useDataRoom().setIsLoadingVaultDocuments,
})
export const useRegulatoryRequirementsCtx = () => ({
  regulatoryRequirements: useDataRoom().regulatoryRequirements,
  isLoadingRequirements: useDataRoom().isLoadingRequirements,
  setRegulatoryRequirements: useDataRoom().setRegulatoryRequirements,
  setIsLoadingRequirements: useDataRoom().setIsLoadingRequirements,
})
