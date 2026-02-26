'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

interface Payment {
  id: string
  user_id: string
  company_id: string | null
  provider_order_id: string
  provider_payment_id: string | null
  amount: number
  amount_paid: number | null
  currency: string
  status: 'pending' | 'completed' | 'failed'
  tier: string | null
  billing_cycle: string | null
  receipt: string | null
  payment_method: string | null
  paid_at: string | null
  error_code: string | null
  error_description: string | null
  created_at: string
  updated_at: string
  user_email?: string
  company_name?: string
}

interface TransactionHistoryProps {
  supabase: ReturnType<typeof createClient>
}

export default function TransactionHistory({ supabase }: TransactionHistoryProps) {
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
      let query = supabase
        .from('payments')
        .select('*')
        .order(sortBy === 'date' ? 'created_at' : 'amount', { ascending: sortOrder === 'asc' })

      if (filter !== 'all') {
        query = query.eq('status', filter)
      }

      const { data, error } = await query

      if (error) throw error

      // Fetch user emails and company names
      const userIds = [...new Set((data || []).map(p => p.user_id))]
      const companyIds = [...new Set((data || []).map(p => p.company_id).filter(Boolean))]

      // Try to get user emails via RPC
      let userEmailsMap: Record<string, string> = {}
      try {
        const { data: rpcData } = await supabase.rpc('get_users_by_ids', {
          user_ids: userIds
        })
        if (rpcData && Array.isArray(rpcData)) {
          rpcData.forEach((user: any) => {
            if (user.id && user.email) {
              userEmailsMap[user.id] = user.email
            }
          })
        }
      } catch (error) {
        console.log('RPC get_users_by_ids not available, using user IDs')
      }

      // Get company names
      let companyNamesMap: Record<string, string> = {}
      if (companyIds.length > 0) {
        try {
          const { data: companyData } = await supabase
            .from('companies')
            .select('id, name')
            .in('id', companyIds)

          if (companyData) {
            companyData.forEach((company: any) => {
              companyNamesMap[company.id] = company.name
            })
          }
        } catch (error) {
          console.error('Error fetching company names:', error)
        }
      }

      const enrichedPayments = (data || []).map((payment) => ({
        ...payment,
        user_email: userEmailsMap[payment.user_id] || payment.user_id.substring(0, 8) + '...',
        company_name: payment.company_id ? (companyNamesMap[payment.company_id] || null) : null,
      }))

      setPayments(enrichedPayments)
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
      payment.provider_order_id?.toLowerCase().includes(query) ||
      payment.provider_payment_id?.toLowerCase().includes(query) ||
      payment.user_email?.toLowerCase().includes(query) ||
      payment.company_name?.toLowerCase().includes(query) ||
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
      .reduce((sum, p) => sum + (p.amount_paid || p.amount || 0), 0),
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
        <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-4">
          <div className="text-sm text-gray-400 mb-1">Total Transactions</div>
          <div className="text-2xl font-light text-white">{stats.total}</div>
        </div>
        <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-4">
          <div className="text-sm text-gray-400 mb-1">Completed</div>
          <div className="text-2xl font-light text-green-400">{stats.completed}</div>
        </div>
        <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-4">
          <div className="text-sm text-gray-400 mb-1">Pending</div>
          <div className="text-2xl font-light text-yellow-400">{stats.pending}</div>
        </div>
        <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-4">
          <div className="text-sm text-gray-400 mb-1">Failed</div>
          <div className="text-2xl font-light text-red-400">{stats.failed}</div>
        </div>
        <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-4">
          <div className="text-sm text-gray-400 mb-1">Total Revenue</div>
          <div className="text-2xl font-light text-primary-orange">{formatCurrency(stats.totalRevenue)}</div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-4">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-300">Filter:</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as any)}
              className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
            </select>
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-300">Sort by:</label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
            >
              <option value="date">Date</option>
              <option value="amount">Amount</option>
            </select>
            <button
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white hover:bg-gray-800 transition-colors"
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
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
            />
          </div>
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-primary-dark-card border border-gray-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-gray-800">
          <h2 className="text-2xl font-light text-white">Transaction History</h2>
        </div>
        {isLoading ? (
          <div className="p-12 flex flex-col items-center justify-center">
            <div className="w-10 h-10 border-4 border-primary-orange border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="text-gray-400">Loading transactions...</p>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            No transactions found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-900 border-b border-gray-800">
                <tr>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Date</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">User</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Company</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Order ID</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Payment ID</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Amount</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Tier</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Billing</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                  <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Method</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-900/50 transition-colors border-t border-gray-800">
                    <td className="px-6 py-4 text-gray-300 text-sm">
                      {formatDate(payment.created_at)}
                    </td>
                    <td className="px-6 py-4 text-white text-sm">
                      <div className="max-w-[200px] truncate" title={payment.user_email}>
                        {payment.user_email || payment.user_id.substring(0, 8) + '...'}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-300 text-sm">
                      {payment.company_name || '-'}
                    </td>
                    <td className="px-6 py-4 text-gray-300 text-sm font-mono text-xs">
                      <div className="max-w-[150px] truncate" title={payment.provider_order_id}>
                        {payment.provider_order_id}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-300 text-sm font-mono text-xs">
                      {payment.provider_payment_id ? (
                        <div className="max-w-[150px] truncate" title={payment.provider_payment_id}>
                          {payment.provider_payment_id}
                        </div>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-white font-medium">
                      {formatCurrency(payment.amount_paid || payment.amount || 0, payment.currency)}
                    </td>
                    <td className="px-6 py-4">
                      {payment.tier ? (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                          {payment.tier}
                        </span>
                      ) : (
                        <span className="text-gray-500 text-sm">-</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {payment.billing_cycle ? (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-400 border border-purple-500/30">
                          {payment.billing_cycle}
                        </span>
                      ) : (
                        <span className="text-gray-500 text-sm">-</span>
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
                      {payment.error_description && (
                        <div className="mt-1 text-xs text-red-400 max-w-[200px] truncate" title={payment.error_description}>
                          {payment.error_description}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-300 text-sm">
                      {payment.payment_method || '-'}
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
