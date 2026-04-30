'use client'

import { useState, useEffect, useCallback } from 'react'
import CIAChatPanel from './CIAChatPanel'
import { getCIAOverview, type CIAOverview } from '@/app/data-room/actions-cia'

interface Props {
  companyId: string
}

export default function CIAWidget({ companyId }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const [overview, setOverview] = useState<CIAOverview | null>(null)
  const [showTooltip, setShowTooltip] = useState(false)

  // Fetch overview on mount
  useEffect(() => {
    if (companyId) {
      getCIAOverview(companyId).then(setOverview).catch(() => {})
    }
  }, [companyId])

  // Escape key closes panel
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) setIsOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isOpen])

  const toggleOpen = useCallback(() => setIsOpen(prev => !prev), [])

  return (
    <>
      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6 z-30 flex flex-col items-end gap-3">
        {/* Quick health badge on hover */}
        {showTooltip && overview && !isOpen && (
          <div className="bg-bg-base border border-white/10 rounded-xl px-4 py-3 shadow-2xl animate-fadeIn min-w-[200px]">
            <div className="flex items-center gap-2 mb-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  overview.healthScore >= 70
                    ? 'bg-green-400'
                    : overview.healthScore >= 40
                      ? 'bg-yellow-400'
                      : 'bg-red-400'
                }`}
              />
              <span className="text-xs font-medium text-fg-primary">
                Health: {overview.healthScore}%
              </span>
            </div>
            <div className="text-[10px] text-fg-muted space-y-0.5">
              <p>{overview.completedCount}/{overview.totalRequirements} completed</p>
              {overview.overdueCount > 0 && (
                <p className="text-red-400">{overview.overdueCount} overdue</p>
              )}
              <p>{overview.documentCount} documents uploaded</p>
            </div>
          </div>
        )}

        {/* FAB */}
        <button
          onClick={toggleOpen}
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          className={`group w-14 h-14 rounded-full shadow-lg shadow-blue-500/20 flex items-center justify-center transition-all duration-300 ${
            isOpen
              ? 'bg-white/10 border border-white/20 rotate-45'
              : 'bg-gradient-to-br from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 hover:shadow-xl hover:shadow-blue-500/30 hover:scale-105'
          }`}
        >
          {isOpen ? (
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5l-10 10" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path
                d="M11 2l2 4.5L17.5 8l-3.5 3.5.5 4.5L11 14l-3.5 2 .5-4.5L4.5 8 9 6.5 11 2z"
                fill="white"
                fillOpacity="0.95"
              />
            </svg>
          )}
        </button>
      </div>

      {/* Chat Panel */}
      <CIAChatPanel
        companyId={companyId}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        suggestedQuestions={overview?.suggestedQuestions || [
          'What are my overdue compliances?',
          'What filings are due this month?',
          'What penalties am I facing?',
          'Summarize my uploaded documents',
        ]}
      />

      {/* Global animation styles */}
      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }
        .scrollbar-thin::-webkit-scrollbar {
          width: 4px;
        }
        .scrollbar-thin::-webkit-scrollbar-track {
          background: transparent;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.1);
          border-radius: 2px;
        }
        .scrollbar-thin::-webkit-scrollbar-thumb:hover {
          background: rgba(255,255,255,0.2);
        }
      `}</style>
    </>
  )
}
