import { emailLayout } from './layout'

interface DocumentInfo {
  name: string
  category: string
  period?: string
  url: string
}

interface DocumentShareEmailProps {
  companyName: string
  senderName: string
  senderEmail: string
  customMessage: string
  documents: DocumentInfo[]
  unsubscribeUrl?: string
}

export function documentShareEmail({
  companyName,
  senderName,
  senderEmail,
  customMessage,
  documents,
  unsubscribeUrl = '',
}: DocumentShareEmailProps): string {
  // Format the custom message with line breaks
  const formattedMessage = customMessage
    .split('\n')
    .map(line => `<p style="margin:0 0 8px 0;color:#374151;font-size:13px;line-height:20px;">${line || '&nbsp;'}</p>`)
    .join('')

  // Build document list HTML
  const documentListHtml = documents.map((doc, index) => `
    <tr>
      <td style="padding:12px 16px;border-bottom:1px solid #E5E7EB;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="vertical-align:top;width:40px;">
              <div style="width:32px;height:32px;background:#1E3A5F;border-radius:6px;text-align:center;line-height:32px;">
                <span style="color:#FFFFFF;font-size:12px;font-weight:600;">${index + 1}</span>
              </div>
            </td>
            <td style="vertical-align:top;padding-left:12px;">
              <div style="font-size:13px;font-weight:600;color:#111827;">${doc.name}</div>
              <div style="font-size:11px;color:#6B7280;margin-top:2px;">${doc.category}${doc.period ? ` • ${doc.period}` : ''}</div>
            </td>
            <td style="vertical-align:middle;text-align:right;width:100px;">
              <a href="${doc.url}" style="display:inline-block;background:#1E3A5F;color:#FFFFFF;text-decoration:none;padding:6px 12px;border-radius:6px;font-size:11px;font-weight:600;">
                Download
              </a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('')

  const bodyContent = `
<div style="font-size:13px;line-height:20px;color:#374151;">
  <p style="margin:0 0 16px 0;">
    <strong>${senderName}</strong> (${senderEmail}) has shared ${documents.length} document${documents.length !== 1 ? 's' : ''} with you from <strong>${companyName}</strong>.
  </p>
</div>

${customMessage ? `
<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin-bottom:20px;">
  <div style="font-size:11px;color:#6B7280;text-transform:uppercase;font-weight:600;margin-bottom:8px;">Message from sender</div>
  ${formattedMessage}
</div>
` : ''}

<div style="margin-top:20px;">
  <div style="font-size:14px;font-weight:600;color:#111827;margin-bottom:12px;">Shared Documents</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#FFFFFF;border:1px solid #E5E7EB;border-radius:8px;overflow:hidden;">
    ${documentListHtml}
  </table>
</div>

<div style="margin-top:20px;padding:12px 16px;background:#FEF3C7;border:1px solid #FCD34D;border-radius:8px;">
  <div style="font-size:12px;color:#92400E;">
    <strong>Note:</strong> These download links will expire in 7 days. Please download the documents before they expire.
  </div>
</div>
`

  return emailLayout({
    preheader: `${senderName} shared ${documents.length} document${documents.length !== 1 ? 's' : ''} from ${companyName}`,
    title: 'Documents Shared with You',
    bodyHtml: bodyContent,
    unsubscribeUrl,
  })
}
