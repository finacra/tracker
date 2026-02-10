'use client'

import { useEffect } from 'react'
import Link from 'next/link'

// This page is public and accessible to unauthenticated users
export default function PrivacyPolicyPage() {
  useEffect(() => {
    console.log('🔒 [PRIVACY PAGE] Component mounted!')
    console.log('🔒 [PRIVACY PAGE] Current URL:', window.location.href)
    console.log('🔒 [PRIVACY PAGE] Pathname:', window.location.pathname)
  }, [])

  return (
    <div className="min-h-screen bg-primary-dark text-gray-300 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <Link 
            href="/home" 
            className="text-primary-orange hover:text-primary-orange/80 mb-6 inline-flex items-center gap-2 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
            Back to Home
          </Link>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-primary-orange/20 rounded-xl flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary-orange">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h1 className="text-5xl font-light text-white">Privacy Policy</h1>
          </div>
          <p className="text-gray-400 text-lg">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>

        {/* Content */}
        <div className="space-y-8 bg-gradient-to-br from-primary-dark-card to-gray-900 p-8 md:p-12 rounded-2xl border border-gray-800 shadow-2xl">
          <section className="space-y-4">
            <h2 className="text-3xl font-semibold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center text-primary-orange text-lg font-bold">1</span>
              Introduction
            </h2>
            <p className="text-gray-300 leading-relaxed text-lg">
              Welcome to <span className="text-primary-orange font-medium">Finacra AI</span> ("we," "our," or "us"). We respect your privacy and are committed to protecting your personal data. This privacy policy will inform you as to how we look after your personal data when you visit our website and use our services, and tell you about your privacy rights and how the law protects you.
            </p>
          </section>

          <section className="space-y-4 pt-8 border-t border-gray-800">
            <h2 className="text-3xl font-semibold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center text-primary-orange text-lg font-bold">2</span>
              The Data We Collect
            </h2>
            <p className="text-gray-300 leading-relaxed text-lg mb-4">
              We may collect, use, store and transfer different kinds of personal data about you which we have grouped together as follows:
            </p>
            <div className="space-y-4">
              <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-800">
                <h3 className="text-xl font-semibold text-white mb-2">Identity Data</h3>
                <p className="text-gray-400">Includes first name, last name, username or similar identifier, company name, and director information.</p>
              </div>
              <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-800">
                <h3 className="text-xl font-semibold text-white mb-2">Contact Data</h3>
                <p className="text-gray-400">Includes email address, telephone numbers, and postal addresses.</p>
              </div>
              <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-800">
                <h3 className="text-xl font-semibold text-white mb-2">Technical Data</h3>
                <p className="text-gray-400">Includes internet protocol (IP) address, your login data, browser type and version, time zone setting and location, browser plug-in types and versions, operating system and platform, and other technology on the devices you use to access this website.</p>
              </div>
              <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-800">
                <h3 className="text-xl font-semibold text-white mb-2">Usage Data</h3>
                <p className="text-gray-400">Includes information about how you use our website, products and services, including compliance tracking data and document management activities.</p>
              </div>
            </div>
          </section>

          <section className="space-y-4 pt-8 border-t border-gray-800">
            <h2 className="text-3xl font-semibold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center text-primary-orange text-lg font-bold">3</span>
              How We Use Your Data
            </h2>
            <p className="text-gray-300 leading-relaxed text-lg mb-4">
              We will only use your personal data when the law allows us to. Most commonly, we will use your personal data in the following circumstances:
            </p>
            <ul className="space-y-3 list-none">
              <li className="flex items-start gap-3">
                <span className="text-primary-orange mt-1">✓</span>
                <span className="text-gray-300">Where we need to perform the contract we are about to enter into or have entered into with you.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary-orange mt-1">✓</span>
                <span className="text-gray-300">Where it is necessary for our legitimate interests (or those of a third party) and your interests and fundamental rights do not override those interests.</span>
              </li>
              <li className="flex items-start gap-3">
                <span className="text-primary-orange mt-1">✓</span>
                <span className="text-gray-300">Where we need to comply with a legal obligation.</span>
              </li>
            </ul>
          </section>

          <section className="space-y-4 pt-8 border-t border-gray-800">
            <h2 className="text-3xl font-semibold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center text-primary-orange text-lg font-bold">4</span>
              Data Security
            </h2>
            <p className="text-gray-300 leading-relaxed text-lg">
              We have put in place appropriate security measures to prevent your personal data from being accidentally lost, used or accessed in an unauthorised way, altered or disclosed. In addition, we limit access to your personal data to those employees, agents, contractors and other third parties who have a business need to know. They will only process your personal data on our instructions and they are subject to a duty of confidentiality.
            </p>
            <div className="bg-primary-orange/10 border border-primary-orange/30 p-5 rounded-xl mt-4">
              <p className="text-gray-300">
                <strong className="text-primary-orange">Note:</strong> We use industry-standard encryption and security protocols to protect your data. All compliance documents and sensitive information are stored securely with access controls.
              </p>
            </div>
          </section>

          <section className="space-y-4 pt-8 border-t border-gray-800">
            <h2 className="text-3xl font-semibold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center text-primary-orange text-lg font-bold">5</span>
              Your Rights
            </h2>
            <p className="text-gray-300 leading-relaxed text-lg mb-4">
              Under certain circumstances, you have rights under data protection laws in relation to your personal data:
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                <p className="text-white font-medium">Right to Access</p>
                <p className="text-gray-400 text-sm mt-1">Request access to your personal data</p>
              </div>
              <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                <p className="text-white font-medium">Right to Rectification</p>
                <p className="text-gray-400 text-sm mt-1">Request correction of your personal data</p>
              </div>
              <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                <p className="text-white font-medium">Right to Erasure</p>
                <p className="text-gray-400 text-sm mt-1">Request deletion of your personal data</p>
              </div>
              <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                <p className="text-white font-medium">Right to Data Portability</p>
                <p className="text-gray-400 text-sm mt-1">Request transfer of your data</p>
              </div>
            </div>
          </section>

          <section className="space-y-4 pt-8 border-t border-gray-800">
            <h2 className="text-3xl font-semibold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center text-primary-orange text-lg font-bold">6</span>
              Contact Us
            </h2>
            <p className="text-gray-300 leading-relaxed text-lg">
              If you have any questions about this privacy policy or our privacy practices, please contact us at:
            </p>
            <div className="bg-gradient-to-r from-primary-orange/10 to-orange-600/10 border border-primary-orange/30 p-6 rounded-xl">
              <p className="text-white font-medium mb-2">Email:</p>
              <a href="mailto:support@finnovate.ai" className="text-primary-orange hover:text-primary-orange/80 transition-colors text-lg">
                support@finnovate.ai
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
