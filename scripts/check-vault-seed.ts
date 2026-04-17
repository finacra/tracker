/**
 * Quick audit: how many companies have the 17-folder system taxonomy
 * seeded vs not. Run:  npx tsx scripts/check-vault-seed.ts
 */
import { prisma } from '../lib/prisma'

async function main() {
  const companyCount = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*)::int AS n FROM companies`,
  )
  const seededRows = await prisma.$queryRawUnsafe<Array<{ company_id: string; n: number }>>(
    `SELECT company_id, COUNT(*)::int AS n
     FROM vault_folders
     WHERE kind = 'system'
     GROUP BY company_id`,
  )
  const fullySeeded = seededRows.filter(r => r.n >= 17).length
  const partiallySeeded = seededRows.filter(r => r.n > 0 && r.n < 17).length
  const notSeeded = companyCount[0].n - seededRows.length

  const docCount = await prisma.$queryRawUnsafe<Array<{ n: number }>>(
    `SELECT COUNT(*)::int AS n FROM company_documents_internal
     WHERE folder_id IS NULL AND deleted_at IS NULL`,
  )

  console.log(JSON.stringify({
    totalCompanies: companyCount[0].n,
    fullySeeded,
    partiallySeeded,
    notSeeded,
    docsWithoutFolderId: docCount[0].n,
  }, null, 2))
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
