import Perplexity from '@perplexity-ai/perplexity_ai'

let _client: Perplexity | null = null

function getPerplexityClient(): Perplexity {
  if (_client) return _client

  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) {
    throw new Error('PERPLEXITY_API_KEY not found in environment variables')
  }

  _client = new Perplexity({ apiKey })
  return _client
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface PerplexityComplianceResponse {
  items: PerplexityComplianceItem[]
  citations: PerplexityCitation[]
  model: string
  usage?: { inputTokens: number; outputTokens: number; totalCost: number }
}

export interface PerplexityComplianceItem {
  id: string
  name: string
  act: string
  section: string
  authority: string
  category: string
  frequency: 'monthly' | 'quarterly' | 'half-yearly' | 'annual' | 'one-time' | 'event-based'
  dueDate: string
  dueDateFormula: string
  penaltyOnMiss: string
  applicabilityReason: string
  documentsRequired: string[]
  sourceUrl: string
  confidenceScore: number
}

export interface PerplexityCitation {
  title: string
  url: string
}

export interface PerplexityValidationItem {
  requirementName: string
  verdict: 'applicable' | 'not_applicable' | 'uncertain'
  reason: string
  sourceUrl: string | null
  correctedDueDate: string | null  // If the due date is wrong
  correctedFrequency: string | null  // If the frequency is wrong
}

export interface PerplexityMissingCompliance {
  id: string
  name: string
  act: string
  section: string
  authority: string
  category: string
  frequency: 'monthly' | 'quarterly' | 'half-yearly' | 'annual' | 'one-time' | 'event-based'
  dueDate: string
  dueDateFormula: string
  penaltyOnMiss: string
  applicabilityReason: string
  documentsRequired: string[]
  sourceUrl: string
  confidenceScore: number
}

export interface PerplexityValidationResponse {
  validations: PerplexityValidationItem[]
  missingCompliances: PerplexityMissingCompliance[]
  citations: PerplexityCitation[]
  usage?: { inputTokens: number; outputTokens: number; totalCost: number }
}

export interface PerplexityChangeDetectionItem {
  changeType: 'new_filing' | 'due_date_extension' | 'exemption' | 'amendment' | 'new_regulation'
  affectedComplianceId: string | null
  description: string
  effectiveDate: string
  sourceUrl: string
  actionRequired: string
}

// ── Compliance Intelligence Query ──────────────────────────────────────────

export async function queryComplianceIntelligence(
  prompt: string,
  systemInstructions: string
): Promise<PerplexityComplianceResponse> {
  const client = getPerplexityClient()

  const response = await client.responses.create({
    preset: 'pro-search' as any,
    input: prompt,
    instructions: systemInstructions,
    tools: [{
      type: 'web_search' as any,
      filters: {
        search_domain_filter: [
          'mca.gov.in',
          'cbic-gst.gov.in',
          'incometaxindia.gov.in',
          'epfindia.gov.in',
          'esic.gov.in',
          'sebi.gov.in',
          'indiacode.nic.in',
          'gst.gov.in',
          'taxguru.in',
          'caclubindia.com',
        ],
        search_recency_filter: 'year' as any,
      },
    }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'compliance_items',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  act: { type: 'string' },
                  section: { type: 'string' },
                  authority: { type: 'string' },
                  category: { type: 'string' },
                  frequency: {
                    type: 'string',
                    enum: ['monthly', 'quarterly', 'half-yearly', 'annual', 'one-time', 'event-based'],
                  },
                  dueDate: { type: 'string' },
                  dueDateFormula: { type: 'string' },
                  penaltyOnMiss: { type: 'string' },
                  applicabilityReason: { type: 'string' },
                  documentsRequired: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  sourceUrl: { type: 'string' },
                  confidenceScore: { type: 'number' },
                },
                required: [
                  'id', 'name', 'act', 'section', 'authority', 'category',
                  'frequency', 'dueDate', 'dueDateFormula', 'penaltyOnMiss',
                  'applicabilityReason', 'documentsRequired', 'sourceUrl',
                  'confidenceScore',
                ],
              },
            },
          },
          required: ['items'],
        },
      },
    },
  })

  // Extract citations from search results in the output
  const citations: PerplexityCitation[] = []
  const outputItems: PerplexityComplianceItem[] = []

  if (response.output) {
    for (const block of response.output as any[]) {
      if (block.type === 'search_results' && block.results) {
        for (const result of block.results) {
          citations.push({ title: result.title, url: result.url })
        }
      }
      if (block.type === 'message' && block.content) {
        for (const content of block.content) {
          if (content.type === 'output_text' && content.text) {
            try {
              const parsed = JSON.parse(content.text)
              if (parsed.items && Array.isArray(parsed.items)) {
                outputItems.push(...parsed.items)
              }
            } catch {
              console.warn('[Perplexity] Failed to parse structured output, attempting fallback')
            }
          }
        }
      }
    }
  }

  const usage = (response as any).usage
  return {
    items: outputItems,
    citations,
    model: response.model || 'pro-search',
    usage: usage?.cost
      ? {
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          totalCost: usage.cost.total_cost || 0,
        }
      : undefined,
  }
}

