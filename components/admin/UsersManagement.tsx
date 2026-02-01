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

interface UserWithDetails {
  id: string
  email: string
  created_at: string
  last_sign_in_at: string | null
  companies_owned: number
  subscription: UserSubscription | null
  roles: { company_id: string; company_name: string; role: string }[]
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
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  
  // Trial management state
  const [extendDays, setExtendDays] = useState<{ [key: string]: number }>({})
  const [isExtending, setIsExtending] = useState<{ [key: string]: boolean }>({})
  const [isRevoking, setIsRevoking] = useState<{ [key: string]: boolean }>({})
  const [isGranting, setIsGranting] = useState<{ [key: string]: boolean }>({})

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

      // Get unique user IDs from companies (owners), subscriptions, and user_roles
      const userIds = new Set<string>()
      
      companies.forEach(c => userIds.add(c.user_id))
      subscriptions?.forEach(s => userIds.add(s.user_id))
      userRoles?.forEach(r => userIds.add(r.user_id))

      // Build user details
      const usersWithDetails: UserWithDetails[] = []
      
      for (const userId of userIds) {
        // Get user's subscription (latest one)
        const userSub = subscriptions?.find(s => s.user_id === userId) || null
        
        // Count companies owned
        const companiesOwned = companies.filter(c => c.user_id === userId).length
        
        // Get user's roles
        const userRolesList = userRoles
          ?.filter(r => r.user_id === userId && r.company_id)
          .map(r => ({
            company_id: r.company_id,
            company_name: companies.find(c => c.id === r.company_id)?.name || 'Unknown',
            role: r.role
          })) || []

        usersWithDetails.push({
          id: userId,
          email: 'Loading...', // Will be populated via RPC or left as ID
          created_at: userSub?.created_at || '',
          last_sign_in_at: null,
          companies_owned: companiesOwned,
          subscription: userSub,
          roles: userRolesList
        })
      }

