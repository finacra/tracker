/**
 * Utility function to generate ICS calendar file from regulatory requirements
 * Extracted from TrackerTab for SRP compliance
 */

export function generateICSFile(requirements: Array<{
  id: string
  requirement?: string | null
  description?: string | null
  category?: string | null
  due_date?: string | null
}>): string {
  const now = new Date()
  const timestamp = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  let icsContent = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Finacra//Compliance Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ].join('\r\n') + '\r\n'

  requirements.forEach((req) => {
    if (!req.due_date) return

    const dueDate = new Date(req.due_date)
    const dueDateStr = dueDate.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

    icsContent += [
      'BEGIN:VEVENT',
      `UID:${req.id}@finnovate.com`,
      `DTSTAMP:${timestamp}`,
      `DTSTART:${dueDateStr}`,
      `DTEND:${dueDateStr}`,
      `SUMMARY:${req.requirement || 'Compliance Requirement'}`,
      `DESCRIPTION:${req.description || ''}\\nCategory: ${req.category || ''}`,
      'END:VEVENT'
    ].join('\r\n') + '\r\n'
  })

  icsContent += 'END:VCALENDAR'

  return icsContent
}
