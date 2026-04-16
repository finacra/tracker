'use server'

import { NextRequest, NextResponse } from 'next/server'
import { handleAPIError } from '@/lib/errors/handle-error'

/**
 * Lookup GST registration details for a company using Perplexity AI.
 * GST registration data is public (searchable on gst.gov.in).
 *
 * Input: { companyName, cin?, pan? }
 * Output: { success, gstNumbers, pan?, stateRegistrations }
 */

export async function POST(request: NextRequest) {
  try {
    const { companyName, cin, pan } = await request.json()

    if (!companyName && !cin && !pan) {
      return NextResponse.json(
        { error: 'Company name, CIN, or PAN is required' },
        { status: 400 }
      )
    }

    const apiKey = process.env.PERPLEXITY_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GST lookup service unavailable' },
        { status: 503 }
      )
    }

    // Build search query — PAN is the most reliable identifier
    const searchTerms = []
    if (pan) searchTerms.push(`PAN ${pan}`)
    if (cin) searchTerms.push(`CIN ${cin}`)
    if (companyName) searchTerms.push(`"${companyName}"`)
    const searchQuery = searchTerms.join(' ')

    const systemPrompt = `You are a GST registration lookup assistant. Your job is to find the GST registration number(s) for an Indian company.

GST numbers are public information available on the GST portal (gst.gov.in) and various public databases.

A GSTN is exactly 15 characters: [2-digit state code][10-char PAN][1 entity number][Z][1 checksum].
Example: 27AABCU9603R1ZM

IMPORTANT RULES:
- Only return GST numbers you find with HIGH CONFIDENCE from official or reliable sources
- If you cannot find the GST number, return an empty array — do NOT guess or fabricate
- Search for the company by name, CIN, or PAN as provided
- Include ALL state registrations if the company has multiple GSTNs
- For each GSTN found, include the state name`

    const userPrompt = `Find the GST registration number(s) for this Indian company:
${searchQuery}

Search gst.gov.in, MCA records, and other public databases. Return ALL GSTNs if the company is registered in multiple states.`

    // Use Perplexity API directly (not the SDK wrapper, to keep response format simple)
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'gst_lookup',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                found: { type: 'boolean', description: 'Whether any GST number was found' },
                companyName: { type: 'string', description: 'Official registered company name' },
                pan: { type: 'string', description: 'PAN extracted from GSTN or search, empty if not found' },
                gstNumbers: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      gstn: { type: 'string', description: 'The 15-character GSTN' },
                      state: { type: 'string', description: 'State name' },
                      status: { type: 'string', description: 'Active/Inactive/Cancelled' },
                    },
                    required: ['gstn', 'state', 'status'],
                  },
                },
                taxpayerType: { type: 'string', description: 'Regular/Composition/ISD/TDS/TCS etc.' },
              },
              required: ['found', 'companyName', 'pan', 'gstNumbers', 'taxpayerType'],
            },
          },
        },
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[lookup-gst] Perplexity API error:', response.status, errText)
      return NextResponse.json({ error: 'GST lookup failed. Please try again.' }, { status: 502 })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return NextResponse.json({ success: true, found: false, gstNumbers: [] })
    }

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      console.error('[lookup-gst] Failed to parse Perplexity response:', content)
      return NextResponse.json({ success: true, found: false, gstNumbers: [] })
    }

    // Validate GSTN format before returning
    const validGstns = (parsed.gstNumbers || []).filter((g: any) => {
      const gstn = (g.gstn || '').toUpperCase().trim()
      return gstn.length === 15 && /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(gstn)
    })

    return NextResponse.json({
      success: true,
      found: validGstns.length > 0,
      companyName: parsed.companyName || '',
      pan: parsed.pan || '',
      gstNumbers: validGstns,
      taxpayerType: parsed.taxpayerType || '',
      citations: data.citations || [],
    })
  } catch (error) {
    return handleAPIError(error)
  }
}
