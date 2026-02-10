export type EmailLayoutArgs = {
  title: string
  preheader?: string
  bodyHtml: string
  footerNote?: string
  /** URL for "Manage preferences" link */
  preferencesUrl?: string
  /** URL for one-click unsubscribe (type-specific) */
  unsubscribeUrl?: string
}

function escapeHtml(input: string) {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

/**
 * Responsive email layout with mobile-friendly styles and unsubscribe links
 */
export function emailLayout(args: EmailLayoutArgs): string {
  const primaryNavy = '#1E3A5F'
  const textGray = '#374151'
  const mutedGray = '#6B7280'
  const linkBlue = '#1E3A5F'
  const border = '#E5E7EB'
  const bg = '#F8FAFC'

  const preheader = args.preheader ? escapeHtml(args.preheader) : ''
  
  // Build unsubscribe footer links
  let unsubscribeHtml = ''
  if (args.preferencesUrl || args.unsubscribeUrl) {
    const links: string[] = []
    if (args.preferencesUrl) {
      links.push(`<a href="${args.preferencesUrl}" style="color:${linkBlue};text-decoration:underline;">Manage preferences</a>`)
    }
    if (args.unsubscribeUrl) {
      links.push(`<a href="${args.unsubscribeUrl}" style="color:${linkBlue};text-decoration:underline;">Unsubscribe</a>`)
    }
    unsubscribeHtml = `<div style="font-size:11px;line-height:16px;color:${mutedGray};margin-top:8px;">${links.join(' &nbsp;•&nbsp; ')}</div>`
  }

  // Mobile-responsive CSS (supported by most modern email clients)
  const responsiveStyles = `
    <style type="text/css">
      /* Reset */
      body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
      table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
      img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
      
      /* Mobile styles */
      @media only screen and (max-width: 620px) {
        .email-container { width: 100% !important; max-width: 100% !important; }
        .mobile-padding { padding-left: 16px !important; padding-right: 16px !important; }
        .mobile-padding-sm { padding-left: 12px !important; padding-right: 12px !important; }
        .mobile-stack { display: block !important; width: 100% !important; }
        .mobile-center { text-align: center !important; }
        .mobile-button { display: block !important; width: 100% !important; text-align: center !important; }
        .mobile-button a { display: block !important; width: 100% !important; padding: 14px 20px !important; }
        .kv-label { display: block !important; width: 100% !important; padding-bottom: 2px !important; }
        .kv-value { display: block !important; width: 100% !important; padding-top: 0 !important; padding-bottom: 12px !important; }
      }
    </style>
    <!--[if mso]>
    <style type="text/css">
      .mobile-button a { padding: 10px 14px !important; }
    </style>
    <![endif]-->
  `.trim()

  // Email-safe: table-based layout, inline styles only.
  return `
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta http-equiv="X-UA-Compatible" content="IE=edge" />
    ${preheader ? `<meta name="x-preheader" content="${preheader}" />` : ''}
    <title>${escapeHtml(args.title)}</title>
    ${responsiveStyles}
  </head>
  <body style="margin:0;padding:0;background:${bg};font-family:Arial,Helvetica,sans-serif;color:${textGray};-webkit-font-smoothing:antialiased;">
    ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;font-size:1px;line-height:1px;">${preheader}${'&nbsp;'.repeat(100)}</div>` : ''}
    
    <!-- Wrapper table -->
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:${bg};">
      <tr>
        <td style="padding:24px 12px;" class="mobile-padding-sm">
          <table role="presentation" cellpadding="0" cellspacing="0" align="center" class="email-container" width="600" style="max-width:600px;margin:0 auto;">
            <tr>
              <td>
                <!-- Main card -->
                <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#FFFFFF;border:1px solid ${border};border-radius:14px;overflow:hidden;">
                  <!-- Header -->
                  <tr>
                    <td style="background:${primaryNavy};padding:18px 20px;" class="mobile-padding">
                      <div style="font-size:16px;line-height:22px;color:#FFFFFF;font-weight:700;">Finacra</div>
                      <div style="font-size:12px;line-height:18px;color:rgba(255,255,255,0.85);margin-top:2px;">Compliance Tracker</div>
                    </td>
                  </tr>
                  <!-- Body -->
                  <tr>
                    <td style="padding:22px 20px;" class="mobile-padding">
                      <div style="font-size:18px;line-height:26px;font-weight:700;color:#111827;margin:0 0 14px 0;">${escapeHtml(args.title)}</div>
                      ${args.bodyHtml}
                    </td>
                  </tr>
                  <!-- Footer -->
                  <tr>
                    <td style="padding:16px 20px;border-top:1px solid ${border};" class="mobile-padding">
                      <div style="font-size:12px;line-height:18px;color:${mutedGray};">
                        ${args.footerNote ? escapeHtml(args.footerNote) : 'Confidential — for internal use only.'}
                      </div>
                    </td>
                  </tr>
                </table>
                
                <!-- Bottom links -->
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

/**
 * Primary CTA button - mobile responsive
 */
export function primaryButton(href: string, label: string): string {
  const navy = '#1E3A5F'
  return `
<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:16px;" class="mobile-button">
  <tr>
    <td>
      <a href="${href}" style="display:inline-block;background:${navy};color:#FFFFFF;text-decoration:none;padding:10px 14px;border-radius:10px;font-weight:700;font-size:13px;mso-padding-alt:0;">
        <!--[if mso]><i style="letter-spacing:14px;mso-font-width:-100%;mso-text-raise:20pt">&nbsp;</i><![endif]-->
        <span style="mso-text-raise:10pt;">${label}</span>
        <!--[if mso]><i style="letter-spacing:14px;mso-font-width:-100%">&nbsp;</i><![endif]-->
      </a>
    </td>
  </tr>
</table>
`.trim()
}

/**
 * Key-value row for data display - mobile responsive (stacks on small screens)
 */
export function kvRow(label: string, value: string): string {
  return `
<tr>
  <td class="kv-label" style="padding:8px 0;color:#6B7280;font-size:12px;line-height:18px;width:180px;vertical-align:top;">${label}</td>
  <td class="kv-value" style="padding:8px 0;color:#111827;font-size:12px;line-height:18px;font-weight:600;vertical-align:top;">${value}</td>
</tr>
`.trim()
}

/**
 * Section header for grouped content
 */
export function sectionHeader(text: string, count?: number): string {
  const countHtml = count !== undefined 
    ? ` <span style="color:#6B7280;font-weight:600;">(${count})</span>` 
    : ''
  return `<div style="font-size:13px;line-height:20px;color:#111827;font-weight:700;margin-top:16px;">${text}${countHtml}</div>`
}
