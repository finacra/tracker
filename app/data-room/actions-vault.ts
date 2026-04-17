'use server'

import { createServerContainer } from '@/lib/composition/server-container'
import { handleActionError } from '@/lib/errors/handle-error'
import { validateCompanyId } from '@/lib/utils/input-validation'
import { prisma } from '@/lib/prisma'
import {
  getFolderTree,
  createUserFolder,
  renameUserFolder,
  deleteUserFolder,
  ensureSystemFolders,
  migrateDocumentFolders,
} from '@/lib/vault/folders'

async function assertCompanyAccess(companyId: string) {
  if (!validateCompanyId(companyId)) throw new Error('Invalid company ID')
  const { authService, companyMembershipRepository, companyRepository } = createServerContainer()
  const user = await authService.requireCurrentUser()

  const company = await companyRepository.getDetailsById(companyId)
  if (!company) throw new Error('Company not found')

  const isOwner = company.ownerUserId === user.id || company.ownerAppUserId === user.id
  let role: string | null = null
  if (!isOwner) {
    const membership = await companyMembershipRepository.findRole(user.id, companyId)
    if (!membership) throw new Error('Access denied')
    role = membership.role
  } else {
    role = 'owner'
  }
  return { user, company, role }
}

function assertEditor(role: string | null) {
  if (role !== 'owner' && role !== 'admin' && role !== 'editor') {
    throw new Error('Insufficient permission')
  }
}

// ── Folder tree ───────────────────────────────────────────────────────────

