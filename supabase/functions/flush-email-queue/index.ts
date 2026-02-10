// Supabase Edge Function (Deno) — Flush email batch queue
//
// This function runs every 5 minutes via pg_cron to batch and send queued status change emails.
// Instead of sending 10 emails for 10 status changes in 5 minutes, it sends 1 batched digest.
//
// Env required:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - RESEND_API_KEY
// - RESEND_FROM
// - NEXT_PUBLIC_SITE_URL (optional; defaults to https://comptracker.vercel.app)
// - CRON_SECRET (optional; if set, request must include header: x-cron-secret)

import { createClient } from 'jsr:@supabase/supabase-js@2'

type QueueItem = {
  id: string
  user_id: string
  user_email: string
  company_id: string
  company_name: string
  email_type: string
  payload: {
    requirement_id: string
    requirement_name: string
    due_date: string | null
    old_status: string
    new_status: string
    recipient_name: string | null
  }
  created_at: string
}

type EmailPreferences = {
  unsubscribe_status_changes: boolean
  unsubscribe_all: boolean
}

function siteUrl(): string {
  const u = Deno.env.get('NEXT_PUBLIC_SITE_URL') || 'https://comptracker.vercel.app'
  return u.replace(/\/+$/, '')
}

// ─────────────────────────────────────────────────────────────────────────────
// Email templates (self-contained for Edge Function)
// ─────────────────────────────────────────────────────────────────────────────

