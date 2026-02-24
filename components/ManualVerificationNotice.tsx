'use client'

import { CountryFactory, CountryRegistry } from '@/lib/countries'

interface ManualVerificationNoticeProps {
  countryCode: string
  fieldType: 'registration' | 'director' | 'tax'
  value: string
  onVerified?: (verified: boolean) => void
}

/**
 * Get verification portal link for a country and field type
 */
function getVerificationPortalLink(countryCode: string, fieldType: string): string {
  const portals: Record<string, Record<string, string>> = {
    'AE': {
      registration: 'https://www.ded.ae/',
      director: 'https://www.ded.ae/',
      tax: 'https://www.tax.gov.ae/'
    },
    'SA': {
      registration: 'https://mc.gov.sa/',
      director: 'https://mc.gov.sa/',
      tax: 'https://zatca.gov.sa/'
    },
    'OM': {
      registration: 'https://www.moc.gov.om/',
      director: 'https://www.moc.gov.om/',
      tax: 'https://tms.taxoman.gov.om/'
    },
    'QA': {
      registration: 'https://www.moci.gov.qa/',
      director: 'https://www.moci.gov.qa/',
      tax: 'https://dhareeba.gov.qa/'
    },
    'BH': {
      registration: 'https://www.moic.gov.bh/',
      director: 'https://www.moic.gov.bh/',
      tax: 'https://www.nbr.gov.bh/'
    },
    'US': {
      registration: 'https://www.irs.gov/businesses/small-businesses-self-employed/employer-id-numbers',
      director: 'https://www.irs.gov/',
      tax: 'https://www.irs.gov/'
    }
  }

  return portals[countryCode]?.[fieldType] || ''
}

export function ManualVerificationNotice({ 
  countryCode, 
  fieldType, 
  value,
  onVerified
}: ManualVerificationNoticeProps) {
  // Add error handling for invalid country codes
  let apiClient
  let config
  try {
    apiClient = CountryFactory.getAPIClient(countryCode)
    config = CountryRegistry.get(countryCode)
  } catch (error) {
    console.error(`Error getting country config for ${countryCode}:`, error)
    return null // Don't show notice if country is invalid
  }
  
  // Don't show notice for India (has API support)
  if (apiClient?.hasAPISupport()) {
    return null
  }

  if (!value || value.trim().length === 0) {
    return null
  }

  const portalLink = getVerificationPortalLink(countryCode, fieldType)
  
  const fieldLabels: Record<string, string> = {
    registration: config?.labels.registrationId || 'Registration ID',
    director: config?.labels.directorId || 'Director ID',
    tax: config?.labels.taxId || 'Tax ID'
  }

  const handleCheckboxChange = (checked: boolean) => {
    onVerified?.(checked)
  }

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-2">
      <div className="flex items-start">
        <svg 
          className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
          />
        </svg>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-yellow-800">
            Manual Verification Required
          </h3>
          <p className="mt-2 text-sm text-yellow-700">
            {config?.name || 'This country'} does not provide API verification. Please verify this{' '}
            <span className="font-medium">{fieldLabels[fieldType]}</span> manually via the official portal.
          </p>
          {portalLink && (
            <div className="mt-3">
              <a 
                href={portalLink} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm font-medium text-yellow-800 hover:text-yellow-900 underline inline-flex items-center gap-1"
              >
                Verify on {config?.name || 'Official'} Portal
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            </div>
          )}
          {onVerified && (
            <div className="mt-3">
              <label className="flex items-center text-sm text-yellow-700 cursor-pointer">
                <input 
                  type="checkbox" 
                  className="rounded border-yellow-300 text-yellow-600 focus:ring-yellow-500"
                  onChange={(e) => handleCheckboxChange(e.target.checked)}
                />
                <span className="ml-2">I have verified this information</span>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
