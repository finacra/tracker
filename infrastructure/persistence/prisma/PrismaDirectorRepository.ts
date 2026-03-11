import type {
    DirectorRecord,
    DirectorRepository,
    CreateDirectorInput,
} from '@/application/interfaces/DirectorRepository'
import { prisma } from '@/lib/prisma'

export class PrismaDirectorRepository implements DirectorRepository {
    async getByCompanyId(companyId: string): Promise<DirectorRecord[]> {
        const rows = await prisma.director.findMany({
            where: { company_id: companyId },
            orderBy: { created_at: 'asc' },
        })

        return rows.map((row) => ({
            id: row.id,
            firstName: row.first_name || '',
            lastName: row.last_name || '',
            middleName: row.middle_name || '',
            din: row.director_id || '',
            designation: row.designation || '',
            dob: row.dob ? row.dob.toISOString().split('T')[0] : '',
            pan: row.tax_id || '',
            email: row.email || '',
            mobile: row.mobile || '',
            verified: row.is_verified || false,
            source: (row.source as 'cin' | 'din' | 'manual') || 'manual',
        }))
    }

    async createMany(directors: CreateDirectorInput[]): Promise<void> {
        if (directors.length === 0) return

        await prisma.director.createMany({
            data: directors.map((dir) => ({
                company_id: dir.companyId,
                first_name: dir.firstName,
                last_name: dir.lastName,
                middle_name: dir.middleName || null,
                director_id: dir.din || null,
                designation: dir.designation || null,
                dob: dir.dob ? new Date(dir.dob) : null,
                tax_id: dir.pan || null,
                email: dir.email || null,
                mobile: dir.mobile || null,
                is_verified: dir.isVerified || false,
                source: dir.source || 'manual',
            })),
        })
    }

    async deleteByCompanyId(companyId: string): Promise<void> {
        await prisma.director.deleteMany({
            where: { company_id: companyId },
        })
    }
}
