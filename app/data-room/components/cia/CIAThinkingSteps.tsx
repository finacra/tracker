'use client'

import { type ThinkingStep } from './useCIAChat'

interface Props {
  steps: ThinkingStep[]
}

export default function CIAThinkingSteps({ steps }: Props) {
  if (steps.length === 0) return null

  return (
    <div className="flex flex-col gap-2 px-1 py-2">
      {steps.map(step => (
        <div
          key={step.id}
          className={`flex items-center gap-2.5 text-sm transition-all duration-300 ${
            step.status === 'pending'
              ? 'text-fg-muted opacity-50'
              : step.status === 'active'
                ? 'text-blue-400'
                : 'text-green-400/70'
          }`}
        >
          {/* Status indicator */}
          <div className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
            {step.status === 'active' ? (
              <div className="w-3.5 h-3.5 rounded-full border-2 border-blue-400 border-t-transparent animate-spin" />
            ) : step.status === 'done' ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <circle cx="7" cy="7" r="6" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4.5 7L6.5 9L9.5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              <div className="w-2 h-2 rounded-full bg-fg-muted/40" />
            )}
          </div>

          <span className={`transition-all duration-300 ${step.status === 'done' ? 'line-through opacity-60' : ''}`}>
            {step.label}
          </span>
        </div>
      ))}
    </div>
  )
}
