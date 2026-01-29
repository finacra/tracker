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
    const { cin } = await request.json()

    if (!cin) {
      return NextResponse.json(
        { error: 'CIN number is required' },
        { status: 400 }
      )
    }

    console.log('Verifying CIN:', cin)

    // Generate auth token
    const token = await generateAuthToken()
    
    // Call CIN verification API
    const url = `${API_BASE_URL}/CIN/GetCompanyDetails?CINorLLPorFCRN=${encodeURIComponent(cin)}&TokenID=${TOKEN_ID}&TokenSecret=${TOKEN_SECRET}`
    
    console.log('CIN API Request URL:', url)

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    })

    const responseText = await response.text()
    console.log('CIN API Response:', responseText.substring(0, 1000))

    let data
    try {
      data = JSON.parse(responseText)
    } catch (e) {
      console.error('Failed to parse CIN response:', responseText)
      return NextResponse.json(
        { error: 'Invalid response from CIN API', details: responseText },
        { status: 500 }
      )
    }

    // Check for API-level errors
    const isSuccess = data.isSuccess ?? data.IsSuccess
    if (!isSuccess) {
      const errorMessage = data.message || data.Message || 'CIN verification failed'
      const responseCode = data.ResponseCode || data.responseCode || data.statusCode || data.StatusCode
      
      console.log('CIN API Error:', { errorMessage, responseCode, data })
      
      // Map response codes to user-friendly messages
      let userMessage = errorMessage
      if (responseCode === 102 || responseCode === '102') {
        userMessage = 'Invalid CIN number format. Please check and try again.'
      } else if (responseCode === 103 || responseCode === '103') {
        userMessage = 'No company found with this CIN number. Please verify the CIN is correct.'
      } else if (responseCode === 110 || responseCode === '110') {
        userMessage = 'MCA service is temporarily unavailable. Please try again later.'
      }
      
      return NextResponse.json(
        { error: userMessage, responseCode, details: data },
        { status: 200 }
      )
    }

    // Log the full response structure to debug director data
    console.log('CIN Full Data keys:', Object.keys(data.Data || data.data || {}))
    
    const rawDirectorData = data.Data?.directorData || 
                            data.data?.directorData || 
                            data.Data?.DirectorData || 
                            data.Data?.directors ||
                            data.data?.DirectorData ||
                            []
    
    console.log('CIN Raw Director Data:', JSON.stringify(rawDirectorData))
    if (Array.isArray(rawDirectorData) && rawDirectorData.length > 0) {
      console.log('CIN First Director Keys:', Object.keys(rawDirectorData[0]))
      console.log('CIN First Director:', JSON.stringify(rawDirectorData[0]))
    }

    // Normalize director data - handle different field name casing
    const normalizedDirectors = Array.isArray(rawDirectorData) ? rawDirectorData.map((dir: any) => ({
      firstName: dir.firstName || dir.FirstName || dir.first_name || dir.name?.split(' ')[0] || '',
      lastName: dir.lastName || dir.LastName || dir.last_name || dir.name?.split(' ').slice(-1)[0] || '',
      middleName: dir.middleName || dir.MiddleName || dir.middle_name || '',
      din: dir.din || dir.DIN || dir.dinOrPAN || dir.DINorPAN || dir.DINOrPAN || '', // Added DINOrPAN (exact API casing)
      designation: dir.designation || dir.Designation || '',
      dob: dir.dob || dir.DOB || dir.dateOfBirth || '',
      educationalQualification: dir.educationalQualification || dir.EducationalQualification || '',
      signatoryAssociationStatus: dir.signatoryAssociationStatus || dir.SignatoryAssociationStatus || '',
    })) : []

    console.log('CIN Normalized Directors:', JSON.stringify(normalizedDirectors))

    // Normalize the response structure for the client
    const normalizedResponse = {
      isSuccess: true,
      message: data.Message || data.message || 'Success',
      data: {
        data: {
          companyData: data.Data?.companyData || data.data?.companyData,
          directorData: normalizedDirectors
        }
      }
    }

    console.log('CIN Final Response Directors Count:', normalizedResponse.data.data.directorData.length)

    // Return successful response
    return NextResponse.json(normalizedResponse)

  } catch (error: any) {
    console.error('CIN verification error:', error)
    
    // Handle network errors
    let errorMessage = error.message || 'Failed to verify CIN'
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
