# Country Module

This module provides country-aware functionality for the multi-country compliance platform.

## Structure

```
lib/countries/
├── index.ts              # Country registry (main entry point)
├── factory.ts            # Factory for creating country-specific modules
├── utils.ts              # Utility functions
├── api/
│   └── india.ts          # India API client (CIN/DIN verification)
└── validators/
    └── base.ts           # Base validator interfaces
```

## Usage

### Getting Country Configuration

```typescript
import { CountryRegistry } from '@/lib/countries'

const country = CountryRegistry.get('IN') // Get India config
const allCountries = CountryRegistry.getAll()
const gccCountries = CountryRegistry.getByRegion('GCC')
```

### Using Country Factory

```typescript
import { CountryFactory } from '@/lib/countries/factory'

// Get validator for a country
const validator = CountryFactory.getValidator('AE')
const result = validator.validateRegistrationId('1234567')

// Get API client (only India has API support)
const apiClient = CountryFactory.getAPIClient('IN')
const hasAPI = apiClient.hasAPISupport() // true for India, false for others
```

### Using React Hooks

```typescript
import { useCountryConfig } from '@/hooks/useCountryConfig'
import { useCountryValidator } from '@/hooks/useCountryValidator'
import { useCountryAPISupport } from '@/hooks/useCountryValidator'

function MyComponent() {
  const { config } = useCountryConfig('AE')
  const validator = useCountryValidator('AE')
  const hasAPI = useCountryAPISupport('AE')
  
  // Use config, validator, etc.
}
```

### Using Country Context

```typescript
import { CountryProvider, useCountry } from '@/contexts/CountryContext'

function App() {
  return (
    <CountryProvider defaultCountry="IN">
      <YourComponent />
    </CountryProvider>
  )
}

function YourComponent() {
  const { countryCode, countryConfig, setCountryCode } = useCountry()
  // Use country context
}
```

## Supported Countries

- **India (IN)** - ✅ API verification available (CIN/DIN)
- **UAE (AE)** - ⚠️ Manual verification required
- **Saudi Arabia (SA)** - ⚠️ Manual verification required
- **Oman (OM)** - ⚠️ Manual verification required
- **Qatar (QA)** - ⚠️ Manual verification required
- **Bahrain (BH)** - ⚠️ Manual verification required
- **USA (US)** - ⚠️ Manual verification required

## Backward Compatibility

All functions maintain backward compatibility:
- Default country code is 'IN' (India)
- Old import paths still work
- Existing code continues to function without changes
