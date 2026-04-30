'use client'

import { useState, useEffect } from 'react'
import { getAllUsersManagementData, type AdminCompanyInput as Company } from '@/app/admin/actions'

interface UserSubscription {
  id: string
  user_id: string
  status: string
  tier: string
  is_trial: boolean
  trial_started_at: string | null
  trial_ends_at: string | null
  start_date: string
  end_date: string
  created_at: string
  billing_cycle: string
  amount: number
  currency: string
}

interface UserRole {
  company_id: string
  company_name: string
  role: string
}

interface UserData {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  companies_owned: Company[]
  team_memberships: UserRole[]
  subscription: UserSubscription | null
}

interface AllUsersManagementProps {
  companies: Company[]
}

export default function AllUsersManagement({ companies }: AllUsersManagementProps) {
  const [users, setUsers] = useState<UserData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterType, setFilterType] = useState<'all' | 'owners' | 'team_only' | 'subscriber' | 'non_subscriber'>('all')
  const [expandedUser, setExpandedUser] = useState<string | null>(null)

  useEffect(() => {
    loadAllUsers()
  }, [companies])

  const loadAllUsers = async () => {
    setIsLoading(true)
    try {
      const result = await getAllUsersManagementData(companies)
      setUsers(result.users as UserData[])
    } catch (error) {
      console.error('Error loading users:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getSubscriptionStatus = (sub: UserSubscription | null): { label: string; color: string; isActive: boolean; isTrial: boolean; isPaid: boolean } => {
    if (!sub) {
      return { label: 'No Subscription', color: 'bg-bg-elevated text-fg-muted border-line/15', isActive: false, isTrial: false, isPaid: false }
    }

    const now = new Date()
    const endDate = sub.trial_ends_at ? new Date(sub.trial_ends_at) : new Date(sub.end_date)

    if (sub.status === 'expired' || endDate < now) {
      return { label: 'Expired', color: 'bg-red-500/20 text-red-400 border-red-500/30', isActive: false, isTrial: false, isPaid: false }
    }

    if (sub.is_trial) {
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return { label: `Trial (${daysLeft}d)`, color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', isActive: true, isTrial: true, isPaid: false }
    }

    return { label: 'Paid', color: 'bg-green-500/20 text-green-400 border-green-500/30', isActive: true, isTrial: false, isPaid: true }
  }

  const getRoleBadge = (role: string) => {
    const colors: { [key: string]: string } = {
      'admin': 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      'editor': 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      'viewer': 'bg-bg-hover text-fg-secondary border-line/30',
      'superadmin': 'bg-red-500/20 text-red-400 border-red-500/30',
    }
    return colors[role] || colors['viewer']
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const filteredUsers = users.filter(user => {
    // Search filter
    const matchesSearch = searchQuery === '' || 
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.companies_owned.some(c => c.name.toLowerCase().includes(searchQuery.toLowerCase())) ||
      user.team_memberships.some(m => m.company_name.toLowerCase().includes(searchQuery.toLowerCase()))

    // Type filter
    if (filterType === 'all') return matchesSearch
    if (filterType === 'owners') return matchesSearch && user.companies_owned.length > 0
    if (filterType === 'team_only') return matchesSearch && user.companies_owned.length === 0 && user.team_memberships.length > 0
    if (filterType === 'subscriber') {
      const status = getSubscriptionStatus(user.subscription)
      return matchesSearch && status.isActive
    }
    if (filterType === 'non_subscriber') {
      const status = getSubscriptionStatus(user.subscription)
      return matchesSearch && !status.isActive
    }

    return matchesSearch
  })

  if (isLoading) {
    return (
      <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl p-12 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary-orange border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-fg-muted">Loading all users...</p>
      </div>
    )
  }

  const hasEmails = users.some(u => u.email.includes('@'))

  // Stats
  const totalOwners = users.filter(u => u.companies_owned.length > 0).length
  const totalTeamOnly = users.filter(u => u.companies_owned.length === 0 && u.team_memberships.length > 0).length
  const totalSubscribers = users.filter(u => getSubscriptionStatus(u.subscription).isActive).length

  return (
    <div className="space-y-6">
      {/* Notice about email lookup */}
      {!hasEmails && users.length > 0 && (
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm">
            <p className="text-blue-300 font-medium">Email lookup not enabled</p>
            <p className="text-blue-400/80 mt-1">
              To display user emails instead of IDs, run the <code className="bg-blue-500/20 px-1.5 py-0.5 rounded">schema-admin-helpers.sql</code> script in your Supabase SQL Editor.
            </p>
          </div>
        </div>
      )}

      {/* Header and Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-light text-white mb-1">All Users</h2>
          <p className="text-fg-muted text-sm">View all users in the system with their companies and subscription status</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by email, ID or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-bg-card border border-line/15 rounded-lg text-white text-sm focus:outline-none focus:border-primary-orange w-72"
            />
          </div>

          {/* Type Filter */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as any)}
            className="px-4 py-2 bg-bg-card border border-line/15 rounded-lg text-white text-sm focus:outline-none focus:border-primary-orange"
          >
            <option value="all">All Users</option>
            <option value="owners">Company Owners</option>
            <option value="team_only">Team Members Only</option>
            <option value="subscriber">With Active Access (Trial/Paid)</option>
            <option value="non_subscriber">No Active Access</option>
          </select>

          {/* Refresh */}
          <button
            onClick={loadAllUsers}
            className="p-2 bg-bg-elevated border border-line/15 rounded-lg text-fg-muted hover:text-white hover:border-line/30 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-bg-card/50 border border-line/10 rounded-xl p-4">
          <div className="text-2xl font-bold text-white">{users.length}</div>
          <div className="text-xs text-fg-muted">Total Users</div>
          <div className="text-[10px] text-fg-muted mt-1">All registered users</div>
        </div>
        <div className="bg-primary-orange/10 border border-primary-orange/30 rounded-xl p-4">
          <div className="text-2xl font-bold text-primary-orange">{totalOwners}</div>
          <div className="text-xs text-primary-orange/80">Company Owners</div>
          <div className="text-[10px] text-primary-orange/60 mt-1">Created companies</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
          <div className="text-2xl font-bold text-blue-400">{totalTeamOnly}</div>
          <div className="text-xs text-blue-400/80">Team Only</div>
          <div className="text-[10px] text-blue-400/60 mt-1">Invited members</div>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <div className="text-2xl font-bold text-yellow-400">
            {users.filter(u => u.subscription?.is_trial && getSubscriptionStatus(u.subscription).isActive).length}
          </div>
          <div className="text-xs text-yellow-400/80">Active Trials</div>
          <div className="text-[10px] text-yellow-400/60 mt-1">Free trial period</div>
        </div>
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <div className="text-2xl font-bold text-green-400">
            {users.filter(u => u.subscription && !u.subscription.is_trial && getSubscriptionStatus(u.subscription).isActive).length}
          </div>
          <div className="text-xs text-green-400/80">Paid Subscribers</div>
          <div className="text-[10px] text-green-400/60 mt-1">Purchased plans</div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <span className="text-fg-muted">Status Legend:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400"></span>
          <span className="text-fg-secondary">Paid Subscriber</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
          <span className="text-fg-secondary">Active Trial</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400"></span>
          <span className="text-fg-secondary">Expired</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-bg-hover"></span>
          <span className="text-fg-secondary">No Subscription</span>
        </span>
      </div>

      {/* Users List */}
      <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="px-6 py-12 text-center text-fg-muted">
            No users found matching your criteria.
          </div>
        ) : (
          <div className="divide-y divide-line/10">
            {filteredUsers.map((user) => {
              const status = getSubscriptionStatus(user.subscription)
              const isExpanded = expandedUser === user.id
              
              return (
                <div key={user.id} className="bg-bg-card">
                  {/* User Row */}
                  <div 
                    className={`px-6 py-4 hover:bg-bg-card/50 transition-colors cursor-pointer ${isExpanded ? 'bg-bg-card/30' : ''}`}
                    onClick={() => setExpandedUser(isExpanded ? null : user.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Expand Icon */}
                        <svg 
                          className={`w-5 h-5 text-fg-muted transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
                          fill="none" 
                          stroke="currentColor" 
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                        
                        {/* User Info */}
                        <div className="w-10 h-10 bg-bg-hover rounded-full flex items-center justify-center">
                          <span className="text-fg-secondary text-sm font-bold">
                            {user.email.includes('@') ? user.email.charAt(0).toUpperCase() : 'U'}
                          </span>
                        </div>
                        <div>
                          <div className="text-white font-medium">
                            {user.email.includes('@') ? user.email : `User ${user.id.substring(0, 8)}...`}
                          </div>
                          <div className="text-fg-muted text-xs flex items-center gap-2">
                            {user.companies_owned.length > 0 && (
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 bg-primary-orange rounded-full"></span>
                                {user.companies_owned.length} owned
                              </span>
                            )}
                            {user.team_memberships.length > 0 && (
                              <span className="flex items-center gap-1">
                                <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
                                {user.team_memberships.length} team
                              </span>
                            )}
                            {user.companies_owned.length === 0 && user.team_memberships.length === 0 && (
                              <span className="text-fg-muted/60">No company associations</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* User Type Badge */}
                        {user.companies_owned.length > 0 ? (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-primary-orange/20 text-primary-orange border border-primary-orange/30">
                            Owner
                          </span>
                        ) : user.team_memberships.length > 0 ? (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-blue-500/20 text-blue-400 border border-blue-500/30">
                            Team Member
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-bg-elevated text-fg-muted border border-line/15">
                            User
                          </span>
                        )}
                        
                        {/* Subscription Status Badge */}
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${status.color}`}>
                          {status.label}
                        </span>
                        
                        {/* Last Sign In */}
                        <div className="text-fg-muted text-xs w-28 text-right hidden md:block">
                          {user.last_sign_in_at ? formatDate(user.last_sign_in_at) : 'Never'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="bg-bg-card/20 border-t border-line/10/50 px-6 py-4">
                      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* User Info */}
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">User Information</h4>
                            <div className="space-y-2 text-sm">
                              <div className="flex justify-between">
                                <span className="text-fg-muted">User ID:</span>
                                <span className="text-white font-mono text-xs">{user.id.substring(0, 16)}...</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-fg-muted">Created:</span>
                                <span className="text-white">{formatDate(user.created_at)}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-fg-muted">Last Sign In:</span>
                                <span className="text-white">{formatDateTime(user.last_sign_in_at)}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Companies Owned */}
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">
                              Companies Owned ({user.companies_owned.length})
                            </h4>
                            {user.companies_owned.length === 0 ? (
                              <p className="text-sm text-fg-muted">No companies owned</p>
                            ) : (
                              <div className="space-y-2">
                                {user.companies_owned.map(company => (
                                  <div 
                                    key={company.id} 
                                    className="flex items-center gap-2 p-2 bg-bg-elevated/30 rounded-lg overflow-hidden"
                                  >
                                    <div className="w-6 h-6 bg-primary-orange/20 rounded flex-shrink-0 flex items-center justify-center">
                                      <svg className="w-3 h-3 text-primary-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                      </svg>
                                    </div>
                                    <div className="flex-1 min-w-0 overflow-hidden">
                                      <div className="text-white text-sm font-medium truncate">{company.name}</div>
                                      <div className="text-fg-muted text-xs">{company.type}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Team Memberships */}
                          <div>
                            <h4 className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">
                              Team Memberships ({user.team_memberships.length})
                            </h4>
                            {user.team_memberships.length === 0 ? (
                              <p className="text-sm text-fg-muted">Not a team member in any company</p>
                            ) : (
                              <div className="space-y-2">
                                {user.team_memberships.map((membership, idx) => (
                                  <div 
                                    key={idx} 
                                    className="flex items-center gap-2 p-2 bg-bg-elevated/30 rounded-lg"
                                  >
                                    <div className="w-6 h-6 bg-blue-500/20 rounded flex-shrink-0 flex items-center justify-center">
                                      <svg className="w-3 h-3 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                      </svg>
                                    </div>
                                    <span className="text-white text-sm truncate flex-1 min-w-0">{membership.company_name}</span>
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium border flex-shrink-0 ${getRoleBadge(membership.role)}`}>
                                      {membership.role}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Subscription Details */}
                        <div>
                          <h4 className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">Subscription Details</h4>
                          {user.subscription ? (
                            <div className="p-4 bg-bg-elevated/30 rounded-lg space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-fg-muted text-sm">Status:</span>
                                <span className={`px-2 py-1 rounded text-xs font-medium border ${status.color}`}>
                                  {status.label}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-fg-muted text-sm">Plan:</span>
                                <span className="text-white text-sm font-medium">
                                  {user.subscription.tier.charAt(0).toUpperCase() + user.subscription.tier.slice(1)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-fg-muted text-sm">Billing Cycle:</span>
                                <span className="text-white text-sm">
                                  {user.subscription.billing_cycle.charAt(0).toUpperCase() + user.subscription.billing_cycle.slice(1)}
                                </span>
                              </div>
                              {user.subscription.amount > 0 && (
                                <div className="flex items-center justify-between">
                                  <span className="text-fg-muted text-sm">Amount:</span>
                                  <span className="text-white text-sm">
                                    {user.subscription.currency === 'INR' ? '₹' : '$'}{user.subscription.amount.toLocaleString()}
                                  </span>
                                </div>
                              )}
                              <div className="flex items-center justify-between">
                                <span className="text-fg-muted text-sm">Is Trial:</span>
                                <span className="text-white text-sm">{user.subscription.is_trial ? 'Yes' : 'No'}</span>
                              </div>
                              {user.subscription.is_trial && user.subscription.trial_started_at && (
                                <div className="flex items-center justify-between">
                                  <span className="text-fg-muted text-sm">Trial Started:</span>
                                  <span className="text-white text-sm">{formatDate(user.subscription.trial_started_at)}</span>
                                </div>
                              )}
                              <div className="flex items-center justify-between">
                                <span className="text-fg-muted text-sm">
                                  {user.subscription.is_trial ? 'Trial Ends:' : 'Expires:'}
                                </span>
                                <span className={`text-sm font-medium ${
                                  status.isActive ? 'text-green-400' : 'text-red-400'
                                }`}>
                                  {formatDate(user.subscription.trial_ends_at || user.subscription.end_date)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between">
                                <span className="text-fg-muted text-sm">Created:</span>
                                <span className="text-white text-sm">{formatDate(user.subscription.created_at)}</span>
                              </div>
                            </div>
                          ) : (
                            <div className="p-4 bg-bg-elevated/30 rounded-lg text-center">
                              <div className="w-12 h-12 mx-auto bg-bg-hover/50 rounded-full flex items-center justify-center mb-3">
                                <svg className="w-6 h-6 text-fg-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                                </svg>
                              </div>
                              <p className="text-fg-muted text-sm">No subscription</p>
                              <p className="text-fg-muted text-xs mt-1">
                                {user.team_memberships.length > 0 
                                  ? 'Access through team membership only'
                                  : 'User has no active plan'
                                }
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
