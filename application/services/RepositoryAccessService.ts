import type { AccessService } from '@/application/interfaces/AccessService'
import type { CompanyAccessSnapshot } from '@/domain/types/CompanyAccess'
import type { AppRole } from '@/domain/types/Role'
import type { CompanyMembershipRepository } from '@/application/interfaces/CompanyMembershipRepository'
import type { SubscriptionRepository } from '@/application/interfaces/SubscriptionRepository'
import type { CompanyRepository } from '@/application/interfaces/CompanyRepository'

export class RepositoryAccessService implements AccessService {
    constructor(
        private companyMembershipRepository: CompanyMembershipRepository,
        private subscriptionRepository: SubscriptionRepository,
        private companyRepository: CompanyRepository
    ) { }

    async isSuperadmin(userId: string): Promise<boolean> {
        const roles = await this.companyMembershipRepository.getRolesByUserId(userId)
        return roles.some((r) => r.companyId === null && r.role === 'superadmin')
    }

    async getRoleForCompany(userId: string, companyId: string, isSuperadminCache?: boolean): Promise<AppRole | null> {
        // OPTIMIZATION: Accept isSuperadminCache to avoid duplicate calls
        // If caller already checked superadmin status, pass it here
        let isSuperadminResult: boolean
        if (isSuperadminCache !== undefined) {
            isSuperadminResult = isSuperadminCache
        } else {
            isSuperadminResult = await this.isSuperadmin(userId)
        }
        
        if (isSuperadminResult) {
            return 'superadmin'
        }
        
        // Fetch company in parallel with superadmin check (if not cached)
        const company = await this.companyRepository.getById(companyId)
        
        // Check if user is owner - handle both Passport and Supabase users
        // OPTIMIZATION: Don't call listOwnedByUser - just check the company record directly
        const isOwner = company && (company.ownerUserId === userId || company.ownerAppUserId === userId)
        
        if (isOwner) {
            return 'admin'
        }

        const membership = await this.companyMembershipRepository.findRole(userId, companyId)
        return membership?.role ?? null
    }

    async canViewCompany(userId: string, companyId: string): Promise<boolean> {
        const access = await this.getCompanyAccessSnapshot(userId, companyId)
        return access.hasAccess
    }

    async getCompanyAccessSnapshot(userId: string, companyId: string, isSuperadminCache?: boolean): Promise<CompanyAccessSnapshot> {
        // OPTIMIZATION: Accept isSuperadminCache to avoid duplicate calls
        let isSuperadmin: boolean
        if (isSuperadminCache !== undefined) {
            isSuperadmin = isSuperadminCache
        } else {
            isSuperadmin = await this.isSuperadmin(userId)
        }
        
        // Fetch company and userRole in parallel
        const [company, userRole] = await Promise.all([
            this.companyRepository.getById(companyId),
            this.companyMembershipRepository.findRole(userId, companyId)
        ])
        
        if (isSuperadmin) {
            return {
                hasAccess: true,
                accessType: 'superadmin',
                trialDaysRemaining: null,
                isOwner: false,
                subscriptionInfo: null,
                ownerSubscriptionExpired: false,
            }
        }

        console.log('[RepositoryAccessService] Company data:', {
            companyId,
            ownerUserId: company?.ownerUserId,
            ownerAppUserId: company?.ownerAppUserId,
            checkingUserId: userId
        })
        console.log('[RepositoryAccessService] User role:', userRole)
        
        // Check if user is owner - handle both Passport and Supabase users
        // For Passport users, check app_user_id; for Supabase users, check user_id
        const userIsOwner = Boolean(company && (company.ownerUserId === userId || company.ownerAppUserId === userId))
        if (userIsOwner) {
            console.log('[RepositoryAccessService] User is owner (direct match)')
        }

        // Invited members (team members/admins) - they can only access if owner has active subscription
        if (userRole && !userIsOwner) {
            // OPTIMIZED: getUserSubscriptionState already handles both app_user_id and user_id via UNION
            // Only call it once with the owner ID (prefer app_user_id, fallback to user_id)
            const ownerId = company?.ownerAppUserId || company?.ownerUserId
            const [companySub, ownerSub] = await Promise.all([
                this.subscriptionRepository.getCompanySubscriptionState(companyId),
                ownerId ? this.subscriptionRepository.getUserSubscriptionState(ownerId) : Promise.resolve(null)
            ])
            
            console.log('[RepositoryAccessService] Invited member - Company subscription:', {
                hasSubscription: companySub?.hasSubscription,
                isTrial: companySub?.isTrial,
                tier: companySub?.tier
            })
            console.log('[RepositoryAccessService] Invited member - Owner subscription:', {
                hasSubscription: ownerSub?.hasSubscription,
                isTrial: ownerSub?.isTrial,
                tier: ownerSub?.tier
            })

            if (companySub && companySub.hasSubscription) {
                // Company has active subscription - invited member can access
                return {
                    hasAccess: true,
                    accessType: 'invited',
                    trialDaysRemaining: null,
                    isOwner: false,
                    subscriptionInfo: null,
                    ownerSubscriptionExpired: false,
                }
            }

            if (ownerSub?.hasSubscription) {
                // Owner has active subscription - invited member can access
                return {
                    hasAccess: true,
                    accessType: 'invited',
                    trialDaysRemaining: null,
                    isOwner: false,
                    subscriptionInfo: null,
                    ownerSubscriptionExpired: false,
                }
            }

            // No active subscription - invited member CANNOT access (subscription expired)
            console.log('[RepositoryAccessService] Invited member - No active subscription, access DENIED')
            return {
                hasAccess: false,
                accessType: null,
                trialDaysRemaining: null,
                isOwner: false,
                subscriptionInfo: null,
                ownerSubscriptionExpired: true, // Owner's subscription expired
            }
        }

        if (userIsOwner) {
            // Optimized: Check both company and user subscriptions in parallel
            const [companySub, userSub] = await Promise.all([
                this.subscriptionRepository.getCompanySubscriptionState(companyId),
                this.subscriptionRepository.getUserSubscriptionState(userId)
            ])
            
            console.log('[RepositoryAccessService] Company subscription state:', {
                companyId,
                hasSubscription: companySub?.hasSubscription,
                isTrial: companySub?.isTrial,
                tier: companySub?.tier,
                trialDaysRemaining: companySub?.trialDaysRemaining
            })
            console.log('[RepositoryAccessService] User subscription state:', {
                userId,
                hasSubscription: userSub?.hasSubscription,
                isTrial: userSub?.isTrial,
                tier: userSub?.tier,
                trialDaysRemaining: userSub?.trialDaysRemaining
            })

            if (companySub && companySub.hasSubscription) {
                return {
                    hasAccess: true,
                    accessType: companySub.isTrial ? 'trial' : 'subscription',
                    trialDaysRemaining: companySub.isTrial ? companySub.trialDaysRemaining : null,
                    isOwner: true,
                    subscriptionInfo: {
                        hasSubscription: true,
                        tier: companySub.tier,
                        isTrial: companySub.isTrial,
                        trialDaysRemaining: companySub.trialDaysRemaining,
                        companyLimit: companySub.tier === 'professional' ? 20 : 5,
                        userLimit: companySub.tier === 'professional' ? 10 : 3,
                    },
                    ownerSubscriptionExpired: false,
                }
            }

            if (userSub?.hasSubscription) {
                return {
                    hasAccess: true,
                    accessType: userSub.isTrial ? 'trial' : 'subscription',
                    trialDaysRemaining: userSub.isTrial ? userSub.trialDaysRemaining : null,
                    isOwner: true,
                    subscriptionInfo: {
                        hasSubscription: true,
                        tier: userSub.tier,
                        isTrial: userSub.isTrial,
                        trialDaysRemaining: userSub.trialDaysRemaining,
                        companyLimit: userSub.companyLimit,
                        userLimit: userSub.userLimit,
                    },
                    ownerSubscriptionExpired: false,
                }
            }

            // Owner but no active subscription/trial - access denied
            console.log('[RepositoryAccessService] Owner has no active subscription/trial')
            return {
                hasAccess: false,
                accessType: null,
                trialDaysRemaining: null,
                isOwner: true,
                subscriptionInfo: null,
                ownerSubscriptionExpired: true,
            }
        }

        return {
            hasAccess: false,
            accessType: null,
            trialDaysRemaining: null,
            isOwner: userIsOwner,
            subscriptionInfo: null,
            ownerSubscriptionExpired: false,
        }
    }

