export interface AppNotification {
  id: string
  user_id: string
  company_id: string | null
  type: string
  title: string
  message: string
  requirement_id: string | null
  document_id: string | null
  is_read: boolean
  read_at: string | null
  created_at: string
  metadata: Record<string, unknown> | null
}
