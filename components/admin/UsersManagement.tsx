'use client'

import { useState, useEffect } from 'react'
import { SupabaseClient } from '@supabase/supabase-js'

interface Company {
  id: string
  name: string
  type: string
  incorporation_date: string
  user_id: string
}

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

interface CompanyWithTeam extends Company {
  team_members: TeamMember[]
}

interface UserWithDetails {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  companies_owned: CompanyWithTeam[]
  subscription: UserSubscription | null
  invited_to: { company_id: string; company_name: string; role: string }[]
}

interface UsersManagementProps {
  supabase: SupabaseClient
  companies: Company[]
}

export default function UsersManagement({ supabase, companies }: UsersManagementProps) {
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
  const [isGranting, setIsGranting] = useState<{ [key: string]: boolean }>({})
  
  // Email cache for team members
  const [emailCache, setEmailCache] = useState<{ [key: string]: string }>({})

  useEffect(() => {
    loadUsers()
  }, [])

  const loadUsers = async () => {
    setIsLoading(true)
    try {
      // Get all subscriptions
      const { data: subscriptions, error: subError } = await supabase
        .from('subscriptions')
        .select('*')
        .order('created_at', { ascending: false })

      if (subError) {
        console.error('Error loading subscriptions:', subError)
      }

      // Get all user roles
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id, company_id, role')

      if (rolesError) {
        console.error('Error loading user roles:', rolesError)
      }

      // Get unique user IDs from subscriptions (these are subscribers/trial users)
      const subscriberUserIds = new Set<string>()
      subscriptions?.forEach(s => subscriberUserIds.add(s.user_id))
      
      // Also include company owners who might not have subscriptions yet
      companies.forEach(c => subscriberUserIds.add(c.user_id))

      // Build user details for subscribers
      const usersWithDetails: UserWithDetails[] = []
      
      for (const userId of subscriberUserIds) {
        // Get user's subscription (latest one)
        const userSub = subscriptions?.find(s => s.user_id === userId) || null
        
        // Get companies owned by this user with team members
        const ownedCompanies: CompanyWithTeam[] = companies
          .filter(c => c.user_id === userId)
          .map(c => {
            // Get team members for this company
            const teamRoles = userRoles?.filter(r => r.company_id === c.id) || []
            const teamMembers: TeamMember[] = teamRoles.map(r => ({
              user_id: r.user_id,
              email: 'Loading...', // Will be populated later
              role: r.role
            }))
            
            return {
              ...c,
              team_members: teamMembers
            }
          })
        
        // Get companies user is invited to (not owned)
        const invitedTo = userRoles
          ?.filter(r => r.user_id === userId && r.company_id && !ownedCompanies.some(c => c.id === r.company_id))
          .map(r => ({
            company_id: r.company_id,
            company_name: companies.find(c => c.id === r.company_id)?.name || 'Unknown',
            role: r.role
          })) || []

        usersWithDetails.push({
          id: userId,
          email: 'Loading...',
          created_at: userSub?.created_at || '',
          last_sign_in_at: null,
          companies_owned: ownedCompanies,
          subscription: userSub,
          invited_to: invitedTo
        })
      }

      // Collect all user IDs that need email lookup (subscribers + team members)
      const allUserIds = new Set<string>(subscriberUserIds)
      usersWithDetails.forEach(user => {
        user.companies_owned.forEach(company => {
          company.team_members.forEach(member => {
            allUserIds.add(member.user_id)
          })
        })
      })

      // Try to get user emails from auth.users via RPC
      try {
        const { data: authUsers, error: authError } = await supabase
          .rpc('get_users_by_ids', { user_ids: Array.from(allUserIds) })
        
        if (!authError && authUsers) {
          const newEmailCache: { [key: string]: string } = {}
          authUsers.forEach((authUser: any) => {
            newEmailCache[authUser.id] = authUser.email || authUser.id.substring(0, 8) + '...'
            
            // Update user email
            const user = usersWithDetails.find(u => u.id === authUser.id)
            if (user) {
              user.email = authUser.email || user.id.substring(0, 8) + '...'
              user.created_at = authUser.created_at || user.created_at
              user.last_sign_in_at = authUser.last_sign_in_at
            }
            
            // Update team member emails
            usersWithDetails.forEach(u => {
              u.companies_owned.forEach(c => {
                c.team_members.forEach(m => {
                  if (m.user_id === authUser.id) {
                    m.email = authUser.email || authUser.id.substring(0, 8) + '...'
                  }
                })
              })
            })
          })
          setEmailCache(newEmailCache)
        } else {
          // RPC failed, use fallback
          usersWithDetails.forEach(user => {
            if (user.email === 'Loading...') {
              user.email = user.id.substring(0, 8) + '...'
            }
            user.companies_owned.forEach(c => {
              c.team_members.forEach(m => {
                if (m.email === 'Loading...') {
                  m.email = m.user_id.substring(0, 8) + '...'
                }
              })
            })
          })
        }
      } catch (rpcError) {
        console.log('RPC not available for user emails, using fallback')
        usersWithDetails.forEach(user => {
          if (user.email === 'Loading...') {
            user.email = user.id.substring(0, 8) + '...'
          }
          user.companies_owned.forEach(c => {
            c.team_members.forEach(m => {
              if (m.email === 'Loading...') {
                m.email = m.user_id.substring(0, 8) + '...'
              }
            })
          })
        })
      }

      // Sort by subscription status (trial/active first, then by created_at)
      usersWithDetails.sort((a, b) => {
        const statusA = getSubscriptionStatus(a.subscription)
        const statusB = getSubscriptionStatus(b.subscription)
        
        // Trial > Active > Expired > None
        const statusOrder = { 'Trial': 0, 'Active': 1, 'Expired': 2, 'No Subscription': 3 }
        const orderA = statusA.label.includes('Trial') ? 0 : statusOrder[statusA.label as keyof typeof statusOrder] ?? 3
        const orderB = statusB.label.includes('Trial') ? 0 : statusOrder[statusB.label as keyof typeof statusOrder] ?? 3
        
        if (orderA !== orderB) return orderA - orderB
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })

      setUsers(usersWithDetails)
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
      // Get current subscription
      const { data: currentSub } = await supabase
        .from('subscriptions')
        .select('trial_ends_at')
        .eq('id', subscriptionId)
        .single()

      const currentEndDate = currentSub?.trial_ends_at 
        ? new Date(currentSub.trial_ends_at) 
        : new Date()
      
      // If trial is expired, extend from today
      const baseDate = currentEndDate < new Date() ? new Date() : currentEndDate
      const newEndDate = new Date(baseDate)
      newEndDate.setDate(newEndDate.getDate() + days)

      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'trial',
          is_trial: true,
          trial_ends_at: newEndDate.toISOString(),
          end_date: newEndDate.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId)

      if (error) {
        alert(`Failed to extend trial: ${error.message}`)
      } else {
        alert(`Trial extended by ${days} days. New end date: ${newEndDate.toLocaleDateString()}\n\nThis affects the owner and all team members of their companies.`)
        await loadUsers()
      }
    } catch (err: any) {
      alert(`Failed to extend trial: ${err.message}`)
    } finally {
      setIsExtending(prev => ({ ...prev, [userId]: false }))
    }
  }

  const handleRevokeTrial = async (userId: string, subscriptionId: string) => {
    // Get user's companies and team member count
    const user = users.find(u => u.id === userId)
    const teamMemberCount = user?.companies_owned.reduce((sum, c) => sum + c.team_members.length, 0) || 0
    
    if (!confirm(`Are you sure you want to revoke this trial?\n\nThis will:\n• Remove access for this user\n• Remove access for ${teamMemberCount} team member(s) across ${user?.companies_owned.length || 0} company(ies)`)) {
      return
    }

    setIsRevoking(prev => ({ ...prev, [userId]: true }))
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'expired',
          trial_ends_at: new Date().toISOString(),
          end_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscriptionId)

      if (error) {
        alert(`Failed to revoke trial: ${error.message}`)
      } else {
        alert('Trial revoked successfully. The owner and all team members have lost access.')
        await loadUsers()
      }
    } catch (err: any) {
      alert(`Failed to revoke trial: ${err.message}`)
    } finally {
      setIsRevoking(prev => ({ ...prev, [userId]: false }))
    }
  }

  const handleGrantTrial = async (userId: string) => {
    const days = extendDays[userId] || 15
    if (days < 1 || days > 365) {
      alert('Please enter a valid number of days (1-365)')
      return
    }

    setIsGranting(prev => ({ ...prev, [userId]: true }))
    try {
      const trialEndDate = new Date()
      trialEndDate.setDate(trialEndDate.getDate() + days)

      const { error } = await supabase
        .from('subscriptions')
        .insert({
          user_id: userId,
          company_id: null, // User-based subscription
          status: 'trial',
          tier: 'starter',
          billing_cycle: 'monthly',
          amount: 0,
          currency: 'INR',
          is_trial: true,
          trial_started_at: new Date().toISOString(),
          trial_ends_at: trialEndDate.toISOString(),
          start_date: new Date().toISOString(),
          end_date: trialEndDate.toISOString(),
        })

      if (error) {
        alert(`Failed to grant trial: ${error.message}`)
      } else {
        alert(`Trial granted for ${days} days.\n\nThis gives access to the owner and all team members of their companies.`)
        await loadUsers()
      }
    } catch (err: any) {
      alert(`Failed to grant trial: ${err.message}`)
    } finally {
      setIsGranting(prev => ({ ...prev, [userId]: false }))
    }
  }

  const getSubscriptionStatus = (sub: UserSubscription | null): { label: string; color: string; isTrial: boolean; isPaid: boolean } => {
    if (!sub) {
      return { label: 'No Subscription', color: 'bg-gray-800 text-gray-400 border-gray-700', isTrial: false, isPaid: false }
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
      'viewer': 'bg-gray-700 text-gray-300 border-gray-600',
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
      <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl p-12 flex flex-col items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary-orange border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-gray-400">Loading users...</p>
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
          <p className="text-gray-400 text-sm">Manage company owners, their trials/subscriptions, and team access</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by email, ID or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-orange w-72"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-orange"
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
            className="p-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-gray-600 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-white">{users.length}</div>
          <div className="text-xs text-gray-400">Company Owners</div>
          <div className="text-[10px] text-gray-500 mt-1">Users who created companies</div>
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
        <span className="text-gray-400">Status Legend:</span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-green-400"></span>
          <span className="text-gray-300">Paid Subscriber</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
          <span className="text-gray-300">Active Trial (Free)</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-red-400"></span>
          <span className="text-gray-300">Expired</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-gray-500"></span>
          <span className="text-gray-300">No Subscription</span>
        </span>
      </div>

      {/* Users List */}
      <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        {filteredUsers.length === 0 ? (
          <div className="px-6 py-12 text-center text-gray-400">
            No company owners found matching your criteria.
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {filteredUsers.map((user) => {
              const status = getSubscriptionStatus(user.subscription)
              const isExpanded = expandedUser === user.id
              const totalMembers = user.companies_owned.reduce((sum, c) => sum + c.team_members.length, 0)
              
              return (
                <div key={user.id} className="bg-primary-dark-card">
                  {/* User Row */}
                  <div 
                    className={`px-6 py-4 hover:bg-gray-900/50 transition-colors cursor-pointer ${isExpanded ? 'bg-gray-900/30' : ''}`}
                    onClick={() => {
                      setExpandedUser(isExpanded ? null : user.id)
                      setExpandedCompany(null)
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Expand Icon */}
                        <svg 
                          className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`} 
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
                          <div className="text-gray-500 text-xs flex items-center gap-2">
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
                        <div className="text-gray-400 text-sm w-20 text-right">
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
                                className="w-14 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm text-center focus:outline-none focus:border-primary-orange"
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
                                className="w-14 px-2 py-1 bg-gray-900 border border-gray-700 rounded text-white text-sm text-center focus:outline-none focus:border-primary-orange"
                              />
                              <button
                                onClick={() => handleGrantTrial(user.id)}
                                disabled={isGranting[user.id]}
                                className="px-3 py-1 bg-primary-orange text-white rounded text-xs font-medium hover:bg-primary-orange/90 transition-colors disabled:opacity-50"
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
                    <div className="bg-gray-900/20 border-t border-gray-800/50">
                      {user.companies_owned.length === 0 ? (
                        <div className="px-12 py-4 text-gray-500 text-sm">
                          No companies owned by this user.
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-800/50">
                          {user.companies_owned.map((company) => {
                            const isCompanyExpanded = expandedCompany === company.id
                            
                            return (
                              <div key={company.id}>
                                {/* Company Row */}
                                <div 
                                  className={`px-12 py-3 hover:bg-gray-900/30 transition-colors cursor-pointer ${isCompanyExpanded ? 'bg-gray-900/40' : ''}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    setExpandedCompany(isCompanyExpanded ? null : company.id)
                                  }}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                      <svg 
                                        className={`w-4 h-4 text-gray-500 transition-transform ${isCompanyExpanded ? 'rotate-90' : ''}`} 
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
                                        <div className="text-gray-500 text-xs">
                                          {company.type} • {company.team_members.length} team member{company.team_members.length !== 1 ? 's' : ''}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>

                                {/* Expanded: Team Members */}
                                {isCompanyExpanded && (
                                  <div className="bg-gray-900/30 px-16 py-3 border-t border-gray-800/30">
                                    <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-3">
                                      Team Members
                                    </div>
                                    {company.team_members.length === 0 ? (
                                      <div className="text-gray-500 text-sm">No team members</div>
                                    ) : (
                                      <div className="space-y-2">
                                        {company.team_members.map((member, idx) => (
                                          <div 
                                            key={idx} 
                                            className="flex items-center justify-between py-2 px-3 bg-gray-800/30 rounded-lg"
                                          >
                                            <div className="flex items-center gap-3">
                                              <div className="w-6 h-6 bg-gray-700 rounded-full flex items-center justify-center">
                                                <span className="text-gray-300 text-xs font-medium">
                                                  {member.email.includes('@') ? member.email.charAt(0).toUpperCase() : 'U'}
                                                </span>
                                              </div>
                                              <div>
                                                <div className="text-gray-200 text-sm">
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
                                    <div className="mt-3 text-xs text-gray-500 flex items-center gap-1">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                      </svg>
                                      {status.label.includes('Trial') || status.label === 'Active' 
                                        ? 'All team members have access through the owner\'s subscription'
                                        : 'Team members have no access (owner\'s subscription expired)'
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
                        <div className="px-12 py-3 border-t border-gray-800/50">
                          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                            Also Team Member In
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {user.invited_to.map((invite, idx) => (
                              <span 
                                key={idx}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-gray-800/50 rounded text-xs text-gray-300"
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
                        <div className="px-12 py-3 border-t border-gray-800/50">
                          <div className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">
                            Subscription Details
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                            <div>
                              <span className="text-gray-500">Status:</span>
                              <span className="ml-2 text-white">{user.subscription.status}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Tier:</span>
                              <span className="ml-2 text-white">{user.subscription.tier}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Is Trial:</span>
                              <span className="ml-2 text-white">{user.subscription.is_trial ? 'Yes' : 'No'}</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Expires:</span>
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
