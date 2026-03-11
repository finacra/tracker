import type { PaymentRepository } from '@/application/interfaces/PaymentRepository'
import type {
  CompletePaymentInput,
  CreatePendingPaymentInput,
  PaymentHistoryRecord,
  PaymentRecord,
  PaymentStatusPatchInput,
  RefundablePaymentRecord,
} from '@/domain/models/Payment'
import { createAdminClient } from '@/utils/supabase/admin'

type PaymentRow = {
  id: string
  user_id: string
  app_user_id: string | null
  company_id: string | null
  provider_order_id: string
  provider_payment_id: string | null
  amount: number
  amount_paid: number | null
  currency: string
  status: PaymentHistoryRecord['status']
  tier: PaymentRecord['tier']
  billing_cycle: PaymentRecord['billingCycle']
  receipt: string | null
  payment_method: string | null
  paid_at: string | null
  error_code: string | null
  error_description: string | null
  created_at: string
  updated_at: string
  refund_status: string | null
  refund_scheduled_at: string | null
  payment_type: string | null
}

export class SupabasePaymentRepository implements PaymentRepository {
  async createPending(input: CreatePendingPaymentInput): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase.from('payments').insert({
      user_id: input.userId,
      app_user_id: input.appUserId || null,
      company_id: input.companyId,
      provider_order_id: input.providerOrderId,
      payment_provider: input.paymentProvider,
      amount: input.amount,
      currency: input.currency,
      status: 'pending',
      tier: input.tier,
      billing_cycle: input.billingCycle,
      receipt: input.receipt,
      notes: input.notes,
      payment_type: input.paymentType ?? null,
    })
    if (error) throw new Error(error.message)
  }

  async findByProviderOrderIdForUser(orderId: string, userId: string): Promise<PaymentRecord | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('payments')
      .select('id, user_id, app_user_id, company_id, provider_order_id, provider_payment_id, amount, amount_paid, currency, status, tier, billing_cycle, receipt, payment_method, paid_at, error_code, error_description, created_at, updated_at, refund_status, refund_scheduled_at, payment_type')
      .eq('provider_order_id', orderId)
      .eq('user_id', userId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return data ? this.mapRow(data as PaymentRow) : null
  }

  async findByProviderOrderId(orderId: string): Promise<PaymentRecord | null> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('payments')
      .select('id, user_id, app_user_id, company_id, provider_order_id, provider_payment_id, amount, amount_paid, currency, status, tier, billing_cycle, receipt, payment_method, paid_at, error_code, error_description, created_at, updated_at, refund_status, refund_scheduled_at, payment_type')
      .eq('provider_order_id', orderId)
      .maybeSingle()

    if (error) throw new Error(error.message)
    return data ? this.mapRow(data as PaymentRow) : null
  }

  async findScheduledTrialVerificationRefunds(beforeIso: string): Promise<RefundablePaymentRecord[]> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('payments')
      .select('id, provider_order_id, provider_payment_id, amount')
      .eq('payment_type', 'trial_verification')
      .eq('status', 'completed')
      .eq('refund_status', 'scheduled')
      .lte('refund_scheduled_at', beforeIso)
      .is('provider_refund_id', null)

    if (error) throw new Error(error.message)
    return (data ?? []).map((row: { id: string; provider_order_id: string; provider_payment_id: string | null; amount: number }) => ({
      id: row.id,
      providerOrderId: row.provider_order_id,
      providerPaymentId: row.provider_payment_id,
      amount: row.amount,
    }))
  }

  async listTransactions(options: {
    status?: 'all' | 'completed' | 'pending' | 'failed' | 'refunded'
    sortBy: 'date' | 'amount'
    sortOrder: 'asc' | 'desc'
  }): Promise<PaymentHistoryRecord[]> {
    const adminSupabase: any = createAdminClient()
    let query = adminSupabase
      .from('payments')
      .select('id, user_id, app_user_id, company_id, provider_order_id, provider_payment_id, amount, amount_paid, currency, status, tier, billing_cycle, receipt, payment_method, paid_at, error_code, error_description, created_at, updated_at, refund_status, refund_scheduled_at, payment_type')
      .order(options.sortBy === 'date' ? 'created_at' : 'amount', { ascending: options.sortOrder === 'asc' })

    if (options.status && options.status !== 'all') {
      query = query.eq('status', options.status)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []).map((row: PaymentRow) => this.mapHistoryRow(row))
  }

  async markCompleted(paymentId: string, input: CompletePaymentInput): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('payments')
      .update({
        provider_payment_id: input.providerPaymentId,
        provider_signature: input.providerSignature,
        payment_provider: input.paymentProvider,
        status: 'completed',
        amount_paid: input.amountPaid,
        paid_at: input.paidAt,
        updated_at: input.updatedAt,
      })
      .eq('id', paymentId)

    if (error) throw new Error(error.message)
  }

  async updateById(paymentId: string, input: PaymentStatusPatchInput): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('payments')
      .update(this.mapPatch(input))
      .eq('id', paymentId)

    if (error) throw new Error(error.message)
  }

  async updateByProviderOrderId(orderId: string, input: PaymentStatusPatchInput): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('payments')
      .update(this.mapPatch(input))
      .eq('provider_order_id', orderId)

    if (error) throw new Error(error.message)
  }

  private mapRow(row: PaymentRow): PaymentRecord {
    return {
      id: row.id,
      userId: row.user_id,
      appUserId: row.app_user_id,
      companyId: row.company_id,
      providerOrderId: row.provider_order_id,
      providerPaymentId: row.provider_payment_id,
      amount: row.amount,
      amountPaid: row.amount_paid,
      currency: row.currency,
      status: row.status,
      tier: row.tier,
      billingCycle: row.billing_cycle,
      receipt: row.receipt,
      paymentMethod: row.payment_method,
      paidAt: row.paid_at,
      errorCode: row.error_code,
      errorDescription: row.error_description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      refundStatus: row.refund_status,
      refundScheduledAt: row.refund_scheduled_at,
      paymentType: row.payment_type,
    }
  }

  private mapHistoryRow(row: PaymentRow): PaymentHistoryRecord {
    return {
      id: row.id,
      userId: row.user_id,
      appUserId: row.app_user_id,
      companyId: row.company_id,
      providerOrderId: row.provider_order_id,
      providerPaymentId: row.provider_payment_id,
      amount: row.amount,
      amountPaid: row.amount_paid,
      currency: row.currency,
      status: row.status,
      tier: row.tier,
      billingCycle: row.billing_cycle,
      receipt: row.receipt,
      paymentMethod: row.payment_method,
      paidAt: row.paid_at,
      errorCode: row.error_code,
      errorDescription: row.error_description,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  }

  private mapPatch(input: PaymentStatusPatchInput) {
    return {
      provider_payment_id: input.providerPaymentId,
      provider_signature: input.providerSignature,
      provider_refund_id: input.providerRefundId,
      payment_provider: input.paymentProvider,
      payment_method: input.paymentMethod,
      status: input.status,
      amount_paid: input.amountPaid,
      paid_at: input.paidAt,
      refunded_at: input.refundedAt,
      refund_amount: input.refundAmount,
      updated_at: input.updatedAt,
      refund_scheduled_at: input.refundScheduledAt,
      refund_status: input.refundStatus,
      refund_error: input.refundError,
      error_code: input.errorCode,
      error_description: input.errorDescription,
    }
  }
}
