/**
 * Service interface for regulatory requirements operations (DIP)
 * Components depend on this interface, not concrete implementations
 */

import { ServiceResult, RegulatoryRequirement } from './types'

export interface IRegulatoryService {
  getRequirements: (companyId: string) => Promise<ServiceResult<RegulatoryRequirement[]>>
  updateRequirementStatus: (requirementId: string, companyId: string, status: string) => Promise<ServiceResult>
  createRequirement: (companyId: string, requirement: Partial<RegulatoryRequirement>) => Promise<ServiceResult<RegulatoryRequirement>>
  updateRequirement: (requirementId: string, companyId: string, requirement: Partial<RegulatoryRequirement>) => Promise<ServiceResult<RegulatoryRequirement>>
  deleteRequirement: (requirementId: string, companyId: string) => Promise<ServiceResult>
  hideCompliance: (companyId: string, requirementId: string) => Promise<ServiceResult>
}
