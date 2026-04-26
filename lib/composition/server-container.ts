import 'server-only'
import { cache } from 'react'
import { PassportAuthGateway } from '@/infrastructure/auth/passport/PassportAuthGateway'
import { PassportAuthService } from '@/infrastructure/auth/passport/PassportAuthService'
import { PassportSessionProvider } from '@/infrastructure/auth/passport/PassportSessionProvider'
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

/**
 * Wrapped in React.cache so multiple calls within the same request
 * (server action, RSC render, route handler) share one container
 * instance instead of instantiating ~17 repos + services 30+ times per
 * data-room load. The container is just a bag of stateless objects
 * around the singleton Prisma client; sharing across calls is safe
 * and matches what callers already assume.
 */
export const createServerContainer = cache(_createServerContainer)

function _createServerContainer() {
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

  // Use Passport authentication (Supabase auth removed)
  const authService = new PassportAuthService(userRepository)
  const authGateway = new PassportAuthGateway()
  const sessionProvider = new PassportSessionProvider()

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
