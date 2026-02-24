# Multi-Country Modularization Plan
## Chief Technology/Product Officer (CTO/CPO) Strategic Plan

**Document Version:** 1.0  
**Date:** 2024  
**Status:** Strategic Planning  
**Target:** Support 7+ countries with scalable, maintainable architecture

---

## Executive Summary

This document outlines a comprehensive plan to transform the Finacra AI compliance tracking application from a country-specific (primarily India-focused) system into a truly modular, multi-country platform. The plan addresses architecture, database design, code organization, configuration management, and implementation strategy.

### Current State Assessment

**Strengths:**
- ✅ Country configuration system exists (`lib/config/countries.ts`)
- ✅ Financial year utilities are country-aware
- ✅ Currency formatting is country-aware
- ✅ Basic country selector component exists
- ✅ Onboarding flow has country selection

**Critical Issues:**
- ❌ Penalty engine hardcoded to INR (₹)
- ❌ Pricing system hardcoded to INR
- ❌ Compliance templates not country-scoped
- ❌ Database schema lacks country context in key tables
- ❌ Country-specific logic scattered across codebase
- ❌ No country-specific validation modules
- ❌ No country-specific compliance rule engines
- ❌ API endpoints (CIN/DIN verification) are India-specific
- ❌ Document templates not country-aware

---

## 1. Architecture Overview

### 1.1 Target Architecture: Country-First Modular Design

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Onboarding │  │  Compliance  │  │  Data Room  │      │
│  │   Module     │  │   Tracker    │  │   Module    │      │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘      │
└─────────┼─────────────────┼─────────────────┼──────────────┘
          │                 │                 │
┌─────────┼─────────────────┼─────────────────┼──────────────┐
│         │                 │                 │               │
│  ┌──────▼─────────────────▼─────────────────▼──────┐      │
│  │         Country-Aware Service Layer               │      │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────┐  │      │
│  │  │ Validation │  │  Compliance │  │  Penalty │  │      │
│  │  │  Engine    │  │    Engine   │  │  Engine  │  │      │
│  │  └────────────┘  └────────────┘  └──────────┘  │      │
│  └──────────────────────────────────────────────────┘      │
│                                                             │
│  ┌──────────────────────────────────────────────────┐      │
│  │         Country Configuration Registry            │      │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐        │      │
│  │  │   IN    │  │   AE     │  │   US     │  ...   │      │
│  │  └──────────┘  └──────────┘  └──────────┘        │      │
│  └──────────────────────────────────────────────────┘      │
└─────────────────────────────────────────────────────────────┘
          │
┌─────────▼──────────────────────────────────────────────────┐
│              Database Layer (Country-Scoped)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Companies   │  │  Compliance │  │  Templates  │      │
│  │ (country_id) │  │ (country_id)│  │(country_id) │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 Core Principles

1. **Country Isolation**: Each country's data and logic should be isolated
2. **Configuration-Driven**: Country-specific behavior via configuration, not code
3. **Plugin Architecture**: Country modules as pluggable components
4. **Backward Compatibility**: Existing India data must continue working
5. **Progressive Enhancement**: Add countries incrementally without breaking existing functionality

---

## 2. Database Schema Changes

### 2.1 Country Master Table

```sql
-- Create or enhance countries table
CREATE TABLE IF NOT EXISTS public.countries (
  code VARCHAR(2) PRIMARY KEY, -- ISO 3166-1 alpha-2
  name VARCHAR(100) NOT NULL,
  region VARCHAR(20) NOT NULL, -- 'APAC', 'GCC', 'NA', 'EU', etc.
  currency_code VARCHAR(3) NOT NULL, -- ISO 4217
  currency_symbol VARCHAR(10) NOT NULL,
  financial_year_start_month INTEGER NOT NULL, -- 1-12
  financial_year_type VARCHAR(2) NOT NULL, -- 'FY' or 'CY'
  timezone VARCHAR(50) NOT NULL,
  date_format VARCHAR(20) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}', -- Country-specific metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_countries_region ON public.countries(region);
CREATE INDEX idx_countries_active ON public.countries(is_active) WHERE is_active = true;

-- Insert supported countries (7 countries: India + 5 GCC + USA)
INSERT INTO public.countries (code, name, region, currency_code, currency_symbol, 
  financial_year_start_month, financial_year_type, timezone, date_format, is_active, is_default)
VALUES
  ('IN', 'India', 'APAC', 'INR', '₹', 4, 'FY', 'Asia/Kolkata', 'DD/MM/YYYY', true, true),
  ('AE', 'United Arab Emirates', 'GCC', 'AED', 'د.إ', 1, 'CY', 'Asia/Dubai', 'DD/MM/YYYY', true, false),
  ('SA', 'Saudi Arabia', 'GCC', 'SAR', 'ر.س', 1, 'CY', 'Asia/Riyadh', 'DD/MM/YYYY', true, false),
  ('OM', 'Oman', 'GCC', 'OMR', 'ر.ع.', 1, 'CY', 'Asia/Muscat', 'DD/MM/YYYY', true, false),
  ('QA', 'Qatar', 'GCC', 'QAR', 'ر.ق', 1, 'CY', 'Asia/Qatar', 'DD/MM/YYYY', true, false),
  ('BH', 'Bahrain', 'GCC', 'BHD', 'د.ب', 1, 'CY', 'Asia/Bahrain', 'DD/MM/YYYY', true, false),
  ('US', 'United States', 'NA', 'USD', '$', 1, 'CY', 'America/New_York', 'MM/DD/YYYY', true, false)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  region = EXCLUDED.region,
  currency_code = EXCLUDED.currency_code,
  currency_symbol = EXCLUDED.currency_symbol,
  financial_year_start_month = EXCLUDED.financial_year_start_month,
  financial_year_type = EXCLUDED.financial_year_type,
  timezone = EXCLUDED.timezone,
  date_format = EXCLUDED.date_format,
  updated_at = NOW();
```

### 2.2 Add Country Context to Key Tables

