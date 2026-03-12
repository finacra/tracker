import { SupabaseAuthGateway } from '@/infrastructure/auth/supabase/SupabaseAuthGateway'
import { SupabaseAuthService } from '@/infrastructure/auth/supabase/SupabaseAuthService'
import { SupabaseSessionProvider } from '@/infrastructure/auth/supabase/SupabaseSessionProvider'
import { PassportAuthGateway } from '@/infrastructure/auth/passport/PassportAuthGateway'
import { PassportAuthService } from '@/infrastructure/auth/passport/PassportAuthService'
import { PassportSessionProvider } from '@/infrastructure/auth/passport/PassportSessionProvider'
import { HybridAuthService } from '@/infrastructure/auth/HybridAuthService'
import { RepositoryAccessService } from '@/application/services/RepositoryAccessService'
import { RepositorySubscriptionService } from '@/application/services/RepositorySubscriptionService'
import { PrismaUserRepository } from '@/infrastructure/persistence/prisma/PrismaUserRepository'
import { PrismaCompanyRepository } from '@/infrastructure/persistence/prisma/PrismaCompanyRepository'
import { PrismaRequirementRepository } from '@/infrastructure/persistence/prisma/PrismaRequirementRepository'
import { PrismaNotificationRepository } from '@/infrastructure/persistence/prisma/PrismaNotificationRepository'
import { PrismaDirectorRepository } from '@/infrastructure/persistence/prisma/PrismaDirectorRepository'
import { PrismaPaymentRepository } from '@/infrastructure/persistence/prisma/PrismaPaymentRepository'
import { PrismaSubscriptionRepository } from '@/infrastructure/persistence/prisma/PrismaSubscriptionRepository'
import { PrismaEmailPreferenceRepository } from '@/infrastructure/persistence/prisma/PrismaEmailPreferenceRepository'
import { PrismaCompanyMembershipRepository } from '@/infrastructure/persistence/prisma/PrismaCompanyMembershipRepository'
import { PrismaTeamInvitationRepository } from '@/infrastructure/persistence/prisma/PrismaTeamInvitationRepository'
import { PrismaAuthIdentityRepository } from '@/infrastructure/persistence/prisma/PrismaAuthIdentityRepository'
import { PrismaDocumentRepository } from '@/infrastructure/persistence/prisma/PrismaDocumentRepository'
import { PrismaVaultFolderRepository } from '@/infrastructure/persistence/prisma/PrismaVaultFolderRepository'
import { PrismaVaultTemplateRepository } from '@/infrastructure/persistence/prisma/PrismaVaultTemplateRepository'
import { PrismaVaultDocumentUsageRepository } from '@/infrastructure/persistence/prisma/PrismaVaultDocumentUsageRepository'
import { PrismaVaultTemplateManagementRepository } from '@/infrastructure/persistence/prisma/PrismaVaultTemplateManagementRepository'

export function createServerContainer() {
  const userRepository = new PrismaUserRepository()
  const companyRepository = new PrismaCompanyRepository()
  const requirementRepository = new PrismaRequirementRepository()
  const notificationRepository = new PrismaNotificationRepository()
  const directorRepository = new PrismaDirectorRepository()
  const paymentRepository = new PrismaPaymentRepository()
  const subscriptionRepository = new PrismaSubscriptionRepository()
  const emailPreferenceRepository = new PrismaEmailPreferenceRepository()
  const companyMembershipRepository = new PrismaCompanyMembershipRepository()
  const teamInvitationRepository = new PrismaTeamInvitationRepository()
  const authIdentityRepository = new PrismaAuthIdentityRepository()
  const documentRepository = new PrismaDocumentRepository()
  const vaultFolderRepository = new PrismaVaultFolderRepository()
  const vaultTemplateRepository = new PrismaVaultTemplateRepository()
  const vaultDocumentUsageRepository = new PrismaVaultDocumentUsageRepository()
  const vaultTemplateManagementRepository = new PrismaVaultTemplateManagementRepository()

  // Choose auth provider based on environment variable (default to Supabase for backward compatibility)
  const authProvider = process.env.AUTH_PROVIDER || 'supabase'

  // Create BOTH services for hybrid support
  const supabaseAuthService = new SupabaseAuthService(userRepository)
  const passportAuthService = new PassportAuthService(userRepository)

  // Use Hybrid by default to support both Supabase (email) and Passport (Google)
  const authService = new HybridAuthService(
    authProvider === 'passport' ? passportAuthService : supabaseAuthService,
    authProvider === 'passport' ? supabaseAuthService : passportAuthService
  )

  const authGateway =
    authProvider === 'passport'
      ? new PassportAuthGateway()
      : new SupabaseAuthGateway()

  const sessionProvider =
    authProvider === 'passport'
      ? new PassportSessionProvider()
      : new SupabaseSessionProvider()

  return {
    authService,
    authGateway,
    sessionProvider,
    authIdentityRepository,
    subscriptionService: new RepositorySubscriptionService(subscriptionRepository),
    accessService: new RepositoryAccessService(companyMembershipRepository, subscriptionRepository, companyRepository),
    companyRepository,
    companyMembershipRepository,
    directorRepository,
    documentRepository,
    emailPreferenceRepository,
    paymentRepository,
    requirementRepository,
    notificationRepository,
    subscriptionRepository,
    teamInvitationRepository,
    userRepository,
    vaultDocumentUsageRepository,
    vaultFolderRepository,
    vaultTemplateManagementRepository,
    vaultTemplateRepository,
  }
}
