/**
 * Single source of truth for the current Terms of Service version.
 *
 * When the Terms page substantively changes, bump this constant. All
 * existing AppUser rows where `terms_version_accepted` doesn't match
 * the new value will be treated as un-consented and prompted at
 * /onboarding before they can create another company.
 *
 * Use a date stamp (YYYY-MM-DD) so the audit history is human-
 * readable and ordering is unambiguous.
 */
export const CURRENT_TERMS_VERSION = '2026-05-14'

/**
 * True when the recorded acceptance is still current. False means
 * either no acceptance, or the user agreed to an older version and
 * needs to re-accept.
 */
export function isAcceptanceCurrent(
  acceptedAt: Date | string | null | undefined,
  acceptedVersion: string | null | undefined,
): boolean {
  if (!acceptedAt) return false
  return acceptedVersion === CURRENT_TERMS_VERSION
}
