/**
 * India API Client
 * Handles CIN/DIN verification via existing APIs
 */

import { CountryAPIClient, VerificationResult, CompanyDetails } from '../factory'

export class IndiaAPIClient implements CountryAPIClient {
  hasAPISupport(): boolean {
    return true // India has API support
  }

  async verifyRegistrationId(cin: string): Promise<VerificationResult> {
    try {
      // Use existing CIN verification API
      const response = await fetch(`/api/verify-cin?cin=${encodeURIComponent(cin)}`)
      
      if (!response.ok) {
        return {
          verified: false,
          message: 'CIN verification failed',
          formatValid: false
        }
      }

      const data = await response.json()
      
      return {
        verified: data.verified || false,
        message: data.message || 'CIN verified successfully',
        companyDetails: data.companyDetails || undefined,
        formatValid: true
      }
    } catch (error) {
      console.error('CIN verification error:', error)
      return {
        verified: false,
        message: 'Error verifying CIN. Please try again.',
        formatValid: false
      }
    }
  }

  async verifyDirectorId(din: string): Promise<VerificationResult> {
    try {
      // Use existing DIN verification API
      const response = await fetch(`/api/verify-din?din=${encodeURIComponent(din)}`)
      
      if (!response.ok) {
        return {
          verified: false,
          message: 'DIN verification failed',
          formatValid: false
        }
      }

      const data = await response.json()
      
      return {
        verified: data.verified || false,
        message: data.message || 'DIN verified successfully',
        formatValid: true
      }
    } catch (error) {
      console.error('DIN verification error:', error)
      return {
        verified: false,
        message: 'Error verifying DIN. Please try again.',
        formatValid: false
      }
    }
  }

  async getCompanyDetails(cin: string): Promise<CompanyDetails | null> {
    const result = await this.verifyRegistrationId(cin)
    return result.companyDetails || null
  }
}
