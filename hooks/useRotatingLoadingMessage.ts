'use client'

import { useEffect, useState } from 'react'

interface UseRotatingLoadingMessageOptions {
  /** Whether the loading state is currently active. */
  active: boolean
  /** Pool of messages to rotate through. */
  messages: readonly string[]
  /** Delay before the first rotation kicks in (gives fast loads a stable message). Default 1500ms. */
  initialDelayMs?: number
  /** How often the message changes once rotation starts. Default 2200ms. */
  intervalMs?: number
}

/**
 * Returns a rotating loading message. Stays on the first message for
 * `initialDelayMs` so quick loads don't flash through several. After
 * that, cycles through the pool every `intervalMs`.
 *
 * Use this anywhere a skeleton is shown so the wait feels intentional
 * and informative instead of indeterminate.
 */
export function useRotatingLoadingMessage({
  active,
  messages,
  initialDelayMs = 1500,
  intervalMs = 2200,
}: UseRotatingLoadingMessageOptions): string {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    if (!active) {
      setIndex(0)
      return
    }
    if (messages.length <= 1) return

    let cancelled = false
    let interval: ReturnType<typeof setInterval> | null = null
    const timer = setTimeout(() => {
      if (cancelled) return
      interval = setInterval(() => {
        setIndex((i) => (i + 1) % messages.length)
      }, intervalMs)
    }, initialDelayMs)

    return () => {
      cancelled = true
      clearTimeout(timer)
      if (interval) clearInterval(interval)
    }
  }, [active, messages, initialDelayMs, intervalMs])

  return messages[index] ?? messages[0] ?? ''
}
