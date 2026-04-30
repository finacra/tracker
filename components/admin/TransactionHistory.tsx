'use client'

import { useState, useEffect } from 'react'
import { getTransactionHistory } from '@/app/admin/payments/actions'

interface Payment {
  id: string
  userId: string
  companyId: string | null
  providerOrderId: string
  providerPaymentId: string | null
  amount: number
  amountPaid: number | null
  currency: string
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  tier: string | null
  billingCycle: string | null
  receipt: string | null
  paymentMethod: string | null
  paidAt: string | null
  errorCode: string | null
  errorDescription: string | null
  createdAt: string
  updatedAt: string
  userEmail?: string
  companyName?: string | null
}

export default function TransactionHistory() {
  const [payments, setPayments] = useState<Payment[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'completed' | 'pending' | 'failed'>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'amount'>('date')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    loadPayments()
  }, [filter, sortBy, sortOrder])

  const loadPayments = async () => {
    setIsLoading(true)
    try {
      const result = await getTransactionHistory({
        status: filter,
        sortBy,
        sortOrder,
      })

      if (!result.success) throw new Error('error' in result ? result.error : 'Failed to load transactions')
      setPayments(result.payments as Payment[])
    } catch (error) {
      console.error('Error loading payments:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredPayments = payments.filter((payment) => {
    if (!searchQuery) return true
    const query = searchQuery.toLowerCase()
    return (
      payment.providerOrderId?.toLowerCase().includes(query) ||
      payment.providerPaymentId?.toLowerCase().includes(query) ||
      payment.userEmail?.toLowerCase().includes(query) ||
      payment.companyName?.toLowerCase().includes(query) ||
      payment.receipt?.toLowerCase().includes(query)
    )
  })

  const stats = {
    total: payments.length,
    completed: payments.filter(p => p.status === 'completed').length,
    pending: payments.filter(p => p.status === 'pending').length,
    failed: payments.filter(p => p.status === 'failed').length,
    totalRevenue: payments
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + (p.amountPaid || p.amount || 0), 0),
  }

  const formatCurrency = (amount: number, currencyCode: string = 'INR') => {
    // Determine locale based on currency
    const locale = currencyCode === 'INR' ? 'en-IN' : 'en-US'
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
    }).format(amount)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-bg-card border border-line/10 rounded-xl p-4">
          <div className="text-sm text-fg-muted mb-1">Total Transactions</div>
          <div className="text-2xl font-light text-white">{stats.total}</div>
        </div>
        <div className="bg-bg-card border border-line/10 rounded-xl p-4">
          <div className="text-sm text-fg-muted mb-1">Completed</div>
          <div className="text-2xl font-light text-green-400">{stats.completed}</div>
        </div>
        <div className="bg-bg-card border border-line/10 rounded-xl p-4">
          <div className="text-sm text-fg-muted mb-1">Pending</div>
          <div className="text-2xl font-light text-yellow-400">{stats.pending}</div>
        </div>
        <div className="bg-bg-card border border-line/10 rounded-xl p-4">
          <div className="text-sm text-fg-muted mb-1">Failed</div>
          <div className="text-2xl font-light text-red-400">{stats.failed}</div>
        </div>
        <div className="bg-bg-card border border-line/10 rounded-xl p-4">
          <div className="text-sm text-fg-muted mb-1">Total Revenue</div>
          <div className="text-2xl font-light text-primary-orange">{formatCurrency(stats.totalRevenue)}</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-bg-card border border-line/10 rounded-xl p-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-fg-secondary">Filter:</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="px-4 py-2 bg-bg-card border border-line/15 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-fg-secondary">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 bg-bg-card border border-line/15 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
            >
              <option value="date">Date</option>
              <option value="amount">Amount</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 bg-bg-card border border-line/15 rounded-lg text-white hover:bg-bg-elevated transition-colors"
              title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
            >
              {sortOrder === 'asc' ? '↑' : '↓'}
            </button>
          </div>

          <div className="flex-1 md:max-w-md">
            <input
              type="text"
              placeholder="Search by Order ID, Payment ID, Email, Company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 bg-bg-card border border-line/15 rounded-lg text-white placeholder:text-fg-muted focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-bg-card border border-line/10 rounded-xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-line/10">
          <h2 className="text-2xl font-light text-white">Transaction History</h2>
        </div>
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary-orange border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-fg-muted">Loading transactions...</p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-12 text-center text-fg-muted">
            No transactions found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-bg-card border-b border-line/10">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Date</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">User</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Company</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Order ID</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Payment ID</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Amount</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Tier</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Billing</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-fg-muted uppercase">Method</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-bg-card/50 transition-colors border-t border-line/10">
                    <td className="px-6 py-4 text-fg-secondary text-sm">
                      {formatDate(payment.createdAt)}
                    </td>
                    <td className="px-6 py-4 text-white text-sm">
                      <div className="max-w-[200px] truncate" title={payment.userEmail}>
                        {payment.userEmail || payment.userId.substring(0, 8) + '...'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-fg-secondary text-sm">
                      {payment.companyName || '-'}
                    </td>
                    <td className="px-6 py-4 text-fg-secondary text-sm font-mono text-xs">
                      <div className="max-w-[150px] truncate" title={payment.providerOrderId}>
                        {payment.providerOrderId}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-fg-secondary text-sm font-mono text-xs">
                      {payment.providerPaymentId ? (
                        <div className="max-w-[150px] truncate" title={payment.providerPaymentId}>
                          {payment.providerPaymentId}
                        </div>
                      ) : (
                        <span className="text-fg-muted">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-white font-medium">
                      {formatCurrency(payment.amountPaid || payment.amount || 0, payment.currency)}
                    </td>
                    <td className="px-6 py-4">
                      {payment.tier ? (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          {payment.tier}
                        </span>
                      ) : (
                        <span className="text-fg-muted text-sm">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {payment.billingCycle ? (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
                          {payment.billingCycle}
                        </span>
                      ) : (
                        <span className="text-fg-muted text-sm">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${payment.status === 'completed'
                          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                          : payment.status === 'pending'
                            ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                            : 'bg-red-500/20 text-red-400 border border-red-500/30'
                        }`}>
                        {payment.status.toUpperCase()}
                      </span>
                      {payment.errorDescription && (
                        <div className="mt-1 text-xs text-red-400 max-w-[200px] truncate" title={payment.errorDescription}>
                          {payment.errorDescription}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-fg-secondary text-sm">
                      {payment.paymentMethod || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
