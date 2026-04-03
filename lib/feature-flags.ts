/**
 * Feature Flag System
 *
 * Controls feature availability per environment.
 * Override any flag with env var: FEATURE_<FLAG_NAME>=true|false
 *
 * Usage:
 *   import { isFeatureEnabled } from '@/lib/feature-flags'
 *   {isFeatureEnabled('SEBI_COMPLIANCE') && <SEBITab />}
 */

export type FeatureFlag =
  | 'SEBI_COMPLIANCE'
  | 'CIA_V2'
  | 'MULTI_COUNTRY'
  | 'REAL_TIME_NOTIFICATIONS'
  | 'ADVANCED_REPORTS'
  | 'BULK_UPLOAD_V2'

type Environment = 'development' | 'preview' | 'production'

const FLAGS: Record<FeatureFlag, {
  description: string
  enabledIn: Environment[]
}> = {
  SEBI_COMPLIANCE: {
    description: 'SEBI compliance module for listed companies',
    enabledIn: ['development', 'preview'],
  },
  CIA_V2: {
    description: 'Next-generation Compliance Intelligence Assistant',
    enabledIn: ['development', 'preview'],
  },
  MULTI_COUNTRY: {
    description: 'Multi-country compliance support (UAE, Saudi, etc.)',
    enabledIn: ['development', 'preview'],
  },
  REAL_TIME_NOTIFICATIONS: {
    description: 'WebSocket/SSE push notifications for deadlines',
    enabledIn: ['development'],
  },
  ADVANCED_REPORTS: {
    description: 'Advanced compliance reporting and analytics',
    enabledIn: ['development', 'preview'],
  },
  BULK_UPLOAD_V2: {
    description: 'Next-generation bulk requirement upload with AI parsing',
    enabledIn: ['development', 'preview'],
  },
}

function getCurrentEnvironment(): Environment {
  if (process.env.NODE_ENV === 'development') return 'development'
  if (process.env.VERCEL_ENV === 'preview') return 'preview'
  return 'production'
}

export function isFeatureEnabled(flag: FeatureFlag): boolean {
  const envOverride = process.env[`FEATURE_${flag}`]
  if (envOverride === 'true') return true
  if (envOverride === 'false') return false

  const config = FLAGS[flag]
  if (!config) return false

  return config.enabledIn.includes(getCurrentEnvironment())
}

export function getEnabledFeatures(): FeatureFlag[] {
  return (Object.keys(FLAGS) as FeatureFlag[]).filter(isFeatureEnabled)
}

export function getAllFlags(): Record<FeatureFlag, { description: string; enabled: boolean }> {
  const env = getCurrentEnvironment()
  return Object.fromEntries(
    (Object.entries(FLAGS) as [FeatureFlag, typeof FLAGS[FeatureFlag]][]).map(([flag, config]) => [
      flag,
      { description: config.description, enabled: isFeatureEnabled(flag) },
    ])
  ) as Record<FeatureFlag, { description: string; enabled: boolean }>
}
