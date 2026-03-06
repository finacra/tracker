import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'

interface SubscriptionCheckResult {
  has_subscription: boolean
  is_trial: boolean
  trial_days_remaining: number
  tier: string
}

export default async function RootPage() {
  const supabase = await createClient()
  let destination = '/home'

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (user) {
      const [{ data: ownedCompanies }, { data: userRoles }] = await Promise.all([
        supabase
          .from('companies')
          .select('id')
          .eq('user_id', user.id)
          .limit(1),
        supabase
          .from('user_roles')
          .select('company_id')
          .eq('user_id', user.id)
          .not('company_id', 'is', null)
          .limit(1),
      ])

      const hasCompanies =
        (ownedCompanies?.length ?? 0) > 0 || (userRoles?.length ?? 0) > 0

      if (hasCompanies) {
        destination = '/data-room'
      } else {
        const { data: subData } = await supabase
          .rpc('check_user_subscription', { target_user_id: user.id })
          .single()

        const subInfo = subData as SubscriptionCheckResult | null
        const hasActiveSubscription =
          subInfo?.has_subscription === true ||
          (subInfo?.is_trial === true &&
            (subInfo?.trial_days_remaining ?? 0) > 0)

        destination = hasActiveSubscription ? '/onboarding' : '/subscribe'
      }
    }
  } catch (error) {
    console.error('Error checking auth on root route:', error)
  }

  redirect(destination)
}
