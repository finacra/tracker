/**
 * Centralized query key factory for type-safe query keys
 * This ensures all query keys are consistent and prevents typos
 */
export const queryKeys = {
  // Company access queries
  companyAccess: (companyId: string | null) => ['company-access', companyId] as const,
  accessibleCompanies: () => ['accessible-companies'] as const,
  
  // User queries
  userRole: (companyId: string | null) => ['user-role', companyId] as const,
  userSubscription: () => ['user-subscription'] as const,
  
  // Company data queries
  companyDetails: (companyId: string) => ['company-details', companyId] as const,
  companyDirectors: (companyId: string) => ['company-directors', companyId] as const,
  
  // Requirements queries
  regulatoryRequirements: (companyId: string | null) => ['regulatory-requirements', companyId] as const,
  
  // Documents queries
  companyDocuments: (companyId: string) => ['company-documents', companyId] as const,
  documentTemplates: () => ['document-templates'] as const,
  
  // Data room initialization (expensive, cache longer)
  dataRoomInit: (preferredCompanyId: string | null) => ['data-room-init', preferredCompanyId] as const,
  
  // Hidden items
  hiddenTemplates: (companyId: string) => ['hidden-templates', companyId] as const,
  hiddenCompliances: (companyId: string) => ['hidden-compliances', companyId] as const,
  
  // Team management
  companyUserRoles: (companyId: string | null) => ['company-user-roles', companyId] as const,
  
  // Notifications
  notifications: () => ['notifications'] as const,
  
  // Compliance templates
  complianceTemplates: () => ['compliance-templates'] as const,
  complianceTemplate: (templateId: string) => ['compliance-template', templateId] as const,

  // Compliance facts (per company × FY) — owned by ComplianceIntelligencePanel
  // and read by ComplianceIntakeForm. Survives CIP re-mount so panels don't
  // regress to "STEP 1" after Approve All / re-fetches in the parent tree.
  complianceFacts: (companyId: string, financialYear: string | null) =>
    ['compliance-facts', companyId, financialYear] as const,
} as const
