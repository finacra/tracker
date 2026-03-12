const { PrismaClient } = require('@prisma/client')

async function main() {
  const prisma = new PrismaClient()
  try {
    console.log('Adding indexes...')
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_company_id ON regulatory_requirements (company_id);
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_regulatory_requirements_due_date ON regulatory_requirements (due_date);
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_directors_company_id ON directors (company_id);
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_subscriptions_app_user_active ON subscriptions (app_user_id) WHERE (status = 'active' OR is_trial = true);
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_user_roles_app_user_id ON user_roles (app_user_id);
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_auth_identities_legacy_auth_id ON auth_identities (legacy_auth_id);
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_companies_app_user_id ON companies (app_user_id);
    `)
    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_companies_user_id ON companies (user_id);
    `)
    console.log('Successfully added indexes.')
  } catch (err) {
    console.error('Error adding indexes:', err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
