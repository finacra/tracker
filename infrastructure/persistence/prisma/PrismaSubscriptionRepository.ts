import type {
    CompanySubscriptionState,
    SubscriptionRecord,
    SubscriptionRepository,
    UserSubscriptionState,
} from '@/application/interfaces/SubscriptionRepository'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

export class PrismaSubscriptionRepository implements SubscriptionRepository {
    private mapRow(row: any): SubscriptionRecord {
        return {
            id: row.id,
            userId: row.user_id,
            companyId: row.company_id,
            subscriptionType: row.subscription_type,
            status: row.status,
            tier: row.tier,
            billingCycle: row.billing_cycle ?? 'monthly',
            amount: row.amount ? Number(row.amount) : 0,
            currency: row.currency ?? 'INR',
            startDate: row.start_date.toISOString(),
            endDate: row.end_date.toISOString(),
            currentPeriodStart: row.current_period_start?.toISOString() ?? null,
            currentPeriodEnd: row.current_period_end?.toISOString() ?? null,
            cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
            cancelledAt: row.cancelled_at?.toISOString() ?? null,
            isTrial: Boolean(row.is_trial),
            trialStartedAt: row.trial_started_at?.toISOString() ?? null,
            trialEndsAt: row.trial_ends_at?.toISOString() ?? null,
            createdAt: row.created_at.toISOString(),
            updatedAt: row.updated_at.toISOString(),
        }
    }

    async hasUsedEnterpriseUserTrial(userId: string): Promise<boolean> {
        const count = await prisma.subscription.count({
            where: {
                user_id: userId,
                subscription_type: 'user',
                tier: 'enterprise',
                is_trial: true,
            },
        })
        return count > 0
    }

    async hasUsedCompanyTrial(companyId: string): Promise<boolean> {
        const count = await prisma.subscription.count({
            where: {
                company_id: companyId,
                subscription_type: 'company',
                is_trial: true,
            },
        })
        return count > 0
    }

    async createUserTrial(userId: string, appUserId?: string | null): Promise<void> {
        // Check if user already has an active subscription or trial
        // Search by both user_id and app_user_id to catch Passport users
        const existing = await prisma.subscription.findFirst({
            where: {
                subscription_type: 'user',
                OR: [
                    { user_id: userId, status: 'active', end_date: { gt: new Date() } },
                    { user_id: userId, is_trial: true, trial_ends_at: { gt: new Date() } },
                    { app_user_id: userId, status: 'active', end_date: { gt: new Date() } },
                    { app_user_id: userId, is_trial: true, trial_ends_at: { gt: new Date() } },
                ],
            },
        })

        if (existing) {
            throw new Error('User already has an active subscription or trial')
        }

        const trialDuration = 15 // days
        const trialEnd = new Date()
        trialEnd.setDate(trialEnd.getDate() + trialDuration)

        try {
            await prisma.subscription.create({
                data: {
                    user_id: userId,
                    app_user_id: appUserId || null,
                    company_id: null,
                    subscription_type: 'user',
                    status: 'trial',
                    tier: 'enterprise',
                    billing_cycle: 'monthly',
                    amount: new Prisma.Decimal(0),
                    currency: 'INR',
                    is_trial: true,
                    trial_started_at: new Date(),
                    trial_ends_at: trialEnd,
                    start_date: new Date(),
                    end_date: trialEnd,
                },
            })
        } catch (err) {
            console.error('[createUserTrial] FAILED:', err instanceof Error ? err.message : err)
            throw err
        }
    }

