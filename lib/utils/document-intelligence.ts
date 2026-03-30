import 'server-only'

/**
 * Azure Document Intelligence OCR
 * Used as a fallback for scanned/image-based PDFs where pdf-parse extracts no text.
 * Uses the prebuilt-read model which extracts raw text + tables from any PDF or image.
 */
export async function extractTextWithOCR(buffer: Buffer): Promise<string> {
  const endpoint = process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT
  const key = process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY

  if (!endpoint || !key) {
    throw new Error('Azure Document Intelligence credentials not configured (AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT / AZURE_DOCUMENT_INTELLIGENCE_KEY)')
  }

  const base64 = buffer.toString('base64')

  // 1. Submit document for analysis
  const analyzeUrl = `${endpoint.replace(/\/$/, '')}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30`
  const startRes = await fetch(analyzeUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Ocp-Apim-Subscription-Key': key,
    },
    body: JSON.stringify({ base64Source: base64 }),
  })

  if (!startRes.ok) {
    const err = await startRes.text()
    throw new Error(`Document Intelligence submit failed (${startRes.status}): ${err}`)
  }

  const resultUrl = startRes.headers.get('Operation-Location')
  if (!resultUrl) {
    throw new Error('Document Intelligence: no Operation-Location header in response')
  }

  // 2. Poll for completion (max 60 seconds, 2s interval)
  for (let attempt = 0; attempt < 30; attempt++) {
    await new Promise(r => setTimeout(r, 2000))

    const pollRes = await fetch(resultUrl, {
      headers: { 'Ocp-Apim-Subscription-Key': key },
    })

    if (!pollRes.ok) {
      throw new Error(`Document Intelligence poll failed (${pollRes.status})`)
    }

    const json = await pollRes.json() as any

    if (json.status === 'succeeded') {
      // analyzeResult.content contains the full extracted text with newlines
      const content: string = json.analyzeResult?.content || ''
      if (!content.trim()) {
        throw new Error('Document Intelligence returned empty content (document may have no readable text)')
      }
      return content
    }

    if (json.status === 'failed') {
      throw new Error(`Document Intelligence OCR failed: ${JSON.stringify(json.error)}`)
    }

    // status === 'running' or 'notStarted' — keep polling
  }

  throw new Error('Document Intelligence OCR timed out after 60 seconds')
}
