'use server'

import { createServerContainer } from '@/lib/composition/server-container'

export async function getTransactionHistory(options: {
  status?: 'all' | 'completed' | 'pending' | 'failed' | 'refunded'
  sortBy: 'date' | 'amount'
  sortOrder: 'asc' | 'desc'
}) {
  try {
    const { companyRepository, paymentRepository, userRepository } = createServerContainer()
    const payments = await paymentRepository.listTransactions(options)

    const userIds = [...new Set(payments.map(payment => payment.userId))]
    const companyIds = [
      ...new Set(payments.map(payment => payment.companyId).filter((companyId): companyId is string => Boolean(companyId))),
    ]

    const [users, companies] = await Promise.all([
      Promise.all(userIds.map(userId => userRepository.getById(userId))),
      Promise.all(companyIds.map(companyId => companyRepository.getById(companyId))),
    ])

    const userEmailMap = new Map(users.filter(Boolean).map(user => [user!.id, user!.email]))
    const companyNameMap = new Map(companies.filter(Boolean).map(company => [company!.id, company!.name]))

    return {
      success: true,
      payments: payments.map(payment => ({
        ...payment,
        userEmail: userEmailMap.get(payment.userId) ?? `${payment.userId.substring(0, 8)}...`,
        companyName: payment.companyId ? companyNameMap.get(payment.companyId) ?? null : null,
      })),
    }
  } catch (error: any) {
    console.error('Error loading transaction history:', error)
    return {
      success: false,
      error: error.message || 'Failed to load transaction history',
      payments: [],
    }
  }
}