    async createCompanyTrial(userId: string, companyId: string, appUserId?: string | null): Promise<void> {
        // Verify user owns the company
        const company = await prisma.company.findUnique({
            where: { id: companyId },
            select: { user_id: true }
        })

        if (!company || company.user_id !== userId) {
            throw new Error('User does not own this company')
        }

        // Check if already used
        const usedTrial = await prisma.subscription.findFirst({
            where: {
                company_id: companyId,
                subscription_type: 'company',
                is_trial: true,
            }
        })

        if (usedTrial) {
            throw new Error('Company has already used its trial')
        }

        // Check if active
        const active = await prisma.subscription.findFirst({
            where: {
                company_id: companyId,
                subscription_type: 'company',
                OR: [
                    { status: 'active', end_date: { gt: new Date() } },
                    { is_trial: true, trial_ends_at: { gt: new Date() } },
                ]
            }
        })

        if (active) {
            throw new Error('Company already has an active subscription or trial')
        }

        const trialDuration = 15 // days
        const trialEnd = new Date()
        trialEnd.setDate(trialEnd.getDate() + trialDuration)

        await prisma.subscription.create({
            data: {
                user_id: userId,
                app_user_id: appUserId || null,
                company_id: companyId,
                subscription_type: 'company',
                status: 'trial',
                tier: 'starter',
                billing_cycle: 'monthly',
                amount: new Prisma.Decimal(0),
                currency: 'INR',
                is_trial: true,
                trial_started_at: new Date(),
                trial_ends_at: trialEnd,
                start_date: new Date(),
                end_date: trialEnd,
            },
        })
    }

    async getUserSubscriptionState(userId: string): Promise<UserSubscriptionState | null> {
        // OPTIMIZED: Use UNION query - now fast with idx_subscriptions_app_user_active index
        // This is more robust than conditional logic and handles all identity paths correctly
        const startTime = performance.now()
        
        const subs = await prisma.$queryRaw<any[]>`
            SELECT s.*
            FROM subscriptions s
            WHERE s.subscription_type = 'user'
            AND (s.status = 'active' OR s.is_trial = true)
            AND s.app_user_id = ${userId}::uuid
            UNION ALL
            SELECT s.*
            FROM subscriptions s
            INNER JOIN auth_identities ai ON ai.legacy_auth_id = s.user_id::text
            WHERE s.subscription_type = 'user'
            AND (s.status = 'active' OR s.is_trial = true)
            AND ai.app_user_id = ${userId}::uuid AND ai.provider = 'supabase'
            UNION ALL
            SELECT s.*
            FROM subscriptions s
            WHERE s.subscription_type = 'user'
            AND (s.status = 'active' OR s.is_trial = true)
            AND s.user_id = ${userId}::uuid
            AND NOT EXISTS (SELECT 1 FROM app_users WHERE id = ${userId}::uuid)
            ORDER BY created_at DESC
            LIMIT 1
        `
        const sub = subs.length > 0 ? subs[0] : null
        const duration = performance.now() - startTime
        if (duration > 1000) {
            console.warn(`[PrismaSubscriptionRepository] getUserSubscriptionState took ${duration.toFixed(2)}ms - slow! Check idx_subscriptions_app_user_active index.`)
        }
        
        if (!sub) {
            return {
                hasSubscription: false,
                tier: '',
                isTrial: false,
                trialDaysRemaining: 0,
                companyLimit: 0,
                userLimit: 0,
            }
        }
        
        return this.mapSubscriptionToState(sub)
    }
    
    private mapSubscriptionToState(sub: any): UserSubscriptionState {
        const now = new Date()
        // Handle date conversion from database
        const trialEndsAt = sub.trial_ends_at ? new Date(sub.trial_ends_at) : null
        const endDateValue = sub.end_date ? new Date(sub.end_date) : null
        const endDate = sub.is_trial ? (trialEndsAt || endDateValue) : endDateValue
        const isExpired = !endDate || endDate < now || sub.status === 'expired'
        const trialDaysRemaining = sub.is_trial && !isExpired
            ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
            : 0

        return {
            hasSubscription: !isExpired,
            tier: sub.tier,
            isTrial: Boolean(sub.is_trial),
            trialDaysRemaining,
            companyLimit: sub.tier === 'enterprise' ? 100 : sub.tier === 'professional' ? 20 : 5,
            userLimit: sub.tier === 'enterprise' ? 999999 : sub.tier === 'professional' ? 10 : 3,
        }
    }

