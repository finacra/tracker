'use client'

import { useState, useEffect } from 'react'

export type ToastType = 'success' | 'error' | 'info' | 'warning'

export interface Toast {
  id: string
  message: string
  type: ToastType
  duration?: number
}

interface ToastContextValue {
  toasts: Toast[]
  showToast: (message: string, type?: ToastType, duration?: number) => void
  removeToast: (id: string) => void
}

// Simple toast hook for use in components
let toastListeners: Array<(toast: Toast) => void> = []
let toastIdCounter = 0

export function showToast(message: string, type: ToastType = 'info', duration: number = 5000) {
  const id = `toast-${toastIdCounter++}`
  const toast: Toast = { id, message, type, duration }
  
  toastListeners.forEach(listener => listener(toast))
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const listener = (toast: Toast) => {
      setToasts(prev => [...prev, toast])
      
      // Auto-remove after duration
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

export default function ToastContainer() {
  const { toasts, removeToast } = useToast()

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 max-w-md">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`
            px-4 py-3 rounded-lg shadow-lg border backdrop-blur-sm
            animate-in slide-in-from-top-5 fade-in duration-300
            ${toast.type === 'success' ? 'bg-green-900/90 border-green-700 text-green-100' : ''}
            ${toast.type === 'error' ? 'bg-red-900/90 border-red-700 text-red-100' : ''}
            ${toast.type === 'warning' ? 'bg-yellow-900/90 border-yellow-700 text-yellow-100' : ''}
            ${toast.type === 'info' ? 'bg-blue-900/90 border-blue-700 text-blue-100' : ''}
          `}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm font-light flex-1">{toast.message}</p>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-current opacity-70 hover:opacity-100 transition-opacity flex-shrink-0"
              aria-label="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
