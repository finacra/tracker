import type { BillingCycle, PricingTier } from '@/lib/pricing/tiers'

export interface PaymentRecord {
  id: string
  userId: string
  appUserId?: string | null
  companyId: string | null
  providerOrderId: string
  providerPaymentId?: string | null
  amount: number
  amountPaid?: number | null
  currency: string
  status?: 'pending' | 'completed' | 'failed' | 'refunded'
  tier: PricingTier
  billingCycle: BillingCycle
  receipt?: string | null
  paymentMethod?: string | null
  paidAt?: string | null
  errorCode?: string | null
  errorDescription?: string | null
  createdAt?: string
  updatedAt?: string
  refundStatus?: string | null
  refundScheduledAt?: string | null
  paymentType: string | null
}

export interface CompletePaymentInput {
  providerPaymentId: string
  providerSignature: string
  paymentProvider: string
  amountPaid: number
  paidAt: string
  updatedAt: string
}

export interface CreatePendingPaymentInput {
  userId: string
  appUserId?: string | null
  companyId: string | null
  providerOrderId: string
  paymentProvider: string
  amount: number
  currency: string
  tier: PricingTier
  billingCycle: BillingCycle
  receipt: string | null
  notes: Record<string, string> | null
  paymentType?: string | null
}

export interface PaymentStatusPatchInput {
  providerPaymentId?: string
  providerSignature?: string
  providerRefundId?: string | null
  paymentProvider?: string
  paymentMethod?: string | null
  status?: 'pending' | 'completed' | 'failed' | 'refunded'
  amountPaid?: number | null
  paidAt?: string | null
  refundedAt?: string | null
  refundAmount?: number | null
  updatedAt: string
  refundScheduledAt?: string | null
  refundStatus?: string | null
  refundError?: string | null
  errorCode?: string | null
  errorDescription?: string | null
}

export interface RefundablePaymentRecord {
  id: string
  providerOrderId: string
  providerPaymentId: string | null
  amount: number
}

export interface PaymentHistoryRecord {
  id: string
  userId: string
  appUserId?: string | null
  companyId: string | null
  providerOrderId: string
  providerPaymentId: string | null
  amount: number
  amountPaid: number | null
  currency: string
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  tier: string | null
  billingCycle: string | null
  receipt: string | null
  paymentMethod: string | null
  paidAt: string | null
  errorCode: string | null
  errorDescription: string | null
  createdAt: string
  updatedAt: string
}
