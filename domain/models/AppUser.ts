export interface AppUser {
  id: string
  /** The canonical app_users.id. During migration, `id` holds the legacy auth ID while this holds the app-owned ID. */
  canonicalId: string | null
  email: string
  fullName: string | null
  legacyAuthProvider: 'supabase' | 'passport'
  legacyAuthId: string | null
}
