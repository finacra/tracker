'use server'

import { createServerContainer } from '@/lib/composition/server-container'
import { handleActionError } from '@/lib/errors/handle-error'
import { validateCompanyId } from '@/lib/utils/input-validation'
import { prisma } from '@/lib/prisma'
import { GetAccessibleCompanyIds } from '@/application/use-cases/access/GetAccessibleCompanyIds'

export type SubscribeCompanySubscription = {
  hasSubscription: boolean
  tier: string
  isTrial: boolean
  trialDaysRemaining: number
  userLimit: number
} | null

export type SubscribeEligibility = {
  eligible: boolean
  reason: string | null
}

export type SubscribeInitState = {
  companyName: string | null
  userCompanies: Array<{ id: string; name: string }>
  accessibleCompanies: Array<{ id: string; name: string }>
  accessibleCompanyIds: string[]
  subscription: SubscribeCompanySubscription
  eligibility: SubscribeEligibility
}

/**
 * Single batched call replacing 3 sequential useEffect server roundtrips
 * (getCompanySubscriptionState + getSubscribeCompanyContext +
 * getCompanyTrialEligibility) on /subscribe page mount. One container,
 * everything fanned out via Promise.all. Critical-path: previously
 * ~450ms cold (3 × ~150ms with 3 fresh containers + 3 auth lookups).
 */
export async function getSubscribeInitState(
  companyId: string | null
): Promise<{ success: boolean; data?: SubscribeInitState; error?: string }> {
  const validCompanyId = companyId && validateCompanyId(companyId) ? companyId : null

  try {
    const { authService, accessService, companyRepository, subscriptionRepository } = createServerContainer()
    const user = await authService.requireCurrentUser()

    const accessibleIdsUseCase = new GetAccessibleCompanyIds(accessService)

    // First fan-out: things that depend only on the user.
    const [ownedCompanies, accessibleCompanyIds, enterpriseTrialUsed] = await Promise.all([
      companyRepository.listOwnedByUser(user.id),
      accessibleIdsUseCase.execute(user.id),
      subscriptionRepository.hasUsedEnterpriseUserTrial(user.id),
    ])

    const ownedIdSet = new Set(ownedCompanies.map((c) => c.id))
    const accessibleIdSet = new Set(accessibleCompanyIds)

    // Second fan-out: things that depend on the company id (if any).
    const targetCompany = validCompanyId
    const isOwner = targetCompany ? ownedIdSet.has(targetCompany) : false
    const hasAccess = targetCompany ? isOwner || accessibleIdSet.has(targetCompany) : false

    const [accessibleCompaniesFull, companyById, companySubscription, companyTrialUsed] = await Promise.all([
      companyRepository.listByIds(accessibleCompanyIds),
      targetCompany ? companyRepository.getById(targetCompany) : Promise.resolve(null),
      targetCompany ? subscriptionRepository.getCompanySubscriptionState(targetCompany) : Promise.resolve(null),
      targetCompany ? subscriptionRepository.hasUsedCompanyTrial(targetCompany) : Promise.resolve(false),
    ])

    let eligibility: SubscribeEligibility = { eligible: true, reason: null }
    if (enterpriseTrialUsed) {
      eligibility = { eligible: false, reason: 'enterprise_trial_used' }
    } else if (targetCompany) {
      if (!hasAccess) {
        eligibility = { eligible: false, reason: 'unauthorized' }
      } else if (!isOwner) {
        eligibility = { eligible: false, reason: 'requires_owner' }
      } else if (companyTrialUsed) {
        eligibility = { eligible: false, reason: 'company_trial_used' }
      }
    }

    const companyName =
      targetCompany && companyById && (ownedIdSet.has(targetCompany) || accessibleIdSet.has(targetCompany))
        ? companyById.name
        : null

    return {
      success: true,
      data: {
        companyName,
        userCompanies: ownedCompanies.map((c) => ({ id: c.id, name: c.name })),
        accessibleCompanies: accessibleCompaniesFull.map((c) => ({ id: c.id, name: c.name })),
        accessibleCompanyIds,
        subscription: companySubscription,
        eligibility,
      },
    }
  } catch (error) {
    console.error('[SA:getSubscribeInitState] threw',
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error.stack : '')
    return handleActionError(error)
  }
}

/**
 * Lightweight refresh used when the user picks a different company in
 * the dropdown. Re-derives subscription + eligibility for the new
 * company without re-listing all owned/accessible companies.
 */
