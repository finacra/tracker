// Entity Detection Utility based on CIN API data

export interface CINCompanyData {
  companyType?: string
  classOfCompany?: string
  companyCategory?: string
  companySubcategory?: string
  companyOrigin?: string
  dateOfIncorporation?: string
  statusUnderCIRP?: string
  llpStatus?: string
  CIN?: string
  cin?: string
  company?: string
}

export interface EntityDetectionResult {
  entityType: string
  entitySubType: string
  industryPrimary: string
  industrySecondary: string
  natureOfBusiness: string
  companyStage: string
  ownershipType: string
  riskStatus: string
  confidenceScore: 'High' | 'Medium' | 'Low'
}

/**
 * Extract NIC code from CIN (5 digits after first letter)
 */
export function extractNICCode(cin: string): string {
  if (!cin || cin.length < 6) return ''
  const nicMatch = cin.match(/^[A-Z](\d{5})/)
  return nicMatch ? nicMatch[1] : ''
}

/**
 * Detect entity type from companyType
 */
function detectEntityType(companyType?: string): string {
  if (!companyType) return 'Unknown'
  
  if (companyType === 'LLP') return 'LLP'
  if (companyType === 'Company') return 'Company'
  
  return 'Unknown'
}

/**
 * Detect entity sub-type from companyCategory and classOfCompany
 */
function detectEntitySubType(
  companyType?: string,
  companyCategory?: string,
  classOfCompany?: string
): string {
  // For LLPs, return "LLP" directly
  if (companyType === 'LLP') {
    return 'LLP'
  }
  
  if (companyCategory?.includes('Company limited by guarantee')) {
    return 'NGO / Section 8'
  }
  
  if (classOfCompany === 'Private') {
    return 'Private Limited'
  }
  
  if (classOfCompany === 'Public') {
    return 'Public Limited'
  }
  
  return 'Other'
}

/**
 * Map NIC code to primary industry
 * Falls back to company name analysis if no NIC code
 */