```sql
-- Add country_code to companies table
ALTER TABLE public.companies
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) REFERENCES public.countries(code) DEFAULT 'IN';

-- Add index
CREATE INDEX IF NOT EXISTS idx_companies_country ON public.companies(country_code);

-- Migrate existing data (all existing companies are India)
UPDATE public.companies SET country_code = 'IN' WHERE country_code IS NULL;

-- Make NOT NULL after migration
ALTER TABLE public.companies
ALTER COLUMN country_code SET NOT NULL;

-- Add country_code to compliance_templates
ALTER TABLE public.compliance_templates
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) REFERENCES public.countries(code) DEFAULT 'IN';

CREATE INDEX IF NOT EXISTS idx_compliance_templates_country ON public.compliance_templates(country_code);

-- Migrate existing templates
UPDATE public.compliance_templates SET country_code = 'IN' WHERE country_code IS NULL;

-- Add country_code to regulatory_requirements (inherits from company)
-- This is optional but useful for reporting
ALTER TABLE public.regulatory_requirements
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) REFERENCES public.countries(code);

-- Populate from company
UPDATE public.regulatory_requirements rr
SET country_code = c.country_code
FROM public.companies c
WHERE rr.company_id = c.id AND rr.country_code IS NULL;

-- Add country_code to document_templates
ALTER TABLE public.document_templates
ADD COLUMN IF NOT EXISTS country_code VARCHAR(2) REFERENCES public.countries(code) DEFAULT 'IN';

CREATE INDEX IF NOT EXISTS idx_document_templates_country ON public.document_templates(country_code);
```

### 2.3 Country-Specific Configuration Tables

```sql
-- Country-specific validation rules
CREATE TABLE IF NOT EXISTS public.country_validation_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code VARCHAR(2) NOT NULL REFERENCES public.countries(code),
  field_type VARCHAR(50) NOT NULL, -- 'registration_id', 'tax_id', 'director_id', etc.
  pattern VARCHAR(255), -- Regex pattern
  min_length INTEGER,
  max_length INTEGER,
  required BOOLEAN DEFAULT true,
  validation_function TEXT, -- Custom validation function name
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_code, field_type)
);

-- Country-specific compliance categories
CREATE TABLE IF NOT EXISTS public.country_compliance_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code VARCHAR(2) NOT NULL REFERENCES public.countries(code),
  category_code VARCHAR(50) NOT NULL, -- 'tax', 'corporate', 'labor', etc.
  category_name VARCHAR(100) NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_code, category_code)
);

-- Country-specific entity types
CREATE TABLE IF NOT EXISTS public.country_entity_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  country_code VARCHAR(2) NOT NULL REFERENCES public.countries(code),
  entity_code VARCHAR(50) NOT NULL, -- 'private_limited', 'llc', 'corporation', etc.
  entity_name VARCHAR(100) NOT NULL,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(country_code, entity_code)
);
```

---

## 3. Code Organization & Module Structure

### 3.1 Proposed Directory Structure

```
lib/
├── countries/
│   ├── index.ts                    # Country registry & factory
│   ├── config/
│   │   ├── base.ts                 # Base country config interface
│   │   ├── india.ts                # India-specific config
│   │   ├── uae.ts                  # UAE-specific config
│   │   ├── saudi.ts                # Saudi Arabia-specific config
│   │   ├── oman.ts                 # Oman-specific config
│   │   ├── qatar.ts                # Qatar-specific config
│   │   ├── bahrain.ts              # Bahrain-specific config
│   │   └── usa.ts                  # USA-specific config
│   ├── validators/
│   │   ├── base.ts                 # Base validator interface
│   │   ├── india.ts                # India validators (CIN, DIN, PAN, GST)
│   │   ├── uae.ts                  # UAE validators (Trade License, Emirates ID)
│   │   ├── saudi.ts                # Saudi validators (Commercial Registration)
│   │   ├── oman.ts                 # Oman validators
│   │   ├── qatar.ts                # Qatar validators
│   │   ├── bahrain.ts              # Bahrain validators
│   │   └── usa.ts                  # USA validators (EIN, State Registration)
│   ├── compliance/
│   │   ├── base.ts                 # Base compliance engine
│   │   ├── india.ts                # India compliance rules
│   │   ├── uae.ts                  # UAE compliance rules
│   │   ├── saudi.ts                # Saudi Arabia compliance rules
│   │   ├── oman.ts                 # Oman compliance rules
│   │   ├── qatar.ts                # Qatar compliance rules
│   │   ├── bahrain.ts              # Bahrain compliance rules
│   │   └── usa.ts                  # USA compliance rules
│   └── api/
│       ├── base.ts                 # Base API client interface
│       ├── india/
│       │   ├── cin-verification.ts # ✅ Full API verification
│       │   └── din-verification.ts # ✅ Full API verification
│       ├── uae/
│       │   └── trade-license.ts   # ⚠️ Format validation only
│       ├── saudi/
│       │   └── commercial-registration.ts # ⚠️ Format validation only
│       ├── oman/
│       │   └── commercial-registration.ts # ⚠️ Format validation only
│       ├── qatar/
│       │   └── commercial-registration.ts # ⚠️ Format validation only
│       ├── bahrain/
│       │   └── commercial-registration.ts # ⚠️ Format validation only
│       └── usa/
│           └── ein-verification.ts # ⚠️ Format validation only
├── penalty/
│   ├── engine.ts                   # Main penalty engine (country-agnostic)
│   ├── formatters/
│   │   ├── base.ts                 # Base formatter interface
│   │   ├── india.ts                # INR formatter
│   │   ├── uae.ts                  # AED formatter
│   │   └── ...                     # Other countries
│   └── calculators/
│       ├── daily.ts                # Daily penalty calculator
│       ├── interest.ts             # Interest calculator
│       └── ...                     # Other penalty types
├── pricing/
│   ├── calculator.ts               # Country-aware pricing calculator
│   ├── tiers.ts                    # Base tier definitions
│   └── currencies/
│       ├── inr.ts                  # INR pricing
│       ├── usd.ts                  # USD pricing
│       └── ...                     # Other currencies
└── utils/
    ├── currency.ts                 # Enhanced currency utils
    ├── financial-year.ts           # Already country-aware ✅
    └── date-format.ts              # Country-aware date formatting
```

