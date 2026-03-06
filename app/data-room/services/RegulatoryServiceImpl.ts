/**
 * Implementation of RegulatoryService using server actions
 * This is the concrete implementation that components should NOT depend on directly
 */

import { IRegulatoryService } from './RegulatoryService'
import { ServiceResult, RegulatoryRequirement } from './types'
import {
  getRegulatoryRequirements,
  updateRequirementStatus,
  createRequirement,
  updateRequirement,
  deleteRequirement,
  hideComplianceForCompany
} from '@/app/data-room/actions'

export class RegulatoryServiceImpl implements IRegulatoryService {
  async getRequirements(companyId: string): Promise<ServiceResult<RegulatoryRequirement[]>> {
    try {
      const result = await getRegulatoryRequirements(companyId)
      if (result.success) {
        return { success: true, data: result.requirements || [] }
      }
      return { success: false, error: result.error || 'Failed to fetch requirements' }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  async updateRequirementStatus(
    requirementId: string,
    companyId: string,
    status: string
  ): Promise<ServiceResult> {
    try {
      const result = await updateRequirementStatus(requirementId, companyId, status as any)
      if (result.success) {
        return { success: true }
      }
      return { success: false, error: result.error || 'Failed to update status' }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  async createRequirement(
    companyId: string,
    requirement: Partial<RegulatoryRequirement>
  ): Promise<ServiceResult<RegulatoryRequirement>> {
    try {
      const result = await createRequirement(companyId, requirement as any)
      if (result.success) {
        // Server action returns { success: true, id?: string }
        // We need to fetch the requirement to get full data
        if (result.id) {
          const fetchResult = await this.getRequirements(companyId)
          if (fetchResult.success && fetchResult.data) {
            const created = fetchResult.data.find(r => r.id === result.id)
            if (created) {
              return { success: true, data: created }
            }
          }
        }
        return { success: true } // Created but couldn't fetch full data
      }
      return { success: false, error: result.error || 'Failed to create requirement' }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  async updateRequirement(
    requirementId: string,
    companyId: string,
    requirement: Partial<RegulatoryRequirement>
  ): Promise<ServiceResult<RegulatoryRequirement>> {
    try {
      const result = await updateRequirement(requirementId, companyId, requirement as any)
      if (result.success) {
        // Server action returns { success: boolean }
        // We need to fetch the requirement to get updated data
        const fetchResult = await this.getRequirements(companyId)
        if (fetchResult.success && fetchResult.data) {
          const updated = fetchResult.data.find(r => r.id === requirementId)
          if (updated) {
            return { success: true, data: updated }
          }
        }
        return { success: true } // Updated but couldn't fetch full data
      }
      return { success: false, error: result.error || 'Failed to update requirement' }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  async deleteRequirement(requirementId: string, companyId: string): Promise<ServiceResult> {
    try {
      const result = await deleteRequirement(requirementId, companyId)
      if (result.success) {
        return { success: true }
      }
      return { success: false, error: result.error || 'Failed to delete requirement' }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
    }
  }

  async hideCompliance(companyId: string, requirementId: string): Promise<ServiceResult> {
    try {
      const result = await hideComplianceForCompany(companyId, requirementId)
      if (result.success) {
        return { success: true }
      }
      // Provide helpful error message if table doesn't exist
      const errorMessage = result.error || 'Failed to hide compliance'
      if (errorMessage.includes('company_compliance_exclusions') || errorMessage.includes('schema cache')) {
        return { 
          success: false, 
          error: 'Database table not found. Please run the migration: supabase/migrations/migration-create-company-compliance-exclusions.sql' 
        }
      }
      return { success: false, error: errorMessage }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      if (errorMsg.includes('company_compliance_exclusions') || errorMsg.includes('schema cache')) {
        return { 
          success: false, 
          error: 'Database table not found. Please run the migration: supabase/migrations/migration-create-company-compliance-exclusions.sql' 
        }
      }
      return { success: false, error: errorMsg }
    }
  }
}
