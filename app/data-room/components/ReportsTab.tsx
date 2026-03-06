'use client'


import React, { useMemo } from 'react'
import jsPDF from 'jspdf'
import { enrichComplianceRequirements, type EnrichedComplianceData } from '@/app/data-room/actions-enrichment'
import { formatCurrency } from '@/lib/utils/currency'
import { trackReportDownload } from '@/lib/tracking/kpi-tracker'
import { type RegulatoryRequirement } from '@/app/data-room/actions'


interface ReportsTabProps {
  // Data
  displayRequirements: any[]
  currentCompany: any
  countryCode: string
  countryConfig: any
  user: any
 
  // Functions from parent
  calculateDelayMemoized: (dueDateStr: string, status: string) => number | null
  calculatePenaltyMemoized: (penaltyStr: string | null, daysDelayed: number | null, penaltyBaseAmount?: number | null) => string
  normalizeDate: (dateStr: string | Date | null | undefined) => Date | null
  formatDate: (dateStr: string) => string
 
  // PDF generation state
  isGeneratingEnhancedPDF: boolean
  setIsGeneratingEnhancedPDF: (value: boolean) => void
  pdfGenerationProgress: { current: number; total: number; step: string }
  setPdfGenerationProgress: (value: { current: number; total: number; step: string }) => void
 
  // Compliance Score Modal (modal JSX is in parent)
  isComplianceScoreModalOpen: boolean
  setIsComplianceScoreModalOpen: (value: boolean) => void
}