### 3.2 Country Registry Pattern

```typescript
// lib/countries/index.ts
import { CountryConfig } from './config/base'
import { IndiaConfig } from './config/india'
import { UAEConfig } from './config/uae'
// ... other countries

export class CountryRegistry {
  private static countries: Map<string, CountryConfig> = new Map()
  
  static register(countryCode: string, config: CountryConfig) {
    this.countries.set(countryCode.toUpperCase(), config)
  }
  
  static get(countryCode: string): CountryConfig | null {
    return this.countries.get(countryCode.toUpperCase()) || null
  }
  
  static getAll(): CountryConfig[] {
    return Array.from(this.countries.values())
  }
  
  static getActive(): CountryConfig[] {
    return this.getAll().filter(c => c.isActive)
  }
  
  static getByRegion(region: string): CountryConfig[] {
    return this.getAll().filter(c => c.region === region)
  }
}

// Initialize on module load
CountryRegistry.register('IN', IndiaConfig)
CountryRegistry.register('AE', UAEConfig)
// ... register all countries
```

### 3.3 Country Factory Pattern

```typescript
// lib/countries/factory.ts
import { CountryRegistry } from './index'
import { BaseValidator } from './validators/base'
import { IndiaValidator } from './validators/india'
import { UAEValidator } from './validators/uae'
// ... other validators

export class CountryFactory {
  static getValidator(countryCode: string): BaseValidator {
    const config = CountryRegistry.get(countryCode)
    if (!config) {
      throw new Error(`Country ${countryCode} not supported`)
    }
    
    switch (countryCode) {
      case 'IN':
        return new IndiaValidator(config)
      case 'AE':
        return new UAEValidator(config)
      // ... other countries
      default:
        throw new Error(`No validator for country ${countryCode}`)
    }
  }
  
  static getComplianceEngine(countryCode: string) {
    // Similar pattern for compliance engines
  }
  
  static getAPIClient(countryCode: string) {
    // Similar pattern for API clients
  }
}
```

---

## 4. Key Module Refactoring

### 4.1 Penalty Engine Refactoring

**Current Issue:** Hardcoded to INR (`formatINR` function)

**Solution:**

```typescript
// lib/penalty/formatters/base.ts
export interface PenaltyFormatter {
  format(amount: number): string
  parse(amountStr: string): number | null
  getSymbol(): string
  getCode(): string
}

// lib/penalty/formatters/india.ts
import { PenaltyFormatter } from './base'
import { formatCurrency, getCurrencySymbol, getCurrencyCode } from '@/lib/utils/currency'

export class IndiaPenaltyFormatter implements PenaltyFormatter {
  format(amount: number): string {
    return formatCurrency(amount, 'IN')
  }
  
  parse(amountStr: string): number | null {
    // Remove ₹ and parse
    return parseFloat(amountStr.replace(/[₹,\s]/g, ''))
  }
  
  getSymbol(): string {
    return getCurrencySymbol('IN')
  }
  
  getCode(): string {
    return getCurrencyCode('IN')
  }
}

// lib/penalty/engine.ts (refactored)
import { CountryFactory } from '@/lib/countries/factory'

export function computePenalty(
  config: PenaltyConfig | null | undefined,
  daysDelayed: number,
  financials: CompanyFinancials | null = null,
  countryCode: string = 'IN', // Add country parameter
  baseAmountOverride?: number,
  options: { isNilReturn?: boolean; invoiceCount?: number } = {}
): PenaltyResult {
  // ... existing calculation logic ...
  
  // Use country-specific formatter
  const formatter = CountryFactory.getPenaltyFormatter(countryCode)
  
  return {
    success: true,
    amount: calculatedAmount,
    display: formatter.format(calculatedAmount), // Country-aware formatting
    // ...
  }
}
```

### 4.2 Pricing System Refactoring

**Current Issue:** Hardcoded to INR

**Solution:**

```typescript
// lib/pricing/currencies/base.ts
export interface CurrencyPricing {
  formatPrice(price: number): string
  convertFromINR(amount: number): number
  convertToINR(amount: number): number
  getExchangeRate(): number
}

// lib/pricing/calculator.ts (refactored)
import { CountryRegistry } from '@/lib/countries'
import { CurrencyPricingFactory } from './currencies/factory'

export function calculatePricing(
  tier: PricingTierConfig,
  billingCycle: BillingCycle,
  countryCode: string = 'IN' // Add country parameter
): PricingOption {
  const country = CountryRegistry.get(countryCode)
  const currencyPricing = CurrencyPricingFactory.get(countryCode)
  
  // Base price in INR (from tier definition)
  const basePriceINR = tier.monthlyPrice
  
  // Convert to country currency
  const basePrice = currencyPricing.convertFromINR(basePriceINR)
  
  // Apply discount
  const discount = BILLING_DISCOUNTS[billingCycle]
  const price = calculatePriceForCycle(basePrice, billingCycle, discount)
  
  return {
    billingCycle,
    price: Math.round(price),
    discount,
    effectiveMonthly: Math.round(price / getCycleMonths(billingCycle)),
    currency: country.currency.code,
    currencySymbol: country.currency.symbol,
    // ...
  }
}

export function formatPrice(price: number, countryCode: string = 'IN'): string {
  const currencyPricing = CurrencyPricingFactory.get(countryCode)
  return currencyPricing.formatPrice(price)
}
```

### 4.3 Compliance Template System

**Current Issue:** Templates not country-scoped

**Solution:**

