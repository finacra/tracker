/**
 * Performance Logger - Writes performance metrics to files
 * This helps identify bottlenecks in the application
 */

interface PerformanceMetric {
  timestamp: string
  component: string
  operation: string
  duration: number // in milliseconds
  metadata?: Record<string, any>
}

class PerformanceLogger {
  private static instance: PerformanceLogger
  private logQueue: PerformanceMetric[] = []
  private flushInterval: NodeJS.Timeout | null = null
  private readonly FLUSH_INTERVAL = 5000 // Flush every 5 seconds
  private readonly MAX_QUEUE_SIZE = 100

  private constructor() {
    // Start periodic flushing
    if (typeof window === 'undefined') {
      // Server-side: flush immediately
      this.flushInterval = setInterval(() => this.flush(), this.FLUSH_INTERVAL)
    }
  }

  static getInstance(): PerformanceLogger {
    if (!PerformanceLogger.instance) {
      PerformanceLogger.instance = new PerformanceLogger()
    }
    return PerformanceLogger.instance
  }

  /**
   * Log a performance metric
   */
  log(component: string, operation: string, duration: number, metadata?: Record<string, any>) {
    const metric: PerformanceMetric = {
      timestamp: new Date().toISOString(),
      component,
      operation,
      duration,
      metadata,
    }

    // Client-side: log to browser console AND send to API
    if (typeof window !== 'undefined') {
      // Log directly to browser console for immediate visibility
      const logMessage = `[PERF] ${component}::${operation} - ${duration.toFixed(2)}ms${metadata ? ' | ' + JSON.stringify(metadata) : ''}`
      console.log(logMessage)
      
      // Also send to API for server-side logging
      this.sendToAPI(metric)
    } else {
      // Server-side: queue for file write
      this.logQueue.push(metric)
      if (this.logQueue.length >= this.MAX_QUEUE_SIZE) {
        this.flush()
      }
    }
  }

  /**
   * Send metric to API route (client-side)
   */
  private async sendToAPI(metric: PerformanceMetric) {
    try {
      await fetch('/api/performance-log', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(metric),
      })
    } catch (error) {
      // Silently fail - don't block the app
      console.error('[PerformanceLogger] Failed to send metric:', error)
    }
  }

  /**
   * Flush logs to file (server-side only)
   */
  private async flush() {
    if (this.logQueue.length === 0) return
    if (typeof window !== 'undefined') {
      // Client-side: don't try to write to files
      // Just log to console
      this.logQueue.forEach(log => {
        console.log(`[PERF] ${log.component}::${log.operation} - ${log.duration}ms${log.metadata ? ' | ' + JSON.stringify(log.metadata) : ''}`)
      })
      this.logQueue = []
      return
    }

    const logs = [...this.logQueue]
    this.logQueue = []

    try {
      const fs = await import('fs/promises')
      const path = await import('path')

      const logDir = path.join(process.cwd(), 'logs')
      await fs.mkdir(logDir, { recursive: true })

      const logFile = path.join(logDir, `performance-${new Date().toISOString().split('T')[0]}.log`)
      const logLines = logs.map(log => 
        `[${log.timestamp}] ${log.component}::${log.operation} - ${log.duration}ms${log.metadata ? ' | ' + JSON.stringify(log.metadata) : ''}`
      ).join('\n') + '\n'

      await fs.appendFile(logFile, logLines, 'utf-8')
      
      // Also log to console for immediate visibility
      logs.forEach(log => {
        console.log(`[PERF] ${log.component}::${log.operation} - ${log.duration}ms${log.metadata ? ' | ' + JSON.stringify(log.metadata) : ''}`)
      })
    } catch (error) {
      console.error('[PerformanceLogger] Failed to write logs:', error)
      // Re-queue logs if write failed
      this.logQueue.unshift(...logs)
    }
  }

  /**
   * Manually flush logs
   */
  async forceFlush() {
    await this.flush()
  }

  /**
   * Cleanup
   */
  destroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval)
    }
    this.forceFlush()
  }
}

// Export singleton instance
export const performanceLogger = PerformanceLogger.getInstance()

/**
 * Helper function to measure performance of an operation
 */
export async function measurePerformance<T>(
  component: string,
  operation: string,
  fn: () => T | Promise<T>,
  metadata?: Record<string, any>
): Promise<T> {
  const startTime = performance.now()
  try {
    const result = await fn()
    const duration = performance.now() - startTime
    performanceLogger.log(component, operation, duration, metadata)
    return result
  } catch (error) {
    const duration = performance.now() - startTime
    performanceLogger.log(component, `${operation}_ERROR`, duration, {
      ...metadata,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Helper function to measure synchronous operations
 */
export function measurePerformanceSync<T>(
  component: string,
  operation: string,
  fn: () => T,
  metadata?: Record<string, any>
): T {
  const startTime = performance.now()
  try {
    const result = fn()
    const duration = performance.now() - startTime
    performanceLogger.log(component, operation, duration, metadata)
    return result
  } catch (error) {
    const duration = performance.now() - startTime
    performanceLogger.log(component, `${operation}_ERROR`, duration, {
      ...metadata,
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
