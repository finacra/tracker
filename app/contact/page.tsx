'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import PublicHeader from '@/components/PublicHeader'
import { submitContactForm } from './actions'

// This page is public and accessible to unauthenticated users
function ContactPageContent() {
  const searchParams = useSearchParams()
  const plan = searchParams.get('plan')
  const source = searchParams.get('source')

  // Debug logging
  if (typeof window !== 'undefined') {
    console.log('📧 [CONTACT PAGE] Component mounted!')
    console.log('📧 [CONTACT PAGE] Current URL:', window.location.href)
    console.log('📧 [CONTACT PAGE] Pathname:', window.location.pathname)
  }

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    company: '',
    phone: '',
    message: ''
  })

  // Pre-fill form based on query parameters
  useEffect(() => {
    if (plan === 'enterprise') {
      setFormData(prev => ({
        ...prev,
        message: prev.message || `I'm interested in learning more about the Enterprise plan. Please contact me to discuss pricing and features.`
      }))
    }
  }, [plan])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle')
  const [errorMessage, setErrorMessage] = useState<string>('')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
    // Clear error when user starts typing
    if (submitStatus === 'error') {
      setSubmitStatus('idle')
      setErrorMessage('')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setSubmitStatus('idle')
    setErrorMessage('')

    try {
      const result = await submitContactForm(formData)

      if (result.success) {
        setSubmitStatus('success')
        // Reset form after showing success
        setTimeout(() => {
          setFormData({ name: '', email: '', company: '', phone: '', message: '' })
          setSubmitStatus('idle')
        }, 5000)
      } else {
        setSubmitStatus('error')
        setErrorMessage(result.error || 'Failed to submit your message. Please try again.')
      }
    } catch (error: any) {
      console.error('Error submitting form:', error)
      setSubmitStatus('error')
      setErrorMessage(error.message || 'An unexpected error occurred. Please try again later.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-primary-dark flex flex-col relative overflow-hidden">
      {/* Navigation Bar */}
      <PublicHeader />
      
      {/* Back Button */}
      <div className="relative z-10 px-4 sm:px-6 pt-4">
        <Link
          href="/home"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors font-light text-sm"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Home
        </Link>
      </div>

      {/* Contact Form Section */}
      <section className="flex-1 relative z-10 px-4 sm:px-6 py-12 sm:py-20 md:py-32">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8 sm:mb-12 text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-light text-white mb-4">
              Get in Touch
            </h1>
            <p className="text-gray-400 text-sm sm:text-base font-light">
              Have questions? We'd love to hear from you. Send us a message and we'll respond as soon as possible.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 sm:gap-8 md:gap-12">
            {/* Left: Contact Form */}
            <div className="bg-[#1a1a1a] border border-gray-800 rounded-xl p-6 sm:p-8 md:p-10">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name */}
              <div>
                <label htmlFor="name" className="block text-sm font-light text-gray-300 mb-2">
                  Name <span className="text-gray-500">*</span>
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#0f0f0f] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors font-light"
                  placeholder="Your name"
                />
              </div>

              {/* Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-light text-gray-300 mb-2">
                  Email <span className="text-gray-500">*</span>
                </label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  required
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#0f0f0f] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors font-light"
                  placeholder="your.email@example.com"
                />
              </div>

              {/* Company */}
              <div>
                <label htmlFor="company" className="block text-sm font-light text-gray-300 mb-2">
                  Company
                </label>
                <input
                  type="text"
                  id="company"
                  name="company"
                  value={formData.company}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#0f0f0f] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors font-light"
                  placeholder="Your company name (optional)"
                />
              </div>

              {/* Phone */}
              <div>
                <label htmlFor="phone" className="block text-sm font-light text-gray-300 mb-2">
                  Phone
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#0f0f0f] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors font-light"
                  placeholder="Your phone number (optional)"
                />
              </div>

              {/* Message */}
              <div>
                <label htmlFor="message" className="block text-sm font-light text-gray-300 mb-2">
                  Message <span className="text-gray-500">*</span>
                </label>
                <textarea
                  id="message"
                  name="message"
                  required
                  rows={6}
                  value={formData.message}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-[#0f0f0f] border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-gray-600 transition-colors font-light resize-none"
                  placeholder="Tell us how we can help you..."
                />
              </div>

              {/* Submit Button */}
              <div>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full px-6 py-3 bg-black border border-gray-700 text-white rounded-lg hover:bg-gray-900 hover:border-gray-600 transition-all duration-300 font-light text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] flex items-center justify-center"
                >
                  {isSubmitting ? (
                    <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  ) : submitStatus === 'success' ? (
                    'Message Sent!'
                  ) : (
                    'Send Message'
                  )}
                </button>
              </div>

              {/* Status Messages */}
              {submitStatus === 'success' && (
                <div className="text-center text-green-400 text-sm font-light">
                  Thank you! Your message has been sent successfully. We'll get back to you soon.
                </div>
              )}
              {submitStatus === 'error' && (
                <div className="text-center text-red-400 text-sm font-light">
                  {errorMessage || 'Something went wrong. Please try again or email us directly at'}{' '}
                  {!errorMessage && (
                    <a href="mailto:info@finacra.com" className="underline hover:text-red-300">
                      info@finacra.com
                    </a>
                  )}
                </div>
              )}
            </form>
            </div>

            {/* Right: Contact Information Card */}
            <div className="bg-gradient-to-br from-[#1a1a1a] to-[#0f0f0f] border border-gray-800 rounded-xl p-6 sm:p-8 md:p-10 shadow-2xl">
              <div className="space-y-8">
                {/* Corporate Header */}
                <div className="pb-6 border-b border-gray-800">
                  <h2 className="text-2xl sm:text-3xl font-light text-white">Corporate</h2>
                </div>

                {/* India Address */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-3 h-3 bg-white rounded-full flex-shrink-0"></div>
                    <h3 className="text-xs font-light text-gray-400 uppercase tracking-widest">India</h3>
                  </div>
                  <div className="pl-6 space-y-2">
                    <p className="text-white font-light text-sm sm:text-base font-medium">
                      Finnogenius Consulting Private Limited,
                    </p>
                    <p className="text-gray-300 font-light leading-relaxed text-sm sm:text-base">
                      4th Floor, Downtown Mall,<br />
                      Lakdikapul, Khairatabad,<br />
                      Hyderabad - 500004, India
                    </p>
                  </div>
                </div>

                {/* USA Address */}
                <div className="space-y-3 pt-6 border-t border-gray-800/50">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-3 h-3 bg-white rounded-full flex-shrink-0"></div>
                    <h3 className="text-xs font-light text-gray-400 uppercase tracking-widest">USA</h3>
                  </div>
                  <div className="pl-6 space-y-2">
                    <p className="text-white font-light text-sm sm:text-base font-medium">
                      RAZR CAPITAL LLC,
                    </p>
                    <p className="text-gray-300 font-light leading-relaxed text-sm sm:text-base">
                      2302 Stillbrooke Lane,<br />
                      Princeton, New Jersey, 08540, United States
                    </p>
                  </div>
                </div>

                {/* Email */}
                <div className="space-y-3 pt-6 border-t border-gray-800">
                  <h3 className="text-xs font-light text-gray-400 uppercase tracking-widest mb-3">Email</h3>
                  <a
                    href="mailto:info@finacra.com"
                    className="text-white hover:text-gray-300 transition-colors font-light text-sm sm:text-base flex items-center gap-2 group"
                  >
                    <svg className="w-4 h-4 text-gray-400 group-hover:text-gray-300 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                    info@finacra.com
                  </a>
                </div>

                {/* Phone */}
                <div className="space-y-4 pt-6 border-t border-gray-800">
                  <h3 className="text-xs font-light text-gray-400 uppercase tracking-widest mb-3">Phone Number</h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <div>
                        <span className="text-white font-light">+91</span>
                        <span className="text-gray-500 font-light ml-2 text-sm">- India</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      <div>
                        <a
                          href="tel:+16693097426"
                          className="text-white hover:text-gray-300 transition-colors font-light"
                        >
                          +1 (669) 309-7426
                        </a>
                        <span className="text-gray-500 font-light ml-2 text-sm">- Global</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-800 px-4 sm:px-6 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <span className="text-gray-400 text-xs sm:text-sm font-light text-center md:text-left">
              © 2026 FinacraAI. All rights reserved.
            </span>
            <div className="flex flex-wrap items-center gap-4 sm:gap-6 text-xs sm:text-sm">
              <Link href="/privacy-policy" className="text-gray-400 hover:text-white transition-colors font-light">
                Privacy Policy
              </Link>
              <Link href="/terms-of-service" className="text-gray-400 hover:text-white transition-colors font-light">
                Terms of Service
              </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

// Force dynamic rendering to avoid build errors
export const dynamic = 'force-dynamic'

export default function ContactPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-primary-dark flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    }>
      <ContactPageContent />
    </Suspense>
  )
}