```typescript
// lib/compliance/template-loader.ts
export class ComplianceTemplateLoader {
  static async getTemplatesForCountry(
    countryCode: string,
    entityType?: string,
    industry?: string
  ): Promise<ComplianceTemplate[]> {
    const supabase = createClient()
    
    let query = supabase
      .from('compliance_templates')
      .select('*')
      .eq('country_code', countryCode)
      .eq('is_active', true)
    
    if (entityType) {
      query = query.contains('entity_types', [entityType])
    }
    
    if (industry) {
      query = query.contains('industries', [industry])
    }
    
    const { data, error } = await query.order('display_order')
    
    if (error) throw error
    return data || []
  }
  
  static async getTemplateById(
    templateId: string,
    countryCode: string
  ): Promise<ComplianceTemplate | null> {
    const supabase = createClient()
    
    const { data, error } = await supabase
      .from('compliance_templates')
      .select('*')
      .eq('id', templateId)
      .eq('country_code', countryCode)
      .single()
    
    if (error) return null
    return data
  }
}
```

### 4.4 Validation System

**Current Issue:** Validation logic scattered, India-specific

**Solution:**

```typescript
// lib/countries/validators/base.ts
export interface FieldValidator {
  validate(value: string, context?: any): ValidationResult
  getPattern(): RegExp | null
  getErrorMessage(): string
}

export interface ValidationResult {
  isValid: boolean
  error?: string
  normalized?: string
}

// lib/countries/validators/india.ts
export class IndiaValidator implements CountryValidator {
  private config: CountryConfig
  
  constructor(config: CountryConfig) {
    this.config = config
  }
  
  validateCIN(cin: string): ValidationResult {
    // CIN validation logic
    const pattern = /^[A-Z]{1}[0-9]{5}[A-Z]{2}[0-9]{4}[A-Z]{3}[0-9]{6}$/
    if (!pattern.test(cin)) {
      return {
        isValid: false,
        error: 'Invalid CIN format'
      }
    }
    return { isValid: true, normalized: cin.toUpperCase() }
  }
  
  validateDIN(din: string): ValidationResult {
    // DIN validation logic
  }
  
  validatePAN(pan: string): ValidationResult {
    // PAN validation logic
  }
  
  validateGST(gst: string): ValidationResult {
    // GST validation logic
  }
}

// lib/countries/validators/uae.ts
export class UAEValidator implements CountryValidator {
  validateTradeLicense(tradeLicense: string): ValidationResult {
    // UAE trade license validation
  }
  
  validateEmiratesID(emiratesId: string): ValidationResult {
    // Emirates ID validation
  }
}
```

---

## 5. API & Integration Refactoring

### 5.1 Country-Specific API Clients

**Note:** Currently, only India has API verification available (CIN/DIN). All other countries use format validation with manual verification requirements.

```typescript
// lib/countries/api/base.ts
export interface CountryAPIClient {
  verifyRegistrationId(id: string): Promise<VerificationResult>
  verifyDirectorId(id: string): Promise<VerificationResult>
  getCompanyDetails(id: string): Promise<CompanyDetails | null>
  hasAPISupport(): boolean // Indicates if API verification is available
}

// lib/countries/api/india/cin-verification.ts
export class IndiaCINVerificationClient implements CountryAPIClient {
  hasAPISupport(): boolean {
    return true // India has API support
  }
  
  async verifyRegistrationId(cin: string): Promise<VerificationResult> {
    // Existing CIN verification logic via API
    const response = await fetch(`/api/verify-cin?cin=${cin}`)
    return response.json()
  }
  
  async verifyDirectorId(din: string): Promise<VerificationResult> {
    // Existing DIN verification logic via API
    const response = await fetch(`/api/verify-din?din=${din}`)
    return response.json()
  }
  
  async getCompanyDetails(cin: string): Promise<CompanyDetails | null> {
    // Fetch company details from MCA API
    const response = await fetch(`/api/verify-cin?cin=${cin}`)
    const data = await response.json()
    return data.companyDetails || null
  }
}

// lib/countries/api/uae/trade-license.ts
export class UAETradeLicenseClient implements CountryAPIClient {
  hasAPISupport(): boolean {
    return false // No API available - manual verification only
  }
  
  async verifyRegistrationId(tradeLicense: string): Promise<VerificationResult> {
    // Manual verification - return validation result based on format only
    // User must manually verify with DED portal
    const validator = CountryFactory.getValidator('AE')
    const formatValidation = validator.validateRegistrationId(tradeLicense)
    
    return {
      verified: false,
      requiresManualVerification: true,
      message: 'Please verify Trade License manually via DED portal',
      validationResult: formatValidation,
      verificationPortal: 'https://www.ded.ae/',
      formatValid: formatValidation.isValid
    }
  }
  
  async verifyDirectorId(id: string): Promise<VerificationResult> {
    return {
      verified: false,
      requiresManualVerification: true,
      message: 'Director verification not available via API. Please verify manually.',
      formatValid: true
    }
  }
  
  async getCompanyDetails(tradeLicense: string): Promise<CompanyDetails | null> {
    return null // No API available
  }
}

// Similar pattern for all other countries (SA, OM, QA, BH, US)
// All return requiresManualVerification: true with format validation only
```

### 5.2 API Route Refactoring

```typescript
// app/api/verify-registration/route.ts (new unified endpoint)
import { CountryFactory } from '@/lib/countries/factory'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const registrationId = searchParams.get('id')
  const countryCode = searchParams.get('country') || 'IN'
  
  if (!registrationId) {
    return Response.json({ error: 'Registration ID required' }, { status: 400 })
  }
  
  const apiClient = CountryFactory.getAPIClient(countryCode)
  
  // Check if API support is available
  if (!apiClient.hasAPISupport()) {
    // Return format validation only for countries without API
    const validationResult = await apiClient.verifyRegistrationId(registrationId)
    return Response.json({
      ...validationResult,
      note: 'API verification not available. Please verify manually via official government portal.',
      manualVerificationRequired: true
    })
  }
  
  // India has API support - perform actual verification
  const result = await apiClient.verifyRegistrationId(registrationId)
  return Response.json(result)
}
```

### 5.3 Manual Verification Strategy

Since only India has API verification available, all other countries will use manual verification with format validation support.

#### 5.3.1 Format Validation (All Countries)

