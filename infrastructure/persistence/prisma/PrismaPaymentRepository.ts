import type { PaymentRepository } from '@/application/interfaces/PaymentRepository'
import type {
    CompletePaymentInput,
    CreatePendingPaymentInput,
    PaymentHistoryRecord,
    PaymentRecord,
    PaymentStatusPatchInput,
    RefundablePaymentRecord,
} from '@/domain/models/Payment'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'
import type { BillingCycle, PricingTier } from '@/lib/pricing/tiers'

export class PrismaPaymentRepository implements PaymentRepository {
    async createPending(input: CreatePendingPaymentInput): Promise<void> {
        await prisma.payment.create({
            data: {
                user_id: input.userId,
                app_user_id: input.appUserId || null,
                company_id: input.companyId,
                provider_order_id: input.providerOrderId,
                payment_provider: input.paymentProvider,
                amount: new Prisma.Decimal(input.amount),
                currency: input.currency,
                status: 'pending',
                tier: input.tier,
                billing_cycle: input.billingCycle,
                receipt: input.receipt,
                notes: input.notes as any,
                payment_type: input.paymentType ?? null,
            },
        })
    }

    async findByProviderOrderIdForUser(orderId: string, userId: string): Promise<PaymentRecord | null> {
        const row = await prisma.payment.findFirst({
            where: {
                provider_order_id: orderId,
                user_id: userId,
            },
        })
        return row ? this.mapRow(row) : null
    }

    async findByProviderOrderId(orderId: string): Promise<PaymentRecord | null> {
        const row = await prisma.payment.findUnique({
            where: { provider_order_id: orderId },
        })
        return row ? this.mapRow(row) : null
    }

    async findScheduledTrialVerificationRefunds(beforeIso: string): Promise<RefundablePaymentRecord[]> {
        const rows = await prisma.payment.findMany({
            where: {
                payment_type: 'trial_verification',
                status: 'completed',
                refund_status: 'scheduled',
                refund_scheduled_at: { lte: new Date(beforeIso) },
            },
            select: {
                id: true,
                provider_order_id: true,
                provider_payment_id: true,
                amount: true,
            },
        })

        return rows.map((row) => ({
            id: row.id,
            providerOrderId: row.provider_order_id,
            providerPaymentId: row.provider_payment_id,
            amount: Number(row.amount),
        }))
    }

    async listTransactions(options: {
        status?: 'all' | 'completed' | 'pending' | 'failed' | 'refunded'
        sortBy: 'date' | 'amount'
        sortOrder: 'asc' | 'desc'
    }): Promise<PaymentHistoryRecord[]> {
        const where: Prisma.PaymentWhereInput = {}
        if (options.status && options.status !== 'all') {
            where.status = options.status
        }

        const rows = await prisma.payment.findMany({
            where,
            orderBy: {
                [options.sortBy === 'date' ? 'created_at' : 'amount']: options.sortOrder,
            },
        })

        return rows.map((row) => this.mapHistoryRow(row))
    }

    async markCompleted(paymentId: string, input: CompletePaymentInput): Promise<void> {
        await prisma.payment.update({
            where: { id: paymentId },
            data: {
                provider_payment_id: input.providerPaymentId,
                provider_signature: input.providerSignature,
                payment_provider: input.paymentProvider,
                status: 'completed',
                amount_paid: new Prisma.Decimal(input.amountPaid),
                paid_at: new Date(input.paidAt),
                updated_at: new Date(input.updatedAt),
            },
        })
    }

    async updateById(paymentId: string, input: PaymentStatusPatchInput): Promise<void> {
        await prisma.payment.update({
            where: { id: paymentId },
            data: this.mapPatch(input),
        })
    }

    async updateByProviderOrderId(orderId: string, input: PaymentStatusPatchInput): Promise<void> {
        await prisma.payment.update({
            where: { provider_order_id: orderId },
            data: this.mapPatch(input),
        })
    }

    private mapRow(row: any): PaymentRecord {
        return {
            id: row.id,
            userId: row.user_id,
            appUserId: row.app_user_id,
            companyId: row.company_id,
            providerOrderId: row.provider_order_id,
            providerPaymentId: row.provider_payment_id,
            amount: Number(row.amount),
            amountPaid: row.amount_paid ? Number(row.amount_paid) : null,
            currency: row.currency,
            status: row.status as any,
            tier: row.tier as PricingTier,
            billingCycle: row.billing_cycle as BillingCycle,
            receipt: row.receipt,
            paymentMethod: row.payment_method,
            paidAt: row.paid_at?.toISOString(),
            errorCode: row.error_code,
            errorDescription: row.error_description,
            createdAt: row.created_at?.toISOString(),
            updatedAt: row.updated_at?.toISOString(),
            refundStatus: row.refund_status,
            refundScheduledAt: row.refund_scheduled_at?.toISOString(),
            paymentType: row.payment_type,
        }
    }

    private mapHistoryRow(row: any): PaymentHistoryRecord {
        return {
            id: row.id,
            userId: row.user_id,
            appUserId: row.app_user_id,
            companyId: row.company_id,
            providerOrderId: row.provider_order_id,
            providerPaymentId: row.provider_payment_id,
            amount: Number(row.amount),
            amountPaid: row.amount_paid ? Number(row.amount_paid) : null,
            currency: row.currency,
            status: row.status as any,
            tier: row.tier,
            billingCycle: row.billing_cycle,
            receipt: row.receipt,
            paymentMethod: row.payment_method,
            paidAt: row.paid_at?.toISOString(),
            errorCode: row.error_code,
            errorDescription: row.error_description,
            createdAt: row.created_at?.toISOString(),
            updatedAt: row.updated_at?.toISOString(),
        }
    }

    private mapPatch(input: PaymentStatusPatchInput): Prisma.PaymentUpdateInput {
        return {
            provider_payment_id: input.providerPaymentId,
            provider_signature: input.providerSignature,
            payment_provider: input.paymentProvider,
            payment_method: input.paymentMethod,
            status: input.status,
            amount_paid: input.amountPaid ? new Prisma.Decimal(input.amountPaid) : undefined,
            paid_at: input.paidAt ? new Date(input.paidAt) : undefined,
            refunded_at: input.refundedAt ? new Date(input.refundedAt) : undefined,
            refund_amount: input.refundAmount ? new Prisma.Decimal(input.refundAmount) : undefined,
            updated_at: new Date(input.updatedAt),
            refund_scheduled_at: input.refundScheduledAt ? new Date(input.refundScheduledAt) : undefined,
            refund_status: input.refundStatus,
            error_code: input.errorCode,
            error_description: input.errorDescription,
        }
    }
}
