import type { SubscriptionService } from '@/application/interfaces/SubscriptionService'
import { createAdminClient } from '@/utils/supabase/admin'

type SubscriptionCheckResult = {
  has_subscription: boolean
  is_trial: boolean
  trial_days_remaining: number
}

export class SupabaseSubscriptionService implements SubscriptionService {
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const adminSupabase: any = createAdminClient()
    const { data } = await adminSupabase
      .rpc('check_user_subscription', { target_user_id: userId })
      .single()

    const subInfo = data as SubscriptionCheckResult | null

    return (
      subInfo?.has_subscription === true ||
      (subInfo?.is_trial === true && (subInfo?.trial_days_remaining ?? 0) > 0)
    )
  }
}
