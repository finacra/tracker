// ── GST Lookup (via Perplexity AI) ────────────────────────────────────────

export interface GSTLookupResult {
  success: boolean
  found: boolean
  companyName?: string
  pan?: string
  gstNumbers?: Array<{ gstn: string; state: string; status: string }>
  taxpayerType?: string
  error?: string
}

/**
 * Lookup GST registration for a company using Perplexity AI.
 * GST data is publicly available on gst.gov.in.
 */
export async function lookupGST(params: {
  companyName?: string
  cin?: string
  pan?: string
}): Promise<GSTLookupResult> {
  try {
    const response = await fetch('/api/lookup-gst', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    const data = await response.json()

    if (data.error) {
      return { success: false, found: false, error: data.error }
    }

    return {
      success: true,
      found: data.found || false,
      companyName: data.companyName || '',
      pan: data.pan || '',
      gstNumbers: data.gstNumbers || [],
      taxpayerType: data.taxpayerType || '',
    }
  } catch (error) {
    console.error('Error looking up GST:', error)
    return { success: false, found: false, error: 'Failed to lookup GST. Please try again.' }
  }
}

/**
 * Fallback company lookup via Perplexity AI when KYC API fails.
 * Returns data in the same shape as CIN verification API.
 */
export async function lookupCompanyByPerplexity(params: {
  cin?: string
  companyName?: string
}): Promise<{ success: true; data: CINVerificationResponse } | { success: false; error: string }> {
  try {
    const response = await fetch('/api/lookup-company', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    })

    const data = await response.json()

    if (data.error) {
      return { success: false, error: data.error }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error looking up company via Perplexity:', error)
    return { success: false, error: 'AI company lookup failed. Please enter details manually.' }
  }
}

// Types for CIN/DIN API responses

export interface CINCompanyData {
  cin: string
  company: string
  companyType: string
  companyOrigin: string
  registrationNumber: string
  dateOfIncorporation: string
  emailAddress: string
  whetherListedOrNot: string
  companyCategory: string
  companySubcategory: string
  classOfCompany: string
  authorisedCapital: string
  paidUpCapital: string
  numberOfMembers: string
  dateOfLastAGM: string
  strikeOff_amalgamated_transferredDate: string
  llpStatus: string
  statusUnderCIRP: string
  numberOfDesignatedPartners: string
  totalObligationOfContribution: string
  rocName: string
  shareCapitalFlag: string
  maximumNumberOfMembers: string
  subscribedCapital: string
  rdName: string
  rdRegion: string
  balanceSheetDate: string
  inc22Aflag: string
  registeredaddress: string
  mcamdscompanyaddress: string
}

export interface CINDirectorData {
  firstName: string
  lastName: string
  middleName: string
  designation: string
  dob: string
  dinOrPAN: string
  educationalQualification: string
  din: string
  signatoryAssociationStatus: string
  signatory: string
}

export interface CINVerificationResponse {
  isSuccess: boolean
  message: string
  data: {
    status: string
    message: string
    type: string
    data: {
      companyData: CINCompanyData
      directorData: CINDirectorData[]
    }
    apiVersion: string
  }
  apiVersion: string
  statusCode: number
  errors: any[]
  additionalData: any
  // Error fields from our API route
  error?: string
  details?: any
}

export interface DINDirectorData {
  DIR3KYCFiledFY: string
  DIR3KYCFiledFlag: string
  aadhaarNumber: string
  accountId: string
  areaOfOccupation: string
  authorizedRepType: string
  birthPlace: string
  citizenOfIndia: string
  companyData: any[]
  companySignatory: any[]
  createdOn: string
  din: string
  dinAllocationDate: string
  dinSurrenderDate: string
  directorDeathDate: string
  directorDisqualified: string
  directorFlag: string
  disqualificationDate: string
  disqualificationReason: string
  disqualificationRemovalDate: string
  disqualificationSection: string
  dob: string
  drivingLicenseNumber: string
  durationofStay: string
  educationalQualification: string
  emailAddress: string
  fathersFirstName: string
  fathersLastName: string
  fathersMiddleName: string
  firstName: string
  gender: string
  kmpFlag: string
  lastName: string
  mcaSignatoryCessationMasterHistory: any[]
  membershipNumber: string
  middleName: string
  migrationDate: string
  migrationFlag: string
  mobileNumber: string
  nationality: string
  occupation: string
  occupationType: string
  oidFlag: string
  opcFlag: string
  opcType: string
  otherOccupation: string
  othersEducationalQualification: string
  pan: string
  passportNumber: string
  personType: string
  personalContact: string
  residentOfIndia: string
  sameAddressFlag: string
  status: string
  surrenderDeactivationReason: string
  updatedOn: string
  verificationStatus: string
  votersIdNumber: string
  whetherKYCBatchProcessed: string
}

export interface DINVerificationResponse {
  isSuccess: boolean
  message: string
  data: {
    directorData: DINDirectorData[]
  }
  apiVersion: string
  statusCode: number
  errors: any[]
  additionalData: any
  // Error fields from our API route
  error?: string
  details?: any
}

/**
 * Verify CIN and get company details
 * Uses server-side API route to avoid CORS issues
 * Returns { success: true, data: ... } or { success: false, error: string }
 */
export async function verifyCIN(cin: string): Promise<{ success: true; data: CINVerificationResponse } | { success: false; error: string }> {
  try {
    const response = await fetch('/api/verify-cin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cin }),
    })

    const data = await response.json()

    // Check for error response from our API route
    if (data.error) {
      return { success: false, error: data.error }
    }

    // Check for API-level errors
    const isSuccess = data.isSuccess ?? data.IsSuccess
    if (!isSuccess) {
      const errorMessage = data.message || data.Message || 'CIN verification failed'
      return { success: false, error: errorMessage }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error verifying CIN:', error)
    let errorMessage = 'Failed to verify CIN. Please try again.'
    const errMsg = error instanceof Error ? error.message : ''
    if (errMsg.includes('fetch') || errMsg.includes('network')) {
      errorMessage = 'Network error. Please check your connection and try again.'
    }
    return { success: false, error: errorMessage }
  }
}

/**
 * Verify DIN and get director details
 * Uses server-side API route to avoid CORS issues
 * Returns { success: true, data: ... } or { success: false, error: string }
 */
export async function verifyDIN(din: string): Promise<{ success: true; data: DINVerificationResponse } | { success: false; error: string }> {
  try {
    const response = await fetch('/api/verify-din', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ din }),
    })

    const data = await response.json()

    // Check for error response from our API route
    if (data.error) {
      return { success: false, error: data.error }
    }

    // Check for API-level errors
    const isSuccess = data.isSuccess ?? data.IsSuccess
    if (!isSuccess) {
      const errorMessage = data.message || data.Message || 'DIN verification failed'
      return { success: false, error: errorMessage }
    }

    return { success: true, data }
  } catch (error) {
    console.error('Error verifying DIN:', error)
    let errorMessage = 'Failed to verify DIN. Please try again.'
    const errMsg = error instanceof Error ? error.message : ''
    if (errMsg.includes('fetch') || errMsg.includes('network')) {
      errorMessage = 'Network error. Please check your connection and try again.'
    }
    return { success: false, error: errorMessage }
  }
}
