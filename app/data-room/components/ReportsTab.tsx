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
    const margin = 20
    const contentWidth = pageWidth - 2 * margin
    let yPos = margin
    const lineHeight = 6
    const sectionGap = 10

    // Color palette
    const navy = [20, 40, 72]
    const darkText = [33, 33, 33]
    const midGray = [100, 100, 100]
    const lightBorder = [200, 200, 200]
    const accentRed = [180, 40, 40]
    const bgLight = [248, 248, 248]

    // Footer reservation
    const footerY = pageHeight - 10
    const maxContentY = footerY - 8

    const checkNewPage = (space: number) => {
      if (yPos + space > maxContentY) {
        doc.addPage()
        yPos = margin
        return true
      }
      return false
    }

    const splitText = (text: string, maxWidth: number, fontSize: number = 10): string[] => {
      doc.setFontSize(fontSize)
      const words = text.split(' ')
      const lines: string[] = []
      let cur = ''
      words.forEach((w: string) => {
        const test = cur ? `${cur} ${w}` : w
        if (doc.getTextWidth(test) > maxWidth && cur) {
          lines.push(cur)
          cur = w
        } else {
          cur = test
        }
      })
      if (cur) lines.push(cur)
      return lines
    }

    // Helper: draw a thin section heading line
    const drawSectionHeader = (title: string) => {
      checkNewPage(20)
      doc.setDrawColor(navy[0], navy[1], navy[2])
      doc.setLineWidth(0.8)
      doc.line(margin, yPos, pageWidth - margin, yPos)
      yPos += 6
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(13)
      doc.setTextColor(navy[0], navy[1], navy[2])
      doc.text(title, margin, yPos)
      yPos += 8
      doc.setTextColor(darkText[0], darkText[1], darkText[2])
      doc.setFont('helvetica', 'normal')
    }

    // ── COVER PAGE ──
    const coverDate = new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })
    const companyName = currentCompany?.name || 'Company'

    // White bg
    doc.setFillColor(255, 255, 255)
    doc.rect(0, 0, pageWidth, pageHeight, 'F')

    // Top navy bar
    doc.setFillColor(navy[0], navy[1], navy[2])
    doc.rect(0, 0, pageWidth, 6, 'F')

    // Left accent strip
    doc.setFillColor(navy[0], navy[1], navy[2])
    doc.rect(0, 0, 4, pageHeight, 'F')

    // Subtitle
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(midGray[0], midGray[1], midGray[2])
    doc.text('COMPLIANCE REPORT', margin + 6, 40)

    // Company name
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(32)
    doc.setTextColor(navy[0], navy[1], navy[2])
    const coverCompanyLines = splitText(companyName, contentWidth - 10, 32)
    let cY = 60
    coverCompanyLines.slice(0, 3).forEach((line: string, i: number) => {
      doc.text(line, margin + 6, cY + i * 14)
    })
    cY += Math.min(coverCompanyLines.length, 3) * 14 + 8

    // Thin line under company
    doc.setDrawColor(lightBorder[0], lightBorder[1], lightBorder[2])
    doc.setLineWidth(0.5)
    doc.line(margin + 6, cY, pageWidth - margin, cY)
    cY += 10

    // By line
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(11)
    doc.setTextColor(midGray[0], midGray[1], midGray[2])
    doc.text('Prepared by Finacra AI', margin + 6, cY)
    cY += 7
    doc.setFontSize(10)
    doc.text(coverDate, margin + 6, cY)

    // Bottom block
    const bY = pageHeight - 55
    doc.setFontSize(9)
    doc.setTextColor(midGray[0], midGray[1], midGray[2])
    doc.text('Scope: Overdue & pending compliances', margin + 6, bY)
    doc.text('Confidential — for internal use only', margin + 6, bY + 10)

    // Bottom navy bar
    doc.setFillColor(navy[0], navy[1], navy[2])
    doc.rect(0, pageHeight - 6, pageWidth, 6, 'F')

    // ── PAGE 2: EXECUTIVE SUMMARY ──
    doc.addPage()
    yPos = margin

    // Page header bar
    doc.setFillColor(navy[0], navy[1], navy[2])
    doc.rect(0, 0, pageWidth, 3, 'F')
    yPos = 15

    // Title
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(18)
    doc.setTextColor(navy[0], navy[1], navy[2])
    doc.text('Executive Summary', margin, yPos)
    yPos += 4
    doc.setDrawColor(navy[0], navy[1], navy[2])
    doc.setLineWidth(0.8)
    doc.line(margin, yPos, margin + 55, yPos)
    yPos += 10

    // Metrics boxes (2x2 grid)
    const boxW = (contentWidth - 8) / 2
    const boxH = 22
    const metricsData = [
      { label: 'Total Compliances', value: totalCompliances.toString(), color: navy },
      { label: 'Completed', value: `${completed}`, sub: totalCompliances > 0 ? `${Math.round((completed / totalCompliances) * 100)}%` : '', color: [34, 120, 60] },
      { label: 'Overdue', value: `${overdue}`, sub: totalCompliances > 0 ? `${Math.round((overdue / totalCompliances) * 100)}%` : '', color: accentRed },
      { label: 'Pending', value: `${pending}`, color: [180, 130, 20] },
    ]

    metricsData.forEach((m: any, i: number) => {
      const col = i % 2
      const row = Math.floor(i / 2)
      const bx = margin + col * (boxW + 8)
      const by = yPos + row * (boxH + 6)

      // Box background
      doc.setFillColor(bgLight[0], bgLight[1], bgLight[2])
      doc.rect(bx, by, boxW, boxH, 'F')
      // Left color accent
      doc.setFillColor(m.color[0], m.color[1], m.color[2])
      doc.rect(bx, by, 2.5, boxH, 'F')

      // Value
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(18)
      doc.setTextColor(m.color[0], m.color[1], m.color[2])
      doc.text(m.value, bx + 8, by + 12)

      // Sub text (percentage)
      if (m.sub) {
        const valWidth = doc.getTextWidth(m.value)
        doc.setFontSize(9)
        doc.setTextColor(midGray[0], midGray[1], midGray[2])
        doc.text(m.sub, bx + 8 + valWidth + 3, by + 12)
      }

      // Label
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.setTextColor(midGray[0], midGray[1], midGray[2])
      doc.text(m.label, bx + 8, by + 18)
    })

    yPos += Math.ceil(metricsData.length / 2) * (boxH + 6) + 4

    // Compliance Score
    if (totalCompliances > 0) {
      checkNewPage(18)
      const score = complianceScore
      doc.setFillColor(bgLight[0], bgLight[1], bgLight[2])
      doc.rect(margin, yPos, contentWidth, 16, 'F')
      doc.setFillColor(navy[0], navy[1], navy[2])
      doc.rect(margin, yPos, 2.5, 16, 'F')

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(midGray[0], midGray[1], midGray[2])
      doc.text('Compliance Score', margin + 8, yPos + 6)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.setTextColor(navy[0], navy[1], navy[2])
      doc.text(`${score}/100`, margin + 8, yPos + 13)

      // Score bar
      const barX = margin + 45
      const barW = contentWidth - 50
      doc.setFillColor(lightBorder[0], lightBorder[1], lightBorder[2])
      doc.rect(barX, yPos + 9, barW, 3, 'F')
      const scoreColor = score >= 70 ? [34, 120, 60] : score >= 40 ? [180, 130, 20] : accentRed
      doc.setFillColor(scoreColor[0], scoreColor[1], scoreColor[2])
      doc.rect(barX, yPos + 9, barW * (score / 100), 3, 'F')

      yPos += 22
    }

    // Total Penalty (in summary)
    if (totalPenalty > 0) {
      checkNewPage(16)
      doc.setFillColor(252, 245, 245)
      doc.rect(margin, yPos, contentWidth, 14, 'F')
      doc.setFillColor(accentRed[0], accentRed[1], accentRed[2])
      doc.rect(margin, yPos, 2.5, 14, 'F')

      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
      doc.setTextColor(midGray[0], midGray[1], midGray[2])
      doc.text('Total Accumulated Penalty', margin + 8, yPos + 6)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(14)
      doc.setTextColor(accentRed[0], accentRed[1], accentRed[2])
      doc.text(formatCurrency(totalPenalty, countryCode), margin + 8, yPos + 12)
      yPos += 20
    }

    yPos += sectionGap

    // ── STATUS BREAKDOWN ──
    drawSectionHeader('Status Breakdown')

    const statusItems = [
      { label: 'Completed', count: statusBreakdown.completed, color: [34, 120, 60] },
      { label: 'Pending', count: statusBreakdown.pending, color: [180, 130, 20] },
      { label: 'Overdue', count: statusBreakdown.overdue, color: accentRed },
      { label: 'Not Started', count: statusBreakdown.notStarted, color: midGray },
      { label: 'Upcoming', count: statusBreakdown.upcoming, color: [50, 100, 168] },
    ]

    // Stacked bar
    if (totalCompliances > 0) {
      const barY = yPos
      const barH = 6
      let barOffset = 0
      const statusBarColors = [[34, 120, 60], [180, 130, 20], accentRed, [160, 160, 160], [50, 100, 168]]
      statusItems.forEach((s: any, i: number) => {
        const w = (s.count / totalCompliances) * contentWidth
        if (w > 0) {
          doc.setFillColor(statusBarColors[i][0], statusBarColors[i][1], statusBarColors[i][2])
          doc.rect(margin + barOffset, barY, w, barH, 'F')
          barOffset += w
        }
      })
      yPos += barH + 6
    }

    // Legend rows
    doc.setFontSize(9)
    statusItems.forEach((s: any) => {
      if (yPos + 6 > maxContentY) { doc.addPage(); yPos = margin }
      const pct = totalCompliances > 0 ? Math.round((s.count / totalCompliances) * 100) : 0
      // Color dot
      doc.setFillColor(s.color[0], s.color[1], s.color[2])
      doc.circle(margin + 2, yPos - 1.5, 1.5, 'F')
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(darkText[0], darkText[1], darkText[2])
      doc.text(s.label, margin + 7, yPos)
      doc.setFont('helvetica', 'bold')
      doc.text(`${s.count}`, margin + 40, yPos)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(midGray[0], midGray[1], midGray[2])
      doc.text(`(${pct}%)`, margin + 52, yPos)
      doc.setTextColor(darkText[0], darkText[1], darkText[2])
      yPos += lineHeight
    })

    yPos += sectionGap

    // ── CATEGORY BREAKDOWN ──
    drawSectionHeader('Category Breakdown')

    const sortedCategories = Object.entries(categoryBreakdown)
      .sort(([, a], [, b]) => (b as number) - (a as number))
      .slice(0, 10)

    doc.setFontSize(9)
    sortedCategories.forEach(([category, count]) => {
      checkNewPage(8)
      const pct = totalCompliances > 0 ? Math.round(((count as number) / totalCompliances) * 100) : 0
      const catLines = splitText(category, 75, 9)
      catLines.forEach((line: string, idx: number) => {
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(darkText[0], darkText[1], darkText[2])
        doc.text(line, margin, yPos + idx * 4)
      })
      const textEndY = yPos + (catLines.length - 1) * 4

      // Bar
      const barX = margin + 80
      const barW = contentWidth - 110
      doc.setFillColor(bgLight[0], bgLight[1], bgLight[2])
      doc.rect(barX, textEndY - 3, barW, 4, 'F')
      doc.setFillColor(navy[0], navy[1], navy[2])
      doc.rect(barX, textEndY - 3, Math.max(barW * (pct / 100), 1), 4, 'F')

      // Count
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(darkText[0], darkText[1], darkText[2])
      doc.text(`${count}`, pageWidth - margin - 14, textEndY, { align: 'right' })
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(midGray[0], midGray[1], midGray[2])
      doc.text(`${pct}%`, pageWidth - margin, textEndY, { align: 'right' })

      yPos += catLines.length * 4 + 4
    })

    yPos += sectionGap

    // ── COMPLIANCE TYPE BREAKDOWN ──
    drawSectionHeader('Compliance Type Breakdown')

    const typeLabels: Record<string, string> = {
      'one-time': 'One-time', 'annual': 'Annual', 'monthly': 'Monthly', 'quarterly': 'Quarterly'
    }

    Object.entries(complianceTypeBreakdown)
      .filter(([, data]) => data.total > 0)
      .forEach(([type, data]) => {
        checkNewPage(16)
        const completionRate = data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(darkText[0], darkText[1], darkText[2])
        doc.text(`${typeLabels[type] || type}`, margin, yPos)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(9)
        doc.setTextColor(midGray[0], midGray[1], midGray[2])
        doc.text(`Total: ${data.total}   Completed: ${data.completed}   Overdue: ${data.overdue}   Pending: ${data.pending}   Not Started: ${data.notStarted}   (${completionRate}% done)`, margin + 2, yPos + 6)

        yPos += 14
      })

    yPos += sectionGap

    // ── FINANCIAL YEAR BREAKDOWN ──
    if (Object.keys(fyBreakdown).length > 0) {
      drawSectionHeader('Financial Year Breakdown')

      const sortedFY = Object.entries(fyBreakdown)
        .sort(([a], [b]) => {
          const yr = (s: string) => { const m = s.match(/\d{4}/); return m ? parseInt(m[0]) : 0 }
          return yr(b) - yr(a)
        })

      doc.setFontSize(9)
      const fyPerRow = 4
      const fyColW = contentWidth / fyPerRow
      sortedFY.forEach(([fy, count], i: number) => {
        const col = i % fyPerRow
        const row = Math.floor(i / fyPerRow)
        if (col === 0 && row > 0) checkNewPage(10)
        const fx = margin + col * fyColW
        const fy2 = yPos + row * 10

        doc.setFont('helvetica', 'normal')
        doc.setTextColor(midGray[0], midGray[1], midGray[2])
        doc.text(fy, fx, fy2)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(darkText[0], darkText[1], darkText[2])
        doc.text(`${count}`, fx + doc.getTextWidth(fy + '  '), fy2)
      })
      yPos += Math.ceil(sortedFY.length / fyPerRow) * 10 + sectionGap
    }

    // ── OVERDUE COMPLIANCES TABLE ──
    if (overdueCompliances.length > 0) {
      drawSectionHeader(`Overdue Compliances (${Math.min(overdueCompliances.length, 15)} of ${overdueCompliances.length})`)

      // Table header
      const cols = [
        { label: 'Requirement', w: contentWidth * 0.35 },
        { label: 'Category', w: contentWidth * 0.20 },
        { label: 'Due Date', w: contentWidth * 0.15 },
        { label: 'Days Late', w: contentWidth * 0.12 },
        { label: 'Penalty', w: contentWidth * 0.18 },
      ]

      doc.setFillColor(navy[0], navy[1], navy[2])
      doc.rect(margin, yPos - 2, contentWidth, 7, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      let hx = margin + 2
      cols.forEach((c: any) => {
        doc.text(c.label, hx, yPos + 3)
        hx += c.w
      })
      yPos += 8

      // Rows
      doc.setFontSize(8)
      overdueCompliances.slice(0, 15).forEach((req: any, idx: number) => {
        const delay = calculateDelayMemoized(req.dueDate, req.status)
        let penalty = calculatePenalty(req.penalty || '', delay, req.penalty_base_amount)
        if (penalty.startsWith("'")) penalty = penalty.substring(1)

        // Estimate row height
        const reqLines = splitText(req.requirement, cols[0].w - 4, 8)
        const catLines = splitText(req.category, cols[1].w - 4, 8)
        const rowH = Math.max(reqLines.length, catLines.length) * 4 + 3
        checkNewPage(rowH + 2)

        // Alternate row bg
        if (idx % 2 === 0) {
          doc.setFillColor(bgLight[0], bgLight[1], bgLight[2])
          doc.rect(margin, yPos - 2, contentWidth, rowH, 'F')
        }

        let cx = margin + 2
        // Requirement
        doc.setFont('helvetica', 'normal')
        doc.setTextColor(darkText[0], darkText[1], darkText[2])
        reqLines.forEach((line: string, li: number) => {
          doc.text(line, cx, yPos + li * 4)
        })
        cx += cols[0].w

        // Category
        doc.setTextColor(midGray[0], midGray[1], midGray[2])
        catLines.forEach((line: string, li: number) => {
          doc.text(line, cx, yPos + li * 4)
        })
        cx += cols[1].w

        // Due Date
        doc.setTextColor(darkText[0], darkText[1], darkText[2])
        doc.text(req.dueDate || '—', cx, yPos)
        cx += cols[2].w

        // Days Late
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(accentRed[0], accentRed[1], accentRed[2])
        doc.text(`${delay || 0}`, cx, yPos)
        cx += cols[3].w

        // Penalty
        if (penalty !== '-' && !penalty.includes('Cannot calculate')) {
          doc.text(penalty, cx, yPos)
        } else {
          doc.setTextColor(midGray[0], midGray[1], midGray[2])
          doc.setFont('helvetica', 'normal')
          doc.text('—', cx, yPos)
        }

        // Row separator
        doc.setDrawColor(lightBorder[0], lightBorder[1], lightBorder[2])
        doc.setLineWidth(0.2)
        doc.line(margin, yPos + rowH - 2, pageWidth - margin, yPos + rowH - 2)

        yPos += rowH
      })

      if (overdueCompliances.length > 15) {
        yPos += 4
        doc.setFontSize(8)
        doc.setTextColor(midGray[0], midGray[1], midGray[2])
        doc.setFont('helvetica', 'italic')
        doc.text(`+ ${overdueCompliances.length - 15} more overdue compliances (see CSV export for full list)`, margin, yPos)
        doc.setFont('helvetica', 'normal')
        yPos += 8
      }
    }

    // ── LEGAL & BUSINESS IMPACT ANALYSIS ──
    if (enrichedData.length > 0) {
      yPos += sectionGap
      drawSectionHeader('Legal & Business Impact Analysis')

      doc.setFontSize(8)
      doc.setTextColor(midGray[0], midGray[1], midGray[2])
      doc.text('AI-researched legal sections, penalty provisions, and business impact for non-compliant items.', margin, yPos)
      yPos += 8

      enrichedData.forEach((enriched: EnrichedComplianceData, index: number) => {
        const group = Array.from(nonCompliantGroups.values()).find((g: any) => g.representative.id === enriched.requirementId)
        const req = group?.representative
        if (!req) return

        // Estimate total height for this block
        const titleLines = splitText(`${index + 1}. ${req.requirement}`, contentWidth - 4, 10)
        const legalLines = splitText(enriched.legalSection, contentWidth - 10, 8)
        const penProvLines = splitText(enriched.penaltyProvision, contentWidth - 10, 8)
        const finLines = splitText(enriched.businessImpact.financial, contentWidth - 10, 8)
        const repLines = splitText(enriched.businessImpact.reputation, contentWidth - 10, 8)
        const opsLines = splitText(enriched.businessImpact.operations, contentWidth - 10, 8)
        const estH = titleLines.length * 5 + 8 + legalLines.length * 4 + 6 + penProvLines.length * 4 + 6 + finLines.length * 4 + 6 + repLines.length * 4 + 6 + opsLines.length * 4 + 10

        checkNewPage(Math.min(estH, 80)) // at least start on fresh page if tight

        // Title bar
        doc.setFillColor(bgLight[0], bgLight[1], bgLight[2])
        doc.rect(margin, yPos - 2, contentWidth, titleLines.length * 5 + 4, 'F')
        doc.setFillColor(navy[0], navy[1], navy[2])
        doc.rect(margin, yPos - 2, 2.5, titleLines.length * 5 + 4, 'F')

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(navy[0], navy[1], navy[2])
        titleLines.forEach((line: string, li: number) => {
          doc.text(line, margin + 6, yPos + li * 5)
        })
        yPos += titleLines.length * 5 + 4

        // Category
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(midGray[0], midGray[1], midGray[2])
        doc.text(`Category: ${req.category}`, margin + 6, yPos)
        yPos += 6

        // Exact penalty (prominent)
        if (enriched.exactPenalty && enriched.exactPenalty !== 'Not applicable') {
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(9)
          doc.setTextColor(accentRed[0], accentRed[1], accentRed[2])
          doc.text(`Calculated Penalty: ${enriched.exactPenalty}`, margin + 6, yPos)
          yPos += 6
        }

        // Sub-sections with label + content
        const subSections = [
          { label: 'Legal Section', lines: legalLines },
          { label: 'Penalty Provision', lines: penProvLines },
          { label: 'Financial Impact', lines: finLines },
          { label: 'Reputation Impact', lines: repLines },
          { label: 'Operational Impact', lines: opsLines },
        ]

        subSections.forEach((sub: any) => {
          if (sub.lines.length === 0 || (sub.lines.length === 1 && sub.lines[0] === 'Information not available')) return
          checkNewPage(sub.lines.length * 4 + 8)

          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8)
          doc.setTextColor(darkText[0], darkText[1], darkText[2])
          doc.text(sub.label, margin + 6, yPos)
          yPos += 4

          doc.setFont('helvetica', 'normal')
          doc.setTextColor(midGray[0], midGray[1], midGray[2])
          sub.lines.forEach((line: string, li: number) => {
            if (yPos + li * 4 > maxContentY) { doc.addPage(); yPos = margin }
            doc.text(line, margin + 6, yPos + li * 4)
          })
          yPos += sub.lines.length * 4 + 2
        })

        // Separator between items
        yPos += 3
        doc.setDrawColor(lightBorder[0], lightBorder[1], lightBorder[2])
        doc.setLineWidth(0.3)
        doc.line(margin, yPos, pageWidth - margin, yPos)
        yPos += 5
      })
    }

    // ── LAST PAGE: QR + CTA ──
    doc.addPage()
    doc.setFillColor(255, 255, 255)
    doc.rect(0, 0, pageWidth, pageHeight, 'F')

    // Top and bottom bars
    doc.setFillColor(navy[0], navy[1], navy[2])
    doc.rect(0, 0, pageWidth, 3, 'F')
    doc.rect(0, pageHeight - 3, pageWidth, 3, 'F')

    try {
      const QRCode: any = await import('qrcode')
      const qrDataUrl: string = await QRCode.toDataURL('https://www.finacra.com', {
        margin: 1, width: 260, color: { dark: '#142848', light: '#FFFFFF' },
      })

      const qrSize = 70
      const qrX = (pageWidth - qrSize) / 2
      const qrY = pageHeight / 2 - 45
      doc.addImage(qrDataUrl, 'PNG', qrX, qrY, qrSize, qrSize)

      doc.setTextColor(navy[0], navy[1], navy[2])
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.text('Try free trial now!', pageWidth / 2, qrY + qrSize + 14, { align: 'center' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(midGray[0], midGray[1], midGray[2])
      doc.text('Scan to visit www.finacra.com', pageWidth / 2, qrY + qrSize + 24, { align: 'center' })
    } catch {
      doc.setTextColor(navy[0], navy[1], navy[2])
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(16)
      doc.text('Try free trial now!', pageWidth / 2, pageHeight / 2, { align: 'center' })
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(midGray[0], midGray[1], midGray[2])
      doc.text('www.finacra.com', pageWidth / 2, pageHeight / 2 + 12, { align: 'center' })
    }

    // ── FOOTER ON ALL PAGES ──
    const totalPages = doc.getNumberOfPages()
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      doc.setFontSize(7)
      doc.setTextColor(midGray[0], midGray[1], midGray[2])
      doc.setFont('helvetica', 'normal')
      doc.text(
        `Page ${i} of ${totalPages}  |  Compliance Report  |  ${coverDate}`,
        pageWidth / 2, footerY, { align: 'center' }
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
      <div className="bg-bg-card border border-line/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-3 sm:mb-4">
          <h2 className="text-xl sm:text-2xl font-light text-fg-primary">Compliance Reports</h2>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
            <button
              onClick={exportPDFReport}
              disabled={isGeneratingEnhancedPDF}
              className="px-3 sm:px-4 py-2 bg-accent-brand text-white rounded-lg hover:bg-bg-hover transition-colors flex items-center justify-center gap-2 font-medium text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
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
              className="px-3 sm:px-4 py-2 bg-bg-hover border border-line/40 text-fg-primary rounded-lg hover:bg-bg-hover transition-colors flex items-center justify-center gap-2 text-sm sm:text-base"
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
            <div className="mt-4 p-4 bg-bg-hover border border-line/40/30 rounded-lg">
              <div className="flex items-center gap-3">
                <svg className="animate-spin h-5 w-5 text-fg-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <div className="flex-1">
                  <div className="text-fg-primary text-sm font-medium">{pdfGenerationProgress.step}</div>
                  {pdfGenerationProgress.total > 0 && (
                    <div className="text-fg-muted text-xs mt-1">
                      {pdfGenerationProgress.current} of {pdfGenerationProgress.total} items enriched
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 text-xs text-fg-muted">
                This may take a few moments as we research legal sections and analyze business impact...
              </div>
            </div>
          )}
        </div>
        <p className="text-fg-muted text-sm sm:text-base">Comprehensive compliance analytics and insights</p>
      </div>

      {/* Statistics Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* Total Compliances */}
        <div className="bg-bg-card border border-line/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-medium text-fg-secondary">Total Compliances</h3>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" className="sm:w-6 sm:h-6 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-light text-fg-primary mb-1 sm:mb-2">{totalCompliances}</div>
          <p className="text-xs sm:text-sm text-fg-muted">All compliance requirements</p>
        </div>

        {/* Completed */}
        <div className="bg-bg-card border border-line/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-medium text-fg-secondary">Completed</h3>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-green-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" className="sm:w-6 sm:h-6 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-light text-fg-primary mb-1 sm:mb-2">{completed}</div>
          <p className="text-xs sm:text-sm text-fg-muted">
            {totalCompliances > 0 ? `${Math.round((completed / totalCompliances) * 100)}% completion rate` : 'No compliances'}
          </p>
        </div>

        {/* Overdue */}
        <div className="bg-bg-card border border-line/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-medium text-fg-secondary">Overdue</h3>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" className="sm:w-6 sm:h-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-light text-fg-primary mb-1 sm:mb-2">{overdue}</div>
          <p className="text-xs sm:text-sm text-fg-muted">
            {totalCompliances > 0 ? `${Math.round((overdue / totalCompliances) * 100)}% overdue rate` : 'No compliances'}
          </p>
        </div>

        {/* Pending */}
        <div className="bg-bg-card border border-line/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-medium text-fg-secondary">Pending</h3>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-yellow-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" className="sm:w-6 sm:h-6 text-yellow-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-light text-fg-primary mb-1 sm:mb-2">{pending}</div>
          <p className="text-xs sm:text-sm text-fg-muted">In progress</p>
        </div>

        {/* Not Started */}
        <div className="bg-bg-card border border-line/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-medium text-fg-secondary">Not Started</h3>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-bg-hover/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" className="sm:w-6 sm:h-6 text-fg-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-light text-fg-primary mb-1 sm:mb-2">{notStarted}</div>
          <p className="text-xs sm:text-sm text-fg-muted">Awaiting action</p>
        </div>

        {/* Compliance Score */}
        <div className="bg-bg-card border border-line/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-medium text-fg-secondary">Compliance Score</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setIsComplianceScoreModalOpen(true)}
                className="text-fg-muted hover:text-fg-primary transition-colors"
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
            <div className="text-2xl sm:text-3xl font-light text-fg-primary">
              {totalCompliances === 0 ? '—' : `${complianceScore}`}
            </div>
            {totalCompliances > 0 && (
              <div className="text-xs sm:text-sm text-fg-muted">/ 100</div>
            )}
          </div>
          <p className="text-xs sm:text-sm text-fg-muted">
            Overall compliance health based on completion and overdue items
          </p>
        </div>

        {/* Total Penalty */}
        <div className="bg-bg-card border border-line/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex items-center justify-between mb-3 sm:mb-4">
            <h3 className="text-base sm:text-lg font-medium text-fg-secondary">Total Penalty</h3>
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <svg width="20" height="20" className="sm:w-6 sm:h-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-light text-fg-primary mb-1 sm:mb-2">
            {totalPenalty > 0 ? formatCurrency(totalPenalty, countryCode) : formatCurrency(0, countryCode)}
          </div>
          <p className="text-xs sm:text-sm text-fg-muted">Accumulated penalties</p>
        </div>
      </div>

      {/* Status Breakdown Chart */}
      <div className="bg-bg-card border border-line/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl font-light text-fg-primary mb-4 sm:mb-6">Status Breakdown</h3>
        <div className="space-y-3 sm:space-y-4">
          {Object.entries(statusBreakdown).map(([status, count]) => {
            const percentage = totalCompliances > 0 ? (count / totalCompliances) * 100 : 0
            const statusColors: Record<string, { bg: string; text: string; bar: string }> = {
              completed: { bg: 'bg-green-500/20', text: 'text-green-400', bar: 'bg-green-500' },
              pending: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', bar: 'bg-yellow-500' },
              overdue: { bg: 'bg-red-500/20', text: 'text-red-400', bar: 'bg-red-500' },
              notStarted: { bg: 'bg-bg-hover/20', text: 'text-fg-muted', bar: 'bg-bg-hover' },
              upcoming: { bg: 'bg-blue-500/20', text: 'text-blue-400', bar: 'bg-blue-500' }
            }
            const colors = statusColors[status] || statusColors.notStarted
            const statusLabel = status === 'notStarted' ? 'Not Started' : status.charAt(0).toUpperCase() + status.slice(1)

            return (
              <div key={status}>
                <div className="flex items-center justify-between mb-1.5 sm:mb-2">
                  <span className={`text-xs sm:text-sm font-medium ${colors.text}`}>{statusLabel}</span>
                  <span className="text-xs sm:text-sm text-fg-muted">{count} ({Math.round(percentage)}%)</span>
                </div>
                <div className="w-full bg-bg-elevated rounded-full h-1.5 sm:h-2">
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
      <div className="bg-bg-card border border-line/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl font-light text-fg-primary mb-4 sm:mb-6">Category Breakdown</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {Object.entries(categoryBreakdown)
            .sort(([, a], [, b]) => (b as number) - (a as number))
            .map(([category, count]) => {
              const percentage = totalCompliances > 0 ? ((count as number) / totalCompliances) * 100 : 0
              return (
                <div key={category} className="border border-line/10 rounded-lg p-3 sm:p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-fg-primary font-medium text-sm sm:text-base break-words">{category}</span>
                    <span className="text-fg-primary font-semibold text-sm sm:text-base flex-shrink-0 ml-2">{count}</span>
                  </div>
                  <div className="w-full bg-bg-elevated rounded-full h-1 sm:h-1.5">
                    <div
                      className="bg-white h-1 sm:h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <p className="text-[10px] sm:text-xs text-fg-muted mt-1">{Math.round(percentage)}% of total</p>
                </div>
              )
            })}
        </div>
      </div>

      {/* Compliance Type Breakdown */}
      <div className="bg-bg-card border border-line/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
        <h3 className="text-lg sm:text-xl font-light text-fg-primary mb-4 sm:mb-6">Compliance Type Breakdown</h3>
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
                    <span className="text-fg-primary font-bold text-base sm:text-lg flex-shrink-0 ml-2">{data.total}</span>
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-fg-muted">Completed</span>
                      <span className="text-green-400 font-medium">{data.completed}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-fg-muted">Overdue</span>
                      <span className="text-red-400 font-medium">{data.overdue}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-fg-muted">Pending</span>
                      <span className="text-yellow-400 font-medium">{data.pending}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-fg-muted">Not Started</span>
                      <span className="text-fg-muted font-medium">{data.notStarted}</span>
                    </div>
                  </div>
                  <div className="mt-2 sm:mt-3 pt-2 sm:pt-3 border-t border-line/10">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] sm:text-xs text-fg-muted">Completion Rate</span>
                      <span className={`text-[10px] sm:text-xs font-semibold ${colors.text}`}>{Math.round(completionRate)}%</span>
                    </div>
                    <div className="w-full bg-bg-elevated rounded-full h-1 sm:h-1.5">
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
        <div className="bg-bg-card border border-line/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <h3 className="text-lg sm:text-xl font-light text-fg-primary mb-4 sm:mb-6">Financial Year Breakdown</h3>
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
                <div key={fy} className="border border-line/10 rounded-lg p-3 sm:p-4 text-center">
                  <div className="text-xl sm:text-2xl font-light text-fg-primary mb-1">{count}</div>
                  <div className="text-xs sm:text-sm text-fg-muted break-words">{fy}</div>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Overdue Compliances Detail */}
      {overdueCompliances.length > 0 && (
        <div className="bg-bg-card border border-line/10 rounded-xl sm:rounded-2xl p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-0 mb-4 sm:mb-6">
            <h3 className="text-lg sm:text-xl font-light text-fg-primary">Overdue Compliances</h3>
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
                  <div key={req.id} className="bg-bg-card border border-line/10 rounded-lg p-3 space-y-2">
                    <div>
                      <div className="text-xs text-fg-muted mb-1">Category</div>
                      <div className="text-fg-primary text-sm font-medium break-words">{req.category}</div>
                    </div>
                    <div>
                      <div className="text-xs text-fg-muted mb-1">Requirement</div>
                      <div className="text-fg-primary text-sm break-words">{req.requirement}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-fg-muted mb-1">Due Date</div>
                        <div className="text-fg-secondary">{req.dueDate}</div>
                      </div>
                      <div>
                        <div className="text-fg-muted mb-1">Days Delayed</div>
                        <div className="text-red-400 font-medium">{delay || 0} days</div>
                      </div>
                    </div>
                    {req.penalty && (
                      <div>
                        <div className="text-xs text-fg-muted mb-1">Penalty</div>
                        <div className="text-fg-secondary text-xs break-words">{req.penalty}</div>
                      </div>
                    )}
                    {penalty !== '-' && !penalty.includes('Cannot calculate') && (
                      <div>
                        <div className="text-xs text-fg-muted mb-1">Calculated Penalty</div>
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
                <tr className="border-b border-line/10">
                  <th className="text-left py-3 px-4 text-sm font-medium text-fg-muted">Category</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-fg-muted">Requirement</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-fg-muted">Due Date</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-fg-muted">Days Delayed</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-fg-muted">Penalty</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-fg-muted">Calculated Penalty</th>
                </tr>
              </thead>
              <tbody>
                {overdueCompliances.slice(0, 10).map((req: any) => {
                  const delay = calculateDelay(req.dueDate, req.status)
                  const penalty = calculatePenalty(req.penalty || '', delay, req.penalty_base_amount)
                  return (
                    <tr key={req.id} className="border-b border-line/10 hover:bg-black/50">
                      <td className="py-3 px-4 text-fg-primary">{req.category}</td>
                      <td className="py-3 px-4 text-fg-primary">{req.requirement}</td>
                      <td className="py-3 px-4 text-fg-muted">{req.dueDate}</td>
                      <td className="py-3 px-4">
                        <span className="text-red-400 font-medium">{delay || 0} days</span>
                      </td>
                      <td className="py-3 px-4 text-fg-muted">{req.penalty || '-'}</td>
                      <td className="py-3 px-4">
                        {penalty !== '-' && !penalty.includes('Cannot calculate') ? (
                          <span className="text-red-400 font-semibold">{penalty}</span>
                        ) : (
                          <span className="text-fg-muted">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {overdueCompliances.length > 10 && (
              <p className="text-xs sm:text-sm text-fg-muted mt-4 text-center">
                Showing 10 of {overdueCompliances.length} overdue compliances. Export to see all.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

