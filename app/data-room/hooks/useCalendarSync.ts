/**
 * Custom hook for calendar sync functionality
 * Extracted from TrackerTab for SRP compliance
 */

import { trackCalendarSync } from '@/lib/tracking/kpi-tracker'
import { generateICSFile } from '../utils/icsGenerator'

interface UseCalendarSyncProps {
  user: { id: string } | null
  currentCompany: { id: string; name: string } | null
  regulatoryRequirements: Array<{
    id: string
    requirement?: string | null
    description?: string | null
    category?: string | null
    due_date?: string | null
  }>
}

export function useCalendarSync({
  user,
  currentCompany,
  regulatoryRequirements
}: UseCalendarSyncProps) {
  const handleCalendarSync = async () => {
    if (!user?.id || !currentCompany?.id) {
      return
    }

    try {
      // Generate calendar file (ICS format)
      const icsContent = generateICSFile(regulatoryRequirements)
      const blob = new Blob([icsContent], { type: 'text/calendar' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${currentCompany.name}-compliance-calendar.ics`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)

      // Track calendar sync
      await trackCalendarSync(user.id, currentCompany.id).catch(err => {
        console.error('Failed to track calendar sync:', err)
      })
    } catch (error) {
      console.error('Error syncing calendar:', error)
    }
  }

  return {
    handleCalendarSync
  }
}