function emailLayout(title: string, bodyHtml: string, preheader: string, unsubscribeUrl?: string): string {
  const navy = '#1E3A5F'
  const border = '#E5E7EB'
  const bg = '#F8FAFC'
  const mutedGray = '#6B7280'

  const preferencesUrl = `${siteUrl()}/settings/email-preferences`
  
  let unsubscribeHtml = ''
  if (unsubscribeUrl) {
    unsubscribeHtml = `<div style="font-size:11px;line-height:16px;color:${mutedGray};margin-top:8px;">
      <a href="${preferencesUrl}" style="color:${navy};text-decoration:underline;">Manage preferences</a>
      &nbsp;•&nbsp;
      <a href="${unsubscribeUrl}" style="color:${navy};text-decoration:underline;">Unsubscribe</a>
    </div>`
  }

  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style type="text/css">
      @media only screen and (max-width: 620px) {
        .email-container { width: 100% !important; max-width: 100% !important; }
        .mobile-padding { padding-left: 16px !important; padding-right: 16px !important; }
      }
    </style>
  </head>
  <body style="margin:0;padding:0;background:${bg};font-family:Arial,Helvetica,sans-serif;color:#374151;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${bg};">
      <tr>
        <td style="padding:24px 12px;">
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" class="email-container" width="600" style="max-width:600px;margin:0 auto;">
            <tr>
              <td>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#FFFFFF;border:1px solid ${border};border-radius:14px;overflow:hidden;">
                  <tr>
                    <td style="background:${navy};padding:18px 20px;" class="mobile-padding">
                      <div style="font-size:16px;line-height:22px;color:#FFFFFF;font-weight:700;">Finacra</div>
                      <div style="font-size:12px;line-height:18px;color:rgba(255,255,255,0.85);margin-top:2px;">Compliance Tracker</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:22px 20px;" class="mobile-padding">
                      <div style="font-size:18px;line-height:26px;font-weight:700;color:#111827;margin:0 0 14px 0;">${title}</div>
                      ${bodyHtml}
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:16px 20px;border-top:1px solid ${border};" class="mobile-padding">
                      <div style="font-size:12px;line-height:18px;color:${mutedGray};">Confidential — for internal use only.</div>
                    </td>
                  </tr>
                </table>
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:12px;">
                  <tr>
                    <td align="center">
                      <div style="font-size:11px;line-height:16px;color:${mutedGray};">
                        If you didn't expect this email, you can ignore it.
                      </div>
                      ${unsubscribeHtml}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
`.trim()
}

function primaryButton(href: string, label: string): string {
  const navy = '#1E3A5F'
  return `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;">
  <tr>
    <td>
      <a href="${href}" style="display:inline-block;background:${navy};color:#FFFFFF;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:700;font-size:13px;">
        ${label}
      </a>
    </td>
  </tr>
</table>
`.trim()
}

function getStatusBadge(status: string): string {
  const colors: Record<string, { bg: string; text: string }> = {
    completed: { bg: '#D1FAE5', text: '#059669' },
    pending: { bg: '#FEF3C7', text: '#D97706' },
    overdue: { bg: '#FEE2E2', text: '#DC2626' },
    not_started: { bg: '#F3F4F6', text: '#6B7280' },
    upcoming: { bg: '#DBEAFE', text: '#2563EB' },
  }
  
  const { bg, text } = colors[status] || colors.not_started
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  
  return `<span style="display:inline-block;background:${bg};color:${text};font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;">${label}</span>`
}

function renderBatchedEmail(
  recipientName: string | null,
  items: Array<QueueItem['payload'] & { company_name: string }>,
  unsubscribeUrl: string
): { subject: string; html: string } {
  const count = items.length
  const subject = count === 1
    ? `Status updated: ${items[0].requirement_name}`
    : `${count} compliance items updated`

  const border = '#E5E7EB'

  // Group by new status
  const completed = items.filter(i => i.new_status === 'completed')
  const pending = items.filter(i => i.new_status === 'pending')
  const overdue = items.filter(i => i.new_status === 'overdue')
  const other = items.filter(i => !['completed', 'pending', 'overdue'].includes(i.new_status))

  function renderSection(title: string, sectionItems: typeof items, accentColor: string): string {
    if (sectionItems.length === 0) return ''
    
    const rows = sectionItems.slice(0, 15).map((item, idx) => {
      const dueInfo = item.due_date ? ` • Due: ${item.due_date}` : ''
      return `
      <tr>
        <td style="padding:12px 14px;${idx > 0 ? `border-top:1px solid ${border};` : ''}">
          <div style="font-size:12px;line-height:18px;color:#111827;font-weight:700;">${item.requirement_name}</div>
          <div style="font-size:12px;line-height:18px;color:#6B7280;margin-top:2px;">
            ${item.company_name}${dueInfo}
          </div>
          <div style="font-size:11px;line-height:16px;color:#9CA3AF;margin-top:4px;">
            ${item.old_status} → ${getStatusBadge(item.new_status)}
          </div>
        </td>
      </tr>
    `
    }).join('')

    const moreCount = sectionItems.length - 15
    const moreHtml = moreCount > 0 
      ? `<div style="font-size:12px;line-height:18px;color:#6B7280;margin-top:8px;padding-left:14px;">+${moreCount} more...</div>` 
      : ''

    return `
<div style="margin-top:16px;">
  <div style="font-size:13px;line-height:20px;font-weight:700;margin-bottom:8px;">
    <span style="color:${accentColor};">●</span>
    <span style="color:#111827;margin-left:6px;">${title}</span>
    <span style="color:#6B7280;font-weight:600;margin-left:4px;">(${sectionItems.length})</span>
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${border};border-radius:10px;border-collapse:separate;overflow:hidden;">
    ${rows}
  </table>
  ${moreHtml}
</div>
`.trim()
  }

  const greeting = recipientName 
    ? `<div style="font-size:13px;line-height:20px;color:#374151;">Hi ${recipientName},</div>`
    : ''

  const intro = count === 1
    ? `<div style="font-size:13px;line-height:20px;color:#374151;margin-top:${recipientName ? '8px' : '0'};">A compliance item was updated:</div>`
    : `<div style="font-size:13px;line-height:20px;color:#374151;margin-top:${recipientName ? '8px' : '0'};">${count} compliance items were updated in the last few minutes:</div>`

  const sectionsHtml = [
    renderSection('Completed', completed, '#059669'),
    renderSection('Pending', pending, '#D97706'),
    renderSection('Overdue', overdue, '#DC2626'),
    renderSection('Updated', other, '#6B7280'),
  ].filter(Boolean).join('')

  const bodyHtml = `
${greeting}
${intro}
${sectionsHtml}
${primaryButton(`${siteUrl()}/data-room`, 'View All Compliances')}
`.trim()

  const html = emailLayout(
    count === 1 ? 'Status Update' : 'Status Updates',
    bodyHtml,
    subject,
    unsubscribeUrl
  )

  return { subject, html }
}

// ─────────────────────────────────────────────────────────────────────────────
// Resend email sender
// ─────────────────────────────────────────────────────────────────────────────

async function resendSend(to: string[], subject: string, html: string) {
  const apiKey = Deno.env.get('RESEND_API_KEY')
  const from = Deno.env.get('RESEND_FROM')
  if (!apiKey) throw new Error('Missing RESEND_API_KEY')
  if (!from) throw new Error('Missing RESEND_FROM')

  const resp = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ from, to, subject, html }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Resend error: ${resp.status} ${text}`)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Unsubscribe token generation (matches lib/email/unsubscribe.ts)
