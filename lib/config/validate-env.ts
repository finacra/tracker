import { z } from 'zod'

/**
 * Environment Variable Validation
 *
 * Validates all required env vars at startup. App crashes immediately with
 * a clear message if config is wrong, instead of failing at runtime.
 *
 * Import and call validateEnv() in your app's entry point or layout.
 */

// --- Schemas ---

/** Core infrastructure — always required */
const coreSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  DIRECT_URL: z.string().min(1, 'DIRECT_URL is required'),
  SESSION_SECRET: z.string().min(1, 'SESSION_SECRET is required'),
})

/** Supabase — always required */
const supabaseSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'NEXT_PUBLIC_SUPABASE_ANON_KEY is required'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
})

/** Google OAuth — required for authentication */
const authSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
})

/** Optional services — validated only if present */
const optionalSchema = z.object({
  // Site
  NEXT_PUBLIC_SITE_URL: z.string().url().optional(),
  NEXT_PUBLIC_PASSPORT_CALLBACK_URL: z.string().url().optional(),

  // Razorpay (required in production, optional in dev)
  NEXT_PUBLIC_RAZORPAY_KEY_ID: z.string().optional(),
  RAZORPAY_KEY_SECRET: z.string().optional(),
  RAZORPAY_WEBHOOK_SECRET: z.string().optional(),

  // Azure OpenAI
  AZURE_OPENAI_ENDPOINT: z.string().url().optional(),
  AZURE_OPENAI_API_KEY: z.string().optional(),
  AZURE_OPENAI_DEPLOYMENT: z.string().optional(),
  AZURE_OPENAI_API_VERSION: z.string().optional(),
  AZURE_OPENAI_EMBEDDING_DEPLOYMENT: z.string().optional(),

  // Azure Speech
  AZURE_SPEECH_KEY: z.string().optional(),
  AZURE_SPEECH_REGION: z.string().optional(),
  AZURE_SPEECH_VOICE: z.string().optional(),

  // Azure Document Intelligence
  AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: z.string().url().optional(),
  AZURE_DOCUMENT_INTELLIGENCE_KEY: z.string().optional(),

  // KYC verification (CIN/DIN)
  KYC_API_TOKEN_ID: z.string().optional(),
  KYC_API_TOKEN_SECRET: z.string().optional(),

  // AI research
  TAVILY_API_KEY: z.string().optional(),
  PERPLEXITY_API_KEY: z.string().optional(),

  // Email
  RESEND_API_KEY: z.string().optional(),

  // Cron
  CRON_SECRET: z.string().optional(),

  // Storage
  STORAGE_PROVIDER: z.enum(['supabase', 's3']).optional(),
  STORAGE_BUCKET: z.string().optional(),
})

/** Full schema = core + supabase + auth + optional */
const envSchema = coreSchema
  .merge(supabaseSchema)
  .merge(authSchema)
  .merge(optionalSchema)

export type EnvConfig = z.infer<typeof envSchema>

// --- Validation ---

let _validated = false

export function validateEnv(): EnvConfig {
  if (_validated) return envSchema.parse(process.env)

  const result = envSchema.safeParse(process.env)

  if (!result.success) {
    const missing = result.error.issues.map(
      (issue) => `  - ${issue.path.join('.')}: ${issue.message}`
    )
    console.error(
      `\n❌ Environment validation failed:\n${missing.join('\n')}\n\n` +
      `Fix these in .env.local (development) or Vercel Dashboard (production/preview).\n`
    )
    throw new Error(`Missing or invalid environment variables:\n${missing.join('\n')}`)
  }

  _validated = true

  // Production-specific warnings
  if (process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production') {
    const warnings: string[] = []
    if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) warnings.push('NEXT_PUBLIC_RAZORPAY_KEY_ID')
    if (!process.env.RAZORPAY_KEY_SECRET) warnings.push('RAZORPAY_KEY_SECRET')
    if (!process.env.CRON_SECRET) warnings.push('CRON_SECRET')
    if (!process.env.RESEND_API_KEY) warnings.push('RESEND_API_KEY')

    if (warnings.length > 0) {
      console.warn(
        `⚠️  Production warning: optional env vars missing: ${warnings.join(', ')}`
      )
    }
  }

  return result.data
}

/**
 * Get a validated env var with type safety.
 * Use this instead of raw process.env access in new code.
 */
export function getEnv<K extends keyof EnvConfig>(key: K): EnvConfig[K] {
  return validateEnv()[key]
}