function mapNICToPrimaryIndustry(nicCode: string, companyName?: string): string {
  if (nicCode && nicCode.length >= 2) {
    const nicPrefix = parseInt(nicCode.substring(0, 2), 10)
    
    // Agriculture, forestry, fishing (01-03)
    if (nicPrefix >= 1 && nicPrefix <= 3) return 'Other'
    
    // Mining and quarrying (05-09)
    if (nicPrefix >= 5 && nicPrefix <= 9) return 'Other'
    
    // Food Manufacturing (10-12)
    if (nicPrefix >= 10 && nicPrefix <= 12) return 'Food Manufacturing'
    
    // Manufacturing (13-33)
    if (nicPrefix >= 13 && nicPrefix <= 33) return 'Manufacturing'
    
    // Electricity, gas, steam (35)
    if (nicPrefix === 35) return 'Other'
    
    // Water supply, sewerage, waste (36-39)
    if (nicPrefix >= 36 && nicPrefix <= 39) return 'Other'
    
    // Construction (41-43)
    if (nicPrefix >= 41 && nicPrefix <= 43) return 'Construction'
    
    // Retail & Trading (45-47)
    if (nicPrefix >= 45 && nicPrefix <= 47) return 'Retail & Trading'
    
    // Transportation and storage (49-53)
    if (nicPrefix >= 49 && nicPrefix <= 53) return 'Other'
    
    // Accommodation (55)
    if (nicPrefix === 55) return 'Food & Hospitality'
    
    // Food & Hospitality (56)
    if (nicPrefix === 56) return 'Food & Hospitality'
    
    // Publishing, media, telecom (58-61)
    if (nicPrefix >= 58 && nicPrefix <= 61) return 'IT & Technology Services'
    
    // IT & Technology Services (62-63)
    if (nicPrefix === 62 || nicPrefix === 63) return 'IT & Technology Services'
    
    // Finance (64-66)
    if (nicPrefix >= 64 && nicPrefix <= 66) return 'Finance'
    
    // Real Estate (68)
    if (nicPrefix === 68) return 'Real Estate'
    
    // Professional Services (69-75)
    if (nicPrefix >= 69 && nicPrefix <= 75) return 'Professional Services'
    
    // Administrative and support (77-82)
    if (nicPrefix >= 77 && nicPrefix <= 82) return 'Professional Services'
    
    // Education (85)
    if (nicPrefix === 85) return 'Education'
    
    // Healthcare (86-88)
    if (nicPrefix >= 86 && nicPrefix <= 88) return 'Healthcare'
    
    // Arts, entertainment, sports, recreation (90-93)
    if (nicPrefix >= 90 && nicPrefix <= 93) return 'Other'
    
    // Other service activities (94-96)
    if (nicPrefix >= 94 && nicPrefix <= 96) return 'Other'
    
    // Ecommerce / information service activities (63 already covered above)
    // Activities of households as employers (97-98)
    if (nicPrefix >= 97 && nicPrefix <= 98) return 'Other'
  }
  
  // Fallback to company name analysis if no NIC code
  if (companyName) {
    const nameLower = companyName.toLowerCase()
    
    // IT & Technology keywords
    const techKeywords = ['ai', 'artificial intelligence', 'tech', 'technology', 'software', 'digital', 'cyber', 'data', 'cloud', 'r&d', 'research', 'development', 'innovation', 'it', 'information technology', 'saas', 'app', 'platform', 'internet', 'web', 'mobile']
    if (techKeywords.some(kw => nameLower.includes(kw))) {
      return 'IT & Technology Services'
    }
    
    // Ecommerce keywords
    const ecomKeywords = ['ecommerce', 'e-commerce', 'marketplace', 'online store', 'online retail', 'd2c', 'direct to consumer']
    if (ecomKeywords.some(kw => nameLower.includes(kw))) {
      return 'Ecommerce'
    }
    
    // Healthcare keywords
    const healthKeywords = ['health', 'medical', 'hospital', 'clinic', 'pharma', 'care', 'diagnostic', 'wellness', 'biotech', 'life science']
    if (healthKeywords.some(kw => nameLower.includes(kw))) {
      return 'Healthcare'
    }
    
    // Education keywords
    const eduKeywords = ['education', 'school', 'college', 'university', 'academy', 'institute', 'training', 'learning', 'edtech']
    if (eduKeywords.some(kw => nameLower.includes(kw))) {
      return 'Education'
    }
    
    // Finance keywords
    const financeKeywords = ['finance', 'financial', 'bank', 'capital', 'investment', 'wealth', 'asset', 'fintech', 'lending', 'insurance', 'nbfc']
    if (financeKeywords.some(kw => nameLower.includes(kw))) {
      return 'Finance'
    }
    
    // Real Estate keywords
    const realEstateKeywords = ['real estate', 'property', 'construction', 'builders', 'infrastructure', 'housing', 'estate', 'realty']
    if (realEstateKeywords.some(kw => nameLower.includes(kw))) {
      return 'Real Estate'
    }
    
    // Manufacturing keywords
    const mfgKeywords = ['manufacturing', 'production', 'factory', 'industrial', 'steel', 'textile', 'chemical', 'engineering']
    if (mfgKeywords.some(kw => nameLower.includes(kw))) {
      return 'Manufacturing'
    }
    
    // Retail keywords
    const retailKeywords = ['retail', 'trading', 'trade', 'wholesale', 'distributor', 'merchant', 'store', 'shop']
    if (retailKeywords.some(kw => nameLower.includes(kw))) {
      return 'Retail & Trading'
    }
    
    // Food keywords
    const foodKeywords = ['food', 'foods', 'restaurant', 'restaurants', 'cafe', 'café', 'bakery', 'bakeries', 'catering', 'hospitality', 'hotel', 'hotels', 'dining', 'beverage', 'beverages']
    if (foodKeywords.some(kw => nameLower.includes(kw))) {
      // Check if it's more likely food manufacturing or hospitality
      if (nameLower.includes('manufacturing') || nameLower.includes('production') || nameLower.includes('factory')) {
        return 'Food Manufacturing'
      }
      return 'Food & Hospitality'
    }
    
    // Professional services keywords
    const profKeywords = ['consulting', 'consultancy', 'advisory', 'legal', 'law firm', 'chartered', 'accounting', 'audit']
    if (profKeywords.some(kw => nameLower.includes(kw))) {
      return 'Professional Services'
    }
  }
  
  return 'Other'
}

