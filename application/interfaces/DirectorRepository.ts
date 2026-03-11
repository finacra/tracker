export interface DirectorRecord {
  id: string
  firstName: string
  lastName: string
  middleName: string
  din: string
  designation: string
  dob: string
  pan: string
  email: string
  mobile: string
  verified: boolean
  source: 'cin' | 'din' | 'manual'
}

export interface CreateDirectorInput {
  companyId: string
  firstName: string
  lastName: string
  middleName?: string | null
  din?: string | null
  designation?: string | null
  dob?: string | null
  pan?: string | null
  email?: string | null
  mobile?: string | null
  isVerified?: boolean
  source?: 'cin' | 'din' | 'manual'
}

export interface DirectorRepository {
  getByCompanyId(companyId: string): Promise<DirectorRecord[]>
  createMany(directors: CreateDirectorInput[]): Promise<void>
  deleteByCompanyId(companyId: string): Promise<void>
}
