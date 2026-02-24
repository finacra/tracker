'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

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
        
        const { data, error: fetchError } = await supabase
          .from('country_compliance_categories')
          .select('category_name, display_order')
          .eq('country_code', countryCode)
          .order('display_order', { ascending: true })

        if (fetchError) {
          console.warn('[useComplianceCategories] Database fetch failed, using fallback:', fetchError)
          throw fetchError
        }

        if (data && data.length > 0) {
          const categoryNames = data.map(c => c.category_name)
          setCategories(categoryNames)
        } else {
          // No categories found in database, use fallback
          console.warn('[useComplianceCategories] No categories found in database, using fallback')
          setCategories(getFallbackCategories(countryCode))
        }
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
 */
function getFallbackCategories(countryCode: string): string[] {
  // Default categories for India
  if (countryCode === 'IN') {
    return ['Income Tax', 'GST', 'Payroll', 'RoC', 'Renewals', 'Other', 'Prof. Tax', 'Labour Law', 'LLP Act']
  }
  
  // For other countries, return basic categories
  return ['Income Tax', 'GST', 'Payroll', 'RoC', 'Renewals', 'Other']
}
