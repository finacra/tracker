'use client'

import { useState } from 'react'
import Link from 'next/link'
import { submitContactForm } from './actions'

// This page is public and accessible to unauthenticated users
export default function ContactPage() {
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
      <nav className="relative z-10 w-full px-4 sm:px-6 py-4 sm:py-6 border-b border-gray-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <Link href="/home" className="flex items-center gap-2">
            <img
              src="https://aqziojkjtmyecfglifbc.supabase.co/storage/v1/object/public/logo/WhatsApp_Image_2026-02-09_at_18.02.02-removebg-preview.png"
              alt="Finacra Logo"
              className="h-8 w-auto sm:h-10 object-contain"
            />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              href="/home"
              className="text-gray-300 hover:text-white transition-colors font-light text-xs sm:text-sm"
            >
              Back to Home
            </Link>
            <Link
              href="/"
              className="text-gray-300 hover:text-white transition-colors font-light text-xs sm:text-sm"
            >
              Log In
            </Link>
          </div>
        </div>
      </nav>

      {/* Contact Form Section */}
      <section className="flex-1 relative z-10 px-4 sm:px-6 py-12 sm:py-20 md:py-32">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8 sm:mb-12 text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-light text-white mb-4">
              Get in Touch
            </h1>
            <p className="text-gray-400 text-sm sm:text-base font-light">
              Have questions? We'd love to hear from you. Send us a message and we'll respond as soon as possible.
            </p>
          </div>

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

            {/* Alternative Contact Info */}
            <div className="mt-8 pt-8 border-t border-gray-800">
              <p className="text-gray-400 text-sm font-light text-center mb-4">
                Or reach us directly:
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center items-center text-sm">
                <a
                  href="mailto:info@finacra.com"
                  className="text-gray-300 hover:text-white transition-colors font-light"
                >
                  info@finacra.com
                </a>
                <span className="text-gray-600 hidden sm:inline">•</span>
                <a
                  href="tel:+919652974428"
                  className="text-gray-300 hover:text-white transition-colors font-light"
                >
                  +91 96529 74428
                </a>
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
              © 2024 FinacraAI. All rights reserved.
            </span>
            <div className="flex gap-6 sm:gap-8 text-xs sm:text-sm">
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
