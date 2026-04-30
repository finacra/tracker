'use client'

import { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'
import { 
  getUsersManagementData, 
  extendSubscriptionTrialAction, 
  revokeSubscriptionAction, 
  grantEnterpriseTrialAction, 
  grantCompanyTrialAction, 
  changeSubscriptionTierAction,
  type AdminCompanyInput as Company
} from '@/app/admin/actions'

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
}

interface TeamMember {
  user_id: string
  email: string
  role: string
}

interface CompanySubscription {
  id: string
  company_id: string
  status: string
  tier: string
  is_trial: boolean
  trial_ends_at: string | null
  end_date: string
  subscription_type: string
}

interface CompanyWithTeam extends Company {
  team_members: TeamMember[]
  subscription: CompanySubscription | null
  has_used_trial: boolean
}

interface UserWithDetails {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  companies_owned: CompanyWithTeam[]
  subscription: UserSubscription | null
  invited_to: { company_id: string; company_name: string; role: string }[]
  has_used_enterprise_trial: boolean
}

interface UsersManagementProps {
  companies: Company[]
}

export default function UsersManagement({ companies }: UsersManagementProps) {
  const [users, setUsers] = useState<UserWithDetails[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'trial' | 'expired' | 'none'>('all')
  
  // Expanded state - can be user ID, or "user_id:company_id" for company expansion
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [expandedCompany, setExpandedCompany] = useState<string | null>(null)
  
  // Trial management state
  const [extendDays, setExtendDays] = useState<{ [key: string]: number }>({})
  const [isExtending, setIsExtending] = useState<{ [key: string]: boolean }>({})
  const [isRevoking, setIsRevoking] = useState<{ [key: string]: boolean }>({})
  const [isRevokingCompany, setIsRevokingCompany] = useState<{ [key: string]: boolean }>({})
  const [isGranting, setIsGranting] = useState<{ [key: string]: boolean }>({})
  const [isGrantingCompany, setIsGrantingCompany] = useState<{ [key: string]: boolean }>({})
  const [companyExtendDays, setCompanyExtendDays] = useState<{ [key: string]: number }>({})
  const [companyTier, setCompanyTier] = useState<{ [key: string]: 'starter' | 'professional' }>({})
  const [isChangingTier, setIsChangingTier] = useState<{ [key: string]: boolean }>({})
  const [isExtendingCompany, setIsExtendingCompany] = useState<{ [key: string]: boolean }>({})
  
  useEffect(() => {
    loadUsers()
  }, [companies])

  const loadUsers = async () => {
    setIsLoading(true)
    try {
      const result = await getUsersManagementData(companies)
      setUsers(result.users as UserWithDetails[])
    } catch (error) {
      console.error('Error loading users:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExtendTrial = async (userId: string, subscriptionId: string) => {
    const days = extendDays[userId] || 15
    if (days < 1 || days > 365) {
      alert('Please enter a valid number of days (1-365)')
      return
    }

    setIsExtending(prev => ({ ...prev, [userId]: true }))
    try {
      await extendSubscriptionTrialAction(subscriptionId, days)
      alert(`Trial extended by ${days} days.\n\nThis affects the owner and all team members of their companies.`)
      await loadUsers()
    } catch (err) {
      alert(`Failed to extend trial: ${err instanceof Error ? err.message : 'Something went wrong'}`)
    } finally {
      setIsExtending(prev => ({ ...prev, [userId]: false }))
    }
  }

  const handleRevokeTrial = async (userId: string, subscriptionId: string) => {
    const user = users.find(u => u.id === userId)
    const teamMemberCount = user?.companies_owned.reduce((sum, c) => sum + c.team_members.length, 0) || 0
    
    if (!confirm(`Are you sure you want to revoke this trial?\n\nThis will:\n• Remove access for this user\n• Remove access for ${teamMemberCount} team member(s) across ${user?.companies_owned.length || 0} company(ies)`)) {
      return
    }

    setIsRevoking(prev => ({ ...prev, [userId]: true }))
    try {
      await revokeSubscriptionAction(subscriptionId)
      alert('Trial revoked successfully. The owner and all team members have lost access.')
      await loadUsers()
    } catch (err) {
      alert(`Failed to revoke trial: ${err instanceof Error ? err.message : 'Something went wrong'}`)
    } finally {
      setIsRevoking(prev => ({ ...prev, [userId]: false }))
    }
  }

  const handleRevokeCompanySubscription = async (companyId: string, subscriptionId: string, companyName: string) => {
    let teamMemberCount = 0
    users.forEach(u => {
      const company = u.companies_owned.find(c => c.id === companyId)
      if (company) {
        teamMemberCount = company.team_members.length
      }
    })
    
    if (!confirm(`Are you sure you want to revoke the subscription for "${companyName}"?\n\nThis will:\n• Remove access for this company\n• Remove access for ${teamMemberCount} team member(s) in this company`)) {
      return
    }

    setIsRevokingCompany(prev => ({ ...prev, [companyId]: true }))
    try {
      await revokeSubscriptionAction(subscriptionId)
      alert(`Subscription revoked successfully for "${companyName}". The company owner and all team members have lost access to this company.`)
      await loadUsers()
    } catch (err) {
      alert(`Failed to revoke company subscription: ${err instanceof Error ? err.message : 'Something went wrong'}`)
    } finally {
      setIsRevokingCompany(prev => ({ ...prev, [companyId]: false }))
    }
  }

  const handleGrantTrial = async (userId: string, tier: 'starter' | 'professional' | 'enterprise' = 'enterprise') => {
    const days = extendDays[userId] || 15
    if (days < 1 || days > 365) {
      alert('Please enter a valid number of days (1-365)')
      return
    }

    setIsGranting(prev => ({ ...prev, [userId]: true }))
    try {
      if (tier === 'enterprise') {
        const user = users.find(u => u.id === userId)
        if (user?.has_used_enterprise_trial) {
          throw new Error('This user has already used an Enterprise trial')
        }
        await grantEnterpriseTrialAction(userId, days)
        alert(`Enterprise trial granted for ${days} days.\n\nThis gives access to the owner and all team members across all their companies (up to 100 companies).`)
      } else {
        throw new Error('User-level trials are only available for Enterprise tier')
      }
      await loadUsers()
    } catch (err) {
      alert(`Failed to grant trial: ${err instanceof Error ? err.message : 'Something went wrong'}`)
    } finally {
      setIsGranting(prev => ({ ...prev, [userId]: false }))
    }
  }

  const handleGrantCompanyTrial = async (companyId: string, userId: string, tier: 'starter' | 'professional' = 'starter', companyName: string) => {
    const days = companyExtendDays[companyId] || 15
    if (days < 1 || days > 365) {
      alert('Please enter a valid number of days (1-365)')
      return
    }

    setIsGrantingCompany(prev => ({ ...prev, [companyId]: true }))
    try {
      const owner = users.find(user => user.id === userId)
      const company = owner?.companies_owned.find(ownedCompany => ownedCompany.id === companyId)

      if (owner?.has_used_enterprise_trial) {
        throw new Error('This user has already used an Enterprise trial, so company trials are not allowed')
      }
      if (company?.has_used_trial) {
        throw new Error('This company has already used its trial')
      }

      await grantCompanyTrialAction(userId, companyId, tier, days)
      alert(`${tier.charAt(0).toUpperCase() + tier.slice(1)} trial granted for "${companyName}" for ${days} days.\n\nThis gives access to the company owner and all team members of this company.`)
      await loadUsers()
    } catch (err) {
      alert(`Failed to grant company trial: ${err instanceof Error ? err.message : 'Something went wrong'}`)
    } finally {
      setIsGrantingCompany(prev => ({ ...prev, [companyId]: false }))
    }
  }

  const handleChangeCompanyTier = async (companyId: string, subscriptionId: string, newTier: 'starter' | 'professional', companyName: string) => {
    if (!confirm(`Change subscription tier for "${companyName}" to ${newTier.charAt(0).toUpperCase() + newTier.slice(1)}?`)) {
      return
    }

    setIsChangingTier(prev => ({ ...prev, [companyId]: true }))
    try {
      await changeSubscriptionTierAction(subscriptionId, newTier)
      alert(`Subscription tier changed to ${newTier.charAt(0).toUpperCase() + newTier.slice(1)} for "${companyName}".`)
      await loadUsers()
    } catch (err) {
      alert(`Failed to change tier: ${err instanceof Error ? err.message : 'Something went wrong'}`)
    } finally {
      setIsChangingTier(prev => ({ ...prev, [companyId]: false }))
    }
  }

  const handleExtendCompanyTrial = async (companyId: string, subscriptionId: string, companyName: string) => {
    const days = companyExtendDays[companyId] || 15
    if (days < 1 || days > 365) {
      alert('Please enter a valid number of days (1-365)')
      return
    }

    setIsExtendingCompany(prev => ({ ...prev, [companyId]: true }))
    try {
      await extendSubscriptionTrialAction(subscriptionId, days)
      alert(`Trial extended by ${days} days for "${companyName}".`)
      await loadUsers()
    } catch (err) {
      alert(`Failed to extend trial: ${err instanceof Error ? err.message : 'Something went wrong'}`)
    } finally {
      setIsExtendingCompany(prev => ({ ...prev, [companyId]: false }))
    }
  }

  const getSubscriptionStatus = (sub: UserSubscription | null): { label: string; color: string; isTrial: boolean; isPaid: boolean } => {
    if (!sub) {
      return { label: 'No Subscription', color: 'bg-bg-elevated text-fg-muted border-line/15', isTrial: false, isPaid: false }
    }

    const now = new Date()
    const endDate = sub.trial_ends_at ? new Date(sub.trial_ends_at) : new Date(sub.end_date)

    if (sub.status === 'expired' || endDate < now) {
      return { label: 'Expired', color: 'bg-red-500/20 text-red-400 border-red-500/30', isTrial: false, isPaid: false }
    }

    if (sub.is_trial) {
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return { label: `Trial (${daysLeft}d left)`, color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', isTrial: true, isPaid: false }
    }

    return { label: 'Paid', color: 'bg-green-500/20 text-green-400 border-green-500/30', isTrial: false, isPaid: true }
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

  const filteredUsers = users.filter(user => {
    // Search filter
    const matchesSearch = searchQuery === '' || 
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.companies_owned.some(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()))

    // Status filter
    if (filterStatus === 'all') return matchesSearch

    const status = getSubscriptionStatus(user.subscription)
    
    if (filterStatus === 'active') return matchesSearch && status.isPaid
    if (filterStatus === 'trial') return matchesSearch && status.isTrial
    if (filterStatus === 'expired') return matchesSearch && status.label === 'Expired'
    if (filterStatus === 'none') return matchesSearch && status.label === 'No Subscription'

    return matchesSearch
  })

  if (isLoading) {
    return (
      <div className="bg-bg-card border border-line/10 rounded-2xl shadow-2xl p-12 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary-orange border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-fg-muted">Loading users...</p>
      </div>
    )
  }

  const hasEmails = users.some(u => u.email.includes('@'))

  // Stats
  const totalTeamMembers = users.reduce((sum, u) => sum + u.companies_owned.reduce((s, c) => s + c.team_members.length, 0), 0)

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
          <h2 className="text-2xl font-light text-white mb-1">Trial & Subscription Management</h2>
          <p className="text-fg-muted text-sm">Manage company owners, their trials/subscriptions, and team access</p>
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

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-4 py-2 bg-bg-card border border-line/15 rounded-lg text-white text-sm focus:outline-none focus:border-primary-orange"
          >
            <option value="all">All Company Owners</option>
            <option value="active">Paid Subscribers</option>
            <option value="trial">Active Trials</option>
            <option value="expired">Expired (Trial/Paid)</option>
            <option value="none">No Trial/Subscription</option>
          </select>

          {/* Refresh */}
          <button
            onClick={loadUsers}
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
          <div className="text-xs text-fg-muted">Company Owners</div>
          <div className="text-[10px] text-fg-muted mt-1">Users who created companies</div>
        </div>
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <div className="text-2xl font-bold text-green-400">
            {users.filter(u => getSubscriptionStatus(u.subscription).isPaid).length}
          </div>
          <div className="text-xs text-green-400/80">Paid Subscribers</div>
          <div className="text-[10px] text-green-400/60 mt-1">Active paid plans</div>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <div className="text-2xl font-bold text-yellow-400">
            {users.filter(u => getSubscriptionStatus(u.subscription).isTrial).length}
          </div>
          <div className="text-xs text-yellow-400/80">Active Trials</div>
          <div className="text-[10px] text-yellow-400/60 mt-1">Free trial period</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="text-2xl font-bold text-red-400">
            {users.filter(u => getSubscriptionStatus(u.subscription).label === 'Expired').length}
          </div>
          <div className="text-xs text-red-400/80">Expired</div>
          <div className="text-[10px] text-red-400/60 mt-1">Trial/subscription ended</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
          <div className="text-2xl font-bold text-blue-400">{totalTeamMembers}</div>
          <div className="text-xs text-blue-400/80">Team Members</div>
          <div className="text-[10px] text-blue-400/60 mt-1">Across all companies</div>
        </div>
      </div>

      {/* Info Box */}
      <div className="bg-primary-orange/10 border border-primary-orange/30 rounded-xl p-4 flex items-start gap-3">
        <svg className="w-5 h-5 text-primary-orange flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div className="text-sm">
          <p className="text-primary-orange font-medium">Understanding Trial vs Paid Subscriptions</p>
          <div className="text-primary-orange/80 mt-1 space-y-1">
            <p>• <strong>Active Trial:</strong> Free trial period (e.g., 15 days). User has access but hasn't paid yet.</p>
            <p>• <strong>Paid Subscriber:</strong> User has purchased a subscription plan (Starter/Professional/Enterprise).</p>
            <p>• <strong>Expired:</strong> Trial or subscription has ended. User and their team members lose access.</p>
            <p className="mt-2">When you grant/extend/revoke access for a company owner, all their team members are affected.</p>
          </div>
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
          <span className="text-fg-secondary">Active Trial (Free)</span>
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
            No company owners found matching your criteria.
          </div>
        ) : (
          <div className="divide-y divide-line/10">
            {filteredUsers.map((user) => {
              const status = getSubscriptionStatus(user.subscription)
              const isExpanded = expandedUser === user.id
              const totalMembers = user.companies_owned.reduce((sum, c) => sum + c.team_members.length, 0)
              
              return (
                <div key={user.id} className="bg-bg-card">
                  {/* User Row */}
                  <div 
                    className={`px-6 py-4 hover:bg-bg-card/50 transition-colors cursor-pointer ${isExpanded ? 'bg-bg-card/30' : ''}`}
                    onClick={() => {
                      setExpandedUser(isExpanded ? null : user.id)
                      setExpandedCompany(null)
                    }}
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
                        <div className="w-10 h-10 bg-primary-orange/20 rounded-full flex items-center justify-center">
                          <span className="text-primary-orange text-sm font-bold">
                            {user.email.includes('@') ? user.email.charAt(0).toUpperCase() : 'U'}
                          </span>
                        </div>
                        <div>
                          <div className="text-white font-medium">
                            {user.email.includes('@') ? user.email : `User ${user.id.substring(0, 8)}...`}
                          </div>
                          <div className="text-fg-muted text-xs flex items-center gap-2">
                            <span>{user.companies_owned.length} companies</span>
                            <span>•</span>
                            <span>{totalMembers} team members</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Status Badge */}
                        <span className={`px-3 py-1 rounded-full text-xs font-medium border ${status.color}`}>
                          {status.label}
                        </span>
                        
                        {/* Tier */}
                        <div className="text-fg-muted text-sm w-20 text-right">
                          {user.subscription?.tier ? user.subscription.tier.charAt(0).toUpperCase() + user.subscription.tier.slice(1) : '-'}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                          {user.subscription ? (
                            <>
                              <input
                                type="number"
                                min="1"
                                max="365"
                                value={extendDays[user.id] || 15}
                                onChange={(e) => setExtendDays(prev => ({ ...prev, [user.id]: parseInt(e.target.value) || 15 }))}
                                className="w-14 px-2 py-1 bg-bg-card border border-line/15 rounded text-white text-sm text-center focus:outline-none focus:border-primary-orange"
                              />
                              <button
                                onClick={() => handleExtendTrial(user.id, user.subscription!.id)}
                                disabled={isExtending[user.id]}
                                className="px-3 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded text-xs font-medium hover:bg-green-500/30 transition-colors disabled:opacity-50"
                              >
                                {isExtending[user.id] ? '...' : '+Days'}
                              </button>
                              {user.subscription.is_trial && (
                                <button
                                  onClick={() => handleRevokeTrial(user.id, user.subscription!.id)}
                                  disabled={isRevoking[user.id]}
                                  className="px-3 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50"
                                >
                                  {isRevoking[user.id] ? '...' : 'Revoke'}
                                </button>
                              )}
                            </>
                          ) : (
                            <>
                              <input
                                type="number"
                                min="1"
                                max="365"
                                value={extendDays[user.id] || 15}
                                onChange={(e) => setExtendDays(prev => ({ ...prev, [user.id]: parseInt(e.target.value) || 15 }))}
                                className="w-14 px-2 py-1 bg-bg-card border border-line/15 rounded text-white text-sm text-center focus:outline-none focus:border-primary-orange"
                              />
                              <button
                                onClick={() => handleGrantTrial(user.id, 'enterprise')}
                                disabled={isGranting[user.id]}
                                className="px-3 py-1 bg-primary-orange text-white rounded text-xs font-medium hover:bg-primary-orange/90 transition-colors disabled:opacity-50"
                                title="Grant Enterprise trial (covers all companies)"
                              >
                                {isGranting[user.id] ? '...' : 'Grant Trial'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Expanded: Companies List */}
                  {isExpanded && (
                    <div className="bg-bg-card/20 border-t border-line/10/50">
                      {user.companies_owned.length === 0 ? (
                        <div className="px-12 py-4 text-fg-muted text-sm">
                          No companies owned by this user.
                        </div>
                      ) : (
                        <div className="divide-y divide-line/10/50">
                          {user.companies_owned.map((company) => {
                            const isCompanyExpanded = expandedCompany === company.id
                            const companyTrialBlocked =
                              user.has_used_enterprise_trial || company.has_used_trial
                            
                            return (
                              <div key={company.id}>
                                {/* Company Row */}
                                <div 
                                  className={`px-12 py-3 hover:bg-bg-card/30 transition-colors cursor-pointer ${isCompanyExpanded ? 'bg-bg-card/40' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setExpandedCompany(isCompanyExpanded ? null : company.id)
                                  }}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <svg 
                                        className={`w-4 h-4 text-fg-muted transition-transform ${isCompanyExpanded ? 'rotate-90' : ''}`} 
                                        fill="none" 
                                        stroke="currentColor" 
                                        viewBox="0 0 24 24"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                      </svg>
                                      <div className="w-8 h-8 bg-blue-500/20 rounded-lg flex items-center justify-center">
                                        <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                        </svg>
                                      </div>
                                      <div>
                                        <div className="text-white text-sm font-medium">{company.name}</div>
                                        <div className="text-fg-muted text-xs">
                                          {company.type} • {company.team_members.length} team member{company.team_members.length !== 1 ? 's' : ''}
                                        </div>
                                      </div>
                                    </div>
                                    
                                    {/* Company Subscription Status & Actions */}
                                    <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                                      {company.subscription ? (
                                        <>
                                          <span className={`px-2 py-1 rounded text-xs font-medium border ${
                                            company.subscription.is_trial
                                              ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
                                              : company.subscription.status === 'active'
                                              ? 'bg-green-500/20 text-green-400 border-green-500/30'
                                              : 'bg-red-500/20 text-red-400 border-red-500/30'
                                          }`}>
                                            {company.subscription.is_trial 
                                              ? `Trial (${Math.max(0, Math.ceil((new Date(company.subscription.trial_ends_at || company.subscription.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)))}d left)`
                                              : company.subscription.status === 'active'
                                              ? 'Active'
                                              : 'Expired'
                                            }
                                          </span>
                                          
                                          {/* Active/Trial Subscription: Show tier selector, extend, and revoke */}
                                          {(company.subscription.is_trial || company.subscription.status === 'active') && (
                                            <>
                                              {/* Tier Selector - Allow changing tier */}
                                              <select
                                                value={company.subscription.tier}
                                                onChange={(e) => {
                                                  const newTier = e.target.value as 'starter' | 'professional'
                                                  if (newTier !== company.subscription!.tier) {
                                                    handleChangeCompanyTier(company.id, company.subscription!.id, newTier, company.name)
                                                  }
                                                }}
                                                disabled={isChangingTier[company.id]}
                                                className="px-2 py-1 bg-bg-card border border-line/15 rounded text-white text-xs focus:outline-none focus:border-primary-orange disabled:opacity-50"
                                              >
                                                <option value="starter">Starter</option>
                                                <option value="professional">Professional</option>
                                              </select>

                                              {/* Extend Trial */}
                                              <input
                                                type="number"
                                                min="1"
                                                max="365"
                                                value={companyExtendDays[company.id] || 15}
                                                onChange={(e) => setCompanyExtendDays(prev => ({ ...prev, [company.id]: parseInt(e.target.value) || 15 }))}
                                                className="w-12 px-1 py-0.5 bg-bg-card border border-line/15 rounded text-white text-xs text-center focus:outline-none focus:border-primary-orange"
                                              />
                                              <button
                                                onClick={() => handleExtendCompanyTrial(company.id, company.subscription!.id, company.name)}
                                                disabled={isExtendingCompany[company.id]}
                                                className="px-2 py-1 bg-green-500/20 text-green-400 border border-green-500/30 rounded text-xs font-medium hover:bg-green-500/30 transition-colors disabled:opacity-50"
                                              >
                                                {isExtendingCompany[company.id] ? '...' : '+Days'}
                                              </button>

                                              {/* Revoke Button */}
                                              <button
                                                onClick={() => handleRevokeCompanySubscription(company.id, company.subscription!.id, company.name)}
                                                disabled={isRevokingCompany[company.id]}
                                                className="px-2 py-1 bg-red-500/20 text-red-400 border border-red-500/30 rounded text-xs font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50"
                                              >
                                                {isRevokingCompany[company.id] ? '...' : 'Revoke'}
                                              </button>
                                            </>
                                          )}

                                          {/* Expired Subscription: Show grant new trial OR extend (not both) */}
                                          {company.subscription.status === 'expired' && (
                                            <>
                                              {companyTrialBlocked ? (
                                                <span className="text-red-400 text-xs">
                                                  {user.has_used_enterprise_trial
                                                    ? 'Enterprise trial already used'
                                                    : 'Company trial already used'}
                                                </span>
                                              ) : (
                                                <>
                                                  <select
                                                    value={companyTier[company.id] || company.subscription.tier}
                                                    onChange={(e) => setCompanyTier(prev => ({ ...prev, [company.id]: e.target.value as 'starter' | 'professional' }))}
                                                    className="px-2 py-1 bg-bg-card border border-line/15 rounded text-white text-xs focus:outline-none focus:border-primary-orange"
                                                  >
                                                    <option value="starter">Starter</option>
                                                    <option value="professional">Professional</option>
                                                  </select>
                                                  <input
                                                    type="number"
                                                    min="1"
                                                    max="365"
                                                    value={companyExtendDays[company.id] || 15}
                                                    onChange={(e) => setCompanyExtendDays(prev => ({ ...prev, [company.id]: parseInt(e.target.value) || 15 }))}
                                                    className="w-12 px-1 py-0.5 bg-bg-card border border-line/15 rounded text-white text-xs text-center focus:outline-none focus:border-primary-orange"
                                                  />
                                                  <button
                                                    onClick={() => handleGrantCompanyTrial(company.id, user.id, companyTier[company.id] || (company.subscription?.tier as 'starter' | 'professional') || 'starter', company.name)}
                                                    disabled={isGrantingCompany[company.id]}
                                                    className="px-2 py-1 bg-primary-orange text-white rounded text-xs font-medium hover:bg-primary-orange/90 transition-colors disabled:opacity-50"
                                                  >
                                                    {isGrantingCompany[company.id] ? '...' : 'Grant Trial'}
                                                  </button>
                                                </>
                                              )}
                                            </>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          <span className="text-fg-muted text-xs">No subscription</span>
                                          <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                                            {companyTrialBlocked ? (
                                              <span className="text-red-400 text-xs">
                                                {user.has_used_enterprise_trial
                                                  ? 'Enterprise trial already used'
                                                  : 'Company trial already used'}
                                              </span>
                                            ) : (
                                              <>
                                                <select
                                                  value={companyTier[company.id] || 'starter'}
                                                  onChange={(e) => setCompanyTier(prev => ({ ...prev, [company.id]: e.target.value as 'starter' | 'professional' }))}
                                                  className="px-2 py-1 bg-bg-card border border-line/15 rounded text-white text-xs focus:outline-none focus:border-primary-orange"
                                                >
                                                  <option value="starter">Starter</option>
                                                  <option value="professional">Professional</option>
                                                </select>
                                                <input
                                                  type="number"
                                                  min="1"
                                                  max="365"
                                                  value={companyExtendDays[company.id] || 15}
                                                  onChange={(e) => setCompanyExtendDays(prev => ({ ...prev, [company.id]: parseInt(e.target.value) || 15 }))}
                                                  className="w-12 px-1 py-0.5 bg-bg-card border border-line/15 rounded text-white text-xs text-center focus:outline-none focus:border-primary-orange"
                                                />
                                                <button
                                                  onClick={() => {
                                                    handleGrantCompanyTrial(company.id, user.id, companyTier[company.id] || 'starter', company.name)
                                                  }}
                                                  disabled={isGrantingCompany[company.id]}
                                                  className="px-2 py-1 bg-primary-orange text-white rounded text-xs font-medium hover:bg-primary-orange/90 transition-colors disabled:opacity-50"
                                                >
                                                  {isGrantingCompany[company.id] ? '...' : 'Grant Trial'}
                                                </button>
                                              </>
                                            )}
                                          </div>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>

                                {/* Expanded: Team Members */}
                                {isCompanyExpanded && (
                                  <div className="bg-bg-card/30 px-16 py-3 border-t border-line/10/30">
                                    <div className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-3">
                                      Team Members
                                    </div>
                                    {company.team_members.length === 0 ? (
                                      <div className="text-fg-muted text-sm">No team members</div>
                                    ) : (
                                      <div className="space-y-2">
                                        {company.team_members.map((member, idx) => (
                                          <div 
                                            key={idx} 
                                            className="flex items-center justify-between py-2 px-3 bg-bg-elevated/30 rounded-lg"
                                          >
                                            <div className="flex items-center gap-3">
                                              <div className="w-6 h-6 bg-bg-hover rounded-full flex items-center justify-center">
                                                <span className="text-fg-secondary text-xs font-medium">
                                                  {member.email.includes('@') ? member.email.charAt(0).toUpperCase() : 'U'}
                                                </span>
                                              </div>
                                              <div>
                                                <div className="text-fg-secondary text-sm">
                                                  {member.email.includes('@') ? member.email : `User ${member.user_id.substring(0, 8)}...`}
                                                </div>
                                                {member.user_id === user.id && (
                                                  <span className="text-xs text-primary-orange">Owner</span>
                                                )}
                                              </div>
                                            </div>
                                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${getRoleBadge(member.role)}`}>
                                              {member.role}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    
                                    {/* Access Status Note */}
                                    <div className="mt-3 text-xs text-fg-muted flex items-center gap-1">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      {company.subscription 
                                        ? (company.subscription.is_trial || company.subscription.status === 'active'
                                          ? 'All team members have access through this company\'s subscription'
                                          : 'Team members have no access (company subscription expired)')
                                        : (status.label.includes('Trial') || status.label === 'Active'
                                          ? 'All team members have access through the owner\'s subscription'
                                          : 'Team members have no access (owner\'s subscription expired)')
                                      }
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}

                      {/* Invited To (as team member in other companies) */}
                      {user.invited_to.length > 0 && (
                        <div className="px-12 py-3 border-t border-line/10/50">
                          <div className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">
                            Also Team Member In
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {user.invited_to.map((invite, idx) => (
                              <span 
                                key={idx}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-bg-elevated/50 rounded text-xs text-fg-secondary"
                              >
                                {invite.company_name}
                                <span className={`px-1.5 py-0.5 rounded text-xs ${getRoleBadge(invite.role)}`}>
                                  {invite.role}
                                </span>
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Subscription Details */}
                      {user.subscription && (
                        <div className="px-12 py-3 border-t border-line/10/50">
                          <div className="text-xs font-medium text-fg-muted uppercase tracking-wider mb-2">
                            Subscription Details
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-fg-muted">Status:</span>
                              <span className="ml-2 text-white">{user.subscription.status}</span>
                            </div>
                            <div>
                              <span className="text-fg-muted">Tier:</span>
                              <span className="ml-2 text-white">{user.subscription.tier}</span>
                            </div>
                            <div>
                              <span className="text-fg-muted">Is Trial:</span>
                              <span className="ml-2 text-white">{user.subscription.is_trial ? 'Yes' : 'No'}</span>
                            </div>
                            <div>
                              <span className="text-fg-muted">Expires:</span>
                              <span className="ml-2 text-white">
                                {user.subscription.trial_ends_at || user.subscription.end_date
                                  ? new Date(user.subscription.trial_ends_at || user.subscription.end_date).toLocaleDateString()
                                  : '-'
                                }
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
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
