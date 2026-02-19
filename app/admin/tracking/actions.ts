'use server'

import { createClient } from '@/utils/supabase/server'
import { AzureOpenAI } from 'openai'

export interface KPIMetric {
  id?: string
  kpi_name: string
  category: string
  user_id?: string
  company_id?: string
  metric_value: number
  metric_data?: Record<string, any>
  recorded_at: string
}

export interface KPIAggregation {
  kpi_name: string
  category: string
  total_count: number
  average_value: number
  min_value: number
  max_value: number
  last_recorded: string
  user_count?: number
  company_count?: number
}

// Get Azure OpenAI client
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

// Record a KPI metric
export async function recordKPIMetric(
  kpiName: string,
  category: string,
  metricValue: number,
  userId?: string,
  companyId?: string,
  metricData?: Record<string, any>
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()
    
    const { error } = await supabase
      .from('kpi_metrics')
      .insert({
        kpi_name: kpiName,
        category: category,
        user_id: userId || null,
        company_id: companyId || null,
        metric_value: metricValue,
        metric_data: metricData || {},
        recorded_at: new Date().toISOString(),
      })

    if (error) {
      console.error('Error recording KPI metric:', error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error recording KPI metric:', error)
    return { success: false, error: error.message }
  }
}

// Get KPI aggregations
export async function getKPIAggregations(
  category?: string,
  kpiName?: string,
  startDate?: string,
  endDate?: string,
  companyId?: string
): Promise<{ success: boolean; data?: KPIAggregation[]; error?: string }> {
  try {
    const supabase = await createClient()
    
    let query = supabase
      .from('kpi_metrics')
      .select('*')

    if (category) {
      query = query.eq('category', category)
    }
    if (kpiName) {
      query = query.eq('kpi_name', kpiName)
    }
    if (startDate) {
      query = query.gte('recorded_at', startDate)
    }
    if (endDate) {
      query = query.lte('recorded_at', endDate)
    }
    if (companyId) {
      query = query.eq('company_id', companyId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching KPI aggregations:', error)
      return { success: false, error: error.message }
    }

    if (!data || data.length === 0) {
      return { success: true, data: [] }
    }

    // Aggregate by KPI name
    const aggregations = data.reduce((acc, metric) => {
      const key = `${metric.category}::${metric.kpi_name}`
      if (!acc[key]) {
        acc[key] = {
          kpi_name: metric.kpi_name,
          category: metric.category,
          values: [],
          recorded_dates: [],
          user_ids: new Set<string>(),
          company_ids: new Set<string>(),
        }
      }
      acc[key].values.push(metric.metric_value)
      acc[key].recorded_dates.push(metric.recorded_at)
      if (metric.user_id) acc[key].user_ids.add(metric.user_id)
      if (metric.company_id) acc[key].company_ids.add(metric.company_id)
      return acc
    }, {} as Record<string, any>)

    const result: KPIAggregation[] = Object.values(aggregations).map((agg: any) => ({
      kpi_name: agg.kpi_name,
      category: agg.category,
      total_count: agg.values.length,
      average_value: agg.values.reduce((a: number, b: number) => a + b, 0) / agg.values.length,
      min_value: Math.min(...agg.values),
      max_value: Math.max(...agg.values),
      last_recorded: agg.recorded_dates.sort().reverse()[0],
      user_count: agg.user_ids.size,
      company_count: agg.company_ids.size,
    }))

    return { success: true, data: result }
  } catch (error: any) {
    console.error('Error fetching KPI aggregations:', error)
    return { success: false, error: error.message }
  }
}

// Get KPI metrics for a specific time period
export async function getKPIMetrics(
  kpiName: string,
  startDate?: string,
  endDate?: string,
  companyId?: string,
  userId?: string
): Promise<{ success: boolean; data?: KPIMetric[]; error?: string }> {
  try {
    const supabase = await createClient()
    
    let query = supabase
      .from('kpi_metrics')
      .select('*')
      .eq('kpi_name', kpiName)
      .order('recorded_at', { ascending: false })

    if (startDate) {
      query = query.gte('recorded_at', startDate)
    }
    if (endDate) {
      query = query.lte('recorded_at', endDate)
    }
    if (companyId) {
      query = query.eq('company_id', companyId)
    }
    if (userId) {
      query = query.eq('user_id', userId)
    }

    const { data, error } = await query

    if (error) {
      console.error('Error fetching KPI metrics:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: data || [] }
  } catch (error: any) {
    console.error('Error fetching KPI metrics:', error)
    return { success: false, error: error.message }
  }
}

// Get all companies for filtering
export async function getAllCompanies(): Promise<{ success: boolean; data?: Array<{ id: string; name: string }>; error?: string }> {
  try {
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from('companies')
      .select('id, name')
      .order('name')

    if (error) {
      console.error('Error fetching companies:', error)
      return { success: false, error: error.message }
    }

    return { success: true, data: data || [] }
  } catch (error: any) {
    console.error('Error fetching companies:', error)
    return { success: false, error: error.message }
  }
}

// Explain KPI tracking data with AI
export async function explainKPIData(
  aggregations: KPIAggregation[],
  metrics: KPIMetric[],
  dateRange: string,
  selectedCategory?: string,
  selectedKPI?: string,
  selectedCompany?: string
): Promise<{ success: boolean; explanation?: string; error?: string }> {
  try {
    const client = getAzureOpenAIClient()
    if (!client) {
      return { success: false, error: 'AI service not available. Please check environment configuration.' }
    }

    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5.2-chat'

    // Build comprehensive data summary
    const dataSummary = {
      dateRange,
      filters: {
        category: selectedCategory || 'All',
        kpi: selectedKPI || 'All',
        company: selectedCompany || 'All Companies'
      },
      aggregations: aggregations.map(agg => ({
        category: agg.category,
        kpi: agg.kpi_name,
        totalRecords: agg.total_count,
        averageValue: agg.average_value.toFixed(2),
        minValue: agg.min_value,
        maxValue: agg.max_value,
        uniqueUsers: agg.user_count || 0,
        uniqueCompanies: agg.company_count || 0,
        lastRecorded: new Date(agg.last_recorded).toLocaleDateString()
      })),
      sampleMetrics: metrics.slice(0, 10).map(m => ({
        timestamp: new Date(m.recorded_at).toLocaleString(),
        value: m.metric_value,
        hasCompany: !!m.company_id,
        hasUser: !!m.user_id,
        metadata: m.metric_data || {}
      }))
    }

    const systemMessage = `You are a data analyst explaining KPI tracking data. Keep explanations simple, short, and admin-friendly. Use LaTeX for math formulas when needed (e.g., $\\frac{total}{count}$ for averages).`

    const userPrompt = `Explain this KPI data briefly and simply:

**Period:** ${dataSummary.dateRange}
**Filters:** ${dataSummary.filters.category} / ${dataSummary.filters.kpi} / ${dataSummary.filters.company}

**Summary:**
${dataSummary.aggregations.map(agg => 
  `- ${agg.kpi} (${agg.category}): ${agg.totalRecords} records, avg ${agg.averageValue}, ${agg.uniqueUsers} users, ${agg.uniqueCompanies} companies`
).join('\n')}

Provide a SHORT explanation (3-4 paragraphs max) covering:
1. What the data shows
2. Key findings
3. What it means

Use LaTeX for any formulas. Keep it simple and actionable.`

    const response = await client.chat.completions.create({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: 4000,
      model: deployment
      // Note: gpt-5.2-chat only supports default temperature (1), so we don't set it
    })

    const explanation = response.choices[0]?.message?.content
    if (!explanation) {
      return { success: false, error: 'AI did not generate an explanation' }
    }

    return { success: true, explanation }
  } catch (error: any) {
    console.error('Error generating AI explanation:', error)
    return { success: false, error: error.message || 'Failed to generate AI explanation' }
  }
}

// Chat with KPI data - custom questions
export async function chatWithKPIData(
  question: string,
  aggregations: KPIAggregation[],
  metrics: KPIMetric[],
  dateRange: string,
  selectedCategory?: string,
  selectedKPI?: string,
  selectedCompany?: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<{ success: boolean; answer?: string; error?: string }> {
  try {
    const client = getAzureOpenAIClient()
    if (!client) {
      return { success: false, error: 'AI service not available. Please check environment configuration.' }
    }

    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5.2-chat'

    // Build data context
    const dataContext = {
      dateRange,
      filters: {
        category: selectedCategory || 'All',
        kpi: selectedKPI || 'All',
        company: selectedCompany || 'All Companies'
      },
      aggregations: aggregations.map(agg => ({
        category: agg.category,
        kpi: agg.kpi_name,
        totalRecords: agg.total_count,
        averageValue: agg.average_value.toFixed(2),
        minValue: agg.min_value,
        maxValue: agg.max_value,
        uniqueUsers: agg.user_count || 0,
        uniqueCompanies: agg.company_count || 0,
        lastRecorded: new Date(agg.last_recorded).toLocaleDateString()
      })),
      sampleMetrics: metrics.slice(0, 20).map(m => ({
        timestamp: new Date(m.recorded_at).toLocaleString(),
        value: m.metric_value,
        hasCompany: !!m.company_id,
        hasUser: !!m.user_id,
        metadata: m.metric_data || {}
      }))
    }

    const systemMessage = `You are a helpful data analyst assistant. Answer questions about KPI tracking data clearly and concisely. Use LaTeX for math (e.g., $\\frac{a}{b}$ for fractions, $\\sum$ for sums). Keep answers short and actionable.`

    // Build conversation messages
    const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      {
        role: 'system',
        content: systemMessage
      }
    ]

    // Add conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
      conversationHistory.forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content
        })
      })
    }

    // Add current data context and question
    messages.push({
      role: 'user',
      content: `KPI Data Context:
Period: ${dataContext.dateRange}
Filters: ${dataContext.filters.category} / ${dataContext.filters.kpi} / ${dataContext.filters.company}

Aggregated Metrics:
${dataContext.aggregations.map(agg => 
  `- ${agg.kpi} (${agg.category}): ${agg.totalRecords} records, avg ${agg.averageValue}, ${agg.uniqueUsers} users, ${agg.uniqueCompanies} companies`
).join('\n')}

User Question: ${question}

Answer the question based on this data. Use LaTeX for any formulas. Keep it concise.`
    })

    const response = await client.chat.completions.create({
      messages,
      max_completion_tokens: 2000,
      model: deployment
    })

    const answer = response.choices[0]?.message?.content
    if (!answer) {
      return { success: false, error: 'AI did not generate an answer' }
    }

    return { success: true, answer }
  } catch (error: any) {
    console.error('Error in chat with KPI data:', error)
    return { success: false, error: error.message || 'Failed to generate answer' }
  }
}
