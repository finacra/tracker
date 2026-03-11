import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
    try {
        console.log('Testing Prisma connection...')
        const userCount = await prisma.appUser.count()
        console.log('Connection successful! AppUser count:', userCount)

        const companyCount = await prisma.company.count()
        console.log('Company count:', companyCount)

    } catch (error) {
        console.error('Prisma connection failed:', error)
    } finally {
        await prisma.$disconnect()
    }
}

main()