/**
 * Determine nature of business from NIC code
 */
function detectNatureOfBusiness(nicCode: string): string {
  if (!nicCode || nicCode.length < 2) return 'Services'
  
  const nicPrefix = parseInt(nicCode.substring(0, 2), 10)
  
  // Manufacturing (10-33)
  if (nicPrefix >= 10 && nicPrefix <= 33) return 'Manufacturing'
  
  // Trading (45-47)
  if (nicPrefix >= 45 && nicPrefix <= 47) return 'Trading'
  
  return 'Services'
}

/**
 * Calculate company stage based on incorporation date
 */
function detectCompanyStage(dateOfIncorporation?: string): string {
  if (!dateOfIncorporation) return 'Unknown'
  
  try {
    // Handle MM/DD/YYYY format
    let date: Date
    if (dateOfIncorporation.includes('/')) {
      const parts = dateOfIncorporation.split('/')
      if (parts.length === 3) {
        date = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]))
      } else {
        date = new Date(dateOfIncorporation)
      }
    } else {
      date = new Date(dateOfIncorporation)
    }
    
    if (isNaN(date.getTime())) return 'Unknown'
    
    const currentYear = new Date().getFullYear()
    const incorporationYear = date.getFullYear()
    const years = currentYear - incorporationYear
    
    if (years < 3) return 'Early-stage'
    if (years <= 10) return 'Growth'
    return 'Established'
  } catch {
    return 'Unknown'
  }
}

/**
 * Detect ownership type from companySubcategory
 */
function detectOwnershipType(companySubcategory?: string): string {
  if (companySubcategory?.includes('Government company')) {
    return 'Government / PSU'
  }
  return 'Private / Non-Government'
}

/**
 * Detect risk status from statusUnderCIRP and llpStatus
 */
function detectRiskStatus(
  statusUnderCIRP?: string,
  llpStatus?: string,
  entityType?: string
): string {
  if (statusUnderCIRP === 'Y') {
    return 'Under CIRP'
  }
  
  // For LLPs, check llpStatus
  if (entityType === 'LLP' && llpStatus && llpStatus !== 'Active') {
    return 'Inactive'
  }
  
  return 'Active'
}

/**
 * Main entity detection function
 */
export function detectEntity(companyData: CINCompanyData, hasCIN: boolean = true): EntityDetectionResult {
  const cin = companyData.CIN || companyData.cin || ''
  const nicCode = extractNICCode(cin)
  
  console.log('Entity Detection Input:', {
    companyType: companyData.companyType,
    companyCategory: companyData.companyCategory,
    classOfCompany: companyData.classOfCompany,
    company: companyData.company,
    cin,
    nicCode
  })
  
  const entityType = detectEntityType(companyData.companyType)
  const entitySubType = detectEntitySubType(
    companyData.companyType,
    companyData.companyCategory,
    companyData.classOfCompany
  )
  
  const industryPrimary = mapNICToPrimaryIndustry(nicCode, companyData.company)
  
  console.log('Entity Detection Output:', {
    entityType,
    entitySubType,
    industryPrimary,
    nicCode: nicCode || 'No NIC code (using name analysis)'
  })
  
  // Secondary industry: same as primary for NGO/Section 8, otherwise empty
  const industrySecondary = entitySubType === 'NGO / Section 8' 
    ? industryPrimary 
    : ''
  
  const natureOfBusiness = detectNatureOfBusiness(nicCode)
  const companyStage = detectCompanyStage(companyData.dateOfIncorporation)
  const ownershipType = detectOwnershipType(companyData.companySubcategory)
  const riskStatus = detectRiskStatus(
    companyData.statusUnderCIRP,
    companyData.llpStatus,
    entityType
  )
  
  // Confidence score
  const confidenceScore: 'High' | 'Medium' | 'Low' = hasCIN 
    ? 'High' 
    : 'Low'
  
  return {
    entityType,
    entitySubType,
    industryPrimary,
    industrySecondary,
    natureOfBusiness,
    companyStage,
    ownershipType,
    riskStatus,
    confidenceScore,
  }
}

