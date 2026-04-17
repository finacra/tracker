/**
 * API endpoint to track login with proper user_id handling
 * For Passport users, checks for Supabase identity and uses it if available
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServerContainer } from '@/lib/composition/server-container'
import { trackKPI } from '@/lib/tracking/kpi-tracker'
import { handleAPIError } from '@/lib/errors/handle-error'

export async function POST(request: NextRequest) {
  try {
    const { appUserId } = await request.json()

    if (!appUserId) {
      return NextResponse.json({ success: false, error: 'appUserId is required' }, { status: 400 })
    }

    const { authService, authIdentityRepository } = createServerContainer()

    // SECURITY: Verify the caller is authenticated and tracking their own login
    const currentUser = await authService.getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }
    if (currentUser.id !== appUserId && currentUser.canonicalId !== appUserId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    // Check if user has a Supabase identity linked to this app_user
    const allIdentities = await authIdentityRepository.findByAppUserId(appUserId)
    const supabaseIdentity = allIdentities.find((id) => id.provider === 'supabase')

    if (supabaseIdentity && supabaseIdentity.legacyAuthId) {
      // User has Supabase identity - use it for tracking
      await trackKPI('Addictiveness', 'General', 1, supabaseIdentity.legacyAuthId, undefined, {
        action: 'login',
      })
    } else {
      // Track without user_id for Passport-only users (new users without Supabase account)
      await trackKPI('Addictiveness', 'General', 1, undefined, undefined, {
        action: 'login',
        app_user_id: appUserId,
        provider: 'passport',
      })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleAPIError(error)
  }
}