```typescript
// lib/countries/validators/base.ts
export interface FormatValidator {
  validateFormat(value: string): ValidationResult
  getExpectedFormat(): string
  getVerificationPortal(): string
}

// Example: UAE Trade License format validation
export class UAETradeLicenseValidator implements FormatValidator {
  validateFormat(tradeLicense: string): ValidationResult {
    // Pattern: Typically 6-10 alphanumeric characters
    const pattern = /^[A-Z0-9]{6,10}$/
    if (!pattern.test(tradeLicense)) {
      return {
        isValid: false,
        error: 'Invalid Trade License format. Expected: 6-10 alphanumeric characters'
      }
    }
    return { isValid: true, normalized: tradeLicense.toUpperCase() }
  }
  
  getExpectedFormat(): string {
    return '6-10 alphanumeric characters (e.g., 1234567)'
  }
  
  getVerificationPortal(): string {
    return 'https://www.ded.ae/ (Emirate-specific DED portal)'
  }
}
```

#### 5.3.2 UI Components for Manual Verification

```typescript
// components/ManualVerificationNotice.tsx
interface ManualVerificationNoticeProps {
  countryCode: string
  fieldType: 'registration' | 'director' | 'tax'
  value: string
}

export function ManualVerificationNotice({ 
  countryCode, 
  fieldType, 
  value 
}: ManualVerificationNoticeProps) {
  const config = CountryRegistry.get(countryCode)
  const apiClient = CountryFactory.getAPIClient(countryCode)
  
  if (apiClient.hasAPISupport()) {
    return null // No notice needed for India
  }
  
  const portalLink = getVerificationPortalLink(countryCode, fieldType)
  
  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded p-4">
      <div className="flex items-start">
        <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
        <div className="ml-3">
          <h3 className="text-sm font-medium text-yellow-800">
            Manual Verification Required
          </h3>
          <p className="mt-2 text-sm text-yellow-700">
            {config.name} does not provide API verification. Please verify this 
            {fieldType === 'registration' ? ' registration ID' : 
             fieldType === 'director' ? ' director ID' : ' tax ID'} 
            manually via the official portal.
          </p>
          <div className="mt-3">
            <a 
              href={portalLink} 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-sm font-medium text-yellow-800 hover:text-yellow-900 underline"
            >
              Verify on {config.name} Official Portal →
            </a>
          </div>
          <div className="mt-2">
            <label className="flex items-center text-sm text-yellow-700">
              <input 
                type="checkbox" 
                className="rounded border-yellow-300"
                onChange={(e) => handleVerificationCheck(e.target.checked)}
              />
              <span className="ml-2">I have verified this information</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
```

#### 5.3.3 Verification Portal Links (Database)

```sql
-- Add verification portal links to country_validation_rules
ALTER TABLE public.country_validation_rules
ADD COLUMN IF NOT EXISTS verification_portal_url TEXT,
ADD COLUMN IF NOT EXISTS verification_instructions TEXT;

-- Example data for non-India countries
INSERT INTO public.country_validation_rules 
(country_code, field_type, verification_portal_url, verification_instructions)
VALUES
  ('AE', 'registration_id', 'https://www.ded.ae/', 'Verify Trade License via DED portal (Emirate-specific)'),
  ('SA', 'registration_id', 'https://mc.gov.sa/', 'Verify Commercial Registration via MOC portal'),
  ('OM', 'registration_id', 'https://www.moc.gov.om/', 'Verify CR via MOCIIP portal'),
  ('QA', 'registration_id', 'https://www.moci.gov.qa/', 'Verify CR via MOCI portal'),
  ('BH', 'registration_id', 'https://www.moic.gov.bh/', 'Verify CR via MOIC portal'),
  ('US', 'registration_id', 'https://www.irs.gov/businesses/small-businesses-self-employed/employer-id-numbers', 'Verify EIN via IRS website')
ON CONFLICT (country_code, field_type) DO UPDATE SET
  verification_portal_url = EXCLUDED.verification_portal_url,
  verification_instructions = EXCLUDED.verification_instructions;
```

---

## 6. Frontend Component Refactoring

### 6.1 Country-Aware Components

```typescript
// components/CountryAwareForm.tsx
interface CountryAwareFormProps {
  countryCode: string
  onSubmit: (data: FormData) => void
}

export function CountryAwareForm({ countryCode, onSubmit }: CountryAwareFormProps) {
  const validator = CountryFactory.getValidator(countryCode)
  const config = CountryRegistry.get(countryCode)
  const apiClient = CountryFactory.getAPIClient(countryCode)
  const [formData, setFormData] = useState({ registrationId: '', taxId: '', directorId: '' })
  
  return (
    <form onSubmit={handleSubmit}>
      {/* Registration ID field - label changes by country */}
      <input
        name="registrationId"
        label={config.labels.registrationId}
        validator={validator.validateRegistrationId}
        value={formData.registrationId}
        onChange={(e) => setFormData({ ...formData, registrationId: e.target.value })}
      />
      
      {/* Show manual verification notice if API not available */}
      {!apiClient.hasAPISupport() && formData.registrationId && (
        <ManualVerificationNotice 
          countryCode={countryCode}
          fieldType="registration"
          value={formData.registrationId}
        />
      )}
      
      {/* Tax ID field - only if country requires it */}
      {config.fields.tax && (
        <>
          <input
            name="taxId"
            label={config.labels.taxId}
            validator={validator.validateTaxId}
            value={formData.taxId}
            onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
          />
          {!apiClient.hasAPISupport() && formData.taxId && (
            <ManualVerificationNotice 
              countryCode={countryCode}
              fieldType="tax"
              value={formData.taxId}
            />
          )}
        </>
      )}
      
      {/* Director ID field - only for countries that require it */}
      {config.fields.director && (
        <>
          <input
            name="directorId"
            label={config.labels.directorId}
            validator={validator.validateDirectorId}
            value={formData.directorId}
            onChange={(e) => setFormData({ ...formData, directorId: e.target.value })}
          />
          {!apiClient.hasAPISupport() && formData.directorId && (
            <ManualVerificationNotice 
              countryCode={countryCode}
              fieldType="director"
              value={formData.directorId}
            />
          )}
        </>
      )}
      
      {/* State/Province field - label changes by country */}
      {config.labels.state && (
        <input
          name="state"
          label={config.labels.state}
        />
      )}
      
      {/* Postal code field - label changes by country */}
      <input
        name="postalCode"
        label={config.labels.postalCode}
        validator={validator.validatePostalCode}
      />
    </form>
  )
}
```

