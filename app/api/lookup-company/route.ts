import { NextRequest, NextResponse } from 'next/server'
import { handleAPIError } from '@/lib/errors/handle-error'

/**
 * Lookup company details by CIN using Perplexity AI as fallback
 * when the KYC API fails. MCA company data is public.
 *
 * Returns data in the same shape as the CIN verification API
 * so it plugs directly into applyParsedCINData().
 */

// Perplexity sonar-pro with web search can stretch past the Hobby 10s default.
export const maxDuration = 60
export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const { cin, companyName } = await request.json()

    if (!cin && !companyName) {
      return NextResponse.json({ error: 'CIN or company name is required' }, { status: 400 })
    }

    const apiKey = process.env.PERPLEXITY_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Lookup service unavailable' }, { status: 503 })
    }

    const searchQuery = cin ? `CIN ${cin}` : `"${companyName}" India MCA`

    const systemPrompt = `You are an Indian company data lookup assistant. You search the MCA (Ministry of Corporate Affairs) portal and public databases to find company details.

All company registration data is publicly available on mca.gov.in. Search thoroughly.

Return ONLY factual data found from official/reliable sources. If a field is not found, return an empty string — do NOT guess or fabricate.

For directors, include ALL current directors with their DIN, full name, and designation. This is public MCA data.`

    const userPrompt = `Find complete company details for: ${searchQuery}

I need:
1. Company name (official registered name)
2. CIN number
3. Company type (Private Limited, Public Limited, LLP, OPC, Section 8, etc.)
4. Date of incorporation (DD/MM/YYYY format)
5. Registered address
6. Email address
7. Whether listed or not
8. Company category and subcategory
9. Class of company (Private/Public)
10. Authorised capital, Paid-up capital, Subscribed capital
11. ROC name (e.g., "RoC-Mumbai", "RoC-Delhi")
12. Company status (Active/Strike Off/etc.)
13. Date of last AGM (DD/MM/YYYY)
14. Balance sheet date (DD/MM/YYYY)
15. ALL current directors with: first name, middle name, last name, DIN, designation
16. Former/ex-directors names (if available)
17. Principal business activity / industrial class

Search mca.gov.in, tofler.in, zaubacorp.com, and other public company databases.`

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
            name: 'company_lookup',
            strict: true,
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                found: { type: 'boolean' },
                companyData: {
                  type: 'object',
                  additionalProperties: false,
                  properties: {
                    company: { type: 'string' },
                    cin: { type: 'string' },
                    companyType: { type: 'string' },
                    dateOfIncorporation: { type: 'string' },
                    registeredaddress: { type: 'string' },
                    emailAddress: { type: 'string' },
                    whetherListedOrNot: { type: 'string' },
                    companyCategory: { type: 'string' },
                    companySubcategory: { type: 'string' },
                    classOfCompany: { type: 'string' },
                    authorisedCapital: { type: 'string' },
                    paidUpCapital: { type: 'string' },
                    subscribedCapital: { type: 'string' },
                    rocName: { type: 'string' },
                    llpStatus: { type: 'string' },
                    dateOfLastAGM: { type: 'string' },
                    balanceSheetDate: { type: 'string' },
                    principalBusinessActivity: { type: 'string' },
                  },
                  required: [
                    'company', 'cin', 'companyType', 'dateOfIncorporation',
                    'registeredaddress', 'emailAddress', 'whetherListedOrNot',
                    'companyCategory', 'companySubcategory', 'classOfCompany',
                    'authorisedCapital', 'paidUpCapital', 'subscribedCapital',
                    'rocName', 'llpStatus', 'dateOfLastAGM', 'balanceSheetDate',
                    'principalBusinessActivity',
                  ],
                },
                directorData: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      firstName: { type: 'string' },
                      middleName: { type: 'string' },
                      lastName: { type: 'string' },
                      din: { type: 'string' },
                      designation: { type: 'string' },
                    },
                    required: ['firstName', 'middleName', 'lastName', 'din', 'designation'],
                  },
                },
                exDirectors: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['found', 'companyData', 'directorData', 'exDirectors'],
            },
          },
        },
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('[lookup-company] Perplexity API error:', response.status, errText)
      return NextResponse.json({ error: 'Company lookup failed' }, { status: 502 })
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      return NextResponse.json({
        isSuccess: true,
        message: 'No data found',
        data: { data: { companyData: {}, directorData: [] } },
        source: 'perplexity',
      })
    }

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      console.error('[lookup-company] Failed to parse response:', content)
      return NextResponse.json({
        isSuccess: true,
        message: 'Failed to parse company data',
        data: { data: { companyData: {}, directorData: [] } },
        source: 'perplexity',
      })
    }

    if (!parsed.found) {
      return NextResponse.json({
        isSuccess: true,
        message: 'Company not found in public records',
        data: { data: { companyData: {}, directorData: [] } },
        source: 'perplexity',
      })
    }

    // Return in the SAME format as the CIN verification API
    // so it plugs directly into the existing applyParsedCINData flow
    return NextResponse.json({
      isSuccess: true,
      message: 'Company data found via AI search',
      data: {
        data: {
          companyData: parsed.companyData || {},
          directorData: parsed.directorData || [],
          exDirectors: parsed.exDirectors || [],
        },
      },
      source: 'perplexity',
    })
  } catch (error) {
    return handleAPIError(error)
  }
}