    async getCompanySubscriptionState(companyId: string): Promise<CompanySubscriptionState | null> {
        // OPTIMIZED: Use raw SQL to ensure index usage (idx_subscriptions_company_status_trial)
        // Prisma's findFirst with OR might not use the composite index optimally
        const subs = await prisma.$queryRaw<any[]>`
            SELECT * FROM subscriptions
            WHERE company_id::uuid = ${companyId}::uuid
            AND subscription_type = 'company'
            AND (status = 'active' OR is_trial = true)
            ORDER BY created_at DESC
            LIMIT 1
        `
        const sub = subs.length > 0 ? subs[0] : null

        console.log('[PrismaSubscriptionRepository] getCompanySubscriptionState:', {
            companyId,
            found: !!sub,
            subscription: sub ? {
                id: sub.id,
                status: sub.status,
                is_trial: sub.is_trial,
                tier: sub.tier,
                trial_ends_at: sub.trial_ends_at,
                end_date: sub.end_date,
            } : null
        })

        if (!sub) {
            return {
                hasSubscription: false,
                tier: '',
                isTrial: false,
                trialDaysRemaining: 0,
                userLimit: 0,
            }
        }

        const now = new Date()
        // For trials (is_trial = true), use trial_ends_at if available, otherwise use end_date
        // For non-trials, use end_date
        const endDate = sub.is_trial 
            ? (sub.trial_ends_at || sub.end_date) 
            : sub.end_date
        
        const isExpired = endDate < now || sub.status === 'expired'
        const trialDaysRemaining = sub.is_trial && !isExpired
            ? Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
            : 0

        console.log('[PrismaSubscriptionRepository] Subscription expiration check:', {
            companyId,
            now: now.toISOString(),
            endDate: endDate.toISOString(),
            isExpired,
            trialDaysRemaining,
            hasSubscription: !isExpired
        })

        return {
            hasSubscription: !isExpired,
            tier: sub.tier,
            isTrial: Boolean(sub.is_trial),
            trialDaysRemaining,
            userLimit: sub.tier === 'enterprise' ? 999999 : sub.tier === 'professional' ? 10 : 3,
        }
    }

    async getById(id: string): Promise<SubscriptionRecord | null> {
        const sub = await prisma.subscription.findUnique({
            where: { id },
        })
        return sub ? this.mapRow(sub) : null
    }

    async listAll(): Promise<SubscriptionRecord[]> {
        const rows = await prisma.subscription.findMany({
            orderBy: { created_at: 'desc' },
        })
        return rows.map((row) => this.mapRow(row))
    }

    async getLatestForCompany(companyId: string): Promise<SubscriptionRecord | null> {
        const sub = await prisma.subscription.findFirst({
            where: { company_id: companyId },
            orderBy: { created_at: 'desc' },
        })
        return sub ? this.mapRow(sub) : null
    }

    async activatePaidSubscription(input: {
        userId: string
        companyId: string | null
        tier: 'starter' | 'professional' | 'enterprise'
        billingCycle: 'monthly' | 'quarterly' | 'half-yearly' | 'annual'
        amount: number
        currency: string
        startDate: string
        endDate: string
        appUserId?: string | null
    }): Promise<void> {
        const subscriptionType = input.tier === 'enterprise' ? 'user' : 'company'
        const finalCompanyId = subscriptionType === 'user' ? null : input.companyId

        let existingId: string | null = null

        if (subscriptionType === 'user') {
            const sub = await prisma.subscription.findFirst({
                where: {
                    user_id: input.userId,
                    subscription_type: 'user',
                    status: 'active',
                },
                select: { id: true }
            })
            existingId = sub?.id ?? null
        } else if (finalCompanyId) {
            const sub = await prisma.subscription.findFirst({
                where: {
                    company_id: finalCompanyId,
                    subscription_type: 'company',
                    status: 'active',
                },
                select: { id: true }
            })
            existingId = sub?.id ?? null
        }

        const payload: Prisma.SubscriptionUpdateInput = {
            tier: input.tier,
            billing_cycle: input.billingCycle,
            amount: new Prisma.Decimal(input.amount),
            currency: input.currency,
            status: 'active',
            start_date: new Date(input.startDate),
            end_date: new Date(input.endDate),
            current_period_start: new Date(input.startDate),
            current_period_end: new Date(input.endDate),
            updated_at: new Date(),
        }

        if (existingId) {
            await prisma.subscription.update({
                where: { id: existingId },
                data: payload,
            })
            return
        }

        await prisma.subscription.create({
            data: {
                user_id: input.userId,
                app_user_id: input.appUserId || null,
                company_id: finalCompanyId,
                subscription_type: subscriptionType,
                payment_provider: 'razorpay',
                tier: input.tier,
                billing_cycle: input.billingCycle,
                amount: new Prisma.Decimal(input.amount),
                currency: input.currency,
                status: 'active',
                start_date: new Date(input.startDate),
                end_date: new Date(input.endDate),
                current_period_start: new Date(input.startDate),
                current_period_end: new Date(input.endDate),
                updated_at: new Date(),
            },
        })
    }

