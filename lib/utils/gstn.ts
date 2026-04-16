/**
 * GSTN (Goods & Services Tax Number) Utility
 *
 * GSTN structure (15 characters):
 *   [2 state code][10 PAN][1 entity number][1 Z][1 checksum]
 *
 * Example: 27AAAAA0000A1Z5
 *   - State: 27 (Maharashtra)
 *   - PAN: AAAAA0000A
 *   - Entity: 1 (first registration in this state)
 *   - Default: Z
 *   - Checksum: 5
 */

// ── State Code Mapping ────────────────────────────────────────────────────

const STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '25': 'Daman & Diu',
  '26': 'Dadra & Nagar Haveli',
  '27': 'Maharashtra',
  '28': 'Andhra Pradesh (old)',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman & Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
}

// ── Types ─────────────────────────────────────────────────────────────────

export interface GSTNInfo {
  gstn: string
  stateCode: string
  stateName: string
  pan: string
  entityNumber: string
  checkCharacter: string
  checksum: string
}

// ── Core Functions ────────────────────────────────────────────────────────

const GSTN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/

/**
 * Validate a GSTN format (15-character alphanumeric).
 */
export function validateGSTN(gstn: string): boolean {
  if (!gstn || gstn.length !== 15) return false
  return GSTN_REGEX.test(gstn.toUpperCase())
}

/**
 * Parse a GSTN into its component parts.
 */
export function parseGSTN(gstn: string): GSTNInfo | null {
  const upper = (gstn || '').toUpperCase().trim()
  if (!validateGSTN(upper)) return null

  const stateCode = upper.slice(0, 2)
  const pan = upper.slice(2, 12)
  const entityNumber = upper.slice(12, 13)
  const checkCharacter = upper.slice(13, 14)
  const checksum = upper.slice(14, 15)
  const stateName = STATE_CODES[stateCode] || 'Unknown'

  return {
    gstn: upper,
    stateCode,
    stateName,
    pan,
    entityNumber,
    checkCharacter,
    checksum,
  }
}

/**
 * Extract PAN number from GSTN (characters 3-12).
 */
export function extractPANFromGSTN(gstn: string): string | null {
  const info = parseGSTN(gstn)
  return info ? info.pan : null
}

/**
 * Get state info from GSTN.
 */
export function getStateFromGSTN(gstn: string): { code: string; name: string } | null {
  const info = parseGSTN(gstn)
  return info ? { code: info.stateCode, name: info.stateName } : null
}

/**
 * Get the entity registration number within a state (13th digit).
 * "1" means first registration, "2" second, etc.
 */
export function getEntityNumberFromGSTN(gstn: string): number | null {
  const info = parseGSTN(gstn)
  if (!info) return null
  const num = parseInt(info.entityNumber, 36) // Can be 1-9 or A-Z (base 36)
  return isNaN(num) ? null : num
}

/**
 * Given multiple GSTNs, group them by state and return a summary.
 */
export function summarizeGSTNsByState(gstns: string[]): Array<{
  stateCode: string
  stateName: string
  count: number
  gstns: string[]
}> {
  const stateMap = new Map<string, { stateName: string; gstns: string[] }>()

  for (const gstn of gstns) {
    const info = parseGSTN(gstn)
    if (!info) continue
    const existing = stateMap.get(info.stateCode)
    if (existing) {
      existing.gstns.push(info.gstn)
    } else {
      stateMap.set(info.stateCode, { stateName: info.stateName, gstns: [info.gstn] })
    }
  }

  return Array.from(stateMap.entries())
    .map(([stateCode, data]) => ({
      stateCode,
      stateName: data.stateName,
      count: data.gstns.length,
      gstns: data.gstns,
    }))
    .sort((a, b) => a.stateName.localeCompare(b.stateName))
}
