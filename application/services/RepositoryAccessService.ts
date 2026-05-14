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
        return this.companyMembershipRepository.isSuperadmin(userId)
    }

    async getRoleForCompany(userId: string, companyId: string, isSuperadminCache?: boolean): Promise<AppRole | null> {
        // OPTIMIZATION: Accept isSuperadminCache to avoid duplicate calls
        let isSuperadminResult: boolean
        if (isSuperadminCache !== undefined) {
            isSuperadminResult = isSuperadminCache
        } else {
            isSuperadminResult = await this.isSuperadmin(userId)
        }
        
        if (isSuperadminResult) {
            return 'superadmin'
        }
        
        const company = await this.companyRepository.getById(companyId)
        const isOwner = company && (company.ownerUserId === userId || company.ownerAppUserId === userId)
        
        if (isOwner) {
            return 'admin'
        }

        const membership = await this.companyMembershipRepository.findRole(userId, companyId)
        return membership?.role ?? null
    }

    async canViewCompany(userId: string, companyId: string, isSuperadminCache?: boolean): Promise<boolean> {
        const access = await this.getCompanyAccessSnapshot(userId, companyId, isSuperadminCache)
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

        // Fetch company and userRole in parallel ONLY for regular users
        const [company, userRole] = await Promise.all([
            this.companyRepository.getById(companyId),
            this.companyMembershipRepository.findRole(userId, companyId)
        ])

        const userIsOwner = Boolean(company && (company.ownerUserId === userId || company.ownerAppUserId === userId))

        // Invited members (team members/admins)
        if (userRole && !userIsOwner) {
            const ownerId = company?.ownerAppUserId || company?.ownerUserId
            const [companySub, ownerSub] = await Promise.all([
                this.subscriptionRepository.getCompanySubscriptionState(companyId),
                ownerId ? this.subscriptionRepository.getUserSubscriptionState(ownerId) : Promise.resolve(null)
            ])
            
            if ((companySub && companySub.hasSubscription) || (ownerSub && ownerSub.hasSubscription)) {
                return {
                    hasAccess: true,
                    accessType: 'invited',
                    trialDaysRemaining: null,
                    isOwner: false,
                    subscriptionInfo: null,
                    ownerSubscriptionExpired: false,
                }
            }

            return {
                hasAccess: false,
                accessType: null,
                trialDaysRemaining: null,
                isOwner: false,
                subscriptionInfo: null,
                ownerSubscriptionExpired: true,
            }
        }

        if (userIsOwner) {
            const [companySub, userSub] = await Promise.all([
                this.subscriptionRepository.getCompanySubscriptionState(companyId),
                this.subscriptionRepository.getUserSubscriptionState(userId)
            ])
            
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

    async getAccessibleCompanyIds(userId: string, isSuperadminCache?: boolean): Promise<string[]> {
        const isSuperadmin = isSuperadminCache !== undefined ? isSuperadminCache : await this.isSuperadmin(userId)
        
        if (isSuperadmin) {
            return this.companyRepository.listAllCompanyIds()
        }

        const startTime = performance.now()
        const accessibleIds: string[] = []

        const [invitedRoles, ownedCompanies, userSub] = await Promise.all([
            this.companyMembershipRepository.getRolesByUserId(userId),
            this.companyRepository.listOwnedByUser(userId),
            this.subscriptionRepository.getUserSubscriptionState(userId)
        ])

        const invitedCompanyIds = invitedRoles
            .filter((r) => r.companyId !== null)
            .map((r) => r.companyId as string)

        if (invitedCompanyIds.length > 0) {
            const invitedCompanies = await Promise.all(
                invitedCompanyIds.map(id => this.companyRepository.getById(id))
            )

            // Only count companies the user is invited to (not owns).
            const invitedNotOwned = invitedCompanies.filter(
                (company): company is NonNullable<typeof company> =>
                    !!company &&
                    company.ownerUserId !== userId &&
                    company.ownerAppUserId !== userId,
            )

            // Mirror the data-room CTE's acc_ids gate: a team-member
            // role grants data-room access only when the company has
            // its own active subscription OR the owner has an active
            // personal subscription. Without this check the /subscribe
            // page listed invited-but-unfunded companies under
            // "Companies You Can Still Access", users clicked through,
            // and /data-room then bounced them right back — confusing
            // dead-end UX. Keeping the gate identical in both places
            // means the listing and the navigation target agree.
            //
            // Fan out the per-company subscription checks in parallel;
            // typical user has only a handful of invited companies so
            // the cost is bounded and stays under one RTT window.
            const invitedSubscriptionResults = await Promise.all(
                invitedNotOwned.map(async (company) => {
                    const ownerId = company.ownerAppUserId || company.ownerUserId
                    const [companySub, ownerSub] = await Promise.all([
                        this.subscriptionRepository.getCompanySubscriptionState(company.id),
                        ownerId
                            ? this.subscriptionRepository.getUserSubscriptionState(ownerId)
                            : Promise.resolve(null),
                    ])
                    const hasFundedAccess = Boolean(
                        companySub?.hasSubscription || ownerSub?.hasSubscription,
                    )
                    return { companyId: company.id, hasFundedAccess }
                }),
            )

            invitedSubscriptionResults.forEach((result) => {
                if (result.hasFundedAccess && !accessibleIds.includes(result.companyId)) {
                    accessibleIds.push(result.companyId)
                }
            })
        }

        if (userSub?.hasSubscription) {
            ownedCompanies.forEach((company) => {
                if (!accessibleIds.includes(company.id)) {
                    accessibleIds.push(company.id)
                }
            })
            return accessibleIds
        }

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
