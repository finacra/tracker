'use client'

import CircuitBackground from '@/components/ui/CircuitBackground'

export default function DashboardPage() {
  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      <CircuitBackground />
      <div className="relative z-10 container mx-auto px-4 py-8">
        <h1 className="text-4xl font-light text-fg-primary mb-4">Dashboard</h1>
        <p className="text-fg-muted">Welcome! Your company has been created successfully.</p>
      </div>
    </div>
  )
}
