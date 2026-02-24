'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'
import { getCountryConfig } from '@/lib/config/countries'

/**
 * Hook to fetch compliance categories from country_compliance_categories table
 * Falls back to config file if database fetch fails
 */
export function useComplianceCategories(countryCode: string = 'IN') {
  const [categories, setCategories] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchCategories() {
      try {
        setIsLoading(true)
        setError(null)
        const supabase = createClient()
        
        // Try to fetch from database, but handle both category_name and category_code columns
        let query = supabase
          .from('country_compliance_categories')
          .select('category_name, category_code, display_order')
          .eq('country_code', countryCode)
          .eq('is_active', true)
          .order('display_order', { ascending: true })

        const { data, error: fetchError } = await query

        if (fetchError) {
          // If column doesn't exist or other error, use fallback
          console.warn('[useComplianceCategories] Database fetch failed, using fallback:', fetchError)
          setCategories(getFallbackCategories(countryCode))
          return
        }

        if (data && data.length > 0) {
          // Use category_name if available, otherwise category_code
          const categoryNames = data.map(c => c.category_name || c.category_code).filter(Boolean)
          if (categoryNames.length > 0) {
            setCategories(categoryNames)
            return
          }
        }
        
        // No categories found in database, use fallback from country config
        console.warn(`[useComplianceCategories] No categories found in database for ${countryCode}, using fallback from country config`)
        setCategories(getFallbackCategories(countryCode))
      } catch (err) {
        console.error('[useComplianceCategories] Error fetching categories:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch categories')
        // Fallback to config file categories
        setCategories(getFallbackCategories(countryCode))
      } finally {
        setIsLoading(false)
      }
    }

    if (countryCode) {
      fetchCategories()
    } else {
      setCategories(getFallbackCategories('IN'))
      setIsLoading(false)
    }
  }, [countryCode])

  return { categories, isLoading, error }
}

/**
 * Fallback categories if database fetch fails
 * Uses country config's defaultCategories
 */
function getFallbackCategories(countryCode: string): string[] {
  try {
    const countryConfig = getCountryConfig(countryCode)
    if (countryConfig?.compliance?.defaultCategories) {
      return countryConfig.compliance.defaultCategories
    }
  } catch (error) {
    console.warn('[useComplianceCategories] Error getting country config, using India defaults:', error)
  }
  
  // Ultimate fallback: India categories
  return ['Income Tax', 'GST', 'Payroll', 'RoC', 'Renewals', 'Others']
}