    async extendTrial(subscriptionId: string, baseDate: Date, days: number): Promise<void> {
        const newEndDate = new Date(baseDate)
        newEndDate.setDate(newEndDate.getDate() + days)

        await prisma.subscription.update({
            where: { id: subscriptionId },
            data: {
                status: 'trial',
                is_trial: true,
                trial_ends_at: newEndDate,
                end_date: newEndDate,
                updated_at: new Date(),
            },
        })
    }

    async revokeSubscription(subscriptionId: string): Promise<void> {
        await prisma.subscription.update({
            where: { id: subscriptionId },
            data: {
                status: 'expired',
                trial_ends_at: new Date(),
                end_date: new Date(),
                updated_at: new Date(),
            },
        })
    }

    async grantEnterpriseTrial(userId: string, days: number, appUserId?: string | null): Promise<void> {
        const existing = await prisma.subscription.findFirst({
            where: {
                user_id: userId,
                subscription_type: 'user',
                OR: [
                    { status: 'active' },
                    { is_trial: true }
                ],
                end_date: { gt: new Date() },
            },
        })

        if (existing) {
            throw new Error('User already has an active Enterprise subscription or trial')
        }

        const trialEndDate = new Date()
        trialEndDate.setDate(trialEndDate.getDate() + days)

        await prisma.subscription.create({
            data: {
                user_id: userId,
                app_user_id: appUserId || null,
                company_id: null,
                subscription_type: 'user',
                status: 'trial',
                tier: 'enterprise',
                billing_cycle: 'monthly',
                amount: new Prisma.Decimal(0),
                currency: 'INR',
                is_trial: true,
                trial_started_at: new Date(),
                trial_ends_at: trialEndDate,
                start_date: new Date(),
                end_date: trialEndDate,
            },
        })
    }

    async grantCompanyTrial(userId: string, companyId: string, tier: string, days: number, appUserId?: string | null): Promise<void> {
        const existing = await prisma.subscription.findFirst({
            where: {
                company_id: companyId,
                subscription_type: 'company',
                OR: [
                    { status: 'active' },
                    { is_trial: true }
                ],
                end_date: { gt: new Date() },
            },
        })

        if (existing) {
            throw new Error('Company already has an active subscription or trial')
        }

        const trialEndDate = new Date()
        trialEndDate.setDate(trialEndDate.getDate() + days)

        await prisma.subscription.create({
            data: {
                user_id: userId,
                app_user_id: appUserId || null,
                company_id: companyId,
                subscription_type: 'company',
                status: 'trial',
                tier: tier,
                billing_cycle: 'monthly',
                amount: new Prisma.Decimal(0),
                currency: 'INR',
                is_trial: true,
                trial_started_at: new Date(),
                trial_ends_at: trialEndDate,
                start_date: new Date(),
                end_date: trialEndDate,
            },
        })
    }

    async changeTier(subscriptionId: string, tier: string): Promise<void> {
        await prisma.subscription.update({
            where: { id: subscriptionId },
            data: {
                tier: tier,
                updated_at: new Date(),
            },
        })
    }
}
