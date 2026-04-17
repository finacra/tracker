/**
 * Seed the 17-folder system taxonomy for every company that doesn't
 * yet have it, and migrate legacy folder_name → folder_id for every
 * document. Idempotent — safe to re-run. Run:
 *   npx tsx scripts/backfill-vault-folders.ts
 *
 * lib/vault/folders.ts is gated with `import 'server-only'` so we
 * inline the seed logic here rather than import it.
 */
import { prisma } from '../lib/prisma'
import { SYSTEM_TAXONOMY, LEGACY_FOLDER_MAP, type SystemFolderDef } from '../lib/vault/taxonomy'

async function ensureSystemFolders(companyId: string) {
  const existing = await prisma.vaultFolder.findMany({
    where: { company_id: companyId, kind: 'system' },
    select: { slug: true, parent_id: true },
  })
  const existingKey = (slug: string, parentId: string | null) => `${parentId ?? 'root'}:${slug}`
  const seen = new Set(existing.map(r => existingKey(r.slug, r.parent_id)))

  let sort = 0
  const insertTree = async (nodes: SystemFolderDef[], parentId: string | null) => {
    for (const node of nodes) {
      const key = existingKey(node.slug, parentId)
      let folderId: string
      if (seen.has(key)) {
        const row = await prisma.vaultFolder.findFirst({
          where: { company_id: companyId, parent_id: parentId, slug: node.slug, kind: 'system' },
          select: { id: true },
        })
        folderId = row!.id
      } else {
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
      }
      if (node.children?.length) await insertTree(node.children, folderId)
    }
  }
  await insertTree(SYSTEM_TAXONOMY, null)
}

async function migrateDocumentFolders(companyId: string) {
  await ensureSystemFolders(companyId)
  const systemRows = await prisma.vaultFolder.findMany({
    where: { company_id: companyId, kind: 'system' },
    select: { id: true, slug: true, name: true, parent_id: true },
  })
  const slugToFolder = new Map(systemRows.map(r => [r.slug, r]))

  // All docs for this company that still need migration (folder_id OR
  // folder_name pointing at a legacy string). Touch both so the DocumentsTab
  // card UI — which groups by folder_name — shows files under the new names.
  const docs = await prisma.companyDocument.findMany({
    where: { company_id: companyId, deleted_at: null },
    select: { id: true, folder_name: true, folder_id: true },
  })

  const result = { migrated: 0, renamedOnly: 0, unmatched: 0 }
  const defaultFolder = slugToFolder.get('financials') || systemRows[0]

  for (const doc of docs) {
    const slug = doc.folder_name ? LEGACY_FOLDER_MAP[doc.folder_name] : undefined
    const target = (slug && slugToFolder.get(slug)) || defaultFolder
    if (!target) { result.unmatched++; continue }

    // Figure out the display name to write back. For a nested system
    // folder (e.g. "moa" under "constitutional"), use the top-level
    // parent's name since the card UI only shows top-level folders.
    let displayName = target.name
    if (target.parent_id) {
      const parent = systemRows.find(r => r.id === target.parent_id)
      if (parent) displayName = parent.name
    }

    const needsFolderId = doc.folder_id !== target.id
    const needsRename = doc.folder_name !== displayName
    if (!needsFolderId && !needsRename) continue

    await prisma.companyDocument.update({
      where: { id: doc.id },
      data: {
        ...(needsFolderId ? { folder_id: target.id } : {}),
        ...(needsRename ? { folder_name: displayName } : {}),
      },
    })
    if (slug && needsFolderId) result.migrated++
    else if (needsRename) result.renamedOnly++
    else result.unmatched++
  }
  return result
}

async function main() {
  const companies = await prisma.$queryRawUnsafe<Array<{ id: string; name: string }>>(
    `SELECT id, name FROM companies ORDER BY created_at ASC`,
  )

  console.log(`Found ${companies.length} companies. Seeding…`)
  for (const c of companies) {
    try {
      await ensureSystemFolders(c.id)
      const r = await migrateDocumentFolders(c.id)
      console.log(` ✓ ${c.name} — migrated ${r.migrated} docs, ${r.unmatched} unmatched`)
    } catch (err) {
      console.error(` ✕ ${c.name} — ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