// ── Validation Query ──────────────────────────────────────────────────────

export async function queryComplianceValidation(
  prompt: string,
  systemInstructions: string
): Promise<PerplexityValidationResponse> {
  const client = getPerplexityClient()

  const response = await client.responses.create({
    preset: 'pro-search' as any,
    input: prompt,
    instructions: systemInstructions,
    tools: [{
      type: 'web_search' as any,
      filters: {
        search_domain_filter: [
          'mca.gov.in',
          'cbic-gst.gov.in',
          'incometaxindia.gov.in',
          'epfindia.gov.in',
          'esic.gov.in',
          'sebi.gov.in',
          'indiacode.nic.in',
          'gst.gov.in',
        ],
        search_recency_filter: 'year' as any,
      },
    }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'compliance_validation',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            validations: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  requirementName: { type: 'string' },
                  verdict: { type: 'string', enum: ['applicable', 'not_applicable', 'uncertain'] },
                  reason: { type: 'string' },
                  sourceUrl: { type: ['string', 'null'] },
                  correctedDueDate: { type: ['string', 'null'] },
                  correctedFrequency: { type: ['string', 'null'] },
                },
                required: ['requirementName', 'verdict', 'reason', 'sourceUrl', 'correctedDueDate', 'correctedFrequency'],
              },
            },
            missingCompliances: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  act: { type: 'string' },
                  section: { type: 'string' },
                  authority: { type: 'string' },
                  category: { type: 'string' },
                  frequency: {
                    type: 'string',
                    enum: ['monthly', 'quarterly', 'half-yearly', 'annual', 'one-time', 'event-based'],
                  },
                  dueDate: { type: 'string' },
                  dueDateFormula: { type: 'string' },
                  penaltyOnMiss: { type: 'string' },
                  applicabilityReason: { type: 'string' },
                  documentsRequired: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  sourceUrl: { type: 'string' },
                  confidenceScore: { type: 'number' },
                },
                required: [
                  'id', 'name', 'act', 'section', 'authority', 'category',
                  'frequency', 'dueDate', 'dueDateFormula', 'penaltyOnMiss',
                  'applicabilityReason', 'documentsRequired', 'sourceUrl',
                  'confidenceScore',
                ],
              },
            },
          },
          required: ['validations', 'missingCompliances'],
        },
      },
    },
  })

  const citations: PerplexityCitation[] = []
  const validations: PerplexityValidationItem[] = []
  const missingCompliances: PerplexityMissingCompliance[] = []

  if (response.output) {
    for (const block of response.output as any[]) {
      if (block.type === 'search_results' && block.results) {
        for (const result of block.results) {
          citations.push({ title: result.title, url: result.url })
        }
      }
      if (block.type === 'message' && block.content) {
        for (const content of block.content) {
          if (content.type === 'output_text' && content.text) {
            try {
              const parsed = JSON.parse(content.text)
              if (parsed.validations && Array.isArray(parsed.validations)) {
                validations.push(...parsed.validations)
              }
              if (parsed.missingCompliances && Array.isArray(parsed.missingCompliances)) {
                missingCompliances.push(...parsed.missingCompliances)
              }
            } catch {
              console.warn('[Perplexity] Failed to parse validation output')
            }
          }
        }
      }
    }
  }

  const usage = (response as any).usage
  return {
    validations,
    missingCompliances,
    citations,
    usage: usage?.cost
      ? {
          inputTokens: usage.input_tokens || 0,
          outputTokens: usage.output_tokens || 0,
          totalCost: usage.cost.total_cost || 0,
        }
      : undefined,
  }
}

// ── Change Detection Query ─────────────────────────────────────────────────