export async function getSubscribeCompanyState(
  companyId: string | null
): Promise<{
  success: boolean
  data?: { subscription: SubscribeCompanySubscription; eligibility: SubscribeEligibility }
  error?: string
}> {
  if (!companyId) {
    return { success: true, data: { subscription: null, eligibility: { eligible: true, reason: null } } }
  }
  if (!validateCompanyId(companyId)) {
    return { success: false, error: 'Invalid company ID format' }
  }

  try {
    const { authService, accessService, companyRepository, subscriptionRepository } = createServerContainer()
    const user = await authService.requireCurrentUser()
    const accessibleIdsUseCase = new GetAccessibleCompanyIds(accessService)

    const [accessibleCompanyIds, ownedCompanies, enterpriseTrialUsed, subscription, companyTrialUsed, company] = await Promise.all([
      accessibleIdsUseCase.execute(user.id),
      companyRepository.listOwnedByUser(user.id),
      subscriptionRepository.hasUsedEnterpriseUserTrial(user.id),
      subscriptionRepository.getCompanySubscriptionState(companyId),
      subscriptionRepository.hasUsedCompanyTrial(companyId),
      companyRepository.getById(companyId),
    ])

    if (!company) return { success: false, error: 'Company not found' }

    const isOwner = ownedCompanies.some((c) => c.id === companyId)
    const hasAccess = isOwner || accessibleCompanyIds.includes(companyId)

    let eligibility: SubscribeEligibility = { eligible: true, reason: null }
    if (enterpriseTrialUsed) eligibility = { eligible: false, reason: 'enterprise_trial_used' }
    else if (!hasAccess) eligibility = { eligible: false, reason: 'unauthorized' }
    else if (!isOwner) eligibility = { eligible: false, reason: 'requires_owner' }
    else if (companyTrialUsed) eligibility = { eligible: false, reason: 'company_trial_used' }

    return { success: true, data: { subscription, eligibility } }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function createTrialSubscription(targetCompanyId: string | null): Promise<{
  success: boolean
  redirectTo?: string
  error?: string
}> {
  const validCompanyId = targetCompanyId && validateCompanyId(targetCompanyId) ? targetCompanyId : null

  try {
    const { authService, companyRepository, subscriptionRepository } = createServerContainer()
    const user = await authService.requireCurrentUser()

    // Block trial creation until the user's email is confirmed. Google
    // OAuth users are trusted via their Google identity even if the
    // legacy app_users.email_verified flag hasn't converged yet — the
    // same logic the proxy middleware uses for page-level access.
    const emailCheck = await prisma.$queryRaw<Array<{ email_verified: boolean | null; is_google: boolean }>>`
      SELECT
        au.email_verified,
        EXISTS(
          SELECT 1 FROM public.auth_identities ai
          WHERE ai.app_user_id = au.id
            AND ai.provider = 'passport'
            AND ai.legacy_auth_id IS NOT NULL
            AND ai.legacy_auth_id != ''
            AND au.password_hash IS NULL
        ) AS is_google
      FROM public.app_users au
      WHERE au.id = ${user.id}::uuid
      LIMIT 1
    `
    const row = emailCheck[0]
    if (!row || (row.email_verified !== true && !row.is_google)) {
      return { success: false, error: 'Please verify your email before starting a trial.' }
    }

    const ownedCompanies = await companyRepository.listOwnedByUser(user.id)

    if (ownedCompanies.length === 0) {
      try {
        await subscriptionRepository.createUserTrial(user.id, user.canonicalId)
      } catch (trialErr) {
        throw trialErr
      }
      return { success: true, redirectTo: '/onboarding' }
    }

    const finalCompanyId = validCompanyId || ownedCompanies[0]?.id || null
    if (!finalCompanyId) {
      return { success: false, error: 'Please select a company for the trial' }
    }

    const selectedCompany = ownedCompanies.find((company) => company.id === finalCompanyId)
    if (!selectedCompany) {
      return { success: false, error: 'Unauthorized' }
    }

    if (await subscriptionRepository.hasUsedEnterpriseUserTrial(user.id)) {
      return {
        success: false,
        error: 'Your account has already used its Enterprise trial. Please subscribe to continue.',
      }
    }

    if (await subscriptionRepository.hasUsedCompanyTrial(finalCompanyId)) {
      return {
        success: false,
        error: 'This company has already used its trial. Please subscribe to continue.',
      }
    }

    await subscriptionRepository.createCompanyTrial(user.id, finalCompanyId, user.canonicalId)
    // Route through /onboarding — the intended flow is
    //   trial → /onboarding → (optional create company) → /data-room
    // Sending the user straight to /data-room here means any stale
    // access snapshot on the target company (e.g. the trial row hasn't
    // yet propagated through react-query cache) bounces them to the
    // subscription-expired page. /onboarding doesn't do that check —
    // it either shows the create form or the "Go to Data Room" CTA
    // once the limit is reached, both of which tolerate cache lag.
    return { success: true, redirectTo: '/onboarding' }
  } catch (error) {
    return handleActionError(error)
  }
}

