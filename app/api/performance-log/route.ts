import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'

/**
 * API route to receive performance logs from client-side
 * Writes them to log files for analysis
 */
export async function POST(request: NextRequest) {
  try {
    const metric = await request.json()

    // Validate metric structure
    if (!metric.timestamp || !metric.component || !metric.operation || typeof metric.duration !== 'number') {
      return NextResponse.json({ error: 'Invalid metric format' }, { status: 400 })
    }

    // Create logs directory if it doesn't exist
    const logDir = path.join(process.cwd(), 'logs')
    await fs.mkdir(logDir, { recursive: true })

    // Write to daily log file
    const logFile = path.join(logDir, `performance-${new Date().toISOString().split('T')[0]}.log`)
    const logLine = `[${metric.timestamp}] ${metric.component}::${metric.operation} - ${metric.duration}ms${metric.metadata ? ' | ' + JSON.stringify(metric.metadata) : ''}\n`

    await fs.appendFile(logFile, logLine, 'utf-8')

    // Also log to console for immediate visibility in terminal
    console.log(`[PERF] ${metric.component}::${metric.operation} - ${metric.duration}ms${metric.metadata ? ' | ' + JSON.stringify(metric.metadata) : ''}`)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[PerformanceLog API] Error:', error)
    return NextResponse.json(
      { error: 'Failed to log performance metric' },
      { status: 500 }
    )
  }
}
