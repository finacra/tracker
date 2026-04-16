import { NextResponse } from 'next/server'
import { ZodError } from 'zod'
import { AppError, AuthError, ValidationError } from './index'

/**
 * Strip tokens, hashes, connection strings from error messages
 * before logging. Never log raw errors — they may contain secrets.
 */
function safeErrorMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error)
  return msg
    .replace(/eyJ[A-Za-z0-9_-]+/g, '[JWT_REDACTED]')
    .replace(/\$2[aby]\$.+/g, '[HASH_REDACTED]')
    .replace(/postgresql:\/\/[^\s]+/g, '[DB_URL_REDACTED]')
    .replace(/Bearer\s+[^\s]+/g, 'Bearer [REDACTED]')
    .replace(/(?:key|secret|token|password|apikey)["']?\s*[:=]\s*["']?[^\s"',}]+/gi, '[SECRET_REDACTED]')
}

/**
 * Safe error logging — always use this instead of raw console.error.
 */
export function safeLog(context: string, error: unknown): void {
  const message = safeErrorMessage(error)
  const stack = error instanceof Error ? error.stack : undefined
  console.error(`[${context}]`, message, stack ? `\n${safeErrorMessage(stack)}` : '')
}

/**
 * For server actions — returns { success, error } instead of throwing.
 * Never leaks internal error details to the client.
 *
 * Per CLAUDE.md § Debugging rule 9: ALWAYS log the raw error message +
 * stack to Vercel runtime logs before redacting. Without this, Vercel logs
 * look clean while the client sees "Something went wrong" and we loop on
 * "retry while I tail logs". Do not remove these console.error lines.
 */
export function handleActionError(error: unknown): { success: false; error: string } {
  // Global error logger — fires for every error, regardless of class.
  // Always-on because Vercel logs are the only persistent audit trail.
  const rawMessage = error instanceof Error ? error.message : String(error)
  const stack = error instanceof Error ? error.stack : undefined
  console.error(
    '[handleActionError]',
    (error as any)?.constructor?.name || 'UnknownError',
    rawMessage,
    stack || '(no stack)',
  )

  // Zod validation errors — return field-level details
  if (error instanceof ZodError) {
    const messages = error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
    return { success: false, error: messages.join('; ') }
  }

  // Validation errors — safe to expose
  if (error instanceof ValidationError) {
    return { success: false, error: error.message }
  }

  // Auth errors — generic message
  if (error instanceof AuthError) {
    return { success: false, error: 'Please sign in again' }
  }

  // Operational errors — safe to expose message
  if (error instanceof AppError && error.isOperational) {
    return { success: false, error: error.message }
  }

  // Unknown/programmer errors — always logged to Vercel via the global
  // console.error above. On non-production environments we ALSO surface
  // the raw message + top stack frames in the response so the browser
  // console shows the real error without requiring Vercel log access.
  // Strip this before going to prod — gated on VERCEL_ENV !== 'production'.
  safeLog('UnhandledActionError', error)
  if (process.env.VERCEL_ENV !== 'production') {
    const topFrames = stack ? stack.split('\n').slice(1, 4).join(' | ') : ''
    const clsName = (error as any)?.constructor?.name || 'Error'
    return { success: false, error: `DEV[${clsName}] ${rawMessage} :: ${topFrames}` }
  }
  return { success: false, error: 'Something went wrong. Please try again.' }
}

/**
 * For API routes — returns NextResponse with appropriate status code.
 * Never leaks internal error details to the client.
 */
export function handleAPIError(error: unknown): NextResponse {
  // Zod validation errors
  if (error instanceof ZodError) {
    const messages = error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
    return NextResponse.json({ error: messages.join('; ') }, { status: 400 })
  }

  // AppError subclasses — use their status code
  if (error instanceof AppError) {
    if (!error.isOperational) {
      safeLog('ProgrammerError', error)
      return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
    return NextResponse.json({ error: error.message }, { status: error.statusCode })
  }

  // Unknown errors — never leak
  safeLog('UnhandledAPIError', error)
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}
