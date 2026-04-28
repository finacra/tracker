'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type Theme = 'dark' | 'light'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

const STORAGE_KEY = 'finacra-theme'

/**
 * PR-3 ThemeProvider.
 *
 * Default behavior: dark. Light is opt-in via localStorage. We don't honor
 * `prefers-color-scheme` by default — most existing users have an OS set to
 * light but have used this app in dark since launch, so flipping their UI
 * silently on PR-3 day would surprise them. Users who want light click the
 * toggle and the choice persists.
 *
 * This provider DOES NOT live inside auth Providers (Rule 10 — never add
 * concurrent state writers there). It mounts at the layout level, in front
 * of every other client tree, so theme is established before children mount.
 *
 * FOUC: the actual `data-theme` attribute is set by an inline blocking
 * script in <head> (see layout.tsx). This component only handles
 * post-hydration changes; it never causes a paint flash.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Initialize from the attribute the inline script already placed on <html>
  // — that's the source of truth for first paint. If for some reason the
  // attribute isn't present (e.g. SSR before the script runs in a non-
  // browser context), fall back to dark.
  const [theme, setThemeState] = useState<Theme>('dark')

  // Sync from DOM once on mount — the inline script already ran so the
  // attribute is correct.
  useEffect(() => {
    const current = document.documentElement.getAttribute('data-theme')
    if (current === 'light' || current === 'dark') {
      setThemeState(current)
    }
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    document.documentElement.setAttribute('data-theme', t)
    try {
      localStorage.setItem(STORAGE_KEY, t)
    } catch {
      // localStorage may be unavailable (private browsing); ignore.
    }
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark')
  }, [theme, setTheme])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    // Returning a no-op default lets components render even if mounted
    // outside the provider (defensive — shouldn't happen in practice).
    return {
      theme: 'dark',
      setTheme: () => {},
      toggleTheme: () => {},
    }
  }
  return ctx
}

/**
 * Inline script source that the layout injects into <head> to set the
 * theme attribute before first paint. Kept here so the storage key and
 * fallback logic stay in one file.
 */
export const THEME_INLINE_SCRIPT = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark');}catch(e){document.documentElement.setAttribute('data-theme','dark');}})();`
