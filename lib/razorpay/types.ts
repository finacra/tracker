/**
 * Razorpay Type Definitions
 */

export interface RazorpayOrder {
  id: string
  entity: string
  amount: number
  amount_paid: number
  amount_due: number
  currency: string
  receipt: string
  offer_id: string | null
  status: 'created' | 'attempted' | 'paid'
  attempts: number
  notes: Record<string, string>
  created_at: number
}

export interface RazorpayPayment {
  id: string
  entity: string
  amount: number
  currency: string
  status: 'created' | 'authorized' | 'captured' | 'refunded' | 'failed'
  order_id: string
  invoice_id: string | null
  international: boolean
  method: string
  amount_refunded: number
  refund_status: string | null
  captured: boolean
  description: string
  card_id: string | null
  bank: string | null
  wallet: string | null
  vpa: string | null
  email: string
  contact: string
  notes: Record<string, string>
  fee: number
  tax: number
  error_code: string | null
  error_description: string | null
  created_at: number
}

export interface CreateOrderParams {
  amount: number // Amount in paise (e.g., 350000 for ₹3500)
  currency?: string
  receipt: string
  notes?: Record<string, string>
}

export interface PaymentVerificationParams {
  razorpay_order_id: string
  razorpay_payment_id: string
  razorpay_signature: string
}

export interface SubscriptionData {
  userId: string
  companyId?: string
  tier: 'starter' | 'professional' | 'enterprise'
  billingCycle: 'monthly' | 'quarterly' | 'half-yearly' | 'annual'
  amount: number
  currency: string
  startDate: Date
  endDate: Date
  status: 'active' | 'cancelled' | 'expired' | 'pending'
}