    async getAccessibleCompanyIds(userId: string): Promise<string[]> {
        const startTime = performance.now()
        
        if (await this.isSuperadmin(userId)) {
            // OPTIMIZATION: For superadmins, just get company IDs (not full records)
            // This is much faster than fetching all company data
            const allCompanyIds = await this.companyRepository.listAllCompanyIds()
            console.log(`[getAccessibleCompanyIds] Superadmin - took ${(performance.now() - startTime).toFixed(2)}ms, found ${allCompanyIds.length} companies`)
            return allCompanyIds
        }

        const accessibleIds: string[] = []

        // Fetch all data in parallel to avoid sequential queries
        const parallelStartTime = performance.now()
        const [invitedRoles, ownedCompanies, userSub] = await Promise.all([
            this.companyMembershipRepository.getRolesByUserId(userId),
            this.companyRepository.listOwnedByUser(userId),
            this.subscriptionRepository.getUserSubscriptionState(userId)
        ])
        console.log(`[getAccessibleCompanyIds] Parallel fetch took ${(performance.now() - parallelStartTime).toFixed(2)}ms`)

        const invitedCompanyIds = invitedRoles
            .filter((r) => r.companyId !== null)
            .map((r) => r.companyId as string)

        // Fetch all invited companies in parallel (not sequentially!)
        if (invitedCompanyIds.length > 0) {
            const invitedCompanies = await Promise.all(
                invitedCompanyIds.map(id => this.companyRepository.getById(id))
            )
            
            invitedCompanies.forEach((company) => {
                if (company && company.ownerUserId !== userId && company.ownerAppUserId !== userId) {
                    if (!accessibleIds.includes(company.id)) {
                        accessibleIds.push(company.id)
                    }
                }
            })
        }

        // If user has subscription, all owned companies are accessible
        if (userSub?.hasSubscription) {
            ownedCompanies.forEach((company) => {
                if (!accessibleIds.includes(company.id)) {
                    accessibleIds.push(company.id)
                }
            })
            return accessibleIds
        }

        // Check company subscriptions in parallel (already optimized)
        const ownedCompanySubscriptionResults = await Promise.all(
            ownedCompanies.map(async (company) => {
                const companySub = await this.subscriptionRepository.getCompanySubscriptionState(company.id)
                return {
                    companyId: company.id,
                    hasSubscription: Boolean(companySub?.hasSubscription),
                }
            })
        )

        ownedCompanySubscriptionResults.forEach((result) => {
            if (result.hasSubscription && !accessibleIds.includes(result.companyId)) {
                accessibleIds.push(result.companyId)
            }
        })

        console.log(`[getAccessibleCompanyIds] Total took ${(performance.now() - startTime).toFixed(2)}ms, found ${accessibleIds.length} companies`)
        return accessibleIds
    }
}