export default function ReportsTab({
  displayRequirements,
  currentCompany,
  countryCode,
  countryConfig,
  user,
  calculateDelayMemoized,
  calculatePenaltyMemoized,
  normalizeDate,
  formatDate,
  isGeneratingEnhancedPDF,
  setIsGeneratingEnhancedPDF,
  pdfGenerationProgress,
  setPdfGenerationProgress,
  isComplianceScoreModalOpen,
  setIsComplianceScoreModalOpen,
}: ReportsTabProps) {
  // Helper function to parse date
  const parseDateForReports = (dateStr: string): Date | null => {
    try {
      // Try parsing formats like "Jan 15, 2026" or "2026-01-15"
      if (dateStr.includes(',')) {
        return new Date(dateStr)
      } else if (dateStr.match(/^\d{4}-\d{2}-\d{2}/)) {
        return new Date(dateStr)
      }
      return null
    } catch {
      return null
    }
  }


  // Calculate days delayed
  const calculateDelay = (dueDateStr: string, status: string): number | null => {
    if (status === 'completed' || status === 'upcoming') return null
    const dueDate = parseDateForReports(dueDateStr)
    if (!dueDate) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    dueDate.setHours(0, 0, 0, 0)
    const diffTime = today.getTime() - dueDate.getTime()
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
    return diffDays > 0 ? diffDays : null
  }


  // Calculate penalty amount - use memoized version with base amount support
  const calculatePenalty = (penaltyStr: string | null, daysDelayed: number | null, penaltyBaseAmount?: number | null): string => {
    return calculatePenaltyMemoized(penaltyStr, daysDelayed, penaltyBaseAmount)
  }


  // Calculate statistics using useMemo for performance
  const statistics = useMemo(() => {
    const totalCompliances = (displayRequirements || []).length
    const completed = (displayRequirements || []).filter((r: any) => r.status === 'completed').length
    const pending = (displayRequirements || []).filter((r: any) => r.status === 'pending').length
    const overdue = (displayRequirements || []).filter((r: any) => {
      if (r.status === 'overdue') return true
      if (r.status === 'completed') return false
      const dueDate = parseDateForReports(r.dueDate)
      return dueDate !== null && dueDate < new Date()
    }).length
    const notStarted = displayRequirements.filter((r: any) => r.status === 'not_started').length
    const upcoming = displayRequirements.filter((r: any) => r.status === 'upcoming').length


    // Compliance score (0–100)
    // Base: completion rate; penalty: overdue items
    let complianceScore = 0
    if (totalCompliances > 0) {
      const completionRate = completed / totalCompliances
      const overdueRate = overdue / totalCompliances
      // Simple formula: 100 * completionRate, minus up to 30 points for overdue
      complianceScore = Math.max(
        0,
        Math.min(100, Math.round(100 * completionRate - 30 * overdueRate))
      )
    }


    // Category breakdown
    const categoryBreakdown: Record<string, number> = {}
    displayRequirements.forEach((req: any) => {
      categoryBreakdown[req.category] = (categoryBreakdown[req.category] || 0) + 1
    })


    // Status breakdown
    const statusBreakdown = {
      completed,
      pending,
      overdue,
      notStarted,
      upcoming
    }


    // Financial year breakdown
    const fyBreakdown: Record<string, number> = {}
    displayRequirements.forEach((req: any) => {
      const fy = req.financial_year || 'Not Specified'
      fyBreakdown[fy] = (fyBreakdown[fy] || 0) + 1
    })


    // Compliance type breakdown
    const complianceTypeBreakdown: Record<string, { total: number; completed: number; overdue: number; pending: number; notStarted: number }> = {
      'one-time': { total: 0, completed: 0, overdue: 0, pending: 0, notStarted: 0 },
      'monthly': { total: 0, completed: 0, overdue: 0, pending: 0, notStarted: 0 },
      'quarterly': { total: 0, completed: 0, overdue: 0, pending: 0, notStarted: 0 },
      'annual': { total: 0, completed: 0, overdue: 0, pending: 0, notStarted: 0 }
    }


    displayRequirements.forEach((req: any) => {
      const type = (req.compliance_type || 'one-time') as 'one-time' | 'monthly' | 'quarterly' | 'annual'
      if (complianceTypeBreakdown[type]) {
        complianceTypeBreakdown[type].total++
        if (req.status === 'completed') {
          complianceTypeBreakdown[type].completed++
        } else if (req.status === 'overdue' || (parseDateForReports(req.dueDate) && parseDateForReports(req.dueDate)! < new Date())) {
          complianceTypeBreakdown[type].overdue++
        } else if (req.status === 'pending') {
          complianceTypeBreakdown[type].pending++
        } else if (req.status === 'not_started') {
          complianceTypeBreakdown[type].notStarted++
        }
      }
    })


    return {
      totalCompliances,
      completed,
      pending,
      overdue,
      notStarted,
      upcoming,
      complianceScore,
      categoryBreakdown,
      statusBreakdown,
      fyBreakdown,
      complianceTypeBreakdown
    }
  }, [displayRequirements])


  const {
    totalCompliances,
    completed,
    pending,
    overdue,
    notStarted,
    upcoming,
    complianceScore,
    categoryBreakdown,
    statusBreakdown,
    fyBreakdown,
    complianceTypeBreakdown
  } = statistics


  // Calculate total penalties
  const totalPenalty = useMemo(() => {
    let total = 0
    const currencySymbol = countryConfig.currency.symbol
    const currencySymbolEscaped = currencySymbol.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    displayRequirements.forEach((req: any) => {
      const delay = calculateDelayMemoized(req.dueDate, req.status)
      if (delay !== null && delay > 0 && req.penalty) {
        const penaltyStr = calculatePenaltyMemoized(req.penalty, delay, req.penalty_base_amount)
        if (penaltyStr !== '-' && !penaltyStr.includes('Cannot calculate')) {
          // Remove currency symbol and commas, then parse
          const cleaned = penaltyStr.replace(new RegExp(currencySymbolEscaped, 'g'), '').replace(/,/g, '').replace(/[^\d.-]/g, '')
          const amount = parseFloat(cleaned)
          if (!isNaN(amount)) {
            total += amount
          }
        }
      }
    })
    return total
  }, [displayRequirements, countryConfig, calculateDelayMemoized, calculatePenaltyMemoized])


  // Overdue compliances
  const overdueCompliances = useMemo(() => {
    return displayRequirements.filter((req: any) => {
      const delay = calculateDelayMemoized(req.dueDate, req.status)
      return delay !== null && delay > 0 && req.status !== 'completed'
    })
  }, [displayRequirements, calculateDelayMemoized])


  // Export to CSV
  const exportToCSV = (data: any[], filename: string) => {
    if (data.length === 0) {
      alert('No data to export')
      return
    }


    const headers = Object.keys(data[0])
    const csvContent = [
      headers.join(','),
      ...data.map((row: any) => headers.map((header: string) => {
        const value = row[header] || ''
        return typeof value === 'string' && value.includes(',') ? `"${value}"` : value
      }).join(','))
    ].join('\n')


    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }


  const exportComplianceReport = () => {
    const reportData = displayRequirements.map((req: any) => ({
      'Category': req.category,
      'Requirement': req.requirement,
      'Description': req.description || '',
      'Status': req.status.toUpperCase(),
      'Due Date': req.dueDate,
      'Financial Year': req.financial_year || 'Not Specified',
      'Penalty': req.penalty || '-',
      'Is Critical': req.isCritical ? 'Yes' : 'No',
      'Compliance Type': req.compliance_type || 'one-time',
      'Filed On': (req as any).filed_on ? new Date((req as any).filed_on).toLocaleDateString('en-GB') : '-',
      'Filed By': (req as any).filed_by_name || ((req as any).filed_by ? 'User' : '-'),
      'Status Reason': (req as any).status_reason || '-',
      'Documents': req.required_documents?.join(', ') || '-'
    }))
    exportToCSV(reportData, `compliance-report-${new Date().toISOString().split('T')[0]}.csv`)
  }


  const exportOverdueReport = () => {
    const reportData = overdueCompliances.map((req: any) => {
      const delay = calculateDelay(req.dueDate, req.status)
      const penalty = calculatePenalty(req.penalty || '', delay, req.penalty_base_amount)
      return {
        'Category': req.category,
        'Requirement': req.requirement,
        'Description': req.description || '',
        'Due Date': req.dueDate,
        'Days Delayed': delay || 0,
        'Penalty': req.penalty || '-',
        'Calculated Penalty': penalty,
        'Financial Year': req.financial_year || 'Not Specified',
        'Is Critical': req.isCritical ? 'Yes' : 'No',
        'Compliance Type': req.compliance_type || 'one-time',
        'Status Reason': (req as any).status_reason || '-',
        'Documents': req.required_documents?.join(', ') || '-'
      }
    })
    exportToCSV(reportData, `overdue-compliance-report-${new Date().toISOString().split('T')[0]}.csv`)
  }


  const exportPDFReport = async () => {
    setIsGeneratingEnhancedPDF(true)
    setPdfGenerationProgress({ current: 0, total: 0, step: 'Preparing report...' })


    // Identify non-compliant items (overdue, pending with past due dates)
    const nonCompliantItems = displayRequirements.filter((req: any) => {
      const delay = calculateDelay(req.dueDate, req.status)
      return delay !== null && delay > 0 && req.status !== 'completed'
    })


    // Group repeated compliances (e.g., same template across months) to keep report fast and avoid duplicate research
    const groupKeyFor = (req: any) => {
      if (req.template_id) return `template:${req.template_id}`
      return `text:${(req.category || '').toLowerCase()}|${(req.requirement || '').toLowerCase()}`
    }


    const nonCompliantGroups = new Map<
      string,
      { key: string; category: string; requirement: string; items: any[]; representative: any }
    >()


    nonCompliantItems.forEach((item: any) => {
      const key = groupKeyFor(item)
      const existing = nonCompliantGroups.get(key)
      if (existing) {
        existing.items.push(item)
      } else {
        nonCompliantGroups.set(key, {
          key,
          category: item.category,
          requirement: item.requirement,
          items: [item],
          representative: item,
        })
      }
    })


    // Convert to RegulatoryRequirement format for enrichment (ONE per unique compliance type)
    const nonCompliantRequirements: RegulatoryRequirement[] = Array.from(nonCompliantGroups.values()).map((group: any) => {
      const req = group.representative
      return {
        id: req.id,
        template_id: req.template_id ?? null,
        company_id: currentCompany?.id || '',
        category: req.category,
        requirement: req.requirement,
        description: null,
        status: req.status as 'not_started' | 'upcoming' | 'pending' | 'overdue' | 'completed',
        due_date: req.dueDate,
        penalty: req.penalty || null,
        penalty_config: null,
        penalty_base_amount: null,
        is_critical: req.isCritical || false,
        financial_year: req.financial_year || null,
        compliance_type: req.compliance_type || null,
        filed_on: null,
        filed_by: null,
        status_reason: null,
        required_documents: [],
        possible_legal_action: null,
        created_at: '',
        updated_at: '',
        created_by: null,
        updated_by: null
      }
    })


    // Enrich non-compliant items
    let enrichedData: EnrichedComplianceData[] = []
    if (nonCompliantRequirements.length > 0) {
      setPdfGenerationProgress({
        current: 0,
        total: nonCompliantRequirements.length,
        step: 'Enriching compliance data...'
      })


      // Call server action for enrichment (Tavily requires server-side execution)
      enrichedData = await enrichComplianceRequirements(nonCompliantRequirements)


      // Update progress after enrichment completes
      setPdfGenerationProgress({
        current: nonCompliantRequirements.length,
        total: nonCompliantRequirements.length,
        step: 'Enrichment complete'
      })
    }


    setPdfGenerationProgress({ current: 0, total: 0, step: 'Generating PDF...' })


    const doc = new jsPDF()
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 15
    const contentWidth = pageWidth - 2 * margin
    let yPos = margin
    const lineHeight = 7
    const sectionSpacing = 12


    // Colors (grayscale for PDF)
    const primaryColor = [30, 58, 95] // Navy (McKinsey/EY style)
    const darkGray = [44, 44, 44]
    const lightGray = [210, 210, 210]
    const textGray = [90, 90, 90]
    const redColor = [198, 40, 40] // Muted red for highlights only
    const accentBlue = [112, 160, 220] // Light accent for cover accents (subtle)


    // Helper function to add new page if needed
    // Reserve space for footer (20px from bottom to prevent overlap)
    const footerHeight = 20
    const footerY = pageHeight - 12
    const maxContentY = footerY - 5 // Content must stop 5px before footer
    const checkNewPage = (requiredSpace: number) => {
      if (yPos + requiredSpace > maxContentY) {
        doc.addPage()
        yPos = margin
        return true
      }
      return false
    }


    // Helper to split long text
    const splitText = (text: string, maxWidth: number, fontSize: number = 10): string[] => {
      doc.setFontSize(fontSize)
      const words = text.split(' ')
      const lines: string[] = []
      let currentLine = ''


      words.forEach((word: string) => {
        const testLine = currentLine ? `${currentLine} ${word}` : word
        const textWidth = doc.getTextWidth(testLine)
        if (textWidth > maxWidth && currentLine) {
          lines.push(currentLine)
          currentLine = word
        } else {
          currentLine = testLine
        }
      })
      if (currentLine) {
        lines.push(currentLine)
      }
      return lines
    }


    // Cover page (modern, minimalist — keep content, refresh layout)
    const coverDate = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
    const companyName = currentCompany?.name || 'Company'


    // White background
    doc.setFillColor(255, 255, 255)
    doc.rect(0, 0, pageWidth, pageHeight, 'F')


    // Diagonal accents (top-left + bottom-right) inspired by modern report covers
    // Use thick diagonal lines to avoid relying on polygon APIs.
    doc.setLineCap(2)


    // Top-left main band
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.setLineWidth(34)
    doc.line(-40, 40, pageWidth * 0.58, -60)


    // Top-left accent strokes
    doc.setDrawColor(210, 230, 255)
    doc.setLineWidth(10)
    doc.line(-38, 55, pageWidth * 0.56, -45)
    doc.setDrawColor(accentBlue[0], accentBlue[1], accentBlue[2])
    doc.setLineWidth(6)
    doc.line(-35, 68, pageWidth * 0.54, -32)


    // Bottom-right band
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.setLineWidth(42)
    doc.line(pageWidth * 0.52, pageHeight + 70, pageWidth + 60, pageHeight * 0.62)


    // Bottom-right accent strokes
    doc.setDrawColor(210, 230, 255)
    doc.setLineWidth(12)
    doc.line(pageWidth * 0.56, pageHeight + 62, pageWidth + 52, pageHeight * 0.66)
    doc.setDrawColor(accentBlue[0], accentBlue[1], accentBlue[2])
    doc.setLineWidth(7)
    doc.line(pageWidth * 0.60, pageHeight + 50, pageWidth + 44, pageHeight * 0.70)


    // Content block
    doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    doc.text('COMPLIANCE REPORT', margin, 45, { maxWidth: contentWidth })


    // Company name (large, wrapped)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(40)
    const companyLines = splitText(companyName.toUpperCase(), contentWidth, 40)
    let coverY = 85
    companyLines.slice(0, 3).forEach((line: string, idx: number) => {
      doc.text(line, margin, coverY + idx * 18, { maxWidth: contentWidth })
    })


    // Byline
    coverY += Math.min(companyLines.length, 3) * 18 + 10
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(14)
    doc.text('BY FINACRA AI', margin, coverY, { maxWidth: contentWidth })


    // Footer details (bottom-left)
    const footerBlockY = pageHeight - 70
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(10)
    doc.setTextColor(textGray[0], textGray[1], textGray[2])
    doc.text('PREPARED FOR MANAGEMENT REVIEW', margin, footerBlockY, { maxWidth: contentWidth })
    doc.setFontSize(9)
    doc.text(`Date: ${coverDate}`, margin, footerBlockY + 10, { maxWidth: contentWidth })
    doc.text(`Scope: Overdue & pending (past due) compliances for the selected company.`, margin, footerBlockY + 20, { maxWidth: contentWidth })
    doc.text('Confidential — for internal use only.', margin, footerBlockY + 32, { maxWidth: contentWidth })
    doc.text(`Generated: ${coverDate}`, margin, footerBlockY + 44, { maxWidth: contentWidth })


    // Page break to main content
    doc.addPage()
    yPos = margin


    // Header
    doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.rect(0, 0, pageWidth, 50, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(22)
    doc.setFont('helvetica', 'bold')
    doc.text('Compliance Report', margin, 30, { maxWidth: contentWidth })
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    const generatedText = `Generated: ${new Date().toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`
    doc.text(generatedText, margin, 42, { maxWidth: contentWidth * 0.6 })
    if (currentCompany) {
      const companyText = `Company: ${currentCompany.name}`
      const companyLines = splitText(companyText, contentWidth * 0.4, 9)
      companyLines.forEach((line: string, idx: number) => {
        doc.text(line, pageWidth - margin, 42 - (companyLines.length - 1 - idx) * 4, { align: 'right', maxWidth: contentWidth * 0.4 })
      })
    }


    yPos = 60


    // Executive Summary Section
    doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
    doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Executive Summary', margin + 3, yPos + 6)
    yPos += 15


    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')


    // Key Metrics Grid - Better spacing
    const metricsPerRow = 2
    const metricWidth = (contentWidth - 20) / metricsPerRow // Leave 20px gap between metrics
    const metrics = [
      { label: 'Total Compliances', value: totalCompliances.toString() },
      { label: 'Completed', value: completed.toString() },
      { label: 'Overdue', value: overdue.toString() },
      { label: 'Pending', value: pending.toString() }
    ]


    const startY = yPos
    metrics.forEach((metric: { label: string; value: string }, index: number) => {
      const row = Math.floor(index / metricsPerRow)
      const col = index % metricsPerRow
      const xPos = margin + (col * metricWidth) + (col * 20)
      const currentY = startY + (row * 25)


      if (row > 0 && col === 0) {
        checkNewPage(30)
      }


      // Value (large number)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(20)
      doc.setTextColor(0, 0, 0)
      doc.text(metric.value, xPos, currentY, { maxWidth: metricWidth - 10 })


      // Label (small text below)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(textGray[0], textGray[1], textGray[2])
      doc.text(metric.label, xPos, currentY + 8, { maxWidth: metricWidth - 10 })
      doc.setTextColor(0, 0, 0)
    })


    yPos = startY + (Math.ceil(metrics.length / metricsPerRow) * 25) + 5
    checkNewPage(20)


    // Compliance Score
    if (totalCompliances > 0) {
      const score = Math.max(0, Math.min(100, Math.round((completed / totalCompliances) * 100 - (overdue / totalCompliances) * 30)))
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text('Compliance Score:', margin, yPos)
      doc.setFontSize(20)
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
      doc.text(`${score}/100`, margin + 50, yPos)
      doc.setTextColor(0, 0, 0)
      yPos += 10
    }


    yPos += sectionSpacing
    checkNewPage(30)


    // Status Breakdown
    doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
    doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Status Breakdown', margin + 3, yPos + 6)
    yPos += 15


    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')


    Object.entries(statusBreakdown).forEach(([status, count]) => {
      // Check before adding each status line
      if (yPos + lineHeight + 2 > maxContentY) {
        doc.addPage()
        yPos = margin
      }


      const percentage = totalCompliances > 0 ? (count / totalCompliances) * 100 : 0
      const statusLabel = status === 'notStarted' ? 'Not Started' : status.charAt(0).toUpperCase() + status.slice(1)


      doc.text(`${statusLabel}:`, margin, yPos, { maxWidth: 60 })
      doc.setFont('helvetica', 'bold')
      doc.text(count.toString(), margin + 45, yPos, { maxWidth: 20 })
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(textGray[0], textGray[1], textGray[2])
      doc.text(`(${Math.round(percentage)}%)`, margin + 60, yPos, { maxWidth: 30 })
      doc.setTextColor(0, 0, 0)


      // Progress bar - ensure it fits within page
      const barStartX = margin + 95
      const barWidth = Math.min(80, pageWidth - barStartX - margin)
      const barHeight = 4
      doc.setDrawColor(lightGray[0], lightGray[1], lightGray[2])
      doc.rect(barStartX, yPos - 3, barWidth, barHeight, 'S')
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
      doc.rect(barStartX, yPos - 3, Math.min((barWidth * percentage) / 100, barWidth), barHeight, 'F')


      yPos += lineHeight + 2
    })


    yPos += sectionSpacing
    checkNewPage(30)


    // Category Breakdown
    doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
    doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Category Breakdown', margin + 3, yPos + 6)
    yPos += 15


    doc.setTextColor(0, 0, 0)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')


    const sortedCategories = Object.entries(categoryBreakdown)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 8) // Limit to top 8 categories


    sortedCategories.forEach(([category, count]) => {
      checkNewPage(10)
      const percentage = totalCompliances > 0 ? ((count as number) / totalCompliances) * 100 : 0


      const categoryLines = splitText(category, 60, 10)
      categoryLines.forEach((line: string, idx: number) => {
        doc.text(line, margin, yPos + (idx * 5), { maxWidth: 60 })
      })
      const textY = yPos + (categoryLines.length - 1) * 5


      doc.setFont('helvetica', 'bold')
      doc.text((count as number).toString(), pageWidth - margin - 35, textY, { align: 'right', maxWidth: 20 })
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(textGray[0], textGray[1], textGray[2])
      doc.text(`(${Math.round(percentage)}%)`, pageWidth - margin - 10, textY, { align: 'right', maxWidth: 25 })
      doc.setTextColor(0, 0, 0)


      // Progress bar - ensure it fits
      const barStartX = margin + 65
      const barWidth = Math.min(70, pageWidth - barStartX - margin - 40)
      const barHeight = 4
      doc.setDrawColor(lightGray[0], lightGray[1], lightGray[2])
      doc.rect(barStartX, textY - 3, barWidth, barHeight, 'S')
      doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2])
      doc.rect(barStartX, textY - 3, Math.min((barWidth * percentage) / 100, barWidth), barHeight, 'F')


      yPos += (categoryLines.length * lineHeight) + 2
    })


    yPos += sectionSpacing
    checkNewPage(30)


    // Compliance Type Breakdown
    doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
    doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.text('Compliance Type Breakdown', margin + 3, yPos + 6)
    yPos += 15


    doc.setTextColor(0, 0, 0)
    doc.setFontSize(9)


    Object.entries(complianceTypeBreakdown)
      .filter(([, data]) => data.total > 0)
      .forEach(([type, data]) => {
        // Check before adding each type breakdown
        if (yPos + 28 > maxContentY) {
          doc.addPage()
          yPos = margin
        }


        // Compliance type labels: one-time (no recurring), annual (recurs annually)
        const typeLabels: Record<string, string> = {
          'one-time': 'One-time (No Recurring)',
          'annual': 'Annual (Recurring)',
          'monthly': 'Monthly (Recurring)',
          'quarterly': 'Quarterly (Recurring)'
        }
        const completionRate = data.total > 0 ? (data.completed / data.total) * 100 : 0


        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11)
        doc.text(typeLabels[type] || type, margin, yPos)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.text(`Total: ${data.total}`, margin + 10, yPos + 6)
        doc.text(`Completed: ${data.completed}`, margin + 10, yPos + 12)
        doc.text(`Overdue: ${data.overdue}`, margin + 10, yPos + 18)
        doc.text(`Pending: ${data.pending}`, margin + 80, yPos + 6)
        doc.text(`Not Started: ${data.notStarted}`, margin + 80, yPos + 12)
        doc.setTextColor(textGray[0], textGray[1], textGray[2])
        doc.text(`Completion: ${Math.round(completionRate)}%`, margin + 80, yPos + 18)
        doc.setTextColor(0, 0, 0)


        yPos += 28
      })


    yPos += sectionSpacing
    checkNewPage(30)


    // Financial Year Breakdown (if available)
    if (Object.keys(fyBreakdown).length > 0) {
      doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
      doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('Financial Year Breakdown', margin + 3, yPos + 6)
      yPos += 15


      doc.setTextColor(0, 0, 0)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')


      const sortedFY = Object.entries(fyBreakdown)
        .sort(([a], [b]) => {
          const getYear = (fy: string) => {
            if (fy === 'Not Specified') return 0
            const match = fy.match(/\d{4}/)
            return match ? parseInt(match[0]) : 0
          }
          return getYear(b) - getYear(a)
        })


      sortedFY.forEach(([fy, count], index: number) => {
        checkNewPage(10)
        if (index % 2 === 0) {
          doc.text(`${fy}:`, margin, yPos)
          doc.setFont('helvetica', 'bold')
          doc.text((count as number).toString(), margin + 50, yPos)
        } else {
          doc.text(`${fy}:`, margin + 100, yPos)
          doc.setFont('helvetica', 'bold')
          doc.text((count as number).toString(), margin + 150, yPos)
          yPos += lineHeight
        }
        doc.setFont('helvetica', 'normal')
      })


      if (sortedFY.length % 2 !== 0) {
        yPos += lineHeight
      }


      yPos += sectionSpacing
      checkNewPage(30)
    }


    // Overdue Compliances (if any)
    if (overdueCompliances.length > 0) {
      doc.setFillColor(redColor[0], redColor[1], redColor[2]) // Muted red for overdue
      doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text(`Overdue Compliances (Top 10 shown)`, margin + 3, yPos + 6)
      yPos += 15


      doc.setTextColor(0, 0, 0)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')


      // To keep report generation fast, show only top 10 individual overdue items
      overdueCompliances.slice(0, 10).forEach((req: any, index: number) => {
        checkNewPage(30)
        const delay = calculateDelayMemoized(req.dueDate, req.status)
        let penalty = calculatePenalty(req.penalty || '', delay, req.penalty_base_amount)
        // Remove leading apostrophe if present
        if (penalty.startsWith("'")) {
          penalty = penalty.substring(1)
        }


        const itemStartY = yPos


        // Item number and requirement name
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(0, 0, 0)
        const reqText = `${index + 1}. ${req.requirement}`
        const reqLines = splitText(reqText, contentWidth * 0.55, 10)
        reqLines.forEach((line: string, idx: number) => {
          doc.text(line, margin, itemStartY + (idx * 5), { maxWidth: contentWidth * 0.55 })
        })
        const reqEndY = itemStartY + (reqLines.length - 1) * 5


        // Category and Due Date on separate lines
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(0, 0, 0)
        let detailY = reqEndY + 6
        doc.text(`Category: ${req.category}`, margin + 5, detailY, { maxWidth: contentWidth * 0.55 })
        detailY += 5
        doc.text(`Due Date: ${req.dueDate}`, margin + 5, detailY, { maxWidth: contentWidth * 0.55 })


        // Right column: Days Delayed and Penalty
        const rightX = margin + contentWidth * 0.6
        let rightY = reqEndY + 6


        if (delay !== null && delay > 0) {
          doc.setTextColor(255, 0, 0)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8)
          doc.text(`Days Delayed: ${delay}`, rightX, rightY, { maxWidth: contentWidth * 0.35 })
          doc.setFont('helvetica', 'normal')
          rightY += 5
        }


        if (penalty !== '-' && !penalty.includes('Cannot calculate')) {
          doc.setTextColor(255, 0, 0)
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8)
          const penaltyText = `Penalty: ${penalty}`
          const penaltyLines = splitText(penaltyText, contentWidth * 0.35, 8)
          penaltyLines.forEach((line: string, idx: number) => {
            doc.text(line, rightX, rightY + (idx * 5), { maxWidth: contentWidth * 0.35 })
          })
          doc.setFont('helvetica', 'normal')
          rightY += (penaltyLines.length - 1) * 5
        }


        // Calculate the maximum height used for this item
        const leftHeight = detailY - itemStartY + 5
        const rightHeight = rightY - reqEndY
        const itemHeight = Math.max(leftHeight, rightHeight) + 5


        // Add a subtle line separator
        doc.setDrawColor(lightGray[0], lightGray[1], lightGray[2])
        doc.setLineWidth(0.5)
        doc.line(margin, yPos + itemHeight, pageWidth - margin, yPos + itemHeight)


        yPos += itemHeight + 3
      })


      if (overdueCompliances.length > 10) {
        yPos += 5
        doc.setFontSize(8)
        doc.setTextColor(textGray[0], textGray[1], textGray[2])
        doc.text(`... and ${overdueCompliances.length - 10} more overdue compliances`, margin, yPos)
        doc.setTextColor(0, 0, 0)
      }
    }


    // Legal & Business Impact Analysis Section (for non-compliant items)
    if (enrichedData.length > 0) {
      yPos += sectionSpacing
      checkNewPage(40)


      doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
      doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('Legal & Business Impact Analysis', margin + 3, yPos + 6)
      yPos += 15


      doc.setTextColor(0, 0, 0)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(textGray[0], textGray[1], textGray[2])
      doc.text('This section provides detailed legal sections, penalty provisions, and business impact for non-compliant items.', margin, yPos, { maxWidth: contentWidth })
      yPos += 8


      // Table header
      const colWidths = {
        requirement: contentWidth * 0.25,
        category: contentWidth * 0.12,
        legalSection: contentWidth * 0.18,
        penaltyProvision: contentWidth * 0.15,
        exactPenalty: contentWidth * 0.12,
        financial: contentWidth * 0.18
      }


      doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
      doc.rect(margin, yPos, contentWidth, 6, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(7)
      doc.setFont('helvetica', 'bold')


      let headerX = margin + 2
      doc.text('Requirement', headerX, yPos + 4.5, { maxWidth: colWidths.requirement - 4 })
      headerX += colWidths.requirement
      doc.text('Category', headerX, yPos + 4.5, { maxWidth: colWidths.category - 4 })
      headerX += colWidths.category
      doc.text('Legal Section', headerX, yPos + 4.5, { maxWidth: colWidths.legalSection - 4 })
      headerX += colWidths.legalSection
      doc.text('Penalty', headerX, yPos + 4.5, { maxWidth: colWidths.penaltyProvision - 4 })
      headerX += colWidths.penaltyProvision
      doc.text('Amount', headerX, yPos + 4.5, { maxWidth: colWidths.exactPenalty - 4 })
      headerX += colWidths.exactPenalty
      doc.text('Financial Impact', headerX, yPos + 4.5, { maxWidth: colWidths.financial - 4 })


      yPos += 8


      // Table rows
      // Enrichment is computed once per unique compliance type (group representative only)
      enrichedData.forEach((enriched: EnrichedComplianceData, index: number) => {
        const group = Array.from(nonCompliantGroups.values()).find((g: any) => g.representative.id === enriched.requirementId)
        const req = group?.representative
        if (!req) return


        // Estimate row height before writing
        const reqLines = splitText(req.requirement, colWidths.requirement - 4, 7)
        const legalLines = splitText(enriched.legalSection, colWidths.legalSection - 4, 7)
        const penaltyLines = splitText(enriched.penaltyProvision, colWidths.penaltyProvision - 4, 7)
        const financialLines = splitText(enriched.businessImpact.financial, colWidths.financial - 4, 7)
        const estimatedRowHeight = Math.max(
          reqLines.length * 4,
          legalLines.length * 4,
          penaltyLines.length * 4,
          financialLines.length * 4
        ) + 4


        // Check if row fits on current page
        checkNewPage(estimatedRowHeight)


        // Alternate row background
        if (index % 2 === 0) {
          doc.setFillColor(245, 245, 245)
          doc.rect(margin, yPos - 2, contentWidth, 0, 'F')
        }


        doc.setTextColor(0, 0, 0)
        doc.setFontSize(7)
        doc.setFont('helvetica', 'normal')


        let cellX = margin + 2
        let maxHeight = 0


        // Requirement
        reqLines.forEach((line: string, idx: number) => {
          doc.text(line, cellX, yPos + (idx * 4), { maxWidth: colWidths.requirement - 4 })
        })
        maxHeight = Math.max(maxHeight, reqLines.length * 4)


        // Category
        cellX += colWidths.requirement
        doc.text(req.category, cellX, yPos, { maxWidth: colWidths.category - 4 })


        // Legal Section
        cellX += colWidths.category
        legalLines.forEach((line: string, idx: number) => {
          doc.text(line, cellX, yPos + (idx * 4), { maxWidth: colWidths.legalSection - 4 })
        })
        maxHeight = Math.max(maxHeight, legalLines.length * 4)


        // Penalty Provision
        cellX += colWidths.legalSection
        penaltyLines.forEach((line: string, idx: number) => {
          doc.text(line, cellX, yPos + (idx * 4), { maxWidth: colWidths.penaltyProvision - 4 })
        })
        maxHeight = Math.max(maxHeight, penaltyLines.length * 4)


        // Exact Penalty
        cellX += colWidths.penaltyProvision
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(255, 0, 0)
        doc.text(enriched.exactPenalty, cellX, yPos, { maxWidth: colWidths.exactPenalty - 4 })
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(0, 0, 0)


        // Financial Impact
        cellX += colWidths.exactPenalty
        financialLines.forEach((line: string, idx: number) => {
          doc.text(line, cellX, yPos + (idx * 4), { maxWidth: colWidths.financial - 4 })
        })
        maxHeight = Math.max(maxHeight, financialLines.length * 4)


        // Draw row separator
        doc.setDrawColor(lightGray[0], lightGray[1], lightGray[2])
        doc.setLineWidth(0.3)
        doc.line(margin, yPos + maxHeight + 2, pageWidth - margin, yPos + maxHeight + 2)


        yPos += maxHeight + 4


        // Final safety check - ensure we haven't exceeded footer area
        if (yPos > maxContentY) {
          doc.addPage()
          yPos = margin
        }
      })


      yPos += sectionSpacing
      checkNewPage(20)


      // Reputation and Operations Impact (separate section)
      doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
      doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(12)
      doc.setFont('helvetica', 'bold')
      doc.text('Additional Business Impact Details', margin + 3, yPos + 6)
      yPos += 15


      enrichedData.forEach((enriched: EnrichedComplianceData, index: number) => {
        const req = nonCompliantItems.find((r: any) => r.id === enriched.requirementId)
        if (!req) return


        // Estimate content height
        const repLines = splitText(enriched.businessImpact.reputation, contentWidth - 10, 8)
        const opsLines = splitText(enriched.businessImpact.operations, contentWidth - 10, 8)
        const estimatedHeight = 6 + 5 + repLines.length * 4 + 3 + 5 + opsLines.length * 4 + 5


        // Check if content fits on current page
        if (yPos + estimatedHeight > maxContentY) {
          doc.addPage()
          yPos = margin
        }


        doc.setTextColor(0, 0, 0)
        doc.setFontSize(9)
        doc.setFont('helvetica', 'bold')
        doc.text(`${index + 1}. ${req.requirement}`, margin, yPos, { maxWidth: contentWidth })
        yPos += 6


        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(0, 0, 0)


        // Reputation Impact
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0, 0, 0)
        doc.text('Reputation Impact:', margin + 5, yPos, { maxWidth: contentWidth - 10 })
        yPos += 5
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(textGray[0], textGray[1], textGray[2])
        repLines.forEach((line: string, idx: number) => {
          // Safety check before each line
          if (yPos + (idx * 4) > maxContentY) {
            doc.addPage()
            yPos = margin
          }
          doc.text(line, margin + 5, yPos + (idx * 4), { maxWidth: contentWidth - 10 })
        })
        yPos += repLines.length * 4 + 3


        // Operations Impact
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(0, 0, 0)
        // Check before adding operations section
        if (yPos + 5 > maxContentY) {
          doc.addPage()
          yPos = margin
        }
        doc.text('Operational Impact:', margin + 5, yPos, { maxWidth: contentWidth - 10 })
        yPos += 5
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(textGray[0], textGray[1], textGray[2])
        opsLines.forEach((line: string, idx: number) => {
          // Safety check before each line
          if (yPos + (idx * 4) > maxContentY) {
            doc.addPage()
            yPos = margin
          }
          doc.text(line, margin + 5, yPos + (idx * 4), { maxWidth: contentWidth - 10 })
        })
        yPos += opsLines.length * 4 + 5


        doc.setTextColor(0, 0, 0)


        // Final safety check
        if (yPos > maxContentY) {
          doc.addPage()
          yPos = margin
        }
      })
    }


    // Total Penalty
    if (totalPenalty > 0) {
      yPos += sectionSpacing
      checkNewPage(15)
      doc.setFillColor(darkGray[0], darkGray[1], darkGray[2])
      doc.rect(margin, yPos, pageWidth - 2 * margin, 8, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(14)
      doc.setFont('helvetica', 'bold')
      doc.text('Total Accumulated Penalty', margin + 3, yPos + 6)
      yPos += 15


      doc.setTextColor(255, 0, 0)
      doc.setFontSize(16)
      doc.setFont('helvetica', 'bold')
      const penaltyText = formatCurrency(totalPenalty, countryCode)
      doc.text(penaltyText, margin, yPos, { maxWidth: contentWidth })
    }


    // Last page: QR + CTA (brand)
    doc.addPage()
    // White background
    doc.setFillColor(255, 255, 255)
    doc.rect(0, 0, pageWidth, pageHeight, 'F')


    // Subtle diagonal accents (match cover)
    doc.setLineCap(2)
    doc.setDrawColor(primaryColor[0], primaryColor[1], primaryColor[2])
    doc.setLineWidth(34)
    doc.line(pageWidth * 0.55, pageHeight + 70, pageWidth + 60, pageHeight * 0.62)
    doc.setDrawColor(210, 230, 255)
    doc.setLineWidth(10)
    doc.line(pageWidth * 0.58, pageHeight + 62, pageWidth + 52, pageHeight * 0.66)


    // QR code
    try {
      const QRCode: any = await import('qrcode')
      const qrUrl = 'https://www.finacra.com'
      const qrDataUrl: string = await QRCode.toDataURL(qrUrl, {
        margin: 1,
        width: 260,
        color: {
          dark: '#1E3A5F',
          light: '#FFFFFF',
        },
      })


      const qrSize = 80
      const qrX = (pageWidth - qrSize) / 2
      const qrY = pageHeight / 2 - 55
      doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize)


      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      doc.text('Try free trial now!', pageWidth / 2, qrY + qrSize + 18, { align: 'center' })


      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(textGray[0], textGray[1], textGray[2])
      doc.text('Scan to visit', pageWidth / 2, qrY + qrSize + 32, { align: 'center' })
      doc.text('www.finacra.com', pageWidth / 2, qrY + qrSize + 44, { align: 'center' })
    } catch (qrErr) {
      // Fallback if QR generation fails: show the URL + CTA text
      doc.setTextColor(primaryColor[0], primaryColor[1], primaryColor[2])
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      doc.text('Try free trial now!', pageWidth / 2, pageHeight / 2, { align: 'center' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(textGray[0], textGray[1], textGray[2])
      doc.text('www.finacra.com', pageWidth / 2, pageHeight / 2 + 14, { align: 'center' })
    }


    // Footer - Add to all pages with proper spacing
    const totalPages = doc.getNumberOfPages()
    // footerY is already defined at the top of the function
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      doc.setFontSize(8)
      doc.setTextColor(textGray[0], textGray[1], textGray[2])
      doc.text(
        `Page ${i} of ${totalPages} | Compliance Report | Generated on ${new Date().toLocaleDateString('en-IN')}`,
        pageWidth / 2,
        footerY,
        { align: 'center' }
      )
    }

    // Save PDF
    const fileName = `compliance-report-${currentCompany?.name || 'company'}-${new Date().toISOString().split('T')[0]}.pdf`
    doc.save(fileName)

    // Track report download
    if (user?.id && currentCompany?.id) {
      await trackReportDownload(user.id, currentCompany.id, 'compliance_pdf').catch((err: any) => {
        console.error('Failed to track report download:', err)
      })
    }

    setIsGeneratingEnhancedPDF(false)
    setPdfGenerationProgress({ current: 0, total: 0, step: '' })
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3 sm:mb-4">
          <h2 className="text-xl sm:text-2xl font-light text-white">Compliance Reports</h2>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <button
              onClick={exportPDFReport}
              disabled={isGeneratingEnhancedPDF}
              className="px-3 sm:px-4 py-2 bg-white text-black rounded-lg hover:bg-gray-700 transition-colors flex items-center justify-center gap-2 font-medium text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGeneratingEnhancedPDF ? (
                <>
                  <svg className="animate-spin h-4 w-4 sm:h-5 sm:w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="hidden sm:inline">Generating...</span>
                  <span className="sm:hidden">Generating...</span>
                </>
              ) : (
                <>
                  <svg width="14" height="14" className="sm:w-4 sm:h-4 hidden sm:inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <span className="hidden sm:inline">Export PDF Report</span>
                  <span className="sm:hidden">Export PDF</span>
                </>
              )}
            </button>
            <button
              onClick={exportComplianceReport}
              className="px-3 sm:px-4 py-2 bg-white/10 border border-white/40 text-white rounded-lg hover:bg-white/20 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
            >
              <svg width="14" height="14" className="sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
              </svg>
              <span className="hidden sm:inline">Export CSV Report</span>
              <span className="sm:hidden">Export CSV</span>
            </button>
            {overdueCompliances.length > 0 && (
              <button
                onClick={exportOverdueReport}
                className="px-3 sm:px-4 py-2 bg-red-500/20 border border-red-500 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
              >
                <svg width="14" height="14" className="sm:w-4 sm:h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <span className="hidden sm:inline">Export Overdue CSV</span>
                <span className="sm:hidden">Overdue CSV</span>
              </button>
            )}
          </div>
          {isGeneratingEnhancedPDF && (
            <div className="mt-4 p-4 bg-white/5 border border-white/40/30 rounded-lg">
              <div className="flex items-center gap-3">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <div className="flex-1">
                  <div className="text-white text-sm font-medium">{pdfGenerationProgress.step}</div>
                  {pdfGenerationProgress.total > 0 && (
                    <div className="text-gray-400 text-xs mt-1">
                      {pdfGenerationProgress.current} of {pdfGenerationProgress.total} items enriched
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 text-xs text-gray-400">
                This may take a few moments as we research legal sections and analyze business impact...
              </div>
            </div>
          )}
        </div>
        <p className="text-gray-400 text-sm sm:text-base">Comprehensive compliance analytics and insights</p>
      </div>

      {/* Statistics Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Total Compliances */}
        <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-medium text-gray-300">Total Compliances</h3>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" className="sm:w-6 sm:h-6 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-light text-white mb-1 sm:mb-2">{totalCompliances}</div>
          <p className="text-xs sm:text-sm text-gray-400">All compliance requirements</p>
        </div>

        {/* Completed */}
        <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-medium text-gray-300">Completed</h3>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" className="sm:w-6 sm:h-6 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-light text-white mb-1 sm:mb-2">{completed}</div>
          <p className="text-xs sm:text-sm text-gray-400">
            {totalCompliances > 0 ? `${Math.round((completed / totalCompliances) * 100)}% completion rate` : 'No compliances'}
          </p>
        </div>

        {/* Overdue */}
        <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-medium text-gray-300">Overdue</h3>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" className="sm:w-6 sm:h-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-light text-white mb-1 sm:mb-2">{overdue}</div>
          <p className="text-xs sm:text-sm text-gray-400">
            {totalCompliances > 0 ? `${Math.round((overdue / totalCompliances) * 100)}% overdue rate` : 'No compliances'}
          </p>
        </div>

        {/* Pending */}
        <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-medium text-gray-300">Pending</h3>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" className="sm:w-6 sm:h-6 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-light text-white mb-1 sm:mb-2">{pending}</div>
          <p className="text-xs sm:text-sm text-gray-400">In progress</p>
        </div>

        {/* Not Started */}
        <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-medium text-gray-300">Not Started</h3>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" className="sm:w-6 sm:h-6 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-light text-white mb-1 sm:mb-2">{notStarted}</div>
          <p className="text-xs sm:text-sm text-gray-400">Awaiting action</p>
        </div>

        {/* Compliance Score */}
        <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-medium text-gray-300">Compliance Score</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsComplianceScoreModalOpen(true)}
                className="text-gray-400 hover:text-white transition-colors"
                title="Learn more about compliance score"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="16" x2="12" y2="12" />
                  <line x1="12" y1="8" x2="12.01" y2="8" />
                </svg>
              </button>
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-indigo-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" className="sm:w-6 sm:h-6 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </div>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mb-1">
            <div className="text-2xl sm:text-3xl font-light text-white">
              {totalCompliances === 0 ? '—' : `${complianceScore}`}
            </div>
            {totalCompliances > 0 && (
              <div className="text-xs sm:text-sm text-gray-400">/ 100</div>
            )}
          </div>
          <p className="text-xs sm:text-sm text-gray-400">
            Overall compliance health based on completion and overdue items
          </p>
        </div>

        {/* Total Penalty */}
        <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-medium text-gray-300">Total Penalty</h3>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" className="sm:w-6 sm:h-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-light text-white mb-1 sm:mb-2">
            {totalPenalty > 0 ? formatCurrency(totalPenalty, countryCode) : formatCurrency(0, countryCode)}
          </div>
          <p className="text-xs sm:text-sm text-gray-400">Accumulated penalties</p>
        </div>
      </div>

      {/* Status Breakdown Chart */}
      <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl font-light text-white mb-4 sm:mb-6">Status Breakdown</h3>
        <div className="space-y-3 sm:space-y-4">
          {Object.entries(statusBreakdown).map(([status, count]) => {
            const percentage = totalCompliances > 0 ? (count / totalCompliances) * 100 : 0
            const statusColors: Record<string, { bg: string; text: string; bar: string }> = {
              completed: { bg: 'bg-green-500/20', text: 'text-green-400', bar: 'bg-green-500' },
              pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', bar: 'bg-yellow-500' },
              overdue: { bg: 'bg-red-500/20', text: 'text-red-400', bar: 'bg-red-500' },
              notStarted: { bg: 'bg-gray-500/20', text: 'text-gray-400', bar: 'bg-gray-500' },
              upcoming: { bg: 'bg-blue-500/20', text: 'text-blue-400', bar: 'bg-blue-500' }
            }
            const colors = statusColors[status] || statusColors.notStarted
            const statusLabel = status === 'notStarted' ? 'Not Started' : status.charAt(0).toUpperCase() + status.slice(1)

            return (
              <div key={status}>
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                  <span className={`text-xs sm:text-sm font-medium ${colors.text}`}>{statusLabel}</span>
                  <span className="text-xs sm:text-sm text-gray-400">{count} ({Math.round(percentage)}%)</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-1.5 sm:h-2">
                  <div
                    className={`h-1.5 sm:h-2 rounded-full ${colors.bar} transition-all duration-300`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl font-light text-white mb-4 sm:mb-6">Category Breakdown</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {Object.entries(categoryBreakdown)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .map(([category, count]) => {
              const percentage = totalCompliances > 0 ? ((count as number) / totalCompliances) * 100 : 0
              return (
                <div key={category} className="border border-white/10 rounded-lg p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white font-medium text-sm sm:text-base break-words">{category}</span>
                    <span className="text-white font-semibold text-sm sm:text-base flex-shrink-0 ml-2">{count}</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-1 sm:h-1.5">
                    <div
                      className="bg-white h-1 sm:h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <p className="text-[10px] sm:text-xs text-gray-400 mt-1">{Math.round(percentage)}% of total</p>
                </div>
              )
            })}
        </div>
      </div>

      {/* Compliance Type Breakdown */}
      <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl font-light text-white mb-4 sm:mb-6">Compliance Type Breakdown</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Object.entries(complianceTypeBreakdown)
            .filter(([, data]) => data.total > 0)
            .map(([type, data]) => {
              const typeLabels: Record<string, string> = {
                'one-time': 'One-time',
                'monthly': 'Monthly',
                'quarterly': 'Quarterly',
                'annual': 'Annual'
              }
              // Color coding: one-time (purple), annual (green), monthly (blue), quarterly (cyan)
              const typeColors: Record<string, { bg: string; text: string; border: string; bar: string }> = {
                'one-time': { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', bar: 'bg-purple-400' },
                'annual': { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30', bar: 'bg-green-400' },
                'monthly': { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', bar: 'bg-blue-400' },
                'quarterly': { bg: 'bg-cyan-500/20', text: 'text-cyan-400', border: 'border-cyan-500/30', bar: 'bg-cyan-400' }
              }
              const colors = typeColors[type] || typeColors['one-time']
              const completionRate = data.total > 0 ? (data.completed / data.total) * 100 : 0

              return (
                <div key={type} className={`border ${colors.border} rounded-lg p-3 sm:p-4 ${colors.bg}`}>
                  <div className="flex items-center justify-between mb-2 sm:mb-3">
                    <h4 className={`font-semibold text-sm sm:text-base ${colors.text}`}>{typeLabels[type]}</h4>
                    <span className="text-white font-bold text-base sm:text-lg flex-shrink-0 ml-2">{data.total}</span>
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-gray-400">Completed</span>
                      <span className="text-green-400 font-medium">{data.completed}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-gray-400">Overdue</span>
                      <span className="text-red-400 font-medium">{data.overdue}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-gray-400">Pending</span>
                      <span className="text-yellow-400 font-medium">{data.pending}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-gray-400">Not Started</span>
                      <span className="text-gray-400 font-medium">{data.notStarted}</span>
                    </div>
                  </div>
                  <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-white/10">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] sm:text-xs text-gray-400">Completion Rate</span>
                      <span className={`text-[10px] sm:text-xs font-semibold ${colors.text}`}>{Math.round(completionRate)}%</span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1 sm:h-1.5">
                      <div
                        className={`h-1 sm:h-1.5 rounded-full ${colors.bar} transition-all duration-300`}
                        style={{ width: `${completionRate}%` }}
                      />
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* Financial Year Breakdown */}
      {Object.keys(fyBreakdown).length > 0 && (
        <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl font-light text-white mb-4 sm:mb-6">Financial Year Breakdown</h3>
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {Object.entries(fyBreakdown)
              .sort(([a], [b]) => {
                // Sort by FY year (extract year from "FY 2019-20")
                const getYear = (fy: string) => {
                  if (fy === 'Not Specified') return 0
                  const match = fy.match(/\d{4}/)
                  return match ? parseInt(match[0]) : 0
                }
                return getYear(b) - getYear(a)
              })
              .map(([fy, count]) => (
                <div key={fy} className="border border-white/10 rounded-lg p-3 sm:p-4 text-center">
                  <div className="text-xl sm:text-2xl font-light text-white mb-1">{count}</div>
                  <div className="text-xs sm:text-sm text-gray-400 break-words">{fy}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Overdue Compliances Detail */}
      {overdueCompliances.length > 0 && (
        <div className="bg-black border border-white/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-4 sm:mb-6">
            <h3 className="text-lg sm:text-xl font-light text-white">Overdue Compliances</h3>
            <span className="px-2 sm:px-3 py-1 bg-red-500/20 text-red-400 rounded-full text-xs sm:text-sm font-medium w-fit">
              {overdueCompliances.length} items
            </span>
          </div>
          <div className="overflow-x-auto scrollbar-hide">
            {/* Mobile Card View */}
            <div className="block sm:hidden space-y-3">
              {overdueCompliances.slice(0, 10).map((req: any) => {
                const delay = calculateDelayMemoized(req.dueDate, req.status)
                const penalty = calculatePenalty(req.penalty || '', delay, req.penalty_base_amount)
                return (
                  <div key={req.id} className="bg-black border border-white/10 rounded-lg p-3 space-y-2">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Category</div>
                      <div className="text-white text-sm font-medium break-words">{req.category}</div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Requirement</div>
                      <div className="text-white text-sm break-words">{req.requirement}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-gray-400 mb-1">Due Date</div>
                        <div className="text-gray-300">{req.dueDate}</div>
                      </div>
                      <div>
                        <div className="text-gray-400 mb-1">Days Delayed</div>
                        <div className="text-red-400 font-medium">{delay || 0} days</div>
                      </div>
                    </div>
                    {req.penalty && (
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Penalty</div>
                        <div className="text-gray-300 text-xs break-words">{req.penalty}</div>
                      </div>
                    )}
                    {penalty !== '-' && !penalty.includes('Cannot calculate') && (
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Calculated Penalty</div>
                        <div className="text-red-400 font-semibold text-sm">{penalty}</div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Desktop Table View */}
            <table className="hidden sm:table w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Category</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Requirement</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Due Date</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Days Delayed</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Penalty</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-400">Calculated Penalty</th>
                </tr>
              </thead>
              <tbody>
                {overdueCompliances.slice(0, 10).map((req: any) => {
                  const delay = calculateDelay(req.dueDate, req.status)
                  const penalty = calculatePenalty(req.penalty || '', delay, req.penalty_base_amount)
                  return (
                    <tr key={req.id} className="border-b border-white/10 hover:bg-black/50">
                      <td className="py-3 px-4 text-white">{req.category}</td>
                      <td className="py-3 px-4 text-white">{req.requirement}</td>
                      <td className="py-3 px-4 text-gray-400">{req.dueDate}</td>
                      <td className="py-3 px-4">
                        <span className="text-red-400 font-medium">{delay || 0} days</span>
                      </td>
                      <td className="py-3 px-4 text-gray-400">{req.penalty || '-'}</td>
                      <td className="py-3 px-4">
                        {penalty !== '-' && !penalty.includes('Cannot calculate') ? (
                          <span className="text-red-400 font-semibold">{penalty}</span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {overdueCompliances.length > 10 && (
              <p className="text-xs sm:text-sm text-gray-400 mt-4 text-center">
                Showing 10 of {overdueCompliances.length} overdue compliances. Export to see all.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

