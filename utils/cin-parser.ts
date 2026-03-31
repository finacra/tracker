import { NIC_CODE_MAP, type NicSubclass } from '@/data/nic-codes';

// CIN structure: L 17110 MH 1973 PLC 019786
//                ^  ^^^^ ^^  ^^^^  ^^^  ^^^^^^
//                |  NIC  St  Year Type  Serial
//                Listed/Unlisted

export const STATE_CODES: Record<string, string> = {
  AN: 'Andaman and Nicobar Islands',
  AP: 'Andhra Pradesh',
  AR: 'Arunachal Pradesh',
  AS: 'Assam',
  BR: 'Bihar',
  CH: 'Chandigarh',
  CG: 'Chhattisgarh',
  CT: 'Chhattisgarh',
  DN: 'Dadra and Nagar Haveli',
  DD: 'Daman and Diu',
  DL: 'Delhi',
  GA: 'Goa',
  GJ: 'Gujarat',
  HR: 'Haryana',
  HP: 'Himachal Pradesh',
  JK: 'Jammu and Kashmir',
  JH: 'Jharkhand',
  KA: 'Karnataka',
  KL: 'Kerala',
  LD: 'Lakshadweep',
  MP: 'Madhya Pradesh',
  MH: 'Maharashtra',
  MN: 'Manipur',
  ML: 'Meghalaya',
  MZ: 'Mizoram',
  NL: 'Nagaland',
  OD: 'Odisha',
  OR: 'Odisha',
  PY: 'Puducherry',
  PB: 'Punjab',
  RJ: 'Rajasthan',
  SK: 'Sikkim',
  TN: 'Tamil Nadu',
  TG: 'Telangana',
  TR: 'Tripura',
  UP: 'Uttar Pradesh',
  UK: 'Uttarakhand',
  WB: 'West Bengal',
};

export const COMPANY_TYPES: Record<string, string> = {
  PLC: 'Public Limited Company',
  PTC: 'Private Limited Company',
  FLC: 'Foreign Company (Listed)',
  FTC: 'Foreign Company',
  GOI: 'Government of India Company',
  NPL: 'Non-Profit Limited Company',
  OPC: 'One Person Company',
  SGC: 'State Government Company',
  ULC: 'Unlimited Liability Company',
  GAP: 'General Association Private',
  GAT: 'General Association Public',
};

export interface ParsedCIN {
  raw: string;
  isValid: boolean;
  isListed: boolean | null;
  nicCode: string | null;
  nicDetails: NicSubclass | null;
  stateCode: string | null;
  stateName: string | null;
  yearOfIncorporation: number | null;
  companyTypeCode: string | null;
  companyTypeName: string | null;
  serialNumber: string | null;
  errors: string[];
}

const CIN_REGEX = /^([LU])(\d{5})([A-Z]{2})(\d{4})([A-Z]{2,4})(\d{6})$/;

export function parseCIN(cin: string): ParsedCIN {
  const raw = cin.trim().toUpperCase();
  const errors: string[] = [];

  const empty: ParsedCIN = {
    raw,
    isValid: false,
    isListed: null,
    nicCode: null,
    nicDetails: null,
    stateCode: null,
    stateName: null,
    yearOfIncorporation: null,
    companyTypeCode: null,
    companyTypeName: null,
    serialNumber: null,
    errors,
  };

  if (!raw) {
    errors.push('CIN is empty');
    return empty;
  }

  const match = raw.match(CIN_REGEX);
  if (!match) {
    errors.push('Invalid CIN format. Expected: L/U + 5-digit NIC + 2-letter state + 4-digit year + company type + 6-digit serial (e.g. L17110MH1973PLC019786)');
    return empty;
  }

  const [, status, nicCode, stateCode, yearStr, companyTypeCode, serialNumber] = match;

  const isListed = status === 'L';
  const year = parseInt(yearStr, 10);
  let nicDetails = NIC_CODE_MAP[nicCode] ?? null;
  const stateName = STATE_CODES[stateCode] ?? null;
  const companyTypeName = COMPANY_TYPES[companyTypeCode] ?? null;

  const warnings: string[] = [];
  if (!nicDetails) {
    // Fallback: find any code in the same division to get division/section info
    const divisionCode = nicCode.substring(0, 2);
    const ref = Object.values(NIC_CODE_MAP).find(c => c.divisionCode === divisionCode);
    if (ref) {
      nicDetails = {
        code: nicCode,
        description: `NIC sub-class ${nicCode} (not in NIC 2008 directory)`,
        classCode: nicCode.substring(0, 4),
        className: ref.className,
        groupCode: nicCode.substring(0, 3),
        groupName: ref.groupName,
        divisionCode: ref.divisionCode,
        divisionName: ref.divisionName,
        section: ref.section,
        sectionName: ref.sectionName,
      };
      warnings.push(`Exact NIC sub-class ${nicCode} not in directory — showing division-level classification`);
    } else {
      warnings.push(`NIC code ${nicCode} not found in NIC 2008 classification`);
    }
  }
  if (!stateName) {
    warnings.push(`Unknown state code: ${stateCode}`);
  }
  if (year < 1850 || year > new Date().getFullYear()) {
    warnings.push(`Unusual year of incorporation: ${year}`);
  }

  return {
    raw,
    isValid: true, // CIN regex matched — structurally valid
    isListed,
    nicCode,
    nicDetails,
    stateCode,
    stateName,
    yearOfIncorporation: year,
    companyTypeCode,
    companyTypeName,
    serialNumber,
    errors: warnings,
  };
}

// Convenience: extract just the NIC subclass from a CIN
export function getNicFromCIN(cin: string): NicSubclass | null {
  return parseCIN(cin).nicDetails;
}
