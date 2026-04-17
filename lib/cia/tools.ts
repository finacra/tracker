/**
 * CIA tool registry — declarative tool definitions for Azure OpenAI
 * function calling + server-side execute handlers.
 *
 * Each handler runs in the chat route with the authenticated user's
 * context. Handlers MUST re-check company access (they cannot trust
 * the model). Server actions already enforce this — we wrap them.
 */

import { prisma } from '@/lib/prisma'
import { updateRequirement, updateRequirementStatus } from '@/app/data-room/actions'
import { runApplicabilityEvaluation, overrideAssessment } from '@/app/data-room/actions-evaluator'
import { recordFact, fyWindow } from '@/lib/compliance/facts'

type JSONSchema = {
  type: string
  description?: string
  properties?: Record<string, JSONSchema>
  items?: JSONSchema
  required?: string[]
  enum?: string[]
}

export interface ToolDef {
  name: string
  description: string
  parameters: JSONSchema
}

export interface ToolContext {
  companyId: string
  userId: string
}

export interface ToolResult {
  ok: boolean
  data?: unknown
  error?: string
  summary: string
}

type ToolHandler = (args: any, ctx: ToolContext) => Promise<ToolResult>

// ── Tool definitions (exposed to the model) ──────────────────────────────

export const TOOLS: ToolDef[] = [
  {
    name: 'list_requirements',
    description:
      'List compliance requirements for the current company, filtered by status, category, financial year, or a text search. Returns requirement IDs the user can act on. Call this before a bulk update to find the right rows.',
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status. Leave empty to match any.',
          enum: ['not_started', 'upcoming', 'pending', 'overdue', 'completed'],
        },
        category: { type: 'string', description: 'Filter by category (e.g. "GST", "TDS", "RoC").' },
        financial_year: { type: 'string', description: 'Filter by financial year (e.g. "2026-27").' },
        search: { type: 'string', description: 'Substring match on requirement name or description.' },
        limit: { type: 'number', description: 'Max rows to return (default 50).' },
      },
    },
  },
  {
    name: 'update_requirement_status',
    description:
      'Update the status of one or more requirements. Use this for bulk operations like "mark all GSTR-1 filings as completed".',
    parameters: {
      type: 'object',
      properties: {
        requirement_ids: {
          type: 'array',
          description: 'UUIDs of requirements to update. Get these from list_requirements.',
          items: { type: 'string' },
        },
        status: {
          type: 'string',
          enum: ['not_started', 'upcoming', 'pending', 'overdue', 'completed'],
        },
      },
      required: ['requirement_ids', 'status'],
    },
  },
  {
    name: 'set_requirement_fields',
    description:
      'Update fields on a single requirement: payable amount, paid amount, due date, filed date, or status. Use for "set GSTR-3B April payable to ₹45,000".',
    parameters: {
      type: 'object',
      properties: {
        requirement_id: { type: 'string', description: 'UUID of the requirement.' },
        amount_payable: { type: 'number', description: 'Amount payable in rupees. Pass null to clear.' },
        amount_paid: { type: 'number', description: 'Amount paid in rupees. Pass null to clear.' },
        due_date: { type: 'string', description: 'Due date in YYYY-MM-DD.' },
        status: {
          type: 'string',
          enum: ['not_started', 'upcoming', 'pending', 'overdue', 'completed'],
        },
        penalty_base_amount: { type: 'number', description: 'Base amount for penalty calc (e.g. the tax due).' },
      },
      required: ['requirement_id'],
    },
  },
  {
    name: 'record_company_fact',
    description:
      'Record a business fact (rent amount, contractor spend, turnover, headcount) that drives which compliances apply. Use when the user mentions a financial threshold or operational detail.',
    parameters: {
      type: 'object',
      properties: {
        kind: {
          type: 'string',
          description:
            'Fact kind. Common: rent.monthly_payment, contractor.annual_spend, professional_fee.annual_spend, turnover.annual, headcount.total, director.remuneration, tds.annual_total.',
        },
        amount: { type: 'number', description: 'Numeric value.' },
        unit: {
          type: 'string',
          description:
            'Unit label: rupees_per_month, rupees_per_year, rupees, count, boolean.',
        },
        financial_year: {
          type: 'string',
          description: 'Indian FY (e.g. "2026-27"). Defaults to current FY.',
        },
      },
      required: ['kind', 'amount'],
    },
  },
  {
    name: 'run_evaluator',
    description:
      'Re-run compliance applicability evaluation for the current FY. Call this after recording facts so the tracker reflects the new state.',
    parameters: {
      type: 'object',
      properties: {
        financial_year: { type: 'string', description: 'FY to re-evaluate (default current).' },
      },
    },
  },
  {
    name: 'override_assessment',
    description:
      'Mark a compliance rule as applicable or not applicable for this company, overriding the evaluator. Use when the user explicitly confirms "this applies / doesn\'t apply".',
    parameters: {
      type: 'object',
      properties: {
        rule_id: { type: 'string', description: 'ComplianceRule id (e.g. "tds.return.q1@itact2025").' },
        financial_year: { type: 'string' },
        applicable: { type: 'boolean' },
        note: { type: 'string', description: 'Optional reason for the override.' },
      },
      required: ['rule_id', 'financial_year', 'applicable'],
    },
  },
]

