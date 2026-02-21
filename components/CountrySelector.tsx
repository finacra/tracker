'use client'

import { getCountriesByRegion, getDefaultCountryConfig, type CountryConfig } from '@/lib/config/countries'

interface CountrySelectorProps {
  value: string
  onChange: (countryCode: string) => void
  className?: string
}

export default function CountrySelector({ value, onChange, className = '' }: CountrySelectorProps) {
  const apacCountries = getCountriesByRegion('APAC')
  const gccCountries = getCountriesByRegion('GCC')
  const naCountries = getCountriesByRegion('NA')

  return (
    <div className={className}>
      <label className="block text-xs sm:text-sm font-medium text-gray-300 mb-2">
        Country <span className="text-red-500">*</span>
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 sm:px-4 py-2 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm sm:text-base focus:outline-none focus:border-gray-600 focus:ring-1 focus:ring-gray-600 transition-colors appearance-none font-light cursor-pointer"
      >
        <optgroup label="Asia Pacific">
          {apacCountries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="Gulf Cooperation Council">
          {gccCountries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </optgroup>
        <optgroup label="North America">
          {naCountries.map((country) => (
            <option key={country.code} value={country.code}>
              {country.name}
            </option>
          ))}
        </optgroup>
      </select>
      <p className="mt-1 text-[10px] sm:text-xs text-gray-500">
        Select the country where your company is registered. This will customize the form fields and compliance requirements.
      </p>
    </div>
  )
}