      // Try to get user emails from auth.users via RPC (if available)
      try {
        const { data: authUsers, error: authError } = await supabase
          .rpc('get_users_by_ids', { user_ids: Array.from(userIds) })
        
        if (!authError && authUsers) {
          authUsers.forEach((authUser: any) => {
            const user = usersWithDetails.find(u => u.id === authUser.id)
            if (user) {
              user.email = authUser.email || user.id
              user.created_at = authUser.created_at || user.created_at
              user.last_sign_in_at = authUser.last_sign_in_at
            }
          })
        }
      } catch (rpcError) {
        // RPC not available, use user_id as fallback
        console.log('RPC not available for user emails, using fallback')
      }

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
        alert(`Trial extended by ${days} days. New end date: ${newEndDate.toLocaleDateString()}`)
        await loadUsers()
      }
    } catch (err: any) {
      alert(`Failed to extend trial: ${err.message}`)
    } finally {
      setIsExtending(prev => ({ ...prev, [userId]: false }))
    }
  }

  const handleRevokeTrial = async (userId: string, subscriptionId: string) => {
    if (!confirm('Are you sure you want to revoke this trial? The user will lose access.')) {
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
        alert('Trial revoked successfully')
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
        alert(`Trial granted for ${days} days`)
        await loadUsers()
      }
    } catch (err: any) {
      alert(`Failed to grant trial: ${err.message}`)
    } finally {
      setIsGranting(prev => ({ ...prev, [userId]: false }))
    }
  }

  const getSubscriptionStatus = (sub: UserSubscription | null): { label: string; color: string } => {
    if (!sub) {
      return { label: 'No Subscription', color: 'bg-gray-800 text-gray-400 border-gray-700' }
    }

    const now = new Date()
    const endDate = sub.trial_ends_at ? new Date(sub.trial_ends_at) : new Date(sub.end_date)

    if (sub.status === 'expired' || endDate < now) {
      return { label: 'Expired', color: 'bg-red-500/20 text-red-400 border-red-500/30' }
    }

    if (sub.is_trial) {
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      return { label: `Trial (${daysLeft}d left)`, color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' }
    }

    return { label: 'Active', color: 'bg-green-500/20 text-green-400 border-green-500/30' }
  }

  const filteredUsers = users.filter(user => {
    // Search filter
    const matchesSearch = searchQuery === '' || 
      user.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.id.toLowerCase().includes(searchQuery.toLowerCase())

    // Status filter
    if (filterStatus === 'all') return matchesSearch

    const status = getSubscriptionStatus(user.subscription)
    
    if (filterStatus === 'active') return matchesSearch && status.label === 'Active'
    if (filterStatus === 'trial') return matchesSearch && status.label.includes('Trial')
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

  return (
    <div className="space-y-6">
      {/* Header and Filters */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-light text-white mb-1">User Management</h2>
          <p className="text-gray-400 text-sm">Manage user subscriptions, trials, and access</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          {/* Search */}
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by email or ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-orange w-64"
            />
          </div>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm focus:outline-none focus:border-primary-orange"
          >
            <option value="all">All Users</option>
            <option value="active">Active Subscription</option>
            <option value="trial">On Trial</option>
            <option value="expired">Expired</option>
            <option value="none">No Subscription</option>
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
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4">
          <div className="text-2xl font-bold text-white">{users.length}</div>
          <div className="text-xs text-gray-400">Total Users</div>
        </div>
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <div className="text-2xl font-bold text-green-400">
            {users.filter(u => getSubscriptionStatus(u.subscription).label === 'Active').length}
          </div>
          <div className="text-xs text-green-400/80">Active Subscriptions</div>
        </div>
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <div className="text-2xl font-bold text-yellow-400">
            {users.filter(u => getSubscriptionStatus(u.subscription).label.includes('Trial')).length}
          </div>
          <div className="text-xs text-yellow-400/80">On Trial</div>
        </div>
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <div className="text-2xl font-bold text-red-400">
            {users.filter(u => getSubscriptionStatus(u.subscription).label === 'Expired').length}
          </div>
          <div className="text-xs text-red-400/80">Expired</div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-primary-dark-card border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-900 border-b border-gray-800">
              <tr>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">User</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Tier</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Companies</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Expires</th>
                <th className="px-6 py-4 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    No users found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const status = getSubscriptionStatus(user.subscription)
                  const isExpanded = expandedUser === user.id
                  
                  return (
                    <>
                      <tr 
                        key={user.id} 
                        className={`hover:bg-gray-900/50 transition-colors border-t border-gray-800 cursor-pointer ${isExpanded ? 'bg-gray-900/30' : ''}`}
                        onClick={() => setExpandedUser(isExpanded ? null : user.id)}
                      >
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-primary-orange/20 rounded-full flex items-center justify-center">
                              <span className="text-primary-orange text-sm font-medium">
                                {user.email.charAt(0).toUpperCase()}
                              </span>
                            </div>
                            <div>
                              <div className="text-white font-medium text-sm">{user.email}</div>
                              <div className="text-gray-500 text-xs truncate max-w-[200px]">{user.id}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${status.color}`}>
                            {status.label}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-gray-300 text-sm">
                          {user.subscription?.tier ? user.subscription.tier.charAt(0).toUpperCase() + user.subscription.tier.slice(1) : '-'}
                        </td>
                        <td className="px-6 py-4 text-gray-300 text-sm">
                          {user.companies_owned}
                        </td>
                        <td className="px-6 py-4 text-gray-300 text-sm">
                          {user.subscription?.trial_ends_at || user.subscription?.end_date
                            ? new Date(user.subscription.trial_ends_at || user.subscription.end_date).toLocaleDateString()
                            : '-'
                          }
                        </td>
                        <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center gap-2">
                            {user.subscription ? (
                              <>
                                {/* Extend/Add Days */}
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
                                {/* Grant Trial */}
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
                        </td>
                      </tr>
                      
                      {/* Expanded Row - User Details */}
                      {isExpanded && (
                        <tr key={`${user.id}-details`} className="bg-gray-900/20 border-t border-gray-800/50">
                          <td colSpan={6} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                              {/* Companies Owned */}
                              <div>
                                <h4 className="text-sm font-medium text-gray-300 mb-2">Companies Owned</h4>
                                {user.companies_owned > 0 ? (
                                  <div className="space-y-1">
                                    {companies.filter(c => c.user_id === user.id).map(c => (
                                      <div key={c.id} className="text-sm text-gray-400 flex items-center gap-2">
                                        <span className="w-2 h-2 bg-primary-orange rounded-full"></span>
                                        {c.name}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-500">No companies owned</p>
                                )}
                              </div>

                              {/* Team Memberships */}
                              <div>
                                <h4 className="text-sm font-medium text-gray-300 mb-2">Team Memberships</h4>
                                {user.roles.length > 0 ? (
                                  <div className="space-y-1">
                                    {user.roles.map((role, idx) => (
                                      <div key={idx} className="text-sm text-gray-400 flex items-center gap-2">
                                        <span className={`px-2 py-0.5 text-xs rounded ${
                                          role.role === 'admin' ? 'bg-purple-500/20 text-purple-400' :
                                          role.role === 'editor' ? 'bg-blue-500/20 text-blue-400' :
                                          'bg-gray-700 text-gray-300'
                                        }`}>
                                          {role.role}
                                        </span>
                                        {role.company_name}
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-500">Not a member of any team</p>
                                )}
                              </div>

                              {/* Subscription Details */}
                              {user.subscription && (
                                <div className="md:col-span-2">
                                  <h4 className="text-sm font-medium text-gray-300 mb-2">Subscription Details</h4>
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
                                      <span className="text-gray-500">Created:</span>
                                      <span className="ml-2 text-white">{new Date(user.subscription.created_at).toLocaleDateString()}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
