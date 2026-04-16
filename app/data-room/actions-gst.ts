'use server'

import { createServerContainer } from '@/lib/composition/server-container'
import { handleActionError } from '@/lib/errors/handle-error'
import { validateCompanyId } from '@/lib/utils/input-validation'
import { prisma } from '@/lib/prisma'
import { validateGSTN, parseGSTN } from '@/lib/utils/gstn'

export type GstRegistrationDto = {
  id: string
  gstin: string
  state: string
}

async function assertCompanyAccess(companyId: string) {
  if (!validateCompanyId(companyId)) throw new Error('Invalid company ID')
  const { authService, companyMembershipRepository, companyRepository } = createServerContainer()
  const user = await authService.requireCurrentUser()

  const company = await companyRepository.getDetailsById(companyId)
  if (!company) throw new Error('Company not found')

  const isOwner = company.ownerUserId === user.id || company.ownerAppUserId === user.id
  if (!isOwner) {
    const membership = await companyMembershipRepository.findRole(user.id, companyId)
    if (!membership) throw new Error('Access denied')
  }
  return { user, company }
}

export async function listGstRegistrations(companyId: string): Promise<{
  success: boolean
  homeState?: string | null
  registrations?: GstRegistrationDto[]
  error?: string
}> {
  try {
    const { company } = await assertCompanyAccess(companyId)
    const rows = await prisma.gstRegistration.findMany({
      where: { company_id: companyId },
      orderBy: { created_at: 'asc' },
      select: { id: true, gstin: true, state: true },
    })
    return {
      success: true,
      homeState: company.state || null,
      registrations: rows.map((r) => ({ id: r.id, gstin: r.gstin, state: r.state || '' })),
    }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function addGstRegistration(companyId: string, gstinInput: string): Promise<{
  success: boolean
  registration?: GstRegistrationDto
  error?: string
}> {
  try {
    await assertCompanyAccess(companyId)
    const gstin = (gstinInput || '').toUpperCase().trim()
    if (!validateGSTN(gstin)) {
      return { success: false, error: 'Invalid GSTIN format' }
    }
    const state = parseGSTN(gstin)?.stateName || null

    // Unique (company_id, gstin) — surface a clean message on duplicate.
    const existing = await prisma.gstRegistration.findUnique({
      where: { company_id_gstin: { company_id: companyId, gstin } },
      select: { id: true },
    })
    if (existing) {
      return { success: false, error: 'This GSTIN is already registered for this company' }
    }

    const row = await prisma.gstRegistration.create({
      data: { company_id: companyId, gstin, state },
      select: { id: true, gstin: true, state: true },
    })
    return { success: true, registration: { id: row.id, gstin: row.gstin, state: row.state || '' } }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function updateGstRegistration(
  companyId: string,
  registrationId: string,
  gstinInput: string,
): Promise<{ success: boolean; registration?: GstRegistrationDto; error?: string }> {
  try {
    await assertCompanyAccess(companyId)
    const gstin = (gstinInput || '').toUpperCase().trim()
    if (!validateGSTN(gstin)) {
      return { success: false, error: 'Invalid GSTIN format' }
    }
    const state = parseGSTN(gstin)?.stateName || null

    // Scope the update to this company so a leaked id from another company can't be edited.
    const existing = await prisma.gstRegistration.findFirst({
      where: { id: registrationId, company_id: companyId },
      select: { id: true },
    })
    if (!existing) return { success: false, error: 'Registration not found' }

    const row = await prisma.gstRegistration.update({
      where: { id: existing.id },
      data: { gstin, state, updated_at: new Date() },
      select: { id: true, gstin: true, state: true },
    })
    return { success: true, registration: { id: row.id, gstin: row.gstin, state: row.state || '' } }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function deleteGstRegistration(
  companyId: string,
  registrationId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    await assertCompanyAccess(companyId)
    const result = await prisma.gstRegistration.deleteMany({
      where: { id: registrationId, company_id: companyId },
    })
    if (result.count === 0) return { success: false, error: 'Registration not found' }
    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}
