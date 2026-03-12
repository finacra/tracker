import { NextRequest, NextResponse } from 'next/server'

/**
 * API route to receive performance logs from client-side
 * In production (Vercel), only logs to console (filesystem is read-only)
 * In development, writes to log files for analysis
 */
export async function POST(request: NextRequest) {
  try {
    const metric = await request.json()

    // Validate metric structure
    if (!metric.timestamp || !metric.component || !metric.operation || typeof metric.duration !== 'number') {
      return NextResponse.json({ error: 'Invalid metric format' }, { status: 400 })
    }

    // Log to console (works in all environments)
    const logMessage = `[PERF] ${metric.component}::${metric.operation} - ${metric.duration}ms${metric.metadata ? ' | ' + JSON.stringify(metric.metadata) : ''}`
    console.log(logMessage)

    // Only write to files in development (Vercel filesystem is read-only)
    if (process.env.NODE_ENV === 'development') {
      try {
        const fs = await import('fs/promises')
        const path = await import('path')

        // Create logs directory if it doesn't exist
        const logDir = path.join(process.cwd(), 'logs')
        await fs.mkdir(logDir, { recursive: true })

        // Write to daily log file
        const logFile = path.join(logDir, `performance-${new Date().toISOString().split('T')[0]}.log`)
        const logLine = `[${metric.timestamp}] ${metric.component}::${metric.operation} - ${metric.duration}ms${metric.metadata ? ' | ' + JSON.stringify(metric.metadata) : ''}\n`

        await fs.appendFile(logFile, logLine, 'utf-8')
      } catch (fileError) {
        // Silently fail file writes - console logging is sufficient
        // This prevents errors in serverless environments
        console.warn('[PerformanceLog API] Could not write to file (this is normal in production):', fileError)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    // Don't return 500 - just log and return success
    // Performance logging failures shouldn't break the app
    console.error('[PerformanceLog API] Error:', error)
    return NextResponse.json({ success: true }) // Return success to prevent client retries
  }
}