/**
 * Map entitySubType to form companyType value
 */
export function mapEntitySubTypeToFormValue(entitySubType: string): string {
  // Values must match the form's <option> value generation:
  // entityType.toLowerCase().replace(/\s+/g, '-')
  // India entityTypes: 'Private Limited', 'Public Limited', 'LLP', 'Partnership', 'Sole Proprietorship'
  const mapping: Record<string, string> = {
    'Private Limited': 'private-limited',
    'Public Limited': 'public-limited',
    'LLP': 'llp',
    'NGO / Section 8': 'ngo-/-section-8',
    'Other': '', // Return empty for Other to allow manual selection
  }
  return mapping[entitySubType] || ''
}

/**
 * Map industryPrimary to form industry value
 */
export function mapIndustryToFormValue(industryPrimary: string): string {
  const mapping: Record<string, string> = {
    'Education': 'education',
    'Healthcare': 'healthcare',
    'IT & Technology Services': 'technology',
    'Finance': 'finance',
    'Real Estate': 'real-estate',
    'Construction': 'real-estate',
    'Manufacturing': 'manufacturing',
    'Retail & Trading': 'retail',
    'Food & Hospitality': 'retail',
    'Professional Services': 'consulting',
  }
  return mapping[industryPrimary] || 'other'
}

/**
 * Map industryPrimary to industry categories
 */
export function mapIndustryToCategories(industryPrimary: string, entitySubType: string): string[] {
  const categories: string[] = []
  
  // Always add NGO category if it's an NGO
  if (entitySubType === 'NGO / Section 8') {
    categories.push('NGOs & Section 8 Companies')
  }
  
  // Map primary industry to categories
  const industryMapping: Record<string, string[]> = {
    'Education': ['Healthcare & Education'],
    'Healthcare': ['Healthcare & Education'],
    'IT & Technology Services': ['IT & Technology Services'],
    'Real Estate': ['Real Estate & Construction'],
    'Construction': ['Real Estate & Construction'],
    'Manufacturing': ['Retail & Manufacturing'],
    'Retail & Trading': ['Retail & Manufacturing'],
    'Food Manufacturing': ['Food & Hospitality'],
    'Food & Hospitality': ['Food & Hospitality'],
    'Ecommerce': ['Ecommerce & D2C'],
    'Professional Services': ['IT & Technology Services'], // Professional services often tech-related
  }
  
  if (industryMapping[industryPrimary]) {
    categories.push(...industryMapping[industryPrimary])
  } else if (industryPrimary && industryPrimary !== 'Other') {
    // Industry has no matching category — select 'Other' so the user sees the API value
    categories.push('Other')
  }
  
  // For LLPs with tech-related names, add IT & Technology Services if not already added
  if (entitySubType === 'LLP' && industryPrimary === 'IT & Technology Services' && !categories.includes('IT & Technology Services')) {
    categories.push('IT & Technology Services')
  }
  
  return [...new Set(categories)] // Remove duplicates
}
