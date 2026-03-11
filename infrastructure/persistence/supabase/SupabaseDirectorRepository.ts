import type { DirectorRecord, DirectorRepository } from '@/application/interfaces/DirectorRepository'
import { createAdminClient } from '@/utils/supabase/admin'

type DirectorRow = {
  id: string
  first_name?: string | null
  last_name?: string | null
  middle_name?: string | null
  director_id?: string | null
  designation?: string | null
  dob?: string | null
  tax_id?: string | null
  email?: string | null
  mobile?: string | null
  is_verified?: boolean | null
  source?: 'cin' | 'din' | 'manual' | null
}

export class SupabaseDirectorRepository implements DirectorRepository {
  async getByCompanyId(companyId: string): Promise<DirectorRecord[]> {
    const adminSupabase: any = createAdminClient()
    const { data, error } = await adminSupabase
      .from('directors')
      .select(
        'id, first_name, last_name, middle_name, director_id, designation, dob, tax_id, email, mobile, is_verified, source'
      )
      .eq('company_id', companyId)
      .order('created_at', { ascending: true })

    if (error) throw new Error(error.message)

    return (data ?? []).map((dir: DirectorRow) => ({
      id: dir.id,
      firstName: dir.first_name || '',
      lastName: dir.last_name || '',
      middleName: dir.middle_name || '',
      din: dir.director_id || '',
      designation: dir.designation || '',
      dob: dir.dob || '',
      pan: dir.tax_id || '',
      email: dir.email || '',
      mobile: dir.mobile || '',
      verified: dir.is_verified || false,
      source: dir.source || 'manual',
    }))
  }

  async createMany(directors: import('@/application/interfaces/DirectorRepository').CreateDirectorInput[]): Promise<void> {
    if (directors.length === 0) return
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase.from('directors').insert(
      directors.map((dir) => ({
        company_id: dir.companyId,
        first_name: dir.firstName,
        last_name: dir.lastName,
        middle_name: dir.middleName || null,
        director_id: dir.din || null,
        designation: dir.designation || null,
        dob: dir.dob || null,
        tax_id: dir.pan || null,
        email: dir.email || null,
        mobile: dir.mobile || null,
        is_verified: dir.isVerified || false,
        source: dir.source || 'manual',
      }))
    )
    if (error) throw new Error(error.message)
  }

  async deleteByCompanyId(companyId: string): Promise<void> {
    const adminSupabase: any = createAdminClient()
    const { error } = await adminSupabase
      .from('directors')
      .delete()
      .eq('company_id', companyId)

    if (error) throw new Error(error.message)
  }
}
