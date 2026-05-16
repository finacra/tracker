'use server'

import { createServerContainer } from '@/lib/composition/server-container'
import { prisma } from '@/lib/prisma'
import { handleActionError } from '@/lib/errors/handle-error'
import { CURRENT_TERMS_VERSION, isAcceptanceCurrent } from '@/lib/consent/terms-version'

/**
 * Record the current user's acceptance of the Terms of Service.
 *
 * Stamps `app_users.terms_accepted_at` with NOW() and
 * `terms_version_accepted` with the current version constant so we
 * can demand re-acceptance later by bumping the constant.
 *
 * Idempotent: re-calling for an already-current acceptance is a no-op.
 */
export async function recordTermsAcceptance(): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const { authService } = createServerContainer()
    const user = await authService.requireCurrentUser()

    await prisma.appUser.update({
      where: { id: user.id },
      data: {
        terms_accepted_at: new Date(),
        terms_version_accepted: CURRENT_TERMS_VERSION,
      },
    })

    console.log('[recordTermsAcceptance] ok', {
      userId: user.id,
      version: CURRENT_TERMS_VERSION,
    })

    return { success: true }
  } catch (error) {
    console.error('[recordTermsAcceptance] threw',
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error.stack : '')
    return handleActionError(error)
  }
}

/**
 * Server-side check used by completeOnboarding (and any other action
 * that creates billable / regulated artifacts) to refuse to proceed
 * for users who haven't accepted the current Terms.
 *
 * Returns the acceptance state so callers can include it in error
 * responses ("you need to accept terms — version X is current").
 */
export async function getTermsAcceptanceState(): Promise<{
  acceptedAt: Date | null
  versionAccepted: string | null
  isCurrent: boolean
  currentVersion: string
}> {
  const { authService } = createServerContainer()
  const user = await authService.requireCurrentUser()

  const row = await prisma.appUser.findUnique({
    where: { id: user.id },
    select: { terms_accepted_at: true, terms_version_accepted: true },
  })

  const acceptedAt = row?.terms_accepted_at ?? null
  const versionAccepted = row?.terms_version_accepted ?? null

  return {
    acceptedAt,
    versionAccepted,
    isCurrent: isAcceptanceCurrent(acceptedAt, versionAccepted),
    currentVersion: CURRENT_TERMS_VERSION,
  }
}
