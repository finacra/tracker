'use client'

import Link from 'next/link'
import Header from '@/components/Header'

export default function ComingSoonPage() {
  return (
    <div className="min-h-screen bg-primary-dark">
      <Header />
      <div className="flex items-center justify-center min-h-[calc(100vh-80px)] px-4">
        <div className="text-center max-w-2xl">
          <div className="mb-8">
            <h1 className="text-5xl sm:text-6xl md:text-7xl font-light text-white mb-4">
              Coming Soon
            </h1>
            <p className="text-xl sm:text-2xl text-gray-400 font-light mb-8">
              We're working on something amazing
            </p>
            <p className="text-base sm:text-lg text-gray-500 font-light mb-12 leading-relaxed">
              Our compliance marketplace will be available soon. Stay tuned for updates!
            </p>
          </div>
          <Link
            href="/home"
            className="inline-block px-8 py-3 bg-white text-black rounded-lg hover:bg-gray-200 transition-colors font-light text-sm sm:text-base"
          >
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  )
}