export async function listVaultFolders(companyId: string): Promise<{
  success: boolean
  folders?: Array<{ id: string; parentId: string | null; slug: string; name: string; kind: string }>
  error?: string
}> {
  try {
    await assertCompanyAccess(companyId)
    const rows = await getFolderTree(companyId)
    return {
      success: true,
      folders: rows.map((r) => ({
        id: r.id, parentId: r.parent_id, slug: r.slug, name: r.name, kind: r.kind,
      })),
    }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function createVaultFolder(
  companyId: string,
  parentId: string | null,
  name: string,
): Promise<{ success: boolean; folderId?: string; error?: string }> {
  try {
    const { role } = await assertCompanyAccess(companyId)
    assertEditor(role)
    if (!name.trim()) return { success: false, error: 'Folder name is required' }
    const folder = await createUserFolder({ companyId, parentId, name })
    return { success: true, folderId: folder.id }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function renameVaultFolder(
  companyId: string,
  folderId: string,
  name: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { role } = await assertCompanyAccess(companyId)
    assertEditor(role)
    await renameUserFolder({ companyId, folderId, name })
    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function deleteVaultFolder(
  companyId: string,
  folderId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { role } = await assertCompanyAccess(companyId)
    assertEditor(role)
    await deleteUserFolder({ companyId, folderId })
    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function bootstrapVault(
  companyId: string,
): Promise<{
  success: boolean
  migrated?: { migrated: number; alreadyMigrated: number; unmatched: number }
  error?: string
}> {
  try {
    await assertCompanyAccess(companyId)
    await ensureSystemFolders(companyId)
    const migrated = await migrateDocumentFolders(companyId)
    return { success: true, migrated }
  } catch (error) {
    return handleActionError(error)
  }
}

// ── Documents ─────────────────────────────────────────────────────────────

export async function renameDocument(
  companyId: string,
  documentId: string,
  newName: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { role } = await assertCompanyAccess(companyId)
    assertEditor(role)
    if (!newName.trim()) return { success: false, error: 'File name cannot be empty' }

    const existing = await prisma.companyDocument.findFirst({
      where: { id: documentId, company_id: companyId, deleted_at: null },
      select: { id: true },
    })
    if (!existing) return { success: false, error: 'Document not found' }

    await prisma.companyDocument.update({
      where: { id: existing.id },
      data: { file_name: newName.trim().slice(0, 255), updated_at: new Date() },
    })
    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function moveDocument(
  companyId: string,
  documentId: string,
  folderId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { role } = await assertCompanyAccess(companyId)
    assertEditor(role)

    const [doc, folder] = await Promise.all([
      prisma.companyDocument.findFirst({
        where: { id: documentId, company_id: companyId, deleted_at: null },
        select: { id: true },
      }),
      prisma.vaultFolder.findFirst({
        where: { id: folderId, company_id: companyId },
        select: { id: true },
      }),
    ])
    if (!doc) return { success: false, error: 'Document not found' }
    if (!folder) return { success: false, error: 'Target folder not found' }

    await prisma.companyDocument.update({
      where: { id: doc.id },
      data: { folder_id: folder.id, updated_at: new Date() },
    })
    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function deleteDocument(
  companyId: string,
  documentId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const { role } = await assertCompanyAccess(companyId)
    assertEditor(role)

    const existing = await prisma.companyDocument.findFirst({
      where: { id: documentId, company_id: companyId, deleted_at: null },
      select: { id: true },
    })
    if (!existing) return { success: false, error: 'Document not found' }

    // Soft delete — keeps ComplianceAssessment / ComplianceFiling links
    // intact for audit. The vault + tracker filter on deleted_at IS NULL.
    await prisma.companyDocument.update({
      where: { id: existing.id },
      data: { deleted_at: new Date(), is_latest: false },
    })
    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}

/**
 * Soft-delete many documents in one round trip. Returns counts so the
 * UI can toast "Deleted N documents" without needing to reconcile.
 */
export async function bulkDeleteDocuments(
  companyId: string,
  documentIds: string[],
): Promise<{ success: boolean; deleted?: number; error?: string }> {
  try {
    const { role } = await assertCompanyAccess(companyId)
    assertEditor(role)
    if (!Array.isArray(documentIds) || documentIds.length === 0) {
      return { success: false, error: 'No documents selected' }
    }
    const res = await prisma.companyDocument.updateMany({
      where: {
        id: { in: documentIds },
        company_id: companyId,
        deleted_at: null,
      },
      data: { deleted_at: new Date(), is_latest: false },
    })
    return { success: true, deleted: res.count }
  } catch (error) {
    return handleActionError(error)
  }
}

/**
 * Tree view of the company's vault: all folders + the non-deleted
 * documents inside them. Consumed by the VaultTreeView UI component.
 */
export async function listVaultTree(companyId: string): Promise<{
  success: boolean
  folders?: Array<{ id: string; parentId: string | null; slug: string; name: string; kind: string; sortOrder: number }>
  documents?: Array<{
    id: string
    folderId: string | null
    folderName: string | null
    fileName: string | null
    documentType: string | null
    fileSize: number | null
    createdAt: string | null
    updatedAt: string | null
    requirementId: string | null
    isLatest: boolean
    versionNumber: number
  }>
  error?: string
}> {
  try {
    await assertCompanyAccess(companyId)
    await ensureSystemFolders(companyId)

    const [folders, latestDocs, allVersionCounts] = await Promise.all([
      prisma.vaultFolder.findMany({
        where: { company_id: companyId },
        orderBy: [{ kind: 'asc' }, { sort_order: 'asc' }, { name: 'asc' }],
      }),
      // Only `is_latest = true` rows show in the tree — old versions are
      // discovered via the "Versions" menu on each row, not as siblings.
      prisma.companyDocument.findMany({
        where: { company_id: companyId, deleted_at: null, is_draft: false, is_latest: true },
        orderBy: { updated_at: 'desc' },
      }),
      // Per-chain version counts so the UI can render "v3" badges without
      // a second round trip per document. Counted via parent_document_id
      // walk in-memory after fetch.
      prisma.companyDocument.findMany({
        where: { company_id: companyId, deleted_at: null, is_draft: false },
        select: { id: true, parent_document_id: true, version_number: true },
      }),
    ])

    // For each latest doc, walk its chain (via parent pointers) and take
    // the max version_number — that's what we surface.
    const chainVersion = new Map<string, number>()
    const parentMap = new Map<string, string | null>()
    for (const r of allVersionCounts) parentMap.set(r.id, r.parent_document_id)
    for (const latest of latestDocs) {
      let max = latest.version_number || 1
      let node: string | null = latest.id
      const seen = new Set<string>()
      while (node && !seen.has(node)) {
        seen.add(node)
        const row = allVersionCounts.find(r => r.id === node)
        if (!row) break
        if (row.version_number > max) max = row.version_number
        node = row.parent_document_id
      }
      chainVersion.set(latest.id, max)
    }

    return {
      success: true,
      folders: folders.map((f) => ({
        id: f.id,
        parentId: f.parent_id,
        slug: f.slug,
        name: f.name,
        kind: f.kind,
        sortOrder: f.sort_order,
      })),
      documents: latestDocs.map((d) => ({
        id: d.id,
        folderId: d.folder_id,
        folderName: d.folder_name,
        fileName: d.file_name,
        documentType: d.document_type,
        fileSize: null,
        createdAt: d.created_at ? d.created_at.toISOString() : null,
        updatedAt: d.updated_at ? d.updated_at.toISOString() : null,
        requirementId: d.requirement_id,
        isLatest: d.is_latest,
        versionNumber: chainVersion.get(d.id) || d.version_number,
      })),
    }
  } catch (error) {
    return handleActionError(error)
  }
}

/**
 * Link a new document as the next version of an existing one. The old
 * document keeps its row (audit) but is_latest flips to false; the new
 * document inherits the old one's folder + requirement unless overridden.
 */
export async function supersedeDocument(
  companyId: string,
  oldDocumentId: string,
  newDocumentId: string,
): Promise<{ success: boolean; versionNumber?: number; error?: string }> {
  try {
    const { role } = await assertCompanyAccess(companyId)
    assertEditor(role)

    const [oldDoc, newDoc] = await Promise.all([
      prisma.companyDocument.findFirst({
        where: { id: oldDocumentId, company_id: companyId },
        select: { id: true, version_number: true, folder_id: true, requirement_id: true, document_type: true },
      }),
      prisma.companyDocument.findFirst({
        where: { id: newDocumentId, company_id: companyId, deleted_at: null },
        select: { id: true },
      }),
    ])
    if (!oldDoc) return { success: false, error: 'Previous version not found' }
    if (!newDoc) return { success: false, error: 'New document not found' }

    const nextVersion = (oldDoc.version_number || 1) + 1

    // Mark old as no longer latest
    await prisma.companyDocument.update({
      where: { id: oldDoc.id },
      data: { is_latest: false, updated_at: new Date() },
    })
    // Point the new document at the old one
    await prisma.companyDocument.update({
      where: { id: newDoc.id },
      data: {
        parent_document_id: oldDoc.id,
        version_number: nextVersion,
        is_latest: true,
        folder_id: oldDoc.folder_id,
        requirement_id: oldDoc.requirement_id,
        document_type: oldDoc.document_type,
        updated_at: new Date(),
      },
    })
    return { success: true, versionNumber: nextVersion }
  } catch (error) {
    return handleActionError(error)
  }
}

/**
 * Walk the version chain for a given document. Returns oldest → newest.
 */
export async function listDocumentVersions(
  companyId: string,
  documentId: string,
): Promise<{
  success: boolean
  versions?: Array<{ id: string; versionNumber: number; fileName: string | null; createdAt: string | null; isLatest: boolean; deletedAt: string | null }>
  error?: string
}> {
  try {
    await assertCompanyAccess(companyId)

    // Walk backwards to the chain's root, then forward.
    const root = await (async () => {
      let cursor: { id: string; parent_document_id: string | null } | null =
        await prisma.companyDocument.findFirst({
          where: { id: documentId, company_id: companyId },
          select: { id: true, parent_document_id: true },
        })
      if (!cursor) return null
      while (cursor.parent_document_id) {
        const next: { id: string; parent_document_id: string | null } | null =
          await prisma.companyDocument.findFirst({
            where: { id: cursor.parent_document_id, company_id: companyId },
            select: { id: true, parent_document_id: true },
          })
        if (!next) break
        cursor = next
      }
      return cursor
    })()

    if (!root) return { success: false, error: 'Document not found' }

    // Collect forward via iterative query (small N, safe).
    const collected: Array<{ id: string; version_number: number; file_name: string | null; created_at: Date | null; is_latest: boolean; deleted_at: Date | null }> = []
    const rootRow = await prisma.companyDocument.findUnique({
      where: { id: root.id },
      select: { id: true, version_number: true, file_name: true, created_at: true, is_latest: true, deleted_at: true },
    })
    if (rootRow) collected.push(rootRow)

    let frontier: string[] = [root.id]
    while (frontier.length) {
      const children = await prisma.companyDocument.findMany({
        where: { company_id: companyId, parent_document_id: { in: frontier } },
        orderBy: { version_number: 'asc' },
        select: { id: true, version_number: true, file_name: true, created_at: true, is_latest: true, deleted_at: true },
      })
      collected.push(...children)
      frontier = children.map((c) => c.id)
    }

    return {
      success: true,
      versions: collected.map((v) => ({
        id: v.id,
        versionNumber: v.version_number,
        fileName: v.file_name,
        createdAt: v.created_at?.toISOString() || null,
        isLatest: v.is_latest,
        deletedAt: v.deleted_at?.toISOString() || null,
      })),
    }
  } catch (error) {
    return handleActionError(error)
  }
}
