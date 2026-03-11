const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
    try {
        console.log('Testing Prisma connection with Node.js directly...')
        const result = await prisma.$queryRaw`SELECT 1 as result`
        console.log('Connection successful! Query result:', result)

        const userCount = await prisma.appUser.count()
        console.log('AppUser count:', userCount)

    } catch (error) {
        console.error('Prisma connection failed:', error)
    } finally {
        await prisma.$disconnect()
    }
}

main()
