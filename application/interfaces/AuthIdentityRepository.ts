export interface AuthIdentityRecord {
  id: string
  appUserId: string
  provider: string
  legacyAuthId: string | null
  email: string | null
  isPrimary: boolean
  metadata: Record<string, unknown>
  createdAt: string
}

export interface AuthIdentityRepository {
  findByLegacyAuthId(provider: string, legacyAuthId: string): Promise<AuthIdentityRecord | null>
  findByAppUserId(appUserId: string): Promise<AuthIdentityRecord[]>
  findPrimaryForAppUser(appUserId: string): Promise<AuthIdentityRecord | null>
  create(input: Omit<AuthIdentityRecord, 'id' | 'createdAt'>): Promise<AuthIdentityRecord>
}
