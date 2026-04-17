import 'server-only'
import { prisma } from '@/lib/prisma'
import { SYSTEM_TAXONOMY, LEGACY_FOLDER_MAP, type SystemFolderDef } from './taxonomy'

/**
 * Ensure every company has the full system folder tree seeded. Idempotent:
 * missing rows are inserted, existing rows are left alone. Safe to call
 * from onboarding, first-visit to the vault, or a one-shot admin run.
 */
// Count expected system folders in the taxonomy once (roots + descendants).
// Used to early-return from ensureSystemFolders when the DB is already
// fully seeded — saves 17 sequential round trips per vault load.
const EXPECTED_SYSTEM_FOLDER_COUNT = (() => {
  const count = (nodes: SystemFolderDef[]): number =>
    nodes.reduce((n, node) => n + 1 + (node.children ? count(node.children) : 0), 0)
  return count(SYSTEM_TAXONOMY)
})()

export async function ensureSystemFolders(companyId: string): Promise<void> {
  // Single query: pull id + slug + parent_id for every existing system row.
  const existing = await prisma.vaultFolder.findMany({
    where: { company_id: companyId, kind: 'system' },
    select: { id: true, slug: true, parent_id: true },
  })

  // Fast path: already fully seeded → no writes, no N+1 lookups.
  if (existing.length >= EXPECTED_SYSTEM_FOLDER_COUNT) return

  const keyFor = (slug: string, parentId: string | null) => `${parentId ?? 'root'}:${slug}`
  const idByKey = new Map<string, string>()
  for (const r of existing) idByKey.set(keyFor(r.slug, r.parent_id), r.id)

  let sort = 0
  const insertTree = async (nodes: SystemFolderDef[], parentId: string | null) => {
    for (const node of nodes) {
      const key = keyFor(node.slug, parentId)
      let folderId = idByKey.get(key)
      if (!folderId) {
        const row = await prisma.vaultFolder.create({
          data: {
            company_id: companyId,
            parent_id: parentId,
            slug: node.slug,
            name: node.name,
            kind: 'system',
            sort_order: sort++,
          },
          select: { id: true },
        })
        folderId = row.id
        idByKey.set(key, folderId)
      }
      if (node.children?.length) {
        await insertTree(node.children, folderId)
      }
    }
  }

  await insertTree(SYSTEM_TAXONOMY, null)
}

/**
 * Migrate a company's existing company_documents_internal.folder_name
 * values to folder_id. Runs exactly the logic the UI needs: map legacy
 * string → system slug → folder_id. Unmatched values fall through to
 * 'financials' (safe bucket), so no document ends up orphaned.
 */
export async function migrateDocumentFolders(companyId: string): Promise<{
  migrated: number
  alreadyMigrated: number
  unmatched: number
}> {
  await ensureSystemFolders(companyId)

  const systemRows = await prisma.vaultFolder.findMany({
    where: { company_id: companyId, kind: 'system' },
    select: { id: true, slug: true, parent_id: true },
  })
  const slugToId = new Map<string, string>()
  for (const r of systemRows) slugToId.set(r.slug, r.id)

  const docs = await prisma.companyDocument.findMany({
    where: { company_id: companyId, folder_id: null, deleted_at: null },
    select: { id: true, folder_name: true },
  })

  const result = { migrated: 0, alreadyMigrated: 0, unmatched: 0 }
  const defaultFolderId = slugToId.get('financials') || systemRows[0]?.id

  for (const doc of docs) {
    const slug = doc.folder_name ? LEGACY_FOLDER_MAP[doc.folder_name] : undefined
    const targetId = (slug && slugToId.get(slug)) || defaultFolderId
    if (!targetId) {
      result.unmatched++
      continue
    }
    await prisma.companyDocument.update({
      where: { id: doc.id },
      data: { folder_id: targetId },
    })
    if (slug) result.migrated++
    else result.unmatched++
  }

  const already = await prisma.companyDocument.count({
    where: { company_id: companyId, folder_id: { not: null } },
  })
  result.alreadyMigrated = already - result.migrated

  return result
}

/**
 * Flattened tree for the vault UI: system folders first (in taxonomy
 * order), then user folders alphabetically inside their parent.
 */
export async function getFolderTree(companyId: string) {
  await ensureSystemFolders(companyId)
  const rows = await prisma.vaultFolder.findMany({
    where: { company_id: companyId },
    orderBy: [{ kind: 'asc' }, { sort_order: 'asc' }, { name: 'asc' }],
  })
  return rows
}

export async function createUserFolder(options: {
  companyId: string
  parentId: string | null
  name: string
}) {
  await ensureSystemFolders(options.companyId)
  const slug = options.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64)
  if (!slug) throw new Error('Folder name must contain at least one letter or digit')

  // If a folder already exists at this parent+slug, return it (idempotent).
  const existing = await prisma.vaultFolder.findFirst({
    where: { company_id: options.companyId, parent_id: options.parentId, slug },
    select: { id: true, kind: true },
  })
  if (existing) return existing

  return prisma.vaultFolder.create({
    data: {
      company_id: options.companyId,
      parent_id: options.parentId,
      slug,
      name: options.name.trim().slice(0, 80),
      kind: 'user',
    },
    select: { id: true, kind: true },
  })
}

export async function renameUserFolder(options: {
  companyId: string
  folderId: string
  name: string
}) {
  const folder = await prisma.vaultFolder.findFirst({
    where: { id: options.folderId, company_id: options.companyId },
    select: { id: true, kind: true },
  })
  if (!folder) throw new Error('Folder not found')
  if (folder.kind === 'system') throw new Error('System folders cannot be renamed')
  await prisma.vaultFolder.update({
    where: { id: options.folderId },
    data: { name: options.name.trim().slice(0, 80) },
  })
}

export async function deleteUserFolder(options: {
  companyId: string
  folderId: string
}) {
  const folder = await prisma.vaultFolder.findFirst({
    where: { id: options.folderId, company_id: options.companyId },
    select: { id: true, kind: true, parent_id: true },
  })
  if (!folder) throw new Error('Folder not found')
  if (folder.kind === 'system') throw new Error('System folders cannot be deleted')

  // Re-parent any children + documents to this folder's parent (so deleting
  // a user folder never orphans data). Do it sequentially — PgBouncer
  // transaction mode rejects interactive $transaction (CLAUDE.md §12).
  await prisma.vaultFolder.updateMany({
    where: { parent_id: folder.id, company_id: options.companyId },
    data: { parent_id: folder.parent_id },
  })
  await prisma.companyDocument.updateMany({
    where: { folder_id: folder.id, company_id: options.companyId },
    data: { folder_id: folder.parent_id },
  })
  await prisma.vaultFolder.delete({ where: { id: folder.id } })
}

/**
 * Given a system slug, return this company's folder id. Used by the
 * agent + tracker-to-vault wiring.
 */
export async function getSystemFolderId(
  companyId: string,
  slug: string,
): Promise<string | null> {
  await ensureSystemFolders(companyId)
  const row = await prisma.vaultFolder.findFirst({
    where: { company_id: companyId, kind: 'system', slug },
    select: { id: true },
  })
  return row?.id || null
}