// ─────────────────────────────────────────────────────────────────────────────

async function generateUnsubscribeToken(userId: string, type: string): Promise<string> {
  const secret = Deno.env.get('UNSUBSCRIBE_SECRET') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || 'fallback-secret'
  const payload = `${userId}:${type}`
  
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload))
  const signatureHex = Array.from(new Uint8Array(signature))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16)
  
  const token = btoa(`${payload}:${signatureHex}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return token
}

function getUnsubscribeUrl(token: string): string {
  return `${siteUrl()}/api/unsubscribe?token=${token}`
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  // Auth check
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (cronSecret) {
    const provided = req.headers.get('x-cron-secret')
    if (provided !== cronSecret) {
      return new Response('Unauthorized', { status: 401 })
    }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !serviceKey) {
    return new Response('Missing Supabase env', { status: 500 })
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Fetch pending queue items
  const { data: queueItems, error: fetchError } = await supabase
    .from('email_batch_queue')
    .select('*')
    .is('processed_at', null)
    .order('created_at', { ascending: true })
    .limit(500)

  if (fetchError) {
    return new Response(JSON.stringify({ ok: false, error: fetchError.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  if (!queueItems || queueItems.length === 0) {
    return new Response(JSON.stringify({ ok: true, processed: 0, note: 'No pending items' }), {
      headers: { 'content-type': 'application/json' },
    })
  }

  // Group by user_id + email_type
  const byUser = new Map<string, QueueItem[]>()
  for (const item of queueItems as QueueItem[]) {
    const key = `${item.user_id}:${item.email_type}`
    const list = byUser.get(key) || []
    list.push(item)
    byUser.set(key, list)
  }

  // Fetch email preferences for all users
  const userIds = Array.from(new Set((queueItems as QueueItem[]).map(i => i.user_id)))
  const { data: prefsData } = await supabase
    .from('email_preferences')
    .select('user_id, unsubscribe_status_changes, unsubscribe_all')
    .in('user_id', userIds)

  const prefsByUser = new Map<string, EmailPreferences>()
  for (const p of (prefsData || []) as Array<EmailPreferences & { user_id: string }>) {
    prefsByUser.set(p.user_id, p)
  }

  let sent = 0
  let skipped = 0
  const processedIds: string[] = []

  for (const [key, items] of byUser.entries()) {
    const userId = key.split(':')[0]
    const emailType = key.split(':')[1]
    const userEmail = items[0].user_email

    // Check preferences
    const prefs = prefsByUser.get(userId)
    if (prefs?.unsubscribe_all || (emailType === 'status_change' && prefs?.unsubscribe_status_changes)) {
      // User unsubscribed, mark as processed but don't send
      processedIds.push(...items.map(i => i.id))
      skipped += items.length
      continue
    }

    // Build batched email
    const recipientName = items[0].payload.recipient_name
    const emailItems = items.map(i => ({
      ...i.payload,
      company_name: i.company_name,
    }))

    try {
      const unsubscribeToken = await generateUnsubscribeToken(userId, 'status_changes')
      const unsubscribeUrl = getUnsubscribeUrl(unsubscribeToken)
      
      const { subject, html } = renderBatchedEmail(recipientName, emailItems, unsubscribeUrl)
      await resendSend([userEmail], subject, html)
      
      processedIds.push(...items.map(i => i.id))
      sent++
    } catch (err) {
      console.error(`[flush-email-queue] Error sending to ${userEmail}:`, err)
      // Don't mark as processed so it retries next time
    }
  }

  // Mark processed items
  if (processedIds.length > 0) {
    await supabase
      .from('email_batch_queue')
      .update({ processed_at: new Date().toISOString() })
      .in('id', processedIds)
  }

  return new Response(
    JSON.stringify({
      ok: true,
      queued: queueItems.length,
      batches: byUser.size,
      sent,
      skipped,
      processed: processedIds.length,
    }),
    { headers: { 'content-type': 'application/json' } }
  )
})
