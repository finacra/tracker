/**
 * Global app store (Zustand)
 *
 * Holds client-side UI/navigation state that needs to be shared across
 * components without prop drilling or server round-trips:
 *
 *  - currentCompanyId   The currently selected company in the data room.
 *                       Persisted to sessionStorage so it survives page
 *                       navigations within the same browser tab.
 *
 *  - activeTab          Active tab in the data room (overview / tracker /
 *                       documents / …).
 *
 *  - isSuperadmin       Cached superadmin flag for the signed-in user.
 *                       Set once after login; avoids repeated DB checks.
 *
 *  - notificationCount  Badge count shown on the bell icon.  Kept here so
 *                       the Header and any future component can read it
 *                       without a separate fetch.
 *
 * Server data (companies list, requirements, documents, …) belongs in
 * React Query, not here.
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

// ─── Types ────────────────────────────────────────────────────────────────────

export type DataRoomTab =
  | 'overview'
  | 'tracker'
  | 'documents'
  | 'reports'
  | 'notices'
  | 'gst'
  | 'dsc-din'

interface AppState {
  // Company selection
  currentCompanyId: string | null
  setCurrentCompanyId: (id: string | null) => void

  // Active data-room tab
  activeTab: DataRoomTab
  setActiveTab: (tab: DataRoomTab) => void

  // Superadmin flag (set once after auth resolves)
  isSuperadmin: boolean
  setIsSuperadmin: (value: boolean) => void

  // Notification badge
  notificationCount: number
  // Timestamp of the most recent authoritative count (from getDataRoomInitState's
  // unreadNotificationCount, getNotifications response, or a mutation). Used by
  // useUnreadCountQuery as the React Query `initialDataUpdatedAt` so the hook
  // honors staleTime instead of immediately re-fetching on mount.
  notificationCountSeededAt: number | null
  setNotificationCount: (count: number) => void
  incrementNotificationCount: () => void
  clearNotificationCount: () => void
}

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // ── Company ────────────────────────────────────────────────────────────
      currentCompanyId: null,
      setCurrentCompanyId: (id) => set({ currentCompanyId: id }),

      // ── Tab ────────────────────────────────────────────────────────────────
      activeTab: 'overview',
      setActiveTab: (tab) => set({ activeTab: tab }),

      // ── Superadmin ─────────────────────────────────────────────────────────
      isSuperadmin: false,
      setIsSuperadmin: (value) => set({ isSuperadmin: value }),

      // ── Notifications ──────────────────────────────────────────────────────
      notificationCount: 0,
      notificationCountSeededAt: null,
      setNotificationCount: (count) =>
        set({ notificationCount: count, notificationCountSeededAt: Date.now() }),
      incrementNotificationCount: () =>
        set((state) => ({
          notificationCount: state.notificationCount + 1,
          notificationCountSeededAt: Date.now(),
        })),
      clearNotificationCount: () =>
        set({ notificationCount: 0, notificationCountSeededAt: Date.now() }),
    }),
    {
      name: 'finacra-app-state',
      storage: createJSONStorage(() => sessionStorage),
      // Only persist company selection and tab across navigations.
      // isSuperadmin / notificationCount are re-derived on mount.
      partialize: (state) => ({
        currentCompanyId: state.currentCompanyId,
        activeTab: state.activeTab,
      }),
    }
  )
)

// ─── Selector helpers (prevent unnecessary re-renders) ───────────────────────

export const selectCurrentCompanyId = (s: AppState) => s.currentCompanyId
export const selectActiveTab = (s: AppState) => s.activeTab
export const selectIsSuperadmin = (s: AppState) => s.isSuperadmin
export const selectNotificationCount = (s: AppState) => s.notificationCount