### 6.2 Country Context Provider

```typescript
// contexts/CountryContext.tsx
'use client'

import { createContext, useContext, useState, ReactNode } from 'react'
import { CountryConfig } from '@/lib/countries/config/base'

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
```

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Weeks 1-2)
**Goal:** Establish country infrastructure without breaking existing functionality

**Tasks:**
1. ✅ Create countries master table in database
2. ✅ Add `country_code` columns to key tables (companies, compliance_templates)
3. ✅ Migrate existing data (set all to 'IN')
4. ✅ Create country registry and factory patterns
5. ✅ Refactor country config system to use new structure
6. ✅ Add country context provider to frontend

**Deliverables:**
- Database migration scripts
- Country registry module
- Updated country config system
- Frontend country context

**Risk:** Low - All changes are additive, existing functionality preserved

---

### Phase 2: Core Module Refactoring (Weeks 3-5)
**Goal:** Make core modules country-aware

**Tasks:**
1. ✅ Refactor penalty engine to support multi-currency
2. ✅ Refactor pricing system for multi-currency
3. ✅ Update compliance template loader to filter by country
4. ✅ Create country-specific validation modules
5. ✅ Update onboarding flow to use country-aware validators
6. ✅ Refactor currency and financial year utilities (already done ✅)

**Deliverables:**
- Country-aware penalty engine
- Multi-currency pricing system
- Country-scoped compliance templates
- Validation modules for all 7 countries

**Risk:** Medium - Core business logic changes, requires thorough testing

---

### Phase 3: API & Integration (Weeks 6-7)
**Goal:** Make API endpoints country-aware with manual verification fallback

**Tasks:**
1. ✅ Create country-specific API client interfaces with `hasAPISupport()` method
2. ✅ Refactor CIN/DIN verification to use country factory (India only - existing APIs)
3. ✅ Implement format-only validation for GCC countries (no API verification)
4. ✅ Implement format-only validation for USA (no API verification)
5. ✅ Update API routes to handle manual verification requirements
6. ✅ Add UI indicators for manual verification requirements
7. ✅ Create manual verification workflow/checklist for non-India countries
8. ✅ Add country-specific verification portal links to UI

**Deliverables:**
- Unified verification API endpoint (India: full API, Others: format validation)
- Country-specific API clients (India: full, Others: format-only)
- Manual verification UI components
- Verification portal links per country
- Format validation for all 7 countries

**Risk:** Low - Format validation is straightforward, no external dependencies for non-India countries

---

### Phase 4: Frontend Enhancement (Weeks 8-9)
**Goal:** Update UI components to be country-aware

**Tasks:**
1. ✅ Update onboarding form to use country-aware components
2. ✅ Update compliance tracker to filter by country
3. ✅ Update data room to show country-specific fields
4. ✅ Update pricing page to show country-specific pricing
5. ✅ Add country selector to all relevant pages
6. ✅ Update email templates for country-specific formatting

**Deliverables:**
- Country-aware form components
- Updated compliance tracker UI
- Multi-currency pricing display
- Country selector integration

**Risk:** Low - UI changes, easy to test and rollback

---

### Phase 5: GCC Country Implementation (Weeks 10-12)
**Goal:** Complete implementation for all GCC countries

**Tasks:**
1. ✅ Create compliance templates for UAE
2. ✅ Create compliance templates for Saudi Arabia
3. ✅ Create compliance templates for Oman
4. ✅ Create compliance templates for Qatar
5. ✅ Create compliance templates for Bahrain
6. ✅ Implement validators for all GCC countries
7. ✅ Configure entity types for GCC countries
8. ✅ Set up compliance categories for GCC countries

**Deliverables:**
- Complete compliance template sets for all GCC countries
- Full validator implementations
- Country-specific configurations

**Risk:** Medium - Requires domain knowledge of GCC compliance requirements

---

### Phase 6: USA Implementation (Weeks 13-14)
**Goal:** Complete USA implementation

**Tasks:**
1. ✅ Create compliance templates for USA
2. ✅ Implement USA validators (EIN, State Registration)
3. ✅ Configure USA entity types (LLC, Corporation, etc.)
4. ✅ Set up USA compliance categories
5. ✅ Integrate with USA verification APIs (if available)
6. ✅ Configure USA-specific financial year (Calendar Year)

**Deliverables:**
- Complete USA compliance template set
- USA validator implementations
- USA-specific configurations

**Risk:** Low - Well-documented requirements

---

### Phase 7: Testing & QA (Weeks 15-16)
**Goal:** Comprehensive testing across all countries

**Tasks:**
1. ✅ Unit tests for all country modules
2. ✅ Integration tests for country-aware flows
3. ✅ End-to-end tests for each country
4. ✅ Performance testing with multi-country data
5. ✅ Security audit for country data isolation
6. ✅ User acceptance testing with country-specific users

**Deliverables:**
- Test suite covering all countries
- Performance benchmarks
- Security audit report
- UAT sign-off

**Risk:** Medium - Comprehensive testing required

---

### Phase 8: Documentation & Training (Week 17)
**Goal:** Document system and train team

**Tasks:**
1. ✅ Update technical documentation
2. ✅ Create country onboarding guide
3. ✅ Document country configuration process
4. ✅ Create developer guide for adding new countries
5. ✅ Train support team on multi-country features
6. ✅ Create user guides for each country

**Deliverables:**
- Complete technical documentation
- Country onboarding guides
- Developer documentation
- User documentation

**Risk:** Low - Documentation task

---

### Phase 9: Rollout & Monitoring (Week 18+)
**Goal:** Gradual rollout and monitoring

