import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { verifyUnsubscribeToken, UnsubscribeType } from '@/lib/email/unsubscribe'

/**
 * One-click unsubscribe endpoint (RFC 8058 compliant)
 * GET: Show confirmation page
 * POST: Process unsubscribe
 */

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token')

  if (!token) {
    return new NextResponse(renderPage('Invalid Link', 'This unsubscribe link is invalid or expired.', false), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const decoded = verifyUnsubscribeToken(token)
  if (!decoded) {
    return new NextResponse(renderPage('Invalid Link', 'This unsubscribe link is invalid or expired.', false), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  // Show confirmation form
  const typeLabel = getTypeLabel(decoded.type)
  return new NextResponse(
    renderPage(
      'Confirm Unsubscribe',
      `You are about to unsubscribe from <strong>${typeLabel}</strong> emails.`,
      true,
      token
    ),
    { headers: { 'Content-Type': 'text/html' } }
  )
}

export async function POST(request: NextRequest) {
  let token: string | null = null

  // Support both form data and query param
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('application/x-www-form-urlencoded')) {
    const formData = await request.formData()
    token = formData.get('token') as string
  } else {
    token = request.nextUrl.searchParams.get('token')
  }

  if (!token) {
    return new NextResponse(renderPage('Error', 'Missing token.', false), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  const decoded = verifyUnsubscribeToken(token)
  if (!decoded) {
    return new NextResponse(renderPage('Invalid Link', 'This unsubscribe link is invalid or expired.', false), {
      status: 400,
      headers: { 'Content-Type': 'text/html' },
    })
  }

  try {
    const supabase = createAdminClient()

    // Upsert email preferences
    const updateData: Record<string, boolean> = {}
    if (decoded.type === 'all') {
      updateData.unsubscribe_all = true
    } else if (decoded.type === 'status_changes') {
      updateData.unsubscribe_status_changes = true
    } else if (decoded.type === 'reminders') {
      updateData.unsubscribe_reminders = true
    } else if (decoded.type === 'team_updates') {
      updateData.unsubscribe_team_updates = true
    }

    const { error } = await supabase
      .from('email_preferences')
      .upsert(
        {
          user_id: decoded.userId,
          ...updateData,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (error) {
      console.error('[unsubscribe] Error updating preferences:', error)
      return new NextResponse(renderPage('Error', 'Failed to update preferences. Please try again.', false), {
        status: 500,
        headers: { 'Content-Type': 'text/html' },
      })
    }

    const typeLabel = getTypeLabel(decoded.type)
    return new NextResponse(
      renderPage('Unsubscribed', `You have been unsubscribed from <strong>${typeLabel}</strong> emails.`, false, undefined, true),
      { headers: { 'Content-Type': 'text/html' } }
    )
  } catch (err) {
    console.error('[unsubscribe] Exception:', err)
    return new NextResponse(renderPage('Error', 'An unexpected error occurred.', false), {
      status: 500,
      headers: { 'Content-Type': 'text/html' },
    })
  }
}

function getTypeLabel(type: UnsubscribeType): string {
  switch (type) {
    case 'status_changes':
      return 'status change notification'
    case 'reminders':
      return 'compliance reminder'
    case 'team_updates':
      return 'team update'
    case 'all':
      return 'all'
    default:
      return type
  }
}

function renderPage(title: string, message: string, showForm: boolean, token?: string, success?: boolean): string {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'
  const preferencesUrl = `${siteUrl.replace(/\/+$/, '')}/settings/email-preferences`

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Finacra</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #F8FAFC;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 4px 24px rgba(0,0,0,0.08);
      max-width: 420px;
      width: 100%;
      padding: 32px;
      text-align: center;
    }
    .logo {
      font-size: 24px;
      font-weight: 700;
      color: #1E3A5F;
      margin-bottom: 8px;
    }
    .subtitle {
      font-size: 13px;
      color: #6B7280;
      margin-bottom: 24px;
    }
    h1 {
      font-size: 20px;
      color: ${success ? '#059669' : '#111827'};
      margin-bottom: 12px;
    }
    .message {
      font-size: 14px;
      color: #374151;
      line-height: 1.6;
      margin-bottom: 24px;
    }
    .btn {
      display: inline-block;
      background: #1E3A5F;
      color: white;
      padding: 12px 24px;
      border-radius: 10px;
      text-decoration: none;
      font-weight: 600;
      font-size: 14px;
      border: none;
      cursor: pointer;
      transition: background 0.2s;
    }
    .btn:hover { background: #2d4a6f; }
    .btn-secondary {
      background: transparent;
      color: #1E3A5F;
      border: 1px solid #E5E7EB;
      margin-left: 8px;
    }
    .btn-secondary:hover { background: #F3F4F6; }
    .links {
      margin-top: 20px;
      font-size: 13px;
    }
    .links a {
      color: #1E3A5F;
      text-decoration: none;
    }
    .links a:hover { text-decoration: underline; }
    .success-icon {
      width: 48px;
      height: 48px;
      background: #D1FAE5;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
    }
    .success-icon svg {
      width: 24px;
      height: 24px;
      color: #059669;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">Finacra</div>
    <div class="subtitle">Compliance Tracker</div>
    
    ${success ? `
    <div class="success-icon">
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
      </svg>
    </div>
    ` : ''}
    
    <h1>${title}</h1>
    <p class="message">${message}</p>
    
    ${showForm && token ? `
    <form method="POST" action="/api/unsubscribe">
      <input type="hidden" name="token" value="${token}">
      <button type="submit" class="btn">Confirm Unsubscribe</button>
      <a href="${siteUrl}" class="btn btn-secondary">Cancel</a>
    </form>
    ` : `
    <a href="${siteUrl}" class="btn">Go to Dashboard</a>
    `}
    
    <div class="links">
      <a href="${preferencesUrl}">Manage all email preferences</a>
    </div>
  </div>
</body>
</html>
`.trim()
}