// ── Tool handlers (executed server-side) ─────────────────────────────────

const HANDLERS: Record<string, ToolHandler> = {
  list_requirements: async (args, ctx) => {
    const limit = Math.min(Number(args.limit) || 50, 200)
    // financial_year lives in DB but isn't in Prisma schema — use raw SQL.
    const conditions: string[] = ['company_id = $1::uuid']
    const params: any[] = [ctx.companyId]
    let idx = 2
    if (args.status) { conditions.push(`status = $${idx++}::text`); params.push(args.status) }
    if (args.category) { conditions.push(`category = $${idx++}::text`); params.push(args.category) }
    if (args.financial_year) { conditions.push(`financial_year = $${idx++}::text`); params.push(args.financial_year) }
    if (args.search) {
      conditions.push(`(requirement ILIKE $${idx} OR COALESCE(description,'') ILIKE $${idx})`)
      params.push(`%${args.search}%`)
      idx++
    }
    const query = `SELECT id, category, requirement, status, due_date, financial_year, amount_payable, amount_paid
                   FROM regulatory_requirements
                   WHERE ${conditions.join(' AND ')}
                   ORDER BY due_date ASC NULLS LAST
                   LIMIT ${limit}`
    const rows = await prisma.$queryRawUnsafe<any[]>(query, ...params)
    const data = rows.map(r => ({
      id: r.id,
      category: r.category,
      name: r.requirement,
      status: r.status,
      due_date: r.due_date ? new Date(r.due_date).toISOString().slice(0, 10) : null,
      financial_year: r.financial_year ?? null,
      amount_payable: r.amount_payable != null ? Number(r.amount_payable) : null,
      amount_paid: r.amount_paid != null ? Number(r.amount_paid) : null,
    }))
    return {
      ok: true,
      data,
      summary: `Found ${data.length} requirement${data.length === 1 ? '' : 's'}.`,
    }
  },

  update_requirement_status: async (args, ctx) => {
    const ids = Array.isArray(args.requirement_ids) ? args.requirement_ids : []
    if (ids.length === 0) return { ok: false, error: 'No requirement IDs provided', summary: 'Nothing to update.' }
    let ok = 0
    let failed = 0
    const errors: string[] = []
    for (const id of ids) {
      try {
        const r = await updateRequirementStatus(id, ctx.companyId, args.status)
        if (r.success) ok++
        else {
          failed++
          if (r.error) errors.push(r.error)
        }
      } catch (e) {
        failed++
        errors.push(e instanceof Error ? e.message : String(e))
      }
    }
    return {
      ok: failed === 0,
      data: { updated: ok, failed, errors: errors.slice(0, 3) },
      summary: `Updated ${ok} requirement${ok === 1 ? '' : 's'} to "${args.status}"${failed ? `, ${failed} failed` : ''}.`,
    }
  },

  set_requirement_fields: async (args, ctx) => {
    const payload: any = {}
    if (args.amount_payable !== undefined) payload.amount_payable = args.amount_payable
    if (args.amount_paid !== undefined) payload.amount_paid = args.amount_paid
    if (args.due_date !== undefined) payload.due_date = args.due_date
    if (args.status !== undefined) payload.status = args.status
    if (args.penalty_base_amount !== undefined) payload.penalty_base_amount = args.penalty_base_amount
    const r = await updateRequirement(args.requirement_id, ctx.companyId, payload)
    if (!r.success) return { ok: false, error: r.error, summary: r.error || 'Update failed.' }
    return { ok: true, summary: `Updated requirement ${args.requirement_id}.` }
  },

  record_company_fact: async (args, ctx) => {
    const fy = args.financial_year || currentIndianFY()
    const { periodStart, periodEnd } = fyWindow(fy)
    await recordFact({
      companyId: ctx.companyId,
      kind: args.kind,
      periodStart,
      periodEnd,
      amount: typeof args.amount === 'number' ? args.amount : null,
      unit: args.unit || null,
      sourceKind: 'user_declared',
      confidence: 1,
      createdBy: ctx.userId,
    })
    return { ok: true, summary: `Recorded ${args.kind} = ${args.amount} for FY ${fy}.` }
  },

  run_evaluator: async (args, ctx) => {
    const fy = args.financial_year || currentIndianFY()
    const r = await runApplicabilityEvaluation(ctx.companyId, fy, { skipLlmFallback: true })
    if (!r.success) return { ok: false, error: r.error, summary: r.error || 'Evaluator failed.' }
    return {
      ok: true,
      data: { applicable: r.applicable, notApplicable: r.notApplicable },
      summary: `Evaluator ran: ${r.applicable} applicable, ${r.notApplicable} not applicable.`,
    }
  },

  override_assessment: async (args, ctx) => {
    const a = await prisma.complianceAssessment.findFirst({
      where: {
        company_id: ctx.companyId,
        rule_id: args.rule_id,
        financial_year: args.financial_year,
      },
      select: { id: true },
    })
    if (!a?.id) return { ok: false, error: 'Assessment not found', summary: 'No assessment exists for that rule + FY.' }
    const r = await overrideAssessment(ctx.companyId, a.id, args.applicable, args.note || '')
    if (!r.success) return { ok: false, error: r.error, summary: r.error || 'Override failed.' }
    return {
      ok: true,
      summary: `Marked rule ${args.rule_id} as ${args.applicable ? 'applicable' : 'not applicable'} for ${args.financial_year}.`,
    }
  },
}

function currentIndianFY(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = now.getMonth() + 1
  const fyStart = month >= 4 ? year : year - 1
  const fyEnd = (fyStart + 1).toString().slice(2)
  return `${fyStart}-${fyEnd}`
}

export async function runTool(name: string, args: any, ctx: ToolContext): Promise<ToolResult> {
  const handler = HANDLERS[name]
  if (!handler) {
    return { ok: false, error: `Unknown tool: ${name}`, summary: `Unknown tool: ${name}` }
  }
  try {
    console.log(`[CIA:tool] ${name} invoked`, { args, companyId: ctx.companyId })
    const result = await handler(args || {}, ctx)
    console.log(`[CIA:tool] ${name} ok`, { summary: result.summary, ok: result.ok })
    return result
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[CIA:tool] ${name} threw`, msg, err instanceof Error ? err.stack : '')
    return { ok: false, error: msg, summary: `Tool ${name} failed: ${msg}` }
  }
}
