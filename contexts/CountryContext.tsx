'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import { CountryConfig, CountryRegistry } from '@/lib/countries'

interface CountryContextType {
  countryCode: string
  countryConfig: CountryConfig | null
  setCountryCode: (code: string) => void
}

const CountryContext = createContext<CountryContextType | undefined>(undefined)

export function CountryProvider({ 
  children, 
  defaultCountry = 'IN' 
}: { 
  children: ReactNode
  defaultCountry?: string 
}) {
  const [countryCode, setCountryCode] = useState(defaultCountry)
  const countryConfig = CountryRegistry.get(countryCode)
  
  return (
    <CountryContext.Provider value={{ countryCode, countryConfig, setCountryCode }}>
      {children}
    </CountryContext.Provider>
  )
}

export function useCountry() {
  const context = useContext(CountryContext)
  if (!context) {
    throw new Error('useCountry must be used within CountryProvider')
  }
  return context
}
