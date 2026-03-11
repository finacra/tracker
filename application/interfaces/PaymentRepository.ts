import type {
  CompletePaymentInput,
  CreatePendingPaymentInput,
  PaymentHistoryRecord,
  PaymentRecord,
  PaymentStatusPatchInput,
  RefundablePaymentRecord,
} from '@/domain/models/Payment'

export interface PaymentRepository {
  createPending(input: CreatePendingPaymentInput): Promise<void>
  findByProviderOrderIdForUser(orderId: string, userId: string): Promise<PaymentRecord | null>
  findByProviderOrderId(orderId: string): Promise<PaymentRecord | null>
  findScheduledTrialVerificationRefunds(beforeIso: string): Promise<RefundablePaymentRecord[]>
  listTransactions(options: {
    status?: 'all' | 'completed' | 'pending' | 'failed' | 'refunded'
    sortBy: 'date' | 'amount'
    sortOrder: 'asc' | 'desc'
  }): Promise<PaymentHistoryRecord[]>
  markCompleted(paymentId: string, input: CompletePaymentInput): Promise<void>
  updateById(paymentId: string, input: PaymentStatusPatchInput): Promise<void>
  updateByProviderOrderId(orderId: string, input: PaymentStatusPatchInput): Promise<void>
}
