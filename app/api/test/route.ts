import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({ 
    message: 'API routing works!',
    timestamp: new Date().toISOString()
  })
}
