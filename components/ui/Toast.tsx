'use client'

import { useState, useEffect, useRef } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

// ── Global event bus ──────────────────────────────────────────────────────────
let toastListeners: Array<(toast: Toast) => void> = []
let toastIdCounter = 0

export function showToast(message: string, type: ToastType = 'info', duration: number = 4000) {
  const id = `toast-${toastIdCounter++}`
  const toast: Toast = { id, message, type, duration }
  toastListeners.forEach(listener => listener(toast))
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const listener = (toast: Toast) => {
      setToasts(prev => [...prev, toast])
      if (toast.duration && toast.duration > 0) {
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== toast.id))
        }, toast.duration)
      }
    }
    toastListeners.push(listener)
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener)
    }
  }, [])

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  return { toasts, removeToast }
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function ToastIcon({ type }: { type: ToastType }) {
  if (type === 'success') {
    return (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    )
  }
  if (type === 'error') {
    return (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    )
  }
  if (type === 'warning') {
    return (
      <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    )
  }
  // info
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  )
}

// ── Single toast item with countdown bar ──────────────────────────────────────
function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: string) => void }) {
  const duration = toast.duration ?? 4000
  const [progress, setProgress] = useState(100)
  const startTime = useRef(Date.now())
  const frameRef = useRef<number | undefined>(undefined)

  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startTime.current
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100)
      setProgress(remaining)
      if (remaining > 0) {
        frameRef.current = requestAnimationFrame(tick)
      }
    }
    frameRef.current = requestAnimationFrame(tick)
    return () => { if (frameRef.current) cancelAnimationFrame(frameRef.current) }
  }, [duration])

  const colorMap: Record<ToastType, { bg: string; border: string; text: string; bar: string; icon: string }> = {
    success: { bg: 'bg-green-950/95', border: 'border-green-800/60', text: 'text-green-100', bar: 'bg-green-500', icon: 'text-green-400' },
    error:   { bg: 'bg-red-950/95',   border: 'border-red-800/60',   text: 'text-red-100',   bar: 'bg-red-500',   icon: 'text-red-400' },
    warning: { bg: 'bg-amber-950/95', border: 'border-amber-800/60', text: 'text-amber-100', bar: 'bg-amber-500', icon: 'text-amber-400' },
    info:    { bg: 'bg-blue-950/95',  border: 'border-blue-800/60',  text: 'text-blue-100',  bar: 'bg-blue-500',  icon: 'text-blue-400' },
  }
  const c = colorMap[toast.type]

  return (
    <div
      className={`relative overflow-hidden rounded-xl shadow-2xl border backdrop-blur-md ${c.bg} ${c.border} ${c.text} animate-in slide-in-from-right-5 fade-in duration-300`}
      style={{ minWidth: '280px', maxWidth: '420px' }}
      role="alert"
      aria-live="polite"
    >
      <div className="flex items-start gap-3 px-4 py-3">
        <span className={c.icon}>
          <ToastIcon type={toast.type} />
        </span>
        <p className="text-sm font-light flex-1 leading-relaxed">{toast.message}</p>
        <button
          onClick={() => onRemove(toast.id)}
          className="opacity-60 hover:opacity-100 transition-opacity flex-shrink-0 mt-0.5"
          aria-label="Dismiss"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      {/* Countdown progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/10">
        <div
          className={`h-full ${c.bar} transition-none`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  )
}

// ── Container ─────────────────────────────────────────────────────────────────
export default function ToastContainer() {
  const { toasts, removeToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div
      className="fixed top-4 right-4 z-[99999] flex flex-col gap-2 pointer-events-none"
      aria-label="Notifications"
    >
      {toasts.map(toast => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onRemove={removeToast} />
        </div>
      ))}
    </div>
  )
}
