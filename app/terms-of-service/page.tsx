'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function TermsOfServicePage() {
  useEffect(() => {
    console.log('📄 [TERMS PAGE] Component mounted!')
    console.log('📄 [TERMS PAGE] Current URL:', window.location.href)
    console.log('📄 [TERMS PAGE] Pathname:', window.location.pathname)
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
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
            </div>
            <h1 className="text-5xl font-light text-white">Terms of Service</h1>
          </div>
          <p className="text-gray-400 text-lg">Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</p>
        </div>

        {/* Content */}
        <div className="space-y-8 bg-gradient-to-br from-primary-dark-card to-gray-900 p-8 md:p-12 rounded-2xl border border-gray-800 shadow-2xl">
          <section className="space-y-4">
            <h2 className="text-3xl font-semibold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center text-primary-orange text-lg font-bold">1</span>
              Agreement to Terms
            </h2>
            <p className="text-gray-300 leading-relaxed text-lg">
              By accessing our website and using our services, you agree to be bound by these Terms of Service and to comply with all applicable laws and regulations. If you do not agree with these terms, you are prohibited from using or accessing this site or using any other services provided by <span className="text-primary-navy font-medium">Finacra</span>.
            </p>
          </section>

          <section className="space-y-4 pt-8 border-t border-gray-800">
            <h2 className="text-3xl font-semibold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center text-primary-orange text-lg font-bold">2</span>
              Use License
            </h2>
            <p className="text-gray-300 leading-relaxed text-lg mb-4">
              Permission is granted to temporarily download one copy of the materials (information or software) on Finacra's website for personal, non-commercial transitory viewing only. This is the grant of a license, not a transfer of title, and under this license you may not:
            </p>
            <div className="space-y-3">
              <div className="flex items-start gap-3 bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                <span className="text-red-400 mt-1">✗</span>
                <span className="text-gray-300">Modify or copy the materials</span>
              </div>
              <div className="flex items-start gap-3 bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                <span className="text-red-400 mt-1">✗</span>
                <span className="text-gray-300">Use the materials for any commercial purpose, or for any public display (commercial or non-commercial)</span>
              </div>
              <div className="flex items-start gap-3 bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                <span className="text-red-400 mt-1">✗</span>
                <span className="text-gray-300">Attempt to decompile or reverse engineer any software contained on Finacra's website</span>
              </div>
              <div className="flex items-start gap-3 bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                <span className="text-red-400 mt-1">✗</span>
                <span className="text-gray-300">Remove any copyright or other proprietary notations from the materials</span>
              </div>
              <div className="flex items-start gap-3 bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                <span className="text-red-400 mt-1">✗</span>
                <span className="text-gray-300">Transfer the materials to another person or "mirror" the materials on any other server</span>
              </div>
            </div>
          </section>

          <section className="space-y-4 pt-8 border-t border-gray-800">
            <h2 className="text-3xl font-semibold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center text-primary-orange text-lg font-bold">3</span>
              Service Description
            </h2>
            <p className="text-gray-300 leading-relaxed text-lg mb-4">
              Finacra provides financial compliance management services, including but not limited to:
            </p>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-800">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary-orange">
                      <path d="M9 12l2 2 4-4" />
                      <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9 9 4.03 9 9z" />
                    </svg>
                  </div>
                  <h3 className="text-white font-semibold">Compliance Tracking</h3>
                </div>
                <p className="text-gray-400 text-sm">Regulatory deadline tracking and management</p>
              </div>
              <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-800">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary-orange">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                    </svg>
                  </div>
                  <h3 className="text-white font-semibold">Document Management</h3>
                </div>
                <p className="text-gray-400 text-sm">Secure document storage and organization</p>
              </div>
              <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-800">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary-orange">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                  <h3 className="text-white font-semibold">Reporting</h3>
                </div>
                <p className="text-gray-400 text-sm">AI-powered compliance reports and insights</p>
              </div>
              <div className="bg-gray-900/50 p-5 rounded-xl border border-gray-800">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-primary-orange">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                      <line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                  </div>
                  <h3 className="text-white font-semibold">GST Integration</h3>
                </div>
                <p className="text-gray-400 text-sm">Automated GST return management</p>
              </div>
            </div>
          </section>

          <section className="space-y-4 pt-8 border-t border-gray-800">
            <h2 className="text-3xl font-semibold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center text-primary-orange text-lg font-bold">4</span>
              Disclaimer
            </h2>
            <p className="text-gray-300 leading-relaxed text-lg">
              The materials on Finacra's website are provided on an 'as is' basis. Finacra makes no warranties, expressed or implied, and hereby disclaims and negates all other warranties including, without limitation, implied warranties or conditions of merchantability, fitness for a particular purpose, or non-infringement of intellectual property or other violation of rights.
            </p>
            <div className="bg-yellow-500/10 border border-yellow-500/30 p-5 rounded-xl mt-4">
              <p className="text-gray-300">
                <strong className="text-yellow-400">Important:</strong> While we strive to provide accurate compliance information, you should always verify regulatory requirements with qualified professionals. Finacra is not a substitute for professional legal or financial advice.
              </p>
            </div>
          </section>

          <section className="space-y-4 pt-8 border-t border-gray-800">
            <h2 className="text-3xl font-semibold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center text-primary-orange text-lg font-bold">5</span>
              Limitations
            </h2>
            <p className="text-gray-300 leading-relaxed text-lg">
              In no event shall Finacra or its suppliers be liable for any damages (including, without limitation, damages for loss of data or profit, or due to business interruption) arising out of the use or inability to use the materials on Finacra's website, even if Finacra or a Finacra authorized representative has been notified orally or in writing of the possibility of such damage.
            </p>
          </section>

          <section className="space-y-4 pt-8 border-t border-gray-800">
            <h2 className="text-3xl font-semibold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center text-primary-orange text-lg font-bold">6</span>
              Account Responsibilities
            </h2>
            <div className="space-y-3">
              <div className="bg-gray-900/50 p-4 rounded-lg border border-gray-800">
                <p className="text-white font-medium mb-2">You are responsible for:</p>
                <ul className="space-y-2 text-gray-300 text-sm list-disc list-inside">
                  <li>Maintaining the confidentiality of your account credentials</li>
                  <li>All activities that occur under your account</li>
                  <li>Ensuring the accuracy of information you provide</li>
                  <li>Complying with all applicable laws and regulations</li>
                </ul>
              </div>
            </div>
          </section>

          <section className="space-y-4 pt-8 border-t border-gray-800">
            <h2 className="text-3xl font-semibold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center text-primary-orange text-lg font-bold">7</span>
              Governing Law
            </h2>
            <p className="text-gray-300 leading-relaxed text-lg">
              These terms and conditions are governed by and construed in accordance with the laws of India, and you irrevocably submit to the exclusive jurisdiction of the courts in that location.
            </p>
          </section>

          <section className="space-y-4 pt-8 border-t border-gray-800">
            <h2 className="text-3xl font-semibold text-white mb-4 flex items-center gap-3">
              <span className="w-8 h-8 bg-primary-orange/20 rounded-lg flex items-center justify-center text-primary-orange text-lg font-bold">8</span>
              Contact Us
            </h2>
            <p className="text-gray-300 leading-relaxed text-lg mb-4">
              If you have any questions about these Terms of Service, please contact us:
            </p>
            <div className="bg-gradient-to-r from-primary-orange/10 to-orange-600/10 border border-primary-orange/30 p-6 rounded-xl">
              <p className="text-white font-medium mb-2">Email:</p>
              <a href="mailto:support@finacra.com" className="text-primary-navy hover:text-primary-navy/80 transition-colors text-lg">
                support@finacra.com
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
