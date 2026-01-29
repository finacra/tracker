import { NextRequest, NextResponse } from 'next/server'

// API Configuration
const API_BASE_URL = 'https://kycapi.microvistatech.com/api/v1'
const TOKEN_URL = 'https://kycapi.microvistatech.com/api/auth/generateauthtoken'
const TOKEN_ID = process.env.KYC_API_TOKEN_ID || ''
const TOKEN_SECRET = process.env.KYC_API_TOKEN_SECRET || ''

if (!TOKEN_ID || !TOKEN_SECRET) {
  console.warn('KYC API credentials not found in environment variables')
}

// Cache token to avoid multiple requests
let cachedToken: string | null = null
let tokenExpiry: number = 0

async function generateAuthToken(): Promise<string> {
  // Return cached token if still valid (cache for 50 minutes)
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken
  }

  const url = `${TOKEN_URL}?TokenID=${encodeURIComponent(TOKEN_ID)}&TokenSecret=${encodeURIComponent(TOKEN_SECRET)}`
  
  console.log('Generating auth token...')
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  const data = await response.json()
  console.log('Token response:', JSON.stringify(data, null, 2))

  if (!data.IsSuccess || !data.Data?.Token) {
    throw new Error(data.Message || 'Failed to generate token')
  }

  // Cache token for 50 minutes
  cachedToken = data.Data.Token
  tokenExpiry = Date.now() + 50 * 60 * 1000

  return data.Data.Token
}

export async function POST(request: NextRequest) {
  try {
    const { din } = await request.json()

    if (!din) {
      return NextResponse.json(
        { error: 'DIN number is required' },
        { status: 400 }
      )
    }

    console.log('Verifying DIN:', din)

    // Generate auth token
    const token = await generateAuthToken()
    
    // Call DIN verification API
    const url = `${API_BASE_URL}/DINAPI/GetDINDetails?DIN=${encodeURIComponent(din)}&TokenID=${TOKEN_ID}&TokenSecret=${TOKEN_SECRET}`
    
    console.log('DIN API Request URL:', url)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    const responseText = await response.text()
    console.log('DIN API Response:', responseText.substring(0, 1000))

    let data
    try {
      data = JSON.parse(responseText)
    } catch (e) {
      console.error('Failed to parse DIN response:', responseText)
      return NextResponse.json(
        { error: 'Invalid response from DIN API', details: responseText },
        { status: 500 }
      )
    }

    // Check for API-level errors
    const isSuccess = data.isSuccess ?? data.IsSuccess
    if (!isSuccess) {
      const errorMessage = data.message || data.Message || 'DIN verification failed'
      const statusCode = data.statusCode || data.StatusCode
      
      console.log('DIN API Error:', { errorMessage, statusCode, data })
      
      // Map status codes to user-friendly messages
      let userMessage = errorMessage
      if (statusCode === 102 || statusCode === '102') {
        userMessage = 'Invalid DIN number. Please check and try again.'
      } else if (statusCode === 103 || statusCode === '103') {
        userMessage = 'No record found for this DIN number.'
      } else if (statusCode === 110 || statusCode === '110') {
        userMessage = 'Service temporarily unavailable. Please try again later.'
      }
      
      return NextResponse.json(
        { error: userMessage, statusCode, details: data },
        { status: 200 }
      )
    }

    // Normalize the response structure for the client
    // API returns: { isSuccess, data: { data: { directorData: [...] } } }
    // or: { IsSuccess, Data: { directorData: [...] } }
    let directorData = data.data?.data?.directorData || 
                       data.data?.directorData || 
                       data.Data?.data?.directorData ||
                       data.Data?.directorData ||
                       []

    const normalizedResponse = {
      isSuccess: true,
      message: data.Message || data.message || 'Success',
      data: {
        directorData: Array.isArray(directorData) ? directorData : [directorData]
      }
    }

    console.log('DIN Normalized Response:', JSON.stringify(normalizedResponse, null, 2).substring(0, 500))

    // Return successful response
    return NextResponse.json(normalizedResponse)

  } catch (error: any) {
    console.error('DIN verification error:', error)
    
    // Handle network errors
    let errorMessage = error.message || 'Failed to verify DIN'
    if (error.cause?.code === 'UND_ERR_CONNECT_TIMEOUT' || error.message?.includes('timeout')) {
      errorMessage = 'Connection to verification service timed out. Please try again.'
    } else if (error.cause?.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) {
      errorMessage = 'Unable to reach verification service. Please try again later.'
    } else if (error.message?.includes('fetch failed')) {
      errorMessage = 'Network error. Please check your internet connection and try again.'
    }
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    )
  }
}
