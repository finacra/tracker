import type { AccessService } from '@/application/interfaces/AccessService'
import type { CompanyAccessSnapshot } from '@/domain/types/CompanyAccess'
import type { AppRole } from '@/domain/types/Role'
import type { CompanyMembershipRepository } from '@/application/interfaces/CompanyMembershipRepository'
import type { SubscriptionRepository } from '@/application/interfaces/SubscriptionRepository'
import type { CompanyRepository } from '@/application/interfaces/CompanyRepository'
// PR-41: temporary boundary break to mirror the data-room CTE's funded-
// access gate exactly. SubscriptionRepository's hasSubscription mapping
// uses end_date as a fallback for trials, which diverges from the CTE's
// strict trial_ends_at check. Until we move this gate into a dedicated
// repository method, run the same SQL the CTE runs.
import { prisma } from '@/lib/prisma'

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

            if (invitedNotOwned.length > 0) {
                // Mirror the data-room CTE's acc_ids gate EXACTLY — a
                // team-member role grants data-room access only when
                // the company has its own active+unexpired subscription
                // OR the owner has an active+unexpired personal sub.
                //
                // PR-40 first tried this with
                // getCompanySubscriptionState / getUserSubscriptionState,
                // but those map a trial sub's expiration as
                // `trial_ends_at || end_date` — falling back to end_date
                // when trial_ends_at is NULL or in the past. The
                // data-room CTE doesn't fall back: it strictly requires
                // `trial_ends_at > NOW()` for trials. That divergence
                // let unfunded invited companies through this listing
                // even though /data-room would then reject them on
                // click, producing the JRS bounce loop reported on prod.
                //
                // This $queryRaw uses the *same* expiry logic the CTE
                // does, so the listing and the navigation target now
                // agree by construction.
                const invitedIdList = invitedNotOwned.map((c) => c.id)
                const fundedRows = await prisma.$queryRaw<Array<{ id: string }>>`
                    SELECT DISTINCT c.id
                    FROM companies c
                    LEFT JOIN subscriptions s_company ON
                        s_company.company_id::uuid = c.id
                        AND s_company.subscription_type = 'company'
                        AND (s_company.status = 'active' OR s_company.is_trial = true)
                        AND (
                            (s_company.is_trial = true AND s_company.trial_ends_at > NOW())
                            OR
                            ((s_company.is_trial = false OR s_company.is_trial IS NULL) AND s_company.end_date > NOW())
                        )
                    LEFT JOIN subscriptions s_owner ON
                        (s_owner.app_user_id = c.app_user_id OR s_owner.user_id = c.user_id)
                        AND s_owner.subscription_type = 'user'
                        AND (s_owner.status = 'active' OR s_owner.is_trial = true)
                        AND (
                            (s_owner.is_trial = true AND s_owner.trial_ends_at > NOW())
                            OR
                            ((s_owner.is_trial = false OR s_owner.is_trial IS NULL) AND s_owner.end_date > NOW())
                        )
                    WHERE c.id::uuid = ANY(${invitedIdList}::uuid[])
                      AND (s_company.id IS NOT NULL OR s_owner.id IS NOT NULL)
                `

                const fundedIds = new Set(fundedRows.map((r) => r.id))
                invitedNotOwned.forEach((company) => {
                    if (fundedIds.has(company.id) && !accessibleIds.includes(company.id)) {
                        accessibleIds.push(company.id)
                    }
                })
            }
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
