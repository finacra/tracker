// Supabase Edge Function (Deno) — Scheduled compliance reminder emails + in-app notifications
//
// Env required:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - RESEND_API_KEY
// - RESEND_FROM
// - NEXT_PUBLIC_SITE_URL (optional; defaults to https://comptracker.vercel.app)
// - CRON_SECRET (optional; if set, request must include header: x-cron-secret)

import { createClient } from 'jsr:@supabase/supabase-js@2'

type RequirementRow = {
  id: string
  company_id: string
  requirement: string
  due_date: string
  status: string
}

type UserRoleRow = {
  user_id: string
  company_id: string
  role: string
}

function siteUrl(): string {
  const u = Deno.env.get('NEXT_PUBLIC_SITE_URL') || 'https://comptracker.vercel.app'
  return u.replace(/\/+$/, '')
}

function daysBetweenUtc(a: Date, b: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000
  const aUtc = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())
  const bUtc = Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate())
  return Math.floor((bUtc - aUtc) / msPerDay)
}

function emailLayout(title: string, bodyHtml: string, preheader: string): string {
  const navy = '#1E3A5F'
  const border = '#E5E7EB'
  const bg = '#F8FAFC'
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background:${bg};font-family:Arial,Helvetica,sans-serif;color:#374151;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${bg};padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;background:#FFFFFF;border:1px solid ${border};border-radius:14px;overflow:hidden;">
            <tr>
              <td style="background:${navy};padding:18px 20px;">
                <div style="font-size:16px;line-height:22px;color:#FFFFFF;font-weight:700;">Finacra</div>
                <div style="font-size:12px;line-height:18px;color:rgba(255,255,255,0.85);margin-top:2px;">Compliance Tracker</div>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 20px;">
                <div style="font-size:18px;line-height:26px;font-weight:700;color:#111827;margin:0 0 14px 0;">${title}</div>
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 20px;border-top:1px solid ${border};">
                <div style="font-size:12px;line-height:18px;color:#6B7280;">Confidential — for internal use only.</div>
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

function renderSection(title: string, items: Array<{ companyName: string; requirementName: string; dueDate: string; status: string }>): string {
  const border = '#E5E7EB'
  if (items.length === 0) return ''
  const rows = items.slice(0, 20).map((i, idx) => `
    <tr>
      <td style="padding:12px 14px;${idx === 0 ? '' : `border-top:1px solid ${border};`}">
        <div style="font-size:12px;line-height:18px;color:#111827;font-weight:700;">${i.requirementName}</div>
        <div style="font-size:12px;line-height:18px;color:#6B7280;margin-top:2px;">
          ${i.companyName} • Due: ${i.dueDate} • Status: ${i.status}
        </div>
      </td>
    </tr>
  `).join('')

  return `
    <div style="margin-top:16px;">
      <div style="font-size:13px;line-height:20px;color:#111827;font-weight:700;">${title} <span style="color:#6B7280;font-weight:600;">(${items.length})</span></div>
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${border};border-radius:12px;border-collapse:separate;overflow:hidden;margin-top:10px;">
        ${rows}
      </table>
      ${items.length > 20 ? `<div style="font-size:12px;line-height:18px;color:#6B7280;margin-top:8px;">Showing 20 of ${items.length} items.</div>` : ''}
    </div>
  `.trim()
}

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

Deno.serve(async (req) => {
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

  const today = new Date()
  const runDate = today.toISOString().slice(0, 10) // YYYY-MM-DD

  const { data: requirements, error: reqError } = await supabase
    .from('regulatory_requirements')
    .select('id, company_id, requirement, due_date, status')
    .neq('status', 'completed')

  if (reqError) {
    return new Response(JSON.stringify({ ok: false, error: reqError.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  const dueSoonDays = new Set([14, 7, 3, 1])

  const dueSoon: Array<RequirementRow & { daysUntil: number }> = []
  const overdue: Array<RequirementRow & { daysOverdue: number }> = []

  for (const r of (requirements || []) as RequirementRow[]) {
    if (!r.due_date) continue
    const due = new Date(`${r.due_date}T00:00:00Z`)
    const daysUntil = daysBetweenUtc(today, due)
    if (dueSoonDays.has(daysUntil)) {
      dueSoon.push({ ...r, daysUntil })
    } else if (daysUntil < 0) {
      const daysOverdue = Math.abs(daysUntil)
      const include = daysOverdue <= 7 || daysOverdue % 7 === 0
      if (include) overdue.push({ ...r, daysOverdue })
    }
  }

  const relevantCompanyIds = Array.from(
    new Set([...dueSoon.map((r) => r.company_id), ...overdue.map((r) => r.company_id)]),
  )

  if (relevantCompanyIds.length === 0) {
    return new Response(JSON.stringify({ ok: true, runDate, sent: 0, skipped: 0, notes: 'No reminders' }), {
      headers: { 'content-type': 'application/json' },
    })
  }

  // Company names
  const { data: companies } = await supabase
    .from('companies')
    .select('id, name')
    .in('id', relevantCompanyIds)

  const companyNameById = new Map<string, string>()
  for (const c of (companies || []) as Array<{ id: string; name: string }>) {
    companyNameById.set(c.id, c.name)
  }

  // Admin mappings for those companies
  const { data: roles, error: rolesError } = await supabase
    .from('user_roles')
    .select('user_id, company_id, role')
    .in('company_id', relevantCompanyIds)
    .in('role', ['admin', 'superadmin'])

  if (rolesError) {
    return new Response(JSON.stringify({ ok: false, error: rolesError.message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }

  const companyAdmins = new Map<string, string[]>() // company_id -> user_ids
  for (const ur of (roles || []) as UserRoleRow[]) {
    const list = companyAdmins.get(ur.company_id) || []
    list.push(ur.user_id)
    companyAdmins.set(ur.company_id, list)
  }

  // Include superadmins (platform-wide access) - they should receive reminders for all companies
  const { data: superadmins, error: superadminError } = await supabase
    .from('user_roles')
    .select('user_id')
    .eq('role', 'superadmin')
    .is('company_id', null)

  if (!superadminError && superadmins) {
    // Add superadmins to all relevant companies
    for (const sa of superadmins) {
      for (const companyId of relevantCompanyIds) {
        const list = companyAdmins.get(companyId) || []
        if (!list.includes(sa.user_id)) {
          list.push(sa.user_id)
          companyAdmins.set(companyId, list)
        }
      }
    }
  }

  // Build per-user digest items
  const byUser = new Map<string, {
    due14: any[]
    due7: any[]
    due3: any[]
    due1: any[]
    overdue: any[]
    companies: Set<string>
  }>()

  function ensureUser(userId: string) {
    if (!byUser.has(userId)) {
      byUser.set(userId, { due14: [], due7: [], due3: [], due1: [], overdue: [], companies: new Set() })
    }
    return byUser.get(userId)!
  }

  for (const r of dueSoon) {
    const admins = companyAdmins.get(r.company_id) || []
    for (const userId of admins) {
      const u = ensureUser(userId)
      const item = {
        companyName: companyNameById.get(r.company_id) || 'Company',
        requirementName: r.requirement,
        dueDate: r.due_date,
        status: r.status,
        requirementId: r.id,
        companyId: r.company_id,
        daysUntil: r.daysUntil,
      }
      u.companies.add(r.company_id)
      if (r.daysUntil === 14) u.due14.push(item)
      if (r.daysUntil === 7) u.due7.push(item)
      if (r.daysUntil === 3) u.due3.push(item)
      if (r.daysUntil === 1) u.due1.push(item)
    }
  }

  for (const r of overdue) {
    const admins = companyAdmins.get(r.company_id) || []
    for (const userId of admins) {
      const u = ensureUser(userId)
      const item = {
        companyName: companyNameById.get(r.company_id) || 'Company',
        requirementName: r.requirement,
        dueDate: r.due_date,
        status: r.status,
        requirementId: r.id,
        companyId: r.company_id,
        daysOverdue: r.daysOverdue,
      }
      u.companies.add(r.company_id)
      u.overdue.push(item)
    }
  }

  // Resolve user emails - batch lookup for better performance
  const userIds = Array.from(byUser.keys())
  const emailByUserId = new Map<string, string>()

  // Batch lookup all user emails at once
  try {
    const { data: users, error: usersError } = await supabase.auth.admin.listUsers()
    if (!usersError && users?.users) {
      for (const user of users.users) {
        if (userIds.includes(user.id) && user.email) {
          emailByUserId.set(user.id, user.email)
        }
      }
    } else {
      // Fallback to individual lookups if batch fails
      console.warn('Batch user lookup failed, falling back to individual lookups:', usersError)
      for (const userId of userIds) {
        const { data } = await supabase.auth.admin.getUserById(userId)
        const email = data?.user?.email
        if (email) emailByUserId.set(userId, email)
      }
    }
  } catch (error) {
    console.error('Error in batch user lookup:', error)
    // Fallback to individual lookups
    for (const userId of userIds) {
      const { data } = await supabase.auth.admin.getUserById(userId)
      const email = data?.user?.email
      if (email) emailByUserId.set(userId, email)
    }
  }

  let sent = 0
  let skipped = 0

  // Send 1 digest per user per day (idempotent)
  for (const [userId, bucket] of byUser.entries()) {
    const toEmail = emailByUserId.get(userId)
    if (!toEmail) {
      skipped++
      continue
    }

    // Check email preferences - skip if user unsubscribed
    const { data: emailPrefs } = await supabase
      .from('email_preferences')
      .select('unsubscribe_reminders, unsubscribe_all')
      .eq('user_id', userId)
      .single()

    if (emailPrefs?.unsubscribe_all || emailPrefs?.unsubscribe_reminders) {
      skipped++
      continue // User unsubscribed from reminders
    }

    // Idempotency check - check if already sent today
    const { data: existingLog } = await supabase
      .from('notification_email_log')
      .select('id')
      .eq('user_id', userId)
      .eq('run_date', runDate)
      .eq('kind', 'reminder_digest')
      .maybeSingle()

    if (existingLog) {
      skipped++
      continue // Already sent today
    }

    const sectionsHtml = [
      renderSection('Due in 14 days', bucket.due14),
      renderSection('Due in 7 days', bucket.due7),
      renderSection('Due in 3 days', bucket.due3),
      renderSection('Due tomorrow', bucket.due1),
      renderSection('Overdue', bucket.overdue),
    ].filter(Boolean).join('')

    const preheader = `Compliance reminders — ${runDate}`
    const bodyHtml = `
      <div style="font-size:13px;line-height:20px;color:#374151;">Here are your compliance reminders.</div>
      ${sectionsHtml || `<div style="font-size:13px;line-height:20px;color:#374151;margin-top:10px;">No reminders for today.</div>`}
      ${primaryButton(`${siteUrl()}/data-room`, 'Open Tracker')}
    `.trim()

    const html = emailLayout('Compliance reminders', bodyHtml, preheader)

    // Send email with error handling - continue processing other users if one fails
    try {
      await resendSend([toEmail], preheader, html)
      
      // Only insert log entry AFTER successful email send
      const { error: logErr } = await supabase
        .from('notification_email_log')
        .insert({ user_id: userId, run_date: runDate, kind: 'reminder_digest' })

      if (logErr) {
        // Log entry failed but email was sent - log warning but don't fail
        console.warn(`Email sent to ${toEmail} but failed to log (user ${userId}):`, logErr)
      }
      
      sent++
    } catch (error) {
      console.error(`Failed to send email to ${toEmail} (user ${userId}):`, error)
      // Continue with next user instead of stopping
      // Don't insert log entry if email failed - allows retry on next run
      skipped++
      continue
    }

    // In-app notifications (best-effort)
    const notifications: any[] = []
    const pushItem = (type: 'upcoming_deadline' | 'overdue', item: any, title: string, message: string, metadata: Record<string, unknown>) => {
      notifications.push({
        company_id: item.companyId,
        user_id: userId,
        type,
        title,
        message,
        requirement_id: item.requirementId,
        is_read: false,
        metadata,
      })
    }

    for (const item of bucket.due14) {
      pushItem('upcoming_deadline', item, 'Compliance due soon', `"${item.requirementName}" is due in 14 days (${item.dueDate}).`, { days_until_due: 14 })
    }
    for (const item of bucket.due7) {
      pushItem('upcoming_deadline', item, 'Compliance due soon', `"${item.requirementName}" is due in 7 days (${item.dueDate}).`, { days_until_due: 7 })
    }
    for (const item of bucket.due3) {
      pushItem('upcoming_deadline', item, 'Compliance due soon', `"${item.requirementName}" is due in 3 days (${item.dueDate}).`, { days_until_due: 3 })
    }
    for (const item of bucket.due1) {
      pushItem('upcoming_deadline', item, 'Compliance due tomorrow', `"${item.requirementName}" is due tomorrow (${item.dueDate}).`, { days_until_due: 1 })
    }
    for (const item of bucket.overdue) {
      pushItem('overdue', item, 'Compliance overdue', `"${item.requirementName}" is overdue (due ${item.dueDate}).`, { days_overdue: item.daysOverdue })
    }

    if (notifications.length > 0) {
      await supabase.from('company_notifications').insert(notifications)
    }
  }

  return new Response(JSON.stringify({ ok: true, runDate, users: userIds.length, sent, skipped }), {
    headers: { 'content-type': 'application/json' },
  })
})

