/**
 * Compliance Template Loader
 * Country-aware compliance template loading and filtering
 */

import { createClient } from '@/utils/supabase/server'

export interface ComplianceTemplate {
  id: string
  name: string
  description?: string
  category: string
  country_code: string
  entity_types?: string[]
  industries?: string[]
  frequency?: string
  due_date_calculation?: any
  penalty_config?: any
  required_documents?: string[]
  is_active: boolean
  display_order?: number
  [key: string]: any
}

export class ComplianceTemplateLoader {
  /**
   * Get compliance templates for a specific country
   * @param countryCode - ISO 3166-1 alpha-2 country code
   * @param entityType - Optional entity type filter
   * @param industry - Optional industry filter
   * @returns Array of compliance templates
   */
  static async getTemplatesForCountry(
    countryCode: string,
    entityType?: string,
    industry?: string
  ): Promise<ComplianceTemplate[]> {
    const supabase = await createClient()
    
    let query = supabase
      .from('compliance_templates')
      .select('*')
      .eq('is_active', true)
    
    // Filter by country_code if column exists
    // Backward compatible: if column doesn't exist, return all templates
    // Note: We'll check if column exists via hasCountryCodeColumn() or just try to filter
    // If the column doesn't exist, Supabase will return an error which we'll handle
    query = query.eq('country_code', countryCode)
    
    if (entityType && entityType.trim().length > 0) {
      query = query.contains('entity_types', [entityType])
    }
    
    if (industry && industry.trim().length > 0) {
      query = query.contains('industries', [industry])
    }
    
    const { data, error } = await query.order('display_order', { ascending: true })
    
    if (error) {
      // If error is about missing column, return all templates (backward compatibility)
      if (error.message?.includes('column') && error.message?.includes('country_code')) {
        console.warn('country_code column not found, returning all templates')
        // Retry without country filter
        const fallbackQuery = supabase
          .from('compliance_templates')
          .select('*')
          .eq('is_active', true)
        const { data: fallbackData } = await fallbackQuery.order('display_order', { ascending: true })
        return fallbackData || []
      }
      console.error('Error loading compliance templates:', error)
      throw error
    }
    
    return data || []
  }
  
  /**
   * Get a specific template by ID and country
   * @param templateId - Template UUID
   * @param countryCode - ISO 3166-1 alpha-2 country code
   * @returns Compliance template or null if not found
   */
  static async getTemplateById(
    templateId: string,
    countryCode: string
  ): Promise<ComplianceTemplate | null> {
    const supabase = await createClient()
    
    let query = supabase
      .from('compliance_templates')
      .select('*')
      .eq('id', templateId)
      .eq('is_active', true)
      .single()
    
    // Filter by country_code if column exists
    try {
      query = query.eq('country_code', countryCode)
    } catch (error) {
      // Column might not exist yet - continue without country filter
      console.warn('country_code column not found, returning template without country filter')
    }
    
    const { data, error } = await query
    
    if (error) {
      if (error.code === 'PGRST116') {
        // No rows returned
        return null
      }
      console.error('Error loading compliance template:', error)
      return null
    }
    
    return data
  }
  
  /**
   * Get templates by category for a country
   * @param countryCode - ISO 3166-1 alpha-2 country code
   * @param category - Category code (e.g., 'tax', 'corporate', 'labor')
   * @returns Array of compliance templates
   */
  static async getTemplatesByCategory(
    countryCode: string,
    category: string
  ): Promise<ComplianceTemplate[]> {
    const supabase = await createClient()
    
    let query = supabase
      .from('compliance_templates')
      .select('*')
      .eq('category', category)
      .eq('is_active', true)
    
    // Filter by country_code if column exists
    try {
      query = query.eq('country_code', countryCode)
    } catch (error) {
      // Column might not exist yet
      console.warn('country_code column not found')
    }
    
    const { data, error } = await query.order('display_order', { ascending: true })
    
    if (error) {
      console.error('Error loading templates by category:', error)
      throw error
    }
    
    return data || []
  }
  
  /**
   * Get all templates for a country (for admin/bulk operations)
   * @param countryCode - ISO 3166-1 alpha-2 country code
   * @param includeInactive - Whether to include inactive templates
   * @returns Array of all compliance templates
   */
  static async getAllTemplatesForCountry(
    countryCode: string,
    includeInactive: boolean = false
  ): Promise<ComplianceTemplate[]> {
    const supabase = await createClient()
    
    let query = supabase
      .from('compliance_templates')
      .select('*')
    
    if (!includeInactive) {
      query = query.eq('is_active', true)
    }
    
    // Filter by country_code if column exists
    try {
      query = query.eq('country_code', countryCode)
    } catch (error) {
      // Column might not exist yet
      console.warn('country_code column not found')
    }
    
    const { data, error } = await query.order('display_order', { ascending: true })
    
    if (error) {
      console.error('Error loading all templates:', error)
      throw error
    }
    
    return data || []
  }
  
  /**
   * Check if country_code column exists in compliance_templates table
   * Used for backward compatibility checks
   */
  static async hasCountryCodeColumn(): Promise<boolean> {
    try {
      const supabase = await createClient()
      // Try to query with country_code filter
      const { error } = await supabase
        .from('compliance_templates')
        .select('country_code')
        .limit(1)
      
      return !error
    } catch {
      return false
    }
  }
}
