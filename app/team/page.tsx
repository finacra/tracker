'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import CompanySelector from '@/components/CompanySelector'
import SubtleCircuitBackground from '@/components/SubtleCircuitBackground'
import { createClient } from '@/utils/supabase/client'
import { useAuth } from '@/hooks/useAuth'
import { getCompanyUserRoles, createTeamInvitation, removeTeamMember, updateTeamMemberRole } from '@/app/data-room/actions'
import { useUserRole } from '@/hooks/useUserRole'
import { getCompanySubscription, type Subscription } from '@/lib/subscriptions/subscription'

interface Company {
  id: string
  name: string
  type: string
  year: string
}

interface UserRole {
  id: string
  user_id: string
  company_id: string | null
  role: 'superadmin' | 'admin' | 'editor' | 'viewer'
  created_at: string
  updated_at: string
  user_email?: string
  user_name?: string
}

export default function TeamPage() {
  const { user } = useAuth()
  const supabase = createClient()
  
  const [currentCompany, setCurrentCompany] = useState<Company | null>(null)
  const [companies, setCompanies] = useState<Company[]>([])
  const [teamMembers, setTeamMembers] = useState<UserRole[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState<'viewer' | 'editor' | 'admin'>('viewer')
  const [isRoleDropdownOpen, setIsRoleDropdownOpen] = useState(false)
  const [isInviting, setIsInviting] = useState(false)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [isRevokingTrial, setIsRevokingTrial] = useState(false)

  // Get user role for current company
  const { role, canManage, isSuperadmin } = useUserRole(currentCompany?.id || null)

  // Fetch companies (owned + invited)
  useEffect(() => {
    async function fetchCompanies() {
      if (!user) return

      try {
        // Fetch companies owned by user
        const { data: ownedCompanies, error: ownedError } = await supabase
          .from('companies')
          .select('id, name, type, incorporation_date')
          .eq('user_id', user.id)

        if (ownedError) throw ownedError

        // Fetch companies user has access to via user_roles using RPC (bypasses RLS)
        let invitedCompanyIds: string[] = []
        
        try {
          const { data: userRoles, error: rolesError } = await supabase
            .rpc('get_user_company_ids', { p_user_id: user.id })

          if (rolesError) {
            console.error('[fetchCompanies] RPC error, trying direct query fallback:', rolesError)
            // Fallback: Direct query (should work with "Users can view their own roles" policy)
            const { data: directRoles, error: directError } = await supabase
              .from('user_roles')
              .select('company_id')
              .eq('user_id', user.id)
              .not('company_id', 'is', null)
            
            if (directError) {
              console.error('[fetchCompanies] Direct query also failed:', directError)
            } else {
              console.log('[fetchCompanies] Direct query succeeded, found', directRoles?.length || 0, 'roles')
              invitedCompanyIds = directRoles 
                ? [...new Set(directRoles.map((ur: { company_id: string | null }) => ur.company_id).filter((id: string | null): id is string => id !== null))]
                : []
            }
          } else {
            console.log('[fetchCompanies] RPC succeeded, found', userRoles?.length || 0, 'company IDs')
            // Get unique company IDs from RPC result
            invitedCompanyIds = userRoles 
              ? [...new Set((userRoles as Array<{ company_id: string | null }>).map((ur) => ur.company_id).filter((id: string | null): id is string => id !== null))]
              : []
          }
        } catch (rpcError) {
          console.error('[fetchCompanies] Exception calling RPC:', rpcError)
          // Final fallback: try direct query
          try {
            const { data: directRoles } = await supabase
              .from('user_roles')
              .select('company_id')
              .eq('user_id', user.id)
              .not('company_id', 'is', null)
            
            invitedCompanyIds = directRoles 
              ? [...new Set(directRoles.map((ur: { company_id: string }) => ur.company_id).filter(Boolean))]
              : []
          } catch (fallbackError) {
            console.error('[fetchCompanies] Fallback also failed:', fallbackError)
          }
        }

        // Fetch company details for invited companies
        let invitedCompanies: any[] = []
        if (invitedCompanyIds.length > 0) {
          const { data: invitedData, error: invitedError } = await supabase
            .from('companies')
            .select('id, name, type, incorporation_date')
            .in('id', invitedCompanyIds)

          if (invitedError) throw invitedError
          invitedCompanies = invitedData || []
        }

        // Combine and deduplicate companies
        const companyMap = new Map<string, Company>()
        
        // Add owned companies
        if (ownedCompanies) {
          ownedCompanies.forEach(c => {
            companyMap.set(c.id, {
              id: c.id,
              name: c.name,
              type: c.type,
              year: new Date(c.incorporation_date).getFullYear().toString()
            })
          })
        }

        // Add companies from user_roles
        invitedCompanies.forEach(c => {
          if (!companyMap.has(c.id)) {
            companyMap.set(c.id, {
              id: c.id,
              name: c.name,
              type: c.type,
              year: new Date(c.incorporation_date).getFullYear().toString()
            })
          }
        })

        const allCompanies = Array.from(companyMap.values())
          .sort((a, b) => b.id.localeCompare(a.id)) // Sort by ID (newest first)

        if (allCompanies.length > 0) {
          setCompanies(allCompanies)
          setCurrentCompany(allCompanies[0])
        } else {
          setCompanies([])
          setCurrentCompany(null)
        }
      } catch (err) {
        console.error('Error fetching companies:', err)
      }
    }

    fetchCompanies()
  }, [user, supabase])

  // Fetch team members (user roles) for current company
  useEffect(() => {
    async function fetchTeamMembers() {
      if (!currentCompany) {
        setTeamMembers([])
        setIsLoading(false)
        return
      }

      setIsLoading(true)
      try {
        const result = await getCompanyUserRoles(currentCompany.id)
        if (result.success && result.roles) {
          setTeamMembers(result.roles)
        } else {
          console.error('Failed to fetch team members:', result.error)
          setTeamMembers([])
        }
      } catch (error) {
        console.error('Error fetching team members:', error)
        setTeamMembers([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchTeamMembers()
  }, [currentCompany])

  // Fetch subscription status for current company (superadmin only)
  useEffect(() => {
    async function fetchSubscription() {
      if (!currentCompany || !isSuperadmin) {
        setSubscription(null)
        return
      }

      try {
        const sub = await getCompanySubscription(currentCompany.id)
        setSubscription(sub)
      } catch (error) {
        console.error('Error fetching subscription:', error)
        setSubscription(null)
      }
    }

    fetchSubscription()
  }, [currentCompany, isSuperadmin])

  const handleRevokeTrial = async () => {
    if (!currentCompany || !subscription) return
    
    if (!confirm('Are you sure you want to revoke the trial for this company? The owner will lose access.')) {
      return
    }

    setIsRevokingTrial(true)
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({
          status: 'expired',
          trial_ends_at: new Date().toISOString(),
          end_date: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', subscription.id)

      if (error) {
        alert(`Failed to revoke trial: ${error.message}`)
      } else {
        alert('Trial revoked successfully')
        // Refresh subscription status
        const sub = await getCompanySubscription(currentCompany.id)
        setSubscription(sub)
      }
    } catch (err: any) {
      alert(`Failed to revoke trial: ${err.message}`)
    } finally {
      setIsRevokingTrial(false)
    }
  }

  const roles = [
    { value: 'viewer' as const, label: 'Viewer - Can view compliance items' },
    { value: 'editor' as const, label: 'Editor - Can view and edit' },
    { value: 'admin' as const, label: 'Admin - Full access including invites' },
  ]

  const handleInvite = async () => {
    if (!currentCompany || !inviteEmail) {
      alert('Please enter an email address')
      return
    }

    if (!canManage && !isSuperadmin) {
      alert('You do not have permission to invite team members')
      return
    }

    setIsInviting(true)
    try {
      const result = await createTeamInvitation(currentCompany.id, inviteEmail, inviteRole, inviteName)
      
      if (result.success) {
        alert('Invitation sent! They will get access after accepting the email invite.')
        setInviteEmail('')
        setInviteName('')
        setInviteRole('viewer')
        
        // Refresh team members list
        const refreshResult = await getCompanyUserRoles(currentCompany.id)
        if (refreshResult.success && refreshResult.roles) {
          setTeamMembers(refreshResult.roles)
        }
      } else {
        alert(`Failed to send invitation: ${result.error}`)
      }
    } catch (error: any) {
      console.error('Error inviting team member:', error)
      alert(`Failed to send invitation: ${error.message}`)
    } finally {
      setIsInviting(false)
    }
  }

  const handleRevokeAccess = async (memberId: string, memberUserId: string) => {
    if (!currentCompany) return

    if (!canManage && !isSuperadmin) {
      alert('You do not have permission to revoke access')
      return
    }

    // Prevent revoking own access if you're the only admin
    if (memberUserId === user?.id) {
      const adminCount = teamMembers.filter(m => m.role === 'admin' || m.role === 'superadmin').length
      if (adminCount <= 1) {
        alert('You cannot revoke your own access as you are the only admin')
        return
      }
    }

    if (!confirm('Are you sure you want to revoke access for this team member?')) {
      return
    }

    try {
      const result = await removeTeamMember(currentCompany.id, memberId, memberUserId)
      
      if (result.success) {
        alert('Access revoked successfully')
        
        // Refresh team members list
        const refreshResult = await getCompanyUserRoles(currentCompany.id)
        if (refreshResult.success && refreshResult.roles) {
          setTeamMembers(refreshResult.roles)
        }
      } else {
        alert(`Failed to revoke access: ${result.error}`)
      }
    } catch (error: any) {
      console.error('Error revoking access:', error)
      alert(`Failed to revoke access: ${error.message}`)
    }
  }

  const handleRoleChange = async (memberId: string, newRole: 'viewer' | 'editor' | 'admin') => {
    if (!currentCompany) return

    if (!canManage && !isSuperadmin) {
      alert('You do not have permission to change roles')
      return
    }

    try {
      const result = await updateTeamMemberRole(currentCompany.id, memberId, newRole)
      
      if (result.success) {
        // Refresh team members list
        const refreshResult = await getCompanyUserRoles(currentCompany.id)
        if (refreshResult.success && refreshResult.roles) {
          setTeamMembers(refreshResult.roles)
        }
      } else {
        alert(`Failed to change role: ${result.error}`)
      }
    } catch (error: any) {
      console.error('Error changing role:', error)
      alert(`Failed to change role: ${error.message}`)
    }
  }

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    } catch {
      return dateStr
    }
  }

  const getRoleDisplayName = (role: string) => {
    return role.toUpperCase()
  }

  return (
    <div className="min-h-screen bg-primary-dark relative overflow-hidden">
      {/* Subtle Circuit Board Background */}
      <SubtleCircuitBackground />

      {/* Header */}
      <Header />

      {/* Main Content */}
      <div className="relative z-10 container mx-auto px-3 sm:px-4 py-4 sm:py-8">
        {/* Company Selector */}
        <div className="mb-4 sm:mb-6">
          <CompanySelector
            companies={companies}
            currentCompany={currentCompany}
            onCompanyChange={setCurrentCompany}
          />
        </div>

        {/* Page Title */}
        <h1 className="text-2xl sm:text-4xl font-light text-white mb-4 sm:mb-6">Team</h1>

        <div className="space-y-4 sm:space-y-6">
          {/* Subscription Status - Superadmin Only */}
          {isSuperadmin && currentCompany && subscription && (
            <div className={`border rounded-xl p-4 ${
              subscription.is_trial 
                ? 'bg-yellow-500/10 border-yellow-500/30' 
                : subscription.status === 'active'
                  ? 'bg-green-500/10 border-green-500/30'
                  : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    subscription.is_trial 
                      ? 'bg-yellow-500/20' 
                      : subscription.status === 'active'
                        ? 'bg-green-500/20'
                        : 'bg-red-500/20'
                  }`}>
                    {subscription.is_trial ? (
                      <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : subscription.status === 'active' ? (
                      <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">
                      {subscription.is_trial ? 'Trial' : subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1)} Plan
                    </div>
                    <div className={`text-xs ${
                      subscription.is_trial ? 'text-yellow-400' : subscription.status === 'active' ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {subscription.is_trial && subscription.trial_ends_at ? (
                        <>
                          Expires: {new Date(subscription.trial_ends_at).toLocaleDateString()}
                          {' '}
                          ({Math.ceil((new Date(subscription.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days left)
                        </>
                      ) : subscription.status === 'active' ? (
                        <>Active until {new Date(subscription.end_date).toLocaleDateString()}</>
                      ) : (
                        <>Expired</>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Revoke Trial Button */}
                {subscription.is_trial && (
                  <button
                    onClick={handleRevokeTrial}
                    disabled={isRevokingTrial}
                    className="px-4 py-2 bg-red-500/20 text-red-400 border border-red-500/30 rounded-lg text-sm font-medium hover:bg-red-500/30 transition-colors disabled:opacity-50"
                  >
                    {isRevokingTrial ? 'Revoking...' : 'Revoke Trial'}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* No Subscription Warning - Superadmin Only */}
          {isSuperadmin && currentCompany && !subscription && !isLoading && (
            <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="text-sm text-gray-400">
                  No active subscription or trial for this company
                </div>
              </div>
            </div>
          )}

          {/* Invite Team Member - Only show if user can manage */}
          {(canManage || isSuperadmin) && (
            <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl shadow-2xl p-4 sm:p-8">
              <div className="flex items-center gap-2 sm:gap-3 mb-2">
                <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary-orange rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg
                    width="14"
                    height="14"
                    className="sm:w-4 sm:h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                </div>
                <h2 className="text-lg sm:text-xl font-light text-white">Invite Team Member</h2>
              </div>
              <p className="text-gray-400 text-xs sm:text-sm mb-4 sm:mb-6 ml-0 sm:ml-11">
                Invite a teammate by email. They can accept even if they don’t have an account yet.
              </p>

              <div className="space-y-3 sm:space-y-4">
                {/* Email Address */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                    Email Address *
                  </label>
                  <input
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                    placeholder="colleague@example.com"
                  />
                </div>

                {/* Name (Optional) */}
                <div>
                  <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
                    Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base placeholder-gray-500 focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                    placeholder="John Doe"
                  />
                </div>

                {/* Role */}
                <div className="relative">
                  <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">Role</label>
                  <button
                    onClick={() => setIsRoleDropdownOpen(!isRoleDropdownOpen)}
                    className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base text-left flex items-center justify-between focus:outline-none focus:border-primary-orange focus:ring-1 focus:ring-primary-orange transition-colors"
                  >
                    <span className="truncate">{roles.find((r) => r.value === inviteRole)?.label}</span>
                    <svg
                      width="14"
                      height="14"
                      className={`sm:w-4 sm:h-4 flex-shrink-0 ml-2 transition-transform ${isRoleDropdownOpen ? 'rotate-180' : ''}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>

                  {isRoleDropdownOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-10"
                        onClick={() => setIsRoleDropdownOpen(false)}
                      />
                      <div className="absolute top-full left-0 right-0 mt-1 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl z-20 overflow-hidden">
                        {roles.map((role) => (
                          <button
                            key={role.value}
                            onClick={() => {
                              setInviteRole(role.value)
                              setIsRoleDropdownOpen(false)
                            }}
                            className={`w-full px-3 sm:px-4 py-2 sm:py-3 text-left hover:bg-gray-800 transition-colors flex items-center justify-between text-sm sm:text-base ${
                              inviteRole === role.value
                                ? 'bg-primary-orange/20 text-white'
                                : 'text-gray-300'
                            }`}
                          >
                            <span className="break-words">{role.label}</span>
                            {inviteRole === role.value && (
                              <svg
                                width="14"
                                height="14"
                                className="sm:w-4 sm:h-4 flex-shrink-0 ml-2 text-primary-orange"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Send Invitation Button */}
                <button
                  onClick={handleInvite}
                  disabled={isInviting || !inviteEmail}
                  className="w-full bg-primary-orange text-white px-4 sm:px-6 py-2.5 sm:py-3 rounded-lg hover:bg-primary-orange/90 transition-colors flex items-center justify-center gap-2 font-medium text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isInviting ? (
                    <>
                      <div className="w-3 h-3 sm:w-4 sm:h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Sending...
                    </>
                  ) : (
                    <>
                      <svg
                        width="16"
                        height="16"
                        className="sm:w-[18px] sm:h-[18px]"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                      Send Invitation
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Team Members */}
          <div className="bg-primary-dark-card border border-gray-800 rounded-xl sm:rounded-2xl shadow-2xl p-4 sm:p-8">
            <div className="flex items-center gap-2 sm:gap-3 mb-2">
              <div className="w-7 h-7 sm:w-8 sm:h-8 bg-primary-orange rounded-lg flex items-center justify-center flex-shrink-0">
                <svg
                  width="14"
                  height="14"
                  className="sm:w-4 sm:h-4"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                </svg>
              </div>
              <h2 className="text-lg sm:text-xl font-light text-white">
                Team Members ({teamMembers.length})
              </h2>
            </div>
            <p className="text-gray-400 text-xs sm:text-sm mb-4 sm:mb-6 ml-0 sm:ml-11">
              People who have access to this company.
            </p>

            {isLoading ? (
              <div className="py-8 sm:py-12 flex flex-col items-center justify-center">
                <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-primary-orange border-t-transparent rounded-full animate-spin mb-3 sm:mb-4"></div>
                <p className="text-gray-400 text-sm sm:text-base">Loading team members...</p>
              </div>
            ) : teamMembers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 sm:py-12">
                <div className="w-12 h-12 sm:w-16 sm:h-16 border-2 border-gray-700 rounded-full flex items-center justify-center mb-3 sm:mb-4">
                  <svg
                    width="24"
                    height="24"
                    className="sm:w-8 sm:h-8 text-gray-600"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                  </svg>
                </div>
                <p className="text-gray-500 text-sm sm:text-base">No team members found</p>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {teamMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-900 rounded-lg border border-gray-800"
                  >
                    <div className="flex items-center gap-3 sm:gap-4 min-w-0 flex-1">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg
                          width="20"
                          height="20"
                          className="sm:w-6 sm:h-6"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="white"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-white font-medium text-sm sm:text-base break-words">{member.user_name}</div>
                        <div className="text-gray-400 text-xs sm:text-sm break-words">{member.user_email}</div>
                        <div className="text-gray-500 text-[10px] sm:text-xs mt-1">
                          Joined {formatDate(member.created_at)}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap">
                      {(canManage || isSuperadmin) ? (
                        <select
                          value={member.role}
                          onChange={(e) => handleRoleChange(member.id, e.target.value as 'viewer' | 'editor' | 'admin')}
                          className="px-2 sm:px-3 py-1 bg-gray-800 text-gray-300 rounded-full text-[10px] sm:text-xs font-medium border border-gray-700 hover:border-primary-orange transition-colors cursor-pointer"
                        >
                          <option value="viewer">VIEWER</option>
                          <option value="editor">EDITOR</option>
                          <option value="admin">ADMIN</option>
                        </select>
                      ) : (
                        <span className="px-2 sm:px-3 py-1 bg-gray-800 text-gray-300 rounded-full text-[10px] sm:text-xs font-medium">
                          {getRoleDisplayName(member.role)}
                        </span>
                      )}
                      {(canManage || isSuperadmin) && member.user_id !== user?.id && (
                        <button
                          onClick={() => handleRevokeAccess(member.id, member.user_id)}
                          className="px-3 sm:px-4 py-1.5 sm:py-2 bg-red-600/20 text-red-400 rounded-lg hover:bg-red-600/30 transition-colors flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-medium border border-red-600/30"
                        >
                          <svg
                            width="14"
                            height="14"
                            className="sm:w-4 sm:h-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          <span className="hidden sm:inline">Revoke Access</span>
                          <span className="sm:hidden">Revoke</span>
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