**Tasks:**
1. ✅ Deploy to staging environment
2. ✅ Beta testing with select users from each country
3. ✅ Monitor performance and errors
4. ✅ Gradual rollout to production
5. ✅ Monitor country-specific metrics
6. ✅ Collect user feedback
7. ✅ Iterate based on feedback

**Deliverables:**
- Production deployment
- Monitoring dashboards
- User feedback reports
- Iteration plan

**Risk:** Medium - Production deployment always has risks

---

## 8. Testing Strategy

### 8.1 Unit Testing

```typescript
// __tests__/countries/validators/india.test.ts
import { IndiaValidator } from '@/lib/countries/validators/india'
import { IndiaConfig } from '@/lib/countries/config/india'

describe('IndiaValidator', () => {
  const validator = new IndiaValidator(IndiaConfig)
  
  describe('validateCIN', () => {
    it('should validate correct CIN format', () => {
      const result = validator.validateCIN('U12345AB2024ABC123456')
      expect(result.isValid).toBe(true)
    })
    
    it('should reject invalid CIN format', () => {
      const result = validator.validateCIN('INVALID')
      expect(result.isValid).toBe(false)
    })
  })
  
  // ... more tests
})
```

### 8.2 Integration Testing

```typescript
// __tests__/integration/country-onboarding.test.ts
describe('Country-Aware Onboarding', () => {
  it('should create company with correct country code', async () => {
    const result = await completeOnboarding({
      companyName: 'Test Company',
      countryCode: 'AE',
      // ... other fields
    })
    
    expect(result.company.country_code).toBe('AE')
  })
  
  it('should load country-specific compliance templates', async () => {
    const templates = await ComplianceTemplateLoader.getTemplatesForCountry('AE')
    expect(templates.every(t => t.country_code === 'AE')).toBe(true)
  })
})
```

### 8.3 End-to-End Testing

- Test complete onboarding flow for each country
- Test compliance tracking for each country
- Test penalty calculation with different currencies
- Test pricing display for each country
- Test country switching functionality

---

## 9. Migration Strategy

### 9.1 Database Migration

**Step 1: Add country infrastructure**
```sql
-- Run schema changes (Section 2.1, 2.2, 2.3)
-- This is non-breaking, adds new columns with defaults
```

**Step 2: Migrate existing data**
```sql
-- All existing companies are India
UPDATE companies SET country_code = 'IN' WHERE country_code IS NULL;
UPDATE compliance_templates SET country_code = 'IN' WHERE country_code IS NULL;
```

**Step 3: Make columns required**
```sql
-- After migration, make country_code NOT NULL
ALTER TABLE companies ALTER COLUMN country_code SET NOT NULL;
```

### 9.2 Code Migration

**Backward Compatibility Approach:**
- All functions accept `countryCode` parameter with default `'IN'`
- Existing code continues to work without changes
- New code explicitly passes country code
- Gradual migration of existing code paths

**Example:**
```typescript
// Old code (still works)
const penalty = computePenalty(config, days, financials)

// New code (explicit country)
const penalty = computePenalty(config, days, financials, 'AE')
```

---

## 10. Risk Assessment & Mitigation

### 10.1 Technical Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|--------------|------------|
| Breaking existing India functionality | High | Medium | Comprehensive testing, backward compatibility |
| Performance degradation with country filtering | Medium | Low | Proper indexing, query optimization |
| Currency conversion accuracy | High | Low | Use reliable exchange rate APIs, cache rates |
| Manual verification user friction | Medium | Medium | Clear UI indicators, portal links, verification checklists, optional document upload for proof |
| Data migration issues | High | Low | Staged migration, rollback plan |

### 10.2 Business Risks

| Risk | Impact | Probability | Mitigation |
|------|--------|--------------|------------|
| Delayed GCC country launch | Medium | Medium | Prioritize high-value countries first |
| Compliance template accuracy | High | Medium | Legal review, expert consultation |
| User confusion with multi-country UI | Medium | Low | Clear country indicators, user testing |
| Support complexity increase | Medium | High | Training, documentation, tiered support |

---

## 11. Success Metrics

### 11.1 Technical Metrics

- **Code Coverage:** >80% for country modules
- **Performance:** <100ms for country-aware queries
- **Error Rate:** <0.1% for country-specific operations
- **API Uptime:** >99.9% for verification endpoints

### 11.2 Business Metrics

- **Country Adoption:** Users from all 7 countries onboarded within 3 months
- **Template Coverage:** >90% of common compliances covered per country
- **User Satisfaction:** >4.5/5 rating for country-specific features
- **Support Tickets:** <5% increase in support volume despite 7x countries

### 11.3 Product Metrics

- **Onboarding Completion:** >85% for all countries
- **Feature Usage:** Country-specific features used by >70% of users
- **Time to Value:** <2 days from signup to first compliance tracked
- **Retention:** Country-specific retention matches or exceeds India baseline

---

## 12. Configuration Management

### 12.1 Country Configuration Structure

```typescript
// lib/countries/config/base.ts
export interface CountryConfig {
  code: string
  name: string
  region: 'APAC' | 'GCC' | 'NA' | 'EU'
  currency: {
    code: string
    symbol: string
  }
  financialYear: {
    type: 'FY' | 'CY'
    startMonth: number // 1-12
  }
  dateFormat: string
  timezone: string
  labels: {
    registrationId: string // 'CIN', 'Trade License', 'EIN', etc.
    taxId: string
    directorId?: string
    state?: string
    postalCode: string
  }
  fields: {
    registration: boolean
    tax?: boolean
    director?: boolean
  }
  validation: {
    registration?: boolean
    director?: boolean
  }
  compliance: {
    defaultCategories: string[]
    authorities: {
      tax?: string
      corporate?: string
      labor?: string
      // ...
    }
  }
  onboarding: {
    documentTypes: string[]
    entityTypes: string[]
    industryCategories: string[]
  }
  isActive: boolean
}
```

### 12.2 Environment-Specific Configuration

