'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RootPage() {
  const router = useRouter()

  useEffect(() => {
    // Redirect root path to /home
    router.replace('/home')
  }, [router])

  // Show loading state while redirecting
  return (
    <div className="min-h-screen bg-primary-dark flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary-orange border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
