import { NextRequest, NextResponse } from 'next/server'

// Azure Speech Services TTS — FREE 500k chars/month neural voices (F0 tier)
// Env vars needed in .env.local:
//   AZURE_SPEECH_KEY=your_key
//   AZURE_SPEECH_REGION=eastus          (just the region name)
//   AZURE_SPEECH_VOICE=en-IN-NeerjaNeural   (optional, this is the default)

const DEFAULT_VOICE = 'en-IN-NeerjaNeural'

export async function POST(req: NextRequest) {
  const apiKey = process.env.AZURE_SPEECH_KEY
  const region = process.env.AZURE_SPEECH_REGION

  if (!apiKey || !region) {
    console.error('[CIA TTS] Missing env vars — AZURE_SPEECH_KEY:', !!apiKey, 'AZURE_SPEECH_REGION:', !!region)
    return new NextResponse('AZURE_SPEECH_KEY / AZURE_SPEECH_REGION not set', { status: 503 })
  }

  const { text } = await req.json() as { text: string }
  if (!text?.trim()) return new NextResponse('No text', { status: 400 })

  const voice = process.env.AZURE_SPEECH_VOICE || DEFAULT_VOICE
  const lang = voice.split('-').slice(0, 2).join('-')

  const safe = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')

  const ssml = `<speak version='1.0' xml:lang='${lang}'><voice name='${voice}'><prosody rate="+5%">${safe}</prosody></voice></speak>`

  const ttsUrl = `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`
  console.log('[CIA TTS] POST', ttsUrl, 'voice:', voice, 'chars:', text.length)

  const upstream = await fetch(ttsUrl, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': apiKey,
      'Content-Type': 'application/ssml+xml',
      // 16khz/32kbps — lower quality but streams faster (less latency to first audio)
      'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
    },
    body: ssml,
  })

  if (!upstream.ok) {
    const err = await upstream.text()
    console.error('[CIA TTS] Azure error', upstream.status, err)
    return new NextResponse(`Azure TTS error ${upstream.status}: ${err}`, { status: 502 })
  }

  console.log('[CIA TTS] OK', upstream.status, 'content-type:', upstream.headers.get('content-type'))

  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Cache-Control': 'no-store',
    },
  })
}
