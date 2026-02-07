'use client'

import { useEffect } from 'react'
import Link from 'next/link'

export default function HomePage() {
  useEffect(() => {
    console.log('🏠 [HOME PAGE] Component mounted!')
    console.log('🏠 [HOME PAGE] Current URL:', window.location.href)
    console.log('🏠 [HOME PAGE] Pathname:', window.location.pathname)
  }, [])

  return (
    <div className="min-h-screen bg-primary-dark flex flex-col relative overflow-hidden">
      {/* Navigation */}
      <nav className="relative z-10 w-full px-6 py-6 border-b border-gray-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-primary-orange rounded-lg flex items-center justify-center shadow-lg shadow-primary-orange/30">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-white"
              >
                <path
                  d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="white"
                  fillOpacity="0.1"
                />
                <path
                  d="M14 2V8H20"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-white text-xl font-light">
              Finacra
            </span>
          </div>
          <Link
            href="/"
            className="px-6 py-2 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors font-medium"
          >
            Sign In
          </Link>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-20">
        <div className="max-w-6xl mx-auto">
          {/* Logo Icon */}
          <div className="mb-8 flex justify-center">
            <div className="w-24 h-24 bg-gradient-to-br from-primary-orange to-orange-600 rounded-3xl flex items-center justify-center shadow-2xl shadow-primary-orange/40 animate-pulse">
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-white"
              >
                <path
                  d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="white"
                  fillOpacity="0.1"
                />
                <path
                  d="M14 2V8H20"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <line
                  x1="8"
                  y1="11"
                  x2="16"
                  y2="11"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="8"
                  y1="14"
                  x2="16"
                  y2="14"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
                <line
                  x1="8"
                  y1="17"
                  x2="16"
                  y2="17"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>

          {/* Main Heading */}
          <h1 className="text-6xl md:text-8xl font-thin text-white mb-6 tracking-tight text-center">
            Welcome to{' '}
            <span className="text-white inline-flex items-baseline gap-2">
              <span className="font-light">Finacra</span>
              <span className="bg-gradient-to-r from-primary-orange to-orange-600 text-white px-4 py-2 rounded-xl font-light shadow-lg">
                AI
              </span>
            </span>
          </h1>

          {/* Subheading */}
          <p className="text-2xl md:text-4xl text-gray-300 mb-4 font-light text-center">
            Intelligent Financial Compliance Management
          </p>
          <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-3xl mx-auto text-center leading-relaxed">
            Streamline your regulatory compliance, track deadlines, manage documents, and stay ahead of financial obligations with AI-powered insights.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-20">
            <Link
              href="/"
              className="px-10 py-5 bg-gradient-to-r from-primary-orange to-orange-600 text-white rounded-xl hover:from-primary-orange/90 hover:to-orange-600/90 transition-all font-medium text-lg shadow-2xl shadow-primary-orange/40 hover:shadow-primary-orange/60 transform hover:scale-105"
            >
              Get Started Free
            </Link>
            <Link
              href="#features"
              className="px-10 py-5 border-2 border-gray-700 text-gray-300 rounded-xl hover:border-primary-orange hover:text-primary-orange transition-all font-medium text-lg"
            >
              Learn More
            </Link>
          </div>

          {/* Features Section */}
          <div id="features" className="mt-32 grid md:grid-cols-3 gap-8">
            <div className="bg-gradient-to-br from-primary-dark-card to-gray-900 border border-gray-800 rounded-2xl p-8 hover:border-primary-orange/50 transition-all hover:shadow-xl hover:shadow-primary-orange/10 transform hover:-translate-y-1">
              <div className="w-14 h-14 bg-gradient-to-br from-primary-orange/30 to-orange-600/30 rounded-xl flex items-center justify-center mb-6">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-primary-orange"
                >
                  <path
                    d="M9 12L11 14L15 10M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold text-white mb-4">Compliance Tracking</h3>
              <p className="text-gray-400 leading-relaxed">
                Never miss a deadline. Track all your regulatory requirements, from Income Tax to GST to ROC filings, all in one centralized dashboard.
              </p>
            </div>

            <div className="bg-gradient-to-br from-primary-dark-card to-gray-900 border border-gray-800 rounded-2xl p-8 hover:border-primary-orange/50 transition-all hover:shadow-xl hover:shadow-primary-orange/10 transform hover:-translate-y-1">
              <div className="w-14 h-14 bg-gradient-to-br from-primary-orange/30 to-orange-600/30 rounded-xl flex items-center justify-center mb-6">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-primary-orange"
                >
                  <path
                    d="M9 12H15M9 16H15M17 21H7C5.89543 21 5 20.1046 5 19V5C5 3.89543 5.89543 3 7 3H12.5858C12.851 3 13.1054 3.10536 13.2929 3.29289L18.7071 8.70711C18.8946 8.89464 19 9.149 19 9.41421V19C19 20.1046 18.1046 21 17 21Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold text-white mb-4">Smart Reports</h3>
              <p className="text-gray-400 leading-relaxed">
                Generate comprehensive compliance reports with AI-powered insights, penalty calculations, and business impact analysis.
              </p>
            </div>

            <div className="bg-gradient-to-br from-primary-dark-card to-gray-900 border border-gray-800 rounded-2xl p-8 hover:border-primary-orange/50 transition-all hover:shadow-xl hover:shadow-primary-orange/10 transform hover:-translate-y-1">
              <div className="w-14 h-14 bg-gradient-to-br from-primary-orange/30 to-orange-600/30 rounded-xl flex items-center justify-center mb-6">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                  className="text-primary-orange"
                >
                  <path
                    d="M12 15C13.6569 15 15 13.6569 15 12C15 10.3431 13.6569 9 12 9C10.3431 9 9 10.3431 9 12C9 13.6569 10.3431 15 12 15Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M19.4 15C19.2669 15.3016 19.2272 15.6362 19.286 15.9606C19.3448 16.285 19.4995 16.5843 19.73 16.82L19.79 16.88C19.976 17.0657 20.1235 17.2863 20.2241 17.5291C20.3248 17.7719 20.3766 18.0322 20.3766 18.295C20.3766 18.5578 20.3248 18.8181 20.2241 19.0609C20.1235 19.3037 19.976 19.5243 19.79 19.71C19.6043 19.896 19.3837 20.0435 19.1409 20.1441C18.8981 20.2448 18.6378 20.2966 18.375 20.2966C18.1122 20.2966 17.8519 20.2448 17.6091 20.1441C17.3663 20.0435 17.1457 19.896 16.96 19.71L16.9 19.65C16.6643 19.4195 16.365 19.2648 16.0406 19.206C15.7162 19.1472 15.3816 19.1869 15.08 19.32C14.7842 19.4468 14.532 19.6572 14.3543 19.9255C14.1766 20.1938 14.0813 20.5082 14.08 20.83V21C14.08 21.5304 13.8693 22.0391 13.4942 22.4142C13.1191 22.7893 12.6104 23 12.08 23C11.5496 23 11.0409 22.7893 10.6658 22.4142C10.2907 22.0391 10.08 21.5304 10.08 21V20.91C10.0723 20.579 9.96512 20.258 9.77251 19.9887C9.5799 19.7194 9.31074 19.5143 9 19.4C8.69838 19.2669 8.36381 19.2272 8.03941 19.286C7.71502 19.3448 7.41568 19.4995 7.18 19.73L7.12 19.79C6.93425 19.976 6.71368 20.1235 6.47088 20.2241C6.22808 20.3248 5.96783 20.2966 5.705 20.2966C5.44217 20.2966 5.18192 20.2448 4.93912 20.1441C4.69632 20.0435 4.47575 19.896 4.29 19.71C4.10405 19.5243 3.95653 19.3037 3.85588 19.0609C3.75523 18.8181 3.70343 18.5578 3.70343 18.295C3.70343 18.0322 3.75523 17.7719 3.85588 17.5291C3.95653 17.2863 4.10405 17.0657 4.29 16.88L4.35 16.82C4.58054 16.5843 4.73519 16.285 4.794 15.9606C4.85282 15.6362 4.81312 15.3016 4.68 15C4.55324 14.7042 4.34276 14.452 4.07447 14.2743C3.80618 14.0966 3.49179 14.0013 3.17 14H3C2.46957 14 1.96086 13.7893 1.58579 13.4142C1.21071 13.0391 1 12.5304 1 12C1 11.4696 1.21071 10.9609 1.58579 10.5858C1.96086 10.2107 2.46957 10 3 10H3.09C3.42099 9.99231 3.742 9.88512 4.01131 9.69251C4.28062 9.4999 4.48574 9.23074 4.6 8.92C4.73312 8.61838 4.77282 8.28381 4.714 7.95941C4.65519 7.63502 4.50054 7.33568 4.27 7.1L4.21 7.04C4.02405 6.85425 3.87653 6.63368 3.77588 6.39088C3.67523 6.14808 3.62343 5.88783 3.62343 5.625C3.62343 5.36217 3.67523 5.10192 3.77588 4.85912C3.87653 4.61632 4.02405 4.39575 4.21 4.21C4.39575 4.02405 4.61632 3.87653 4.85912 3.77588C5.10192 3.67523 5.36217 3.62343 5.625 3.62343C5.88783 3.62343 6.14808 3.67523 6.39088 3.77588C6.63368 3.87653 6.85425 4.02405 7.04 4.21L7.1 4.27C7.33568 4.50054 7.63502 4.65519 7.95941 4.714C8.28381 4.77282 8.61838 4.73312 8.92 4.6H9C9.29577 4.47324 9.54802 4.26276 9.72569 3.99447C9.90337 3.72618 9.99872 3.41179 10 3.09V3C10 2.46957 10.2107 1.96086 10.5858 1.58579C10.9609 1.21071 11.4696 1 12 1C12.5304 1 13.0391 1.21071 13.4142 1.58579C13.7893 1.96086 14 2.46957 14 3V3.09C14.0013 3.41179 14.0966 3.72618 14.2743 3.99447C14.452 4.26276 14.7042 4.47324 15 4.6C15.3016 4.73312 15.6362 4.77282 15.9606 4.714C16.285 4.65519 16.5843 4.50054 16.82 4.27L16.88 4.21C17.0657 4.02405 17.2863 3.87653 17.5291 3.77588C17.7719 3.67523 18.0322 3.62343 18.295 3.62343C18.5578 3.62343 18.8181 3.67523 19.0609 3.77588C19.3037 3.87653 19.5243 4.02405 19.71 4.21C19.896 4.39575 20.0435 4.61632 20.1441 4.85912C20.2448 5.10192 20.2966 5.36217 20.2966 5.625C20.2966 5.88783 20.2448 6.14808 20.1441 6.39088C20.0435 6.63368 19.896 6.85425 19.71 7.04L19.65 7.1C19.4195 7.33568 19.2648 7.63502 19.206 7.95941C19.1472 8.28381 19.1869 8.61838 19.32 8.92V9C19.4468 9.29577 19.6572 9.54802 19.9255 9.72569C20.1938 9.90337 20.5082 9.99872 20.83 10H21C21.5304 10 22.0391 10.2107 22.4142 10.5858C22.7893 10.9609 23 11.4696 23 12C23 12.5304 22.7893 13.0391 22.4142 13.4142C22.0391 13.7893 21.5304 14 21 14H20.91C20.5882 14.0013 20.2738 14.0966 20.0055 14.2743C19.7372 14.452 19.5268 14.7042 19.4 15Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="text-2xl font-semibold text-white mb-4">Document Vault</h3>
              <p className="text-gray-400 leading-relaxed">
                Securely store and organize all your compliance documents in one centralized, searchable vault with advanced encryption.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-gray-800 px-6 py-12">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-primary-orange rounded-lg flex items-center justify-center">
              <svg
                  width="20"
                  height="20"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="text-white"
              >
                <path
                  d="M14 2H6C5.46957 2 4.96086 2.21071 4.58579 2.58579C4.21071 2.96086 4 3.46957 4 4V20C4 20.5304 4.21071 21.0391 4.58579 21.4142C4.96086 21.7893 5.46957 22 6 22H18C18.5304 22 19.0391 21.7893 19.4142 21.4142C19.7893 21.0391 20 20.5304 20 20V8L14 2Z"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="white"
                  fillOpacity="0.1"
                />
                <path
                  d="M14 2V8H20"
                  stroke="white"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <span className="text-gray-400 text-sm">
              © 2024 Finacra. All rights reserved.
            </span>
          </div>
            <div className="flex gap-8 text-sm">
              <Link href="/privacy-policy" className="text-gray-400 hover:text-primary-orange transition-colors">
              Privacy Policy
            </Link>
              <Link href="/terms-of-service" className="text-gray-400 hover:text-primary-orange transition-colors">
              Terms of Service
            </Link>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