export async function queryRegulatoryChanges(
  prompt: string
): Promise<PerplexityChangeDetectionItem[]> {
  const client = getPerplexityClient()

  const response = await client.responses.create({
    preset: 'pro-search' as any,
    input: prompt,
    instructions: 'You are an Indian regulatory compliance monitoring agent. Search for the latest circulars, notifications, and amendments. Return structured JSON.',
    tools: [{
      type: 'web_search' as any,
      filters: {
        search_domain_filter: [
          'mca.gov.in',
          'cbic-gst.gov.in',
          'incometaxindia.gov.in',
          'epfindia.gov.in',
          'esic.gov.in',
          'sebi.gov.in',
        ],
        search_recency_filter: 'week' as any,
      },
    }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'regulatory_changes',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            changes: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  changeType: {
                    type: 'string',
                    enum: ['new_filing', 'due_date_extension', 'exemption', 'amendment', 'new_regulation'],
                  },
                  affectedComplianceId: { type: ['string', 'null'] },
                  description: { type: 'string' },
                  effectiveDate: { type: 'string' },
                  sourceUrl: { type: 'string' },
                  actionRequired: { type: 'string' },
                },
                required: ['changeType', 'affectedComplianceId', 'description', 'effectiveDate', 'sourceUrl', 'actionRequired'],
              },
            },
          },
          required: ['changes'],
        },
      },
    },
  })

  // Parse output
  if (response.output) {
    for (const block of response.output as any[]) {
      if (block.type === 'message' && block.content) {
        for (const content of block.content) {
          if (content.type === 'output_text' && content.text) {
            try {
              const parsed = JSON.parse(content.text)
              return parsed.changes || []
            } catch {
              console.warn('[Perplexity] Failed to parse change detection output')
            }
          }
        }
      }
    }
  }

  return []
}

// ── Report Enrichment Query ──────────────────────────────────────────────

export interface PerplexityEnrichmentItem {
  requirementKey: string
  legalSection: string
  penaltyProvision: string
  businessImpact: {
    financial: string
    reputation: string
    operations: string
  }
}

export interface PerplexityEnrichmentResponse {
  items: PerplexityEnrichmentItem[]
  citations: PerplexityCitation[]
}

export async function queryReportEnrichment(
  requirements: Array<{ key: string; category: string; requirement: string; penalty: string | null }>
): Promise<PerplexityEnrichmentResponse> {
  const client = getPerplexityClient()

  const reqList = requirements.map((r, i) =>
    `${i + 1}. [${r.key}] ${r.category} — ${r.requirement}${r.penalty ? ` (Penalty: ${r.penalty})` : ''}`
  ).join('\n')

  const prompt = `For each Indian regulatory compliance requirement below, provide:
1. The exact legal section and act (e.g., "Section 234F of Income Tax Act, 1961")
2. The specific penalty provision with amounts
3. Business impact analysis (financial, reputation, and operational consequences of non-compliance)

Requirements:
${reqList}

Return structured JSON for each requirement using the requirementKey exactly as given in brackets.`

  const systemInstructions = `You are an Indian regulatory compliance expert. For each requirement, research the exact legal provisions, penalty clauses, and business consequences. Be specific with section numbers, penalty amounts, and real-world business impacts. Use current Indian law as of 2026.`

  const response = await client.responses.create({
    preset: 'pro-search' as any,
    input: prompt,
    instructions: systemInstructions,
    tools: [{
      type: 'web_search' as any,
      filters: {
        search_domain_filter: [
          'mca.gov.in',
          'cbic-gst.gov.in',
          'incometaxindia.gov.in',
          'indiacode.nic.in',
          'gst.gov.in',
          'taxguru.in',
          'caclubindia.com',
        ],
        search_recency_filter: 'year' as any,
      },
    }],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'enrichment_items',
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  requirementKey: { type: 'string' },
                  legalSection: { type: 'string' },
                  penaltyProvision: { type: 'string' },
                  businessImpact: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      financial: { type: 'string' },
                      reputation: { type: 'string' },
                      operations: { type: 'string' },
                    },
                    required: ['financial', 'reputation', 'operations'],
                  },
                },
                required: ['requirementKey', 'legalSection', 'penaltyProvision', 'businessImpact'],
              },
            },
          },
          required: ['items'],
        },
      },
    },
  })

  const citations: PerplexityCitation[] = []
  const outputItems: PerplexityEnrichmentItem[] = []

  if (response.output) {
    for (const block of response.output as any[]) {
      if (block.type === 'search_results' && block.results) {
        for (const result of block.results) {
          citations.push({ title: result.title, url: result.url })
        }
      }
      if (block.type === 'message' && block.content) {
        for (const content of block.content) {
          if (content.type === 'output_text' && content.text) {
            try {
              const parsed = JSON.parse(content.text)
              if (parsed.items && Array.isArray(parsed.items)) {
                outputItems.push(...parsed.items)
              }
            } catch {
              console.warn('[Perplexity] Failed to parse enrichment output')
            }
          }
        }
      }
    }
  }

  return { items: outputItems, citations }
}

// ── Simple Search (for Knowledge Bot) ──────────────────────────────────────

export async function searchCompliance(
  queries: string[],
  domainFilter?: string[]
) {
  const client = getPerplexityClient()

  const search = await client.search.create({
    query: queries.length === 1 ? queries[0] : queries,
    max_results: 10,
    search_domain_filter: domainFilter || [
      'mca.gov.in',
      'cbic-gst.gov.in',
      'incometaxindia.gov.in',
      'indiacode.nic.in',
      'taxguru.in',
    ],
  })

  return search.results || []
}
