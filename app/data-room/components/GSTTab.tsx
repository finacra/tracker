'use client'

import React, { useState } from 'react'
import GstRegistrationsSection from './GstRegistrationsSection'

interface Company {
  id: string
  name: string
  type: string
  year: string
  country_code?: string
  region?: string
}

interface GSTTabProps {
  // Data
  currentCompany: Company | null

  // Functions
  formatCurrency: (amount: number, countryCode?: string) => string
}

export default function GSTTab({
  currentCompany,
  formatCurrency,
}: GSTTabProps) {
  // State
  const [gstStep, setGstStep] = useState<'connect' | 'otp' | 'dashboard'>('connect')
  const [gstCredentials, setGstCredentials] = useState({ gstin: '', gstUsername: '' })
  const [gstOtp, setGstOtp] = useState('')
  const [isGstLoading, setIsGstLoading] = useState(false)
  const [gstAuthToken, setGstAuthToken] = useState<string | null>(null)
  const [gstError, setGstError] = useState<string | null>(null)
  const [gstData, setGstData] = useState<any>(null)
  const [selectedGstPeriod, setSelectedGstPeriod] = useState('012026')
  const [gstActiveSection, setGstActiveSection] = useState<'overview' | 'gstr1' | 'gstr2a' | 'gstr2b' | 'gstr3b' | 'ledger'>('overview')

  return (
    <div className="space-y-6">
      {/* Registrations: the authoritative list of this company's GSTINs,
          with state + within/outside classification. Renders independently
          of the portal-integration wizard below. */}
      {currentCompany && <GstRegistrationsSection companyId={currentCompany.id} />}

      {/* GST Integration Flow */}
      {gstStep === 'connect' && (
        <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-8">
          <div className="max-w-lg mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-green-500/20">
                <span className="text-3xl font-bold text-white">GST</span>
              </div>
              <h2 className="text-2xl font-light text-white mb-2">Connect Your GST Account</h2>
              <p className="text-gray-400">Link your GST portal credentials to fetch returns automatically</p>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-4 mb-8">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-black text-sm font-bold">1</div>
                <span className="text-white text-sm">Connect</span>
              </div>
              <div className="h-px w-12 bg-gray-700"></div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-gray-400 text-sm font-bold">2</div>
                <span className="text-gray-400 text-sm">Verify OTP</span>
              </div>
              <div className="h-px w-12 bg-gray-700"></div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-gray-400 text-sm font-bold">3</div>
                <span className="text-gray-400 text-sm">Dashboard</span>
              </div>
            </div>

            {/* Form */}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  GSTIN <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={gstCredentials.gstin}
                  onChange={(e) => setGstCredentials({ ...gstCredentials, gstin: e.target.value.toUpperCase() })}
                  placeholder="Enter your 15-digit GSTIN"
                  maxLength={15}
                  className="w-full px-4 py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors font-mono tracking-wider"
                />
                <p className="mt-1 text-xs text-gray-500">Example: 27AQOPD9471C3ZM</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  GST Portal Username <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={gstCredentials.gstUsername}
                  onChange={(e) => setGstCredentials({ ...gstCredentials, gstUsername: e.target.value })}
                  placeholder="Enter your GST portal username"
                  className="w-full px-4 py-3 bg-black border border-white/20 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                />
              </div>

              {gstError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
                  {gstError}
                </div>
              )}

              <button
                onClick={async () => {
                  if (!gstCredentials.gstin || !gstCredentials.gstUsername) {
                    setGstError('Please enter both GSTIN and Username')
                    return
                  }
                  if (gstCredentials.gstin.length !== 15) {
                    setGstError('GSTIN must be exactly 15 characters')
                    return
                  }
                  setGstError(null)
                  setIsGstLoading(true)
                  // Simulate API call to send OTP
                  await new Promise(resolve => setTimeout(resolve, 1500))
                  setIsGstLoading(false)
                  setGstStep('otp')
                }}
                disabled={isGstLoading}
                className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
              >
                {isGstLoading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Sending OTP...
                  </>
                ) : (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M22 2L11 13" />
                      <path d="M22 2L15 22L11 13L2 9L22 2Z" />
                    </svg>
                    Send OTP
                  </>
                )}
              </button>

              <p className="text-center text-xs text-gray-500">
                By connecting, you agree to share your GST data securely with Finacra
              </p>
            </div>
          </div>
        </div>
      )}

      {gstStep === 'otp' && (
        <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-8">
          <div className="max-w-lg mx-auto">
            {/* Header */}
            <div className="text-center mb-8">
              <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-500/20">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </div>
              <h2 className="text-2xl font-light text-white mb-2">Verify OTP</h2>
              <p className="text-gray-400">Enter the OTP sent to your registered mobile number</p>
            </div>

            {/* Progress Steps */}
            <div className="flex items-center justify-center gap-4 mb-8">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <span className="text-green-400 text-sm">Connect</span>
              </div>
              <div className="h-px w-12 bg-green-500"></div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-white rounded-full flex items-center justify-center text-black text-sm font-bold">2</div>
                <span className="text-white text-sm">Verify OTP</span>
              </div>
              <div className="h-px w-12 bg-gray-700"></div>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-gray-400 text-sm font-bold">3</div>
                <span className="text-gray-400 text-sm">Dashboard</span>
              </div>
            </div>

            {/* OTP Info */}
            <div className="bg-gray-900/50 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <span className="text-green-400 font-bold text-sm">GST</span>
                </div>
                <div>
                  <p className="text-white font-medium">{gstCredentials.gstin}</p>
                  <p className="text-gray-400 text-sm">{gstCredentials.gstUsername}</p>
                </div>
              </div>
            </div>

            {/* OTP Input */}
            <div className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Enter OTP <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={gstOtp}
                  onChange={(e) => setGstOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit OTP"
                  maxLength={6}
                  className="w-full px-4 py-4 bg-gray-900 border border-gray-700 rounded-lg text-white text-center text-2xl font-mono tracking-[0.5em] placeholder-gray-500 focus:outline-none focus:border-white/40 focus:ring-1 focus:ring-white/40 transition-colors"
                />
                <p className="mt-2 text-center text-xs text-gray-500">
                  OTP expires in <span className="text-white">5:00</span> minutes
                </p>
              </div>

              {gstError && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-400 text-sm">
                  {gstError}
                </div>
              )}

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setGstStep('connect')
                    setGstOtp('')
                    setGstError(null)
                  }}
                  className="flex-1 py-4 bg-gray-800 text-gray-300 rounded-lg font-medium hover:bg-gray-700 transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={async () => {
                    if (gstOtp.length !== 6) {
                      setGstError('Please enter a valid 6-digit OTP')
                      return
                    }
                    setGstError(null)
                    setIsGstLoading(true)
                    // Simulate API authentication
                    await new Promise(resolve => setTimeout(resolve, 2000))
                    setGstAuthToken('demo_auth_token_' + Date.now())
                    // Load mock GST data
                    setGstData({
                      gstin: gstCredentials.gstin,
                      tradeName: currentCompany?.name || 'Demo Company',
                      legalName: currentCompany?.name || 'Demo Company Pvt Ltd',
                      status: 'Active',
                      gstr1: {
                        filed: true,
                        filedDate: '2026-01-11',
                        period: '122025',
                        totalInvoices: 156,
                        totalValue: 4523150.00,
                        igst: 287650.00,
                        cgst: 143825.00,
                        sgst: 143825.00,
                        cess: 0
                      },
                      gstr3b: {
                        filed: true,
                        filedDate: '2026-01-20',
                        period: '122025',
                        totalLiability: 575300.00,
                        itcClaimed: 412500.00,
                        taxPaid: 162800.00
                      },
                      cashBalance: {
                        igst: 125180.00,
                        cgst: 62590.00,
                        sgst: 62590.00,
                        cess: 0
                      },
                      itcBalance: {
                        igst: 312500.00,
                        cgst: 156250.00,
                        sgst: 156250.00,
                        cess: 0
                      }
                    })
                    setIsGstLoading(false)
                    setGstStep('dashboard')
                  }}
                  disabled={isGstLoading || gstOtp.length !== 6}
                  className="flex-1 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-medium hover:from-green-600 hover:to-emerald-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-green-500/20"
                >
                  {isGstLoading ? (
                    <>
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Verifying...
                    </>
                  ) : (
                    <>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                      Verify & Connect
                    </>
                  )}
                </button>
              </div>

              <button className="w-full text-center text-sm text-white hover:text-white/80 transition-colors">
                Didn't receive OTP? Resend
              </button>
            </div>
          </div>
        </div>
      )}

      {gstStep === 'dashboard' && gstData && (
        <div className="space-y-6">
          {/* GST Dashboard Header */}
          <div className="bg-primary-dark-card border border-gray-800 rounded-2xl p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-green-500/20">
                  <span className="text-xl font-bold text-white">GST</span>
                </div>
                <div>
                  <h2 className="text-2xl font-light text-white">{gstData.tradeName}</h2>
                  <p className="text-gray-400 font-mono">{gstData.gstin}</p>
                  <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                    <span className="w-1.5 h-1.5 bg-green-400 rounded-full"></span>
                    {gstData.status}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <select
                  value={selectedGstPeriod}
                  onChange={(e) => setSelectedGstPeriod(e.target.value)}
                  className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-white/40"
                >
                  <option value="012026">January 2026</option>
                  <option value="122025">December 2025</option>
                  <option value="112025">November 2025</option>
                  <option value="102025">October 2025</option>
                </select>
                <button
                  onClick={() => {
                    setGstStep('connect')
                    setGstAuthToken(null)
                    setGstData(null)
                    setGstCredentials({ gstin: '', gstUsername: '' })
                    setGstOtp('')
                  }}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors text-sm"
                >
                  Disconnect
                </button>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex flex-wrap gap-2 overflow-x-auto pb-2">
            {[
              { id: 'overview', label: 'Overview', icon: '📊' },
              { id: 'gstr1', label: 'GSTR-1', icon: '📄' },
              { id: 'gstr2a', label: 'GSTR-2A', icon: '📥' },
              { id: 'gstr2b', label: 'GSTR-2B', icon: '📋' },
              { id: 'gstr3b', label: 'GSTR-3B', icon: '📝' },
              { id: 'ledger', label: 'Ledger', icon: '💰' }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setGstActiveSection(tab.id as any)}
                className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap ${gstActiveSection === tab.id
                    ? 'bg-white text-black'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Overview Section */}
          {gstActiveSection === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Cash Balance Card */}
              <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2">
                      <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                      <line x1="1" y1="10" x2="23" y2="10" />
                    </svg>
                  </div>
                  <span className="text-gray-400 text-sm">Cash Balance</span>
                </div>
                <p className="text-2xl font-light text-white mb-2">
                  ₹{(gstData.cashBalance.igst + gstData.cashBalance.cgst + gstData.cashBalance.sgst).toLocaleString('en-IN')}
                </p>
                <div className="text-xs text-gray-500 space-y-1">
                  <div className="flex justify-between"><span>IGST</span><span>₹{gstData.cashBalance.igst.toLocaleString('en-IN')}</span></div>
                  <div className="flex justify-between"><span>CGST</span><span>₹{gstData.cashBalance.cgst.toLocaleString('en-IN')}</span></div>
                  <div className="flex justify-between"><span>SGST</span><span>₹{gstData.cashBalance.sgst.toLocaleString('en-IN')}</span></div>
                </div>
              </div>

              {/* ITC Balance Card */}
              <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-green-500/20 rounded-lg flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2">
                      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                    </svg>
                  </div>
                  <span className="text-gray-400 text-sm">ITC Balance</span>
                </div>
                <p className="text-2xl font-light text-white mb-2">
                  ₹{(gstData.itcBalance.igst + gstData.itcBalance.cgst + gstData.itcBalance.sgst).toLocaleString('en-IN')}
                </p>
                <div className="text-xs text-gray-500 space-y-1">
                  <div className="flex justify-between"><span>IGST</span><span>₹{gstData.itcBalance.igst.toLocaleString('en-IN')}</span></div>
                  <div className="flex justify-between"><span>CGST</span><span>₹{gstData.itcBalance.cgst.toLocaleString('en-IN')}</span></div>
                  <div className="flex justify-between"><span>SGST</span><span>₹{gstData.itcBalance.sgst.toLocaleString('en-IN')}</span></div>
                </div>
              </div>

              {/* GSTR-1 Status Card */}
              <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#A855F7" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <polyline points="14 2 14 8 20 8" />
                      <line x1="16" y1="13" x2="8" y2="13" />
                      <line x1="16" y1="17" x2="8" y2="17" />
                    </svg>
                  </div>
                  <span className="text-gray-400 text-sm">GSTR-1 (Dec 2025)</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${gstData.gstr1.filed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {gstData.gstr1.filed ? 'Filed' : 'Pending'}
                  </span>
                  <span className="text-gray-500 text-xs">{gstData.gstr1.filedDate}</span>
                </div>
                <p className="text-lg font-light text-white">₹{gstData.gstr1.totalValue.toLocaleString('en-IN')}</p>
                <p className="text-xs text-gray-500">{gstData.gstr1.totalInvoices} invoices</p>
              </div>

              {/* GSTR-3B Status Card */}
              <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gray-500/20 rounded-lg flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2">
                      <path d="M9 11l3 3L22 4" />
                      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                    </svg>
                  </div>
                  <span className="text-gray-400 text-sm">GSTR-3B (Dec 2025)</span>
                </div>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`px-2 py-0.5 rounded text-xs ${gstData.gstr3b.filed ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                    {gstData.gstr3b.filed ? 'Filed' : 'Pending'}
                  </span>
                  <span className="text-gray-500 text-xs">{gstData.gstr3b.filedDate}</span>
                </div>
                <p className="text-lg font-light text-white">₹{gstData.gstr3b.taxPaid.toLocaleString('en-IN')}</p>
                <p className="text-xs text-gray-500">Tax paid</p>
              </div>
            </div>
          )}

          {/* GSTR-1 Section */}
          {gstActiveSection === 'gstr1' && (
            <div className="bg-primary-dark-card border border-gray-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-light text-white">GSTR-1 - Outward Supplies</h3>
                  <p className="text-gray-400 text-sm">Return period: December 2025</p>
                </div>
                <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-lg text-sm">Filed on {gstData.gstr1.filedDate}</span>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <p className="text-gray-400 text-xs mb-1">Total Value</p>
                  <p className="text-white text-lg font-light">₹{gstData.gstr1.totalValue.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <p className="text-gray-400 text-xs mb-1">IGST</p>
                  <p className="text-white text-lg font-light">₹{gstData.gstr1.igst.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <p className="text-gray-400 text-xs mb-1">CGST</p>
                  <p className="text-white text-lg font-light">₹{gstData.gstr1.cgst.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <p className="text-gray-400 text-xs mb-1">SGST</p>
                  <p className="text-white text-lg font-light">₹{gstData.gstr1.sgst.toLocaleString('en-IN')}</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <p className="text-gray-400 text-xs mb-1">Invoices</p>
                  <p className="text-white text-lg font-light">{gstData.gstr1.totalInvoices}</p>
                </div>
              </div>

              {/* Sample Invoice Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Invoice No</th>
                      <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Date</th>
                      <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Customer GSTIN</th>
                      <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Value</th>
                      <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Tax</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { inv: 'INV-2025-001', date: '05-12-2025', ctin: '29AABCU9603R1ZJ', val: 125000, tax: 22500 },
                      { inv: 'INV-2025-002', date: '08-12-2025', ctin: '27AAACR5055K1Z7', val: 85000, tax: 15300 },
                      { inv: 'INV-2025-003', date: '12-12-2025', ctin: '33AADCB2230M1ZE', val: 210000, tax: 37800 },
                      { inv: 'INV-2025-004', date: '18-12-2025', ctin: '07AAHCS0973B1ZL', val: 56000, tax: 10080 },
                      { inv: 'INV-2025-005', date: '25-12-2025', ctin: '19AAECI3797E1ZO', val: 175000, tax: 31500 }
                    ].map((row, idx) => (
                      <tr key={idx} className="border-b border-gray-800/50 hover:bg-gray-900/30">
                        <td className="py-3 px-4 text-white font-mono text-sm">{row.inv}</td>
                        <td className="py-3 px-4 text-gray-300 text-sm">{row.date}</td>
                        <td className="py-3 px-4 text-gray-300 font-mono text-sm">{row.ctin}</td>
                        <td className="py-3 px-4 text-white text-sm text-right">₹{row.val.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-green-400 text-sm text-right">₹{row.tax.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* GSTR-2A Section */}
          {gstActiveSection === 'gstr2a' && (
            <div className="bg-primary-dark-card border border-gray-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-light text-white">GSTR-2A - Auto-drafted Inward Supplies</h3>
                  <p className="text-gray-400 text-sm">Return period: December 2025</p>
                </div>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <p className="text-gray-400 text-xs mb-1">Total ITC Available</p>
                  <p className="text-white text-lg font-light">₹412,500</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <p className="text-gray-400 text-xs mb-1">B2B Invoices</p>
                  <p className="text-white text-lg font-light">89</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <p className="text-gray-400 text-xs mb-1">Credit Notes</p>
                  <p className="text-white text-lg font-light">12</p>
                </div>
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <p className="text-gray-400 text-xs mb-1">Amendments</p>
                  <p className="text-white text-lg font-light">3</p>
                </div>
              </div>

              {/* Sample Table */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Supplier GSTIN</th>
                      <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Trade Name</th>
                      <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Invoice</th>
                      <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Taxable Value</th>
                      <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">ITC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { gstin: '29AABCU9603R1ZJ', name: 'ABC Traders', inv: 'ST/001', val: 85000, itc: 15300 },
                      { gstin: '27AAACR5055K1Z7', name: 'XYZ Supplies', inv: 'INV-789', val: 125000, itc: 22500 },
                      { gstin: '33AADCB2230M1ZE', name: 'Tech Solutions', inv: 'TS-456', val: 65000, itc: 11700 }
                    ].map((row, idx) => (
                      <tr key={idx} className="border-b border-gray-800/50 hover:bg-gray-900/30">
                        <td className="py-3 px-4 text-gray-300 font-mono text-sm">{row.gstin}</td>
                        <td className="py-3 px-4 text-white text-sm">{row.name}</td>
                        <td className="py-3 px-4 text-gray-300 text-sm">{row.inv}</td>
                        <td className="py-3 px-4 text-white text-sm text-right">₹{row.val.toLocaleString('en-IN')}</td>
                        <td className="py-3 px-4 text-green-400 text-sm text-right">₹{row.itc.toLocaleString('en-IN')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* GSTR-2B Section */}
          {gstActiveSection === 'gstr2b' && (
            <div className="bg-primary-dark-card border border-gray-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-light text-white">GSTR-2B - ITC Statement</h3>
                  <p className="text-gray-400 text-sm">Return period: December 2025</p>
                </div>
                <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-lg text-sm">Generated on 14-01-2026</span>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* ITC Available */}
                <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-6">
                  <h4 className="text-green-400 font-medium mb-4">ITC Available</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-gray-400 text-xs mb-1">IGST</p>
                      <p className="text-white text-lg">₹156,250</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs mb-1">CGST</p>
                      <p className="text-white text-lg">₹128,125</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs mb-1">SGST</p>
                      <p className="text-white text-lg">₹128,125</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs mb-1">Total</p>
                      <p className="text-green-400 text-lg font-medium">₹412,500</p>
                    </div>
                  </div>
                </div>

                {/* ITC Not Available */}
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-6">
                  <h4 className="text-red-400 font-medium mb-4">ITC Not Available</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-gray-400 text-xs mb-1">IGST</p>
                      <p className="text-white text-lg">₹12,500</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs mb-1">CGST</p>
                      <p className="text-white text-lg">₹6,250</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs mb-1">SGST</p>
                      <p className="text-white text-lg">₹6,250</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs mb-1">Total</p>
                      <p className="text-red-400 text-lg font-medium">₹25,000</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* GSTR-3B Section */}
          {gstActiveSection === 'gstr3b' && (
            <div className="bg-primary-dark-card border border-gray-800 rounded-2xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-light text-white">GSTR-3B - Summary Return</h3>
                  <p className="text-gray-400 text-sm">Return period: December 2025</p>
                </div>
                <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-lg text-sm">Filed on {gstData.gstr3b.filedDate}</span>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <div className="bg-gray-900/50 rounded-xl p-6">
                  <h4 className="text-gray-400 text-sm mb-4">Tax Liability</h4>
                  <p className="text-3xl font-light text-white mb-2">₹{gstData.gstr3b.totalLiability.toLocaleString('en-IN')}</p>
                  <div className="text-xs text-gray-500 space-y-1">
                    <div className="flex justify-between"><span>IGST</span><span>₹287,650</span></div>
                    <div className="flex justify-between"><span>CGST</span><span>₹143,825</span></div>
                    <div className="flex justify-between"><span>SGST</span><span>₹143,825</span></div>
                  </div>
                </div>

                <div className="bg-gray-900/50 rounded-xl p-6">
                  <h4 className="text-gray-400 text-sm mb-4">ITC Claimed</h4>
                  <p className="text-3xl font-light text-green-400 mb-2">₹{gstData.gstr3b.itcClaimed.toLocaleString('en-IN')}</p>
                  <div className="text-xs text-gray-500 space-y-1">
                    <div className="flex justify-between"><span>IGST</span><span>₹206,250</span></div>
                    <div className="flex justify-between"><span>CGST</span><span>₹103,125</span></div>
                    <div className="flex justify-between"><span>SGST</span><span>₹103,125</span></div>
                  </div>
                </div>

                <div className="bg-white/5 border border-white/40/30 rounded-xl p-6">
                  <h4 className="text-gray-400 text-sm mb-4">Tax Paid</h4>
                  <p className="text-3xl font-light text-white mb-2">₹{gstData.gstr3b.taxPaid.toLocaleString('en-IN')}</p>
                  <div className="text-xs text-gray-500 space-y-1">
                    <div className="flex justify-between"><span>Cash</span><span>₹81,400</span></div>
                    <div className="flex justify-between"><span>ITC</span><span>₹81,400</span></div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Ledger Section */}
          {gstActiveSection === 'ledger' && (
            <div className="space-y-6">
              {/* Cash Ledger */}
              <div className="bg-primary-dark-card border border-gray-800 rounded-2xl p-6">
                <h3 className="text-xl font-light text-white mb-6">Cash Ledger</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Date</th>
                        <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Description</th>
                        <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Ref No</th>
                        <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Credit</th>
                        <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Debit</th>
                        <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { date: '01-12-2025', desc: 'Opening Balance', ref: '-', cr: 0, dr: 0, bal: 185360 },
                        { date: '05-12-2025', desc: 'Cash Deposit', ref: 'DC1205250001', cr: 100000, dr: 0, bal: 285360 },
                        { date: '20-12-2025', desc: 'GSTR-3B Payment', ref: 'DC2012250002', cr: 0, dr: 35000, bal: 250360 }
                      ].map((row, idx) => (
                        <tr key={idx} className="border-b border-gray-800/50 hover:bg-gray-900/30">
                          <td className="py-3 px-4 text-gray-300 text-sm">{row.date}</td>
                          <td className="py-3 px-4 text-white text-sm">{row.desc}</td>
                          <td className="py-3 px-4 text-gray-400 font-mono text-sm">{row.ref}</td>
                          <td className="py-3 px-4 text-green-400 text-sm text-right">{row.cr > 0 ? `₹${row.cr.toLocaleString('en-IN')}` : '-'}</td>
                          <td className="py-3 px-4 text-red-400 text-sm text-right">{row.dr > 0 ? `₹${row.dr.toLocaleString('en-IN')}` : '-'}</td>
                          <td className="py-3 px-4 text-white text-sm text-right font-medium">₹{row.bal.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ITC Ledger */}
              <div className="bg-primary-dark-card border border-gray-800 rounded-2xl p-6">
                <h3 className="text-xl font-light text-white mb-6">ITC Ledger</h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-800">
                        <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Date</th>
                        <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Description</th>
                        <th className="text-left py-3 px-4 text-gray-400 text-sm font-medium">Return Period</th>
                        <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Credit</th>
                        <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Debit</th>
                        <th className="text-right py-3 px-4 text-gray-400 text-sm font-medium">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[
                        { date: '01-12-2025', desc: 'Opening Balance', period: '-', cr: 0, dr: 0, bal: 525000 },
                        { date: '11-12-2025', desc: 'ITC from GSTR-3B', period: '112025', cr: 100000, dr: 0, bal: 625000 },
                        { date: '20-12-2025', desc: 'ITC Utilization', period: '122025', cr: 0, dr: 81400, bal: 543600 }
                      ].map((row, idx) => (
                        <tr key={idx} className="border-b border-gray-800/50 hover:bg-gray-900/30">
                          <td className="py-3 px-4 text-gray-300 text-sm">{row.date}</td>
                          <td className="py-3 px-4 text-white text-sm">{row.desc}</td>
                          <td className="py-3 px-4 text-gray-400 text-sm">{row.period}</td>
                          <td className="py-3 px-4 text-green-400 text-sm text-right">{row.cr > 0 ? `₹${row.cr.toLocaleString('en-IN')}` : '-'}</td>
                          <td className="py-3 px-4 text-red-400 text-sm text-right">{row.dr > 0 ? `₹${row.dr.toLocaleString('en-IN')}` : '-'}</td>
                          <td className="py-3 px-4 text-white text-sm text-right font-medium">₹{row.bal.toLocaleString('en-IN')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
