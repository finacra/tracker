import { AzureOpenAI } from 'openai'

// Get Azure OpenAI client - read environment variables when needed
function getAzureOpenAIClient(): AzureOpenAI | null {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT
  const apiKey = process.env.AZURE_OPENAI_API_KEY
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5.2-chat'
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2025-04-01-preview'

  if (!endpoint || !apiKey) {
    console.warn('Azure OpenAI credentials not found in environment variables')
    return null
  }

  try {
    return new AzureOpenAI({
      endpoint,
      apiKey,
      deployment,
      apiVersion
    })
  } catch (error) {
    console.error('Failed to initialize Azure OpenAI client:', error)
    return null
  }
}

export interface BusinessImpact {
  financial: string
  reputation: string
  operations: string
}

export type BatchImpactItem = {
  key: string
  category: string
  requirement: string
  legalSection: string
  penaltyProvision: string
}

/**
 * Generate business impact analysis for many compliance items in ONE call.
 * Returns a map by item key.
 *
 * Note: We request strict JSON, then parse defensively.
 */
export async function generateBatchBusinessImpact(
  items: BatchImpactItem[]
): Promise<Record<string, BusinessImpact> | null> {
  const client = getAzureOpenAIClient()
  if (!client) {
    console.error('Azure OpenAI client not initialized. Check environment variables.')
    return null
  }

  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5.2-chat'

  const systemMessage =
    'You are a senior consultant combining McKinsey and EY styles. You produce concise, structured, professional regulatory risk analysis for Indian compliances. No alarmist language. Be specific, practical, and business-focused.'

  // Keep prompt bounded: pass only the essential fields.
  // Keys are stable and must be echoed back.
  const userPrompt =
    `Create business impact analysis for the following non-compliance items in India.\n\n` +
    `Return STRICT JSON ONLY (no markdown, no commentary) as an object where each key maps to:\n` +
    `{ "financial": string, "reputation": string, "operations": string }\n\n` +
    `Rules:\n` +
    `- Each field 1-2 sentences, crisp, consultant tone.\n` +
    `- If penalty is interest/percentage-based requiring turnover/tax due/principal, say "Needs amount / Refer to Act" and give operational guidance.\n` +
    `- Do not invent section numbers; if legalSection is missing/uncertain, say "Refer to Act/Rules".\n\n` +
    `Items:\n` +
    items
      .slice(0, 80) // safety cap to avoid huge prompts; report should group repeated items anyway
      .map((it) => {
        return JSON.stringify({
          key: it.key,
          category: it.category,
          requirement: it.requirement,
          legalSection: it.legalSection,
          penaltyProvision: it.penaltyProvision,
        })
      })
      .join('\n')

  try {
    const response = await client.chat.completions.create({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userPrompt }
      ],
      // Keep bounded; we want speed.
      max_completion_tokens: 3000,
      model: deployment
    })

    const content = response.choices[0]?.message?.content
    if (!content) return null

    // Defensive JSON parse: extract first {...} block if model adds noise.
    const trimmed = content.trim()
    const firstBrace = trimmed.indexOf('{')
    const lastBrace = trimmed.lastIndexOf('}')
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) return null

    const jsonText = trimmed.slice(firstBrace, lastBrace + 1)
    const parsed = JSON.parse(jsonText) as Record<string, BusinessImpact>

    // Minimal validation
    const out: Record<string, BusinessImpact> = {}
    for (const [k, v] of Object.entries(parsed || {})) {
      if (!v) continue
      out[k] = {
        financial: (v as any).financial || 'Financial impact analysis unavailable.',
        reputation: (v as any).reputation || 'Reputation impact analysis unavailable.',
        operations: (v as any).operations || 'Operational impact analysis unavailable.',
      }
    }

    return out
  } catch (error: any) {
    console.error('Azure OpenAI API error (batch):', error)
    return null
  }
}

/**
 * Generate business impact analysis for compliance non-compliance
 * @param requirement - Compliance requirement description
 * @param penalty - Penalty information
 * @param legalSection - Legal section reference
 * @returns Structured business impact analysis
 */
export async function generateBusinessImpact(
  requirement: string,
  penalty: string,
  legalSection: string
): Promise<BusinessImpact | null> {
  const client = getAzureOpenAIClient()
  
  if (!client) {
    console.error('Azure OpenAI client not initialized. Check environment variables.')
    return null
  }

  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5.2-chat'
  const systemMessage = 'You are a compliance expert analyzing business impact of regulatory non-compliance in India. Provide concise, specific, and actionable insights.'

  const userPrompt = `Analyze the business impact of "${requirement}" non-compliance with penalty: "${penalty}" under ${legalSection}.

Focus on three areas:
1) Financial consequences: Direct penalties, interest, additional costs, tax implications
2) Reputation risks: Credit rating impact, business relationships, market perception, investor confidence
3) Operational disruptions: Delays, restrictions, compliance burden, business continuity

Format your response as three short paragraphs (one for each area), each 2-3 sentences. Be specific to Indian regulatory context.`

  try {
    const response = await client.chat.completions.create({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: 16384,
      model: deployment
      // Note: gpt-5.2-chat only supports default temperature (1), so we don't set it
    })

    // Check for errors - Azure OpenAI throws exceptions, so if we get here, it's successful

    const content = response.choices[0]?.message?.content
    if (!content) {
      return null
    }

    // Parse the response into structured format
    // The AI should return three paragraphs, we'll try to extract them
    const paragraphs = content.split('\n\n').filter(p => p.trim().length > 0)
    
    // Try to identify which paragraph is which based on keywords
    let financial = ''
    let reputation = ''
    let operations = ''

    paragraphs.forEach(para => {
      const lowerPara = para.toLowerCase()
      if (lowerPara.includes('financial') || lowerPara.includes('penalty') || lowerPara.includes('cost') || lowerPara.includes('rupee') || lowerPara.includes('₹')) {
        financial = para.trim()
      } else if (lowerPara.includes('reputation') || lowerPara.includes('credit') || lowerPara.includes('rating') || lowerPara.includes('relationship') || lowerPara.includes('investor')) {
        reputation = para.trim()
      } else if (lowerPara.includes('operational') || lowerPara.includes('delay') || lowerPara.includes('restriction') || lowerPara.includes('compliance') || lowerPara.includes('business')) {
        operations = para.trim()
      }
    })

    // If we couldn't categorize, assign in order
    if (!financial && paragraphs.length > 0) financial = paragraphs[0].trim()
    if (!reputation && paragraphs.length > 1) reputation = paragraphs[1].trim()
    if (!operations && paragraphs.length > 2) operations = paragraphs[2].trim()

    // Fallback if parsing failed
    if (!financial && !reputation && !operations) {
      const splitContent = content.split(/[\.\n]/).filter(s => s.trim().length > 20)
      financial = splitContent[0]?.trim() || 'Financial impact analysis unavailable.'
      reputation = splitContent[1]?.trim() || 'Reputation impact analysis unavailable.'
      operations = splitContent[2]?.trim() || 'Operational impact analysis unavailable.'
    }

    return {
      financial: financial || 'Financial impact analysis unavailable.',
      reputation: reputation || 'Reputation impact analysis unavailable.',
      operations: operations || 'Operational impact analysis unavailable.'
    }
  } catch (error: any) {
    console.error('Azure OpenAI API error:', error)
    return null
  }
}