```typescript
// lib/countries/config/environment.ts
export const COUNTRY_FEATURE_FLAGS = {
  IN: { enabled: true, beta: false },
  AE: { enabled: true, beta: false },
  SA: { enabled: true, beta: true }, // Beta for initial rollout
  OM: { enabled: true, beta: true },
  QA: { enabled: true, beta: true },
  BH: { enabled: true, beta: true },
  US: { enabled: true, beta: false },
}
```

---

## 13. Monitoring & Observability

### 13.1 Key Metrics to Track

**Country-Specific Metrics:**
- Number of companies per country
- Compliance templates loaded per country
- API verification success rate per country
- Error rate by country
- User activity by country

**Performance Metrics:**
- Query performance by country filter
- Currency conversion latency
- Template loading time
- Validation response time

### 13.2 Logging Strategy

```typescript
// lib/monitoring/country-logger.ts
export function logCountryOperation(
  operation: string,
  countryCode: string,
  metadata?: Record<string, any>
) {
  logger.info('country_operation', {
    operation,
    country_code: countryCode,
    timestamp: new Date().toISOString(),
    ...metadata
  })
}
```

---

## 14. Future Enhancements

### 14.1 Additional Countries

The modular architecture makes adding new countries straightforward:

1. Create country config file
2. Implement validators
3. Create compliance templates
4. Add API clients (if needed)
5. Register in country registry
6. Test and deploy

**Target Countries for Future:**
- United Kingdom (GB)
- Singapore (SG)
- Australia (AU)
- Canada (CA)

### 14.2 Advanced Features

- **Multi-Country Companies:** Support companies operating in multiple countries
- **Cross-Country Compliance:** Track compliances that span multiple jurisdictions
- **Regional Reporting:** Aggregate reports across GCC, APAC regions
- **Currency Conversion:** Real-time exchange rates for financial reporting
- **Localization:** Full UI translation for each country
- **Country-Specific Workflows:** Custom workflows per country

---

## 15. Conclusion

This modularization plan transforms the Finacra AI compliance tracking platform from an India-focused application into a truly multi-country platform. By implementing a country-first architecture with:

- **Isolated country modules** for easy maintenance
- **Configuration-driven behavior** for rapid country addition
- **Backward compatibility** to preserve existing functionality
- **Comprehensive testing** to ensure quality
- **Phased rollout** to minimize risk

The platform will be able to:
- ✅ Support 7 countries (India + 5 GCC + USA) initially
- ✅ Scale to additional countries with minimal effort
- ✅ Maintain high code quality and performance
- ✅ Provide excellent user experience across all countries
- ✅ Enable rapid feature development per country

**Next Steps:**
1. Review and approve this plan
2. Assign team members to each phase
3. Begin Phase 1 implementation
4. Set up project tracking and milestones
5. Schedule regular review meetings

---

## Appendix A: Country-Specific Requirements

### India (IN)
- **Registration ID:** CIN (Corporate Identification Number)
- **Tax ID:** PAN, GST
- **Director ID:** DIN
- **Financial Year:** April to March (FY)
- **Key Authorities:** MCA, CBIC, SEBI, ESIC
- **Verification Method:** ✅ **API Available** (CIN/DIN verification via MCA V3)
- **Verification Portal:** MCA V3 Portal

### UAE (AE)
- **Registration ID:** Trade License Number
- **Tax ID:** VAT Registration Number
- **Financial Year:** Calendar Year (CY)
- **Key Authorities:** DED, FTA
- **Verification Method:** ⚠️ **Manual Verification** (Format validation only)
- **Verification Portal:** DED Portal (Emirate-specific, e.g., https://www.ded.ae/)

### Saudi Arabia (SA)
- **Registration ID:** Commercial Registration (CR)
- **Tax ID:** VAT Registration
- **Financial Year:** Calendar Year (CY)
- **Key Authorities:** MOCI, GAZT (now ZATCA)
- **Verification Method:** ⚠️ **Manual Verification** (Format validation only)
- **Verification Portal:** MOC Portal (https://mc.gov.sa/)

### Oman (OM)
- **Registration ID:** Commercial Registration
- **Tax ID:** Tax Card Number
- **Financial Year:** Calendar Year (CY)
- **Key Authorities:** MOCIIP, TAX Authority
- **Verification Method:** ⚠️ **Manual Verification** (Format validation only)
- **Verification Portal:** MOCIIP Portal (https://www.moc.gov.om/)

### Qatar (QA)
- **Registration ID:** Commercial Registration
- **Tax ID:** Tax Identification Number
- **Financial Year:** Calendar Year (CY)
- **Key Authorities:** MOCI, GTA
- **Verification Method:** ⚠️ **Manual Verification** (Format validation only)
- **Verification Portal:** MOCI Portal (https://www.moci.gov.qa/)

### Bahrain (BH)
- **Registration ID:** Commercial Registration (CR)
- **Tax ID:** VAT Registration
- **Financial Year:** Calendar Year (CY)
- **Key Authorities:** MOIC, NBR
- **Verification Method:** ⚠️ **Manual Verification** (Format validation only)
- **Verification Portal:** MOIC Portal (https://www.moic.gov.bh/)

### USA (US)
- **Registration ID:** EIN (Employer Identification Number)
- **Tax ID:** EIN, State Tax ID
- **Financial Year:** Calendar Year (CY)
- **Key Authorities:** IRS, State Tax Authorities, SEC
- **Verification Method:** ⚠️ **Manual Verification** (Format validation only)
- **Verification Portal:** IRS Website (https://www.irs.gov/businesses/small-businesses-self-employed/employer-id-numbers)

---

## Appendix B: Database Migration Scripts

See separate migration files:
- `migration-add-countries-table.sql`
- `migration-add-country-codes.sql`
- `migration-country-config-tables.sql`

---

## Appendix C: Code Examples

See code repository for complete implementations:
- Country registry: `lib/countries/index.ts`
- Country factory: `lib/countries/factory.ts`
- Validators: `lib/countries/validators/`
- API clients: `lib/countries/api/`

---

**Document End**

*This plan is a living document and will be updated as implementation progresses and new requirements emerge.*