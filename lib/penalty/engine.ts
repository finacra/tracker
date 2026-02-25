/**
 * Penalty Engine - Structured penalty calculation
 * 
 * Handles penalty_config JSONB from the database and computes
 * calculated penalties based on days delayed and base amounts.
 */

// ============================================
// TYPES
// ============================================

export type PenaltyType = 'daily' | 'flat' | 'interest' | 'percentage' | 'composite' | 'range' | 'per_invoice';

export interface DailyPenaltyConfig {
  type: 'daily';
  rate: number;           // Amount per day
  nil_rate?: number;      // Reduced rate for NIL returns
  cap?: number;           // Maximum cap (absolute amount)
  cap_type?: 'percentage'; // If cap is a percentage
  cap_rate?: number;      // Cap percentage rate
  cap_base?: string;      // Base for percentage cap (e.g., 'turnover')
}

export interface FlatPenaltyConfig {
  type: 'flat';
  amount: number;
  reduced_amount?: number;        // Reduced amount for certain conditions
  reduced_condition?: string;     // Condition for reduced amount
}

export interface InterestPenaltyConfig {
  type: 'interest';
  rate: number;           // Interest rate (e.g., 1.5 for 1.5%)
  period: 'day' | 'month' | 'year';
  base: string;           // Base amount type (e.g., 'tax_due', 'turnover', 'contribution')
}

export interface PercentagePenaltyConfig {
  type: 'percentage';
  rate: number;           // Percentage rate
  rate_min?: number;      // Minimum rate (for range-based)
  rate_max?: number;      // Maximum rate (for range-based)
  base: string;           // Base amount type
  cap?: number;           // Maximum cap amount
}

export interface RangePenaltyConfig {
  type: 'range';
  min: number;
  max: number;
}

export interface PerInvoicePenaltyConfig {
  type: 'per_invoice';
  rate: number;           // Percentage of tax
  base: string;           // Base for percentage
  min_per_invoice: number; // Minimum per invoice
}

export interface CompositePenaltyConfig {
  type: 'composite';
  parts: PenaltyConfig[];
}

export type PenaltyConfig =
  | DailyPenaltyConfig
  | FlatPenaltyConfig
  | InterestPenaltyConfig
  | PercentagePenaltyConfig
  | RangePenaltyConfig
  | PerInvoicePenaltyConfig
  | CompositePenaltyConfig;

export interface CompanyFinancials {
  turnover?: number;
  tax_due?: number;
  local_contributions?: Record<string, number>;
  income?: number;
}

export interface PenaltyResult {
  success: boolean;
  amount?: number;
  display: string;
  needs_amount?: string;      // Which base amount is needed (e.g., 'tax_due', 'turnover')
  breakdown?: string[];       // Breakdown of composite penalties
  warning?: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format amount in Indian Rupees (legacy function - maintained for backward compatibility)
 * @deprecated Use formatCurrency with countryCode parameter instead
 */
export function formatINR(amount: number): string {
  return formatCurrency(amount, 'IN')
}

/**
 * Format currency amount with country-specific symbol and locale
 * Backward compatible: defaults to INR if countryCode not provided
 */
export function formatCurrency(
  amount: number,
  countryCode: string = 'IN'
): string {
  // Import dynamically to avoid circular dependencies
  try {
    const { CountryFactory } = require('../countries/factory')
    const formatter = CountryFactory.getPenaltyFormatter(countryCode)
    return formatter.format(amount)
  } catch {
    // Fallback to INR if country module not available
    return `₹${Math.round(amount).toLocaleString('en-IN')}`
  }
}

/**
 * Get base amount from financials
 */
function getBaseAmount(base: string, financials: CompanyFinancials | null): number | null {
  if (!financials) return null;

  switch (base) {
    case 'turnover':
      return financials.turnover ?? null;
    case 'tax_due':
    case 'tax_amount':
      return financials.tax_due ?? null;
    case 'contribution':
    case 'pf_contribution':
      return financials.local_contributions?.pf_contribution ?? null;
    case 'esi_contribution':
      return financials.local_contributions?.esi_contribution ?? null;
    case 'income':
      return financials.income ?? null;
    default:
      return null;
  }
}

/**
 * Calculate daily penalty
 */
function calculateDailyPenalty(
  config: DailyPenaltyConfig,
  daysDelayed: number,
  financials: CompanyFinancials | null,
  isNilReturn: boolean = false,
  countryCode: string = 'IN'
): PenaltyResult {
  const rate = isNilReturn && config.nil_rate ? config.nil_rate : config.rate;
  let amount = rate * daysDelayed;

  // Handle absolute cap
  if (config.cap && !config.cap_type) {
    amount = Math.min(amount, config.cap);
  }

  // Handle percentage-based cap
  if (config.cap_type === 'percentage' && config.cap_rate && config.cap_base) {
    const baseAmount = getBaseAmount(config.cap_base, financials);
    if (baseAmount === null) {
      return {
        success: false,
        display: `Needs ${config.cap_base}`,
        needs_amount: config.cap_base,
        warning: `Cannot apply cap without ${config.cap_base}`
      };
    }
    const cap = (config.cap_rate / 100) * baseAmount;
    amount = Math.min(amount, cap);
  }

  return {
    success: true,
    amount,
    display: formatCurrency(amount, countryCode),
    breakdown: [`${formatCurrency(rate, countryCode)}/day × ${daysDelayed} days = ${formatCurrency(amount, countryCode)}`]
  };
}

/**
 * Calculate flat penalty
 */
function calculateFlatPenalty(
  config: FlatPenaltyConfig,
  financials: CompanyFinancials | null,
  countryCode: string = 'IN'
): PenaltyResult {
  let amount = config.amount;

  // Check for reduced amount condition
  if (config.reduced_amount && config.reduced_condition) {
    if (config.reduced_condition === 'income_under_5l') {
      if (financials?.income !== undefined && financials.income < 500000) {
        amount = config.reduced_amount;
      }
    }
  }

  return {
    success: true,
    amount,
    display: formatCurrency(amount, countryCode),
    breakdown: [`Fixed penalty: ${formatCurrency(amount, countryCode)}`]
  };
}

/**
 * Calculate interest penalty
 */
function calculateInterestPenalty(
  config: InterestPenaltyConfig,
  daysDelayed: number,
  financials: CompanyFinancials | null,
  baseAmountOverride?: number,
  countryCode: string = 'IN'
): PenaltyResult {
  const baseAmount = baseAmountOverride ?? getBaseAmount(config.base, financials);

  if (baseAmount === null) {
    return {
      success: false,
      display: `Needs ${config.base}`,
      needs_amount: config.base
    };
  }

  let periods: number;
  let periodLabel: string;

  switch (config.period) {
    case 'day':
      periods = daysDelayed;
      periodLabel = 'days';
      break;
    case 'month':
      periods = daysDelayed / 30;
      periodLabel = 'months';
      break;
    case 'year':
      periods = daysDelayed / 365;
      periodLabel = 'years';
      break;
    default:
      periods = daysDelayed / 30;
      periodLabel = 'months';
  }

  const amount = (config.rate / 100) * baseAmount * periods;

  return {
    success: true,
    amount,
    display: formatCurrency(amount, countryCode),
    breakdown: [
      `${config.rate}% p.${config.period[0]}. on ${formatCurrency(baseAmount, countryCode)}`,
      `= ${formatCurrency(amount, countryCode)} for ${periods.toFixed(2)} ${periodLabel}`
    ]
  };
}

/**
 * Calculate percentage penalty
 */
function calculatePercentagePenalty(
  config: PercentagePenaltyConfig,
  financials: CompanyFinancials | null,
  baseAmountOverride?: number,
  countryCode: string = 'IN'
): PenaltyResult {
  const baseAmount = baseAmountOverride ?? getBaseAmount(config.base, financials);

  if (baseAmount === null) {
    return {
      success: false,
      display: `Needs ${config.base}`,
      needs_amount: config.base
    };
  }

  // Use midpoint for range-based rates
  const rate = config.rate ?? ((config.rate_min ?? 0) + (config.rate_max ?? 0)) / 2;
  let amount = (rate / 100) * baseAmount;

  // Apply cap if specified
  if (config.cap) {
    amount = Math.min(amount, config.cap);
  }

  return {
    success: true,
    amount,
    display: formatCurrency(amount, countryCode),
    breakdown: [`${rate}% of ${formatCurrency(baseAmount, countryCode)} = ${formatCurrency(amount, countryCode)}`]
  };
}

/**
 * Calculate range penalty (uses minimum)
 */
function calculateRangePenalty(config: RangePenaltyConfig, countryCode: string = 'IN'): PenaltyResult {
  return {
    success: true,
    amount: config.min,
    display: `${formatCurrency(config.min, countryCode)} - ${formatCurrency(config.max, countryCode)}`,
    breakdown: [`Range: ${formatCurrency(config.min, countryCode)} to ${formatCurrency(config.max, countryCode)}`],
    warning: 'Showing minimum amount from range'
  };
}

/**
 * Calculate per-invoice penalty
 */
function calculatePerInvoicePenalty(
  config: PerInvoicePenaltyConfig,
  financials: CompanyFinancials | null,
  invoiceCount: number = 1,
  countryCode: string = 'IN'
): PenaltyResult {
  const baseAmount = getBaseAmount(config.base, financials);

  if (baseAmount === null) {
    return {
      success: false,
      display: `Needs ${config.base}`,
      needs_amount: config.base
    };
  }

  const perInvoice = Math.max((config.rate / 100) * baseAmount, config.min_per_invoice);
  const amount = perInvoice * invoiceCount;

  return {
    success: true,
    amount,
    display: formatCurrency(amount, countryCode),
    breakdown: [`${config.rate}% of ${config.base} per invoice (min ${formatCurrency(config.min_per_invoice, countryCode)})`]
  };
}

/**
 * Calculate composite penalty (sum of parts)
 */
function calculateCompositePenalty(
  config: CompositePenaltyConfig,
  daysDelayed: number,
  financials: CompanyFinancials | null,
  baseAmountOverride?: number,
  countryCode: string = 'IN'
): PenaltyResult {
  let totalAmount = 0;
  const breakdown: string[] = [];
  const neededAmounts: string[] = [];

  for (const part of config.parts) {
    const result = computePenalty(part, daysDelayed, financials, baseAmountOverride, { countryCode });

    if (result.needs_amount) {
      neededAmounts.push(result.needs_amount);
    }

    if (result.success && result.amount !== undefined) {
      totalAmount += result.amount;
      if (result.breakdown) {
        breakdown.push(...result.breakdown);
      }
    }
  }

  // If any part needs an amount, return that
  if (neededAmounts.length > 0) {
    const uniqueNeeded = [...new Set(neededAmounts)];
    return {
      success: false,
      display: `Needs ${uniqueNeeded.join(', ')}`,
      needs_amount: uniqueNeeded[0],
      amount: totalAmount > 0 ? totalAmount : undefined,
      breakdown,
      warning: `Partial calculation - missing: ${uniqueNeeded.join(', ')}`
    };
  }

  return {
    success: true,
    amount: totalAmount,
    display: formatCurrency(totalAmount, countryCode),
    breakdown
  };
}

// ============================================
// MAIN COMPUTATION FUNCTION
// ============================================

/**
 * Compute penalty based on config, days delayed, and available financials
 * @param countryCode - Optional country code for currency formatting (defaults to 'IN' for backward compatibility)
 */
export function computePenalty(
  config: PenaltyConfig | null | undefined,
  daysDelayed: number,
  financials: CompanyFinancials | null = null,
  baseAmountOverride?: number,
  options: { isNilReturn?: boolean; invoiceCount?: number; countryCode?: string } = {}
): PenaltyResult {
  // No config or no delay
  if (!config) {
    return {
      success: false,
      display: 'No penalty config'
    };
  }

  if (daysDelayed <= 0) {
    return {
      success: true,
      amount: 0,
      display: 'No delay'
    };
  }

  const countryCode = options.countryCode || 'IN' // Default to 'IN' for backward compatibility

  switch (config.type) {
    case 'daily':
      return calculateDailyPenalty(config, daysDelayed, financials, options.isNilReturn, countryCode);

    case 'flat':
      return calculateFlatPenalty(config, financials, countryCode);

    case 'interest':
      return calculateInterestPenalty(config, daysDelayed, financials, baseAmountOverride, countryCode);

    case 'percentage':
      return calculatePercentagePenalty(config, financials, baseAmountOverride, countryCode);

    case 'range':
      return calculateRangePenalty(config, countryCode);

    case 'per_invoice':
      return calculatePerInvoicePenalty(config, financials, options.invoiceCount ?? 1, countryCode);

    case 'composite':
      return calculateCompositePenalty(config, daysDelayed, financials, baseAmountOverride, countryCode);

    default:
      return {
        success: false,
        display: 'Unknown penalty type'
      };
  }
}

/**
 * Parse penalty_config from database (handles JSON string or object)
 */
export function parsePenaltyConfig(configInput: unknown): PenaltyConfig | null {
  if (!configInput) return null;

  try {
    if (typeof configInput === 'string') {
      return JSON.parse(configInput) as PenaltyConfig;
    }
    return configInput as PenaltyConfig;
  } catch {
    console.error('Failed to parse penalty_config:', configInput);
    return null;
  }
}

/**
 * Generate a human-readable summary of the penalty config
 * @param countryCode - Optional country code for currency formatting (defaults to 'IN')
 */
export function getPenaltySummary(config: PenaltyConfig | null, countryCode: string = 'IN'): string {
  if (!config) return '-';

  switch (config.type) {
    case 'daily': {
      let summary = `${formatCurrency(config.rate, countryCode)}/day`;
      if (config.nil_rate) {
        summary += ` (NIL: ${formatCurrency(config.nil_rate, countryCode)}/day)`;
      }
      if (config.cap) {
        summary += ` (max ${formatCurrency(config.cap, countryCode)})`;
      }
      return summary;
    }

    case 'flat':
      return formatCurrency(config.amount, countryCode);

    case 'interest':
      return `${config.rate}% p.${config.period[0]}.`;

    case 'percentage':
      return `${config.rate}% of ${config.base}${config.cap ? ` (max ${formatCurrency(config.cap, countryCode)})` : ''}`;

    case 'range':
      return `${formatCurrency(config.min, countryCode)} - ${formatCurrency(config.max, countryCode)}`;

    case 'per_invoice':
      return `${config.rate}% per invoice (min ${formatCurrency(config.min_per_invoice, countryCode)})`;

    case 'composite':
      return config.parts.map(part => getPenaltySummary(part, countryCode)).join(' + ');

    default:
      return 'Complex penalty';
  }
}

// ============================================
// LEGACY TEXT PARSING (FALLBACK)
// ============================================

/**
 * Fallback: Calculate penalty from legacy text format
 * Used when penalty_config is not available
 * @param countryCode - Optional country code for currency formatting (defaults to 'IN' for backward compatibility)
 */
export function calculatePenaltyFromText(
  penaltyStr: string | null,
  daysDelayed: number,
  countryCode: string = 'IN'
): PenaltyResult {
  if (!penaltyStr || daysDelayed <= 0) {
    return { success: true, amount: 0, display: '-' };
  }

  const penalty = penaltyStr.trim();

  // Handle NULL
  if (penalty === 'NULL' || penalty === 'null' || penalty === '') {
    return { success: false, display: 'Refer to Act' };
  }

  // Simple daily rate: "50", "100", "200"
  if (/^\d+$/.test(penalty)) {
    const dailyRate = parseInt(penalty, 10);
    if (!isNaN(dailyRate) && dailyRate > 0) {
      const amount = dailyRate * daysDelayed;
      return { success: true, amount, display: formatCurrency(amount, countryCode) };
    }
  }

  // Complex format with daily rate and max cap: "100|500000"
  if (/^\d+\|\d+$/.test(penalty)) {
    const [dailyRateStr, maxCapStr] = penalty.split('|');
    const dailyRate = parseInt(dailyRateStr, 10);
    const maxCap = parseInt(maxCapStr, 10);

    if (!isNaN(dailyRate) && dailyRate > 0) {
      let calculated = dailyRate * daysDelayed;
      if (!isNaN(maxCap) && maxCap > 0) {
        calculated = Math.min(calculated, maxCap);
      }
      return { success: true, amount: calculated, display: formatINR(calculated) };
    }
  }

  // Complex format with base + daily: "500|5000|base"
  if (/^\d+\|\d+\|base$/.test(penalty)) {
    const [dailyRateStr, baseAmountStr] = penalty.split('|');
    const dailyRate = parseInt(dailyRateStr, 10);
    const baseAmount = parseInt(baseAmountStr, 10);

    if (!isNaN(dailyRate) && dailyRate > 0 && !isNaN(baseAmount) && baseAmount >= 0) {
      const calculated = baseAmount + (dailyRate * daysDelayed);
      return { success: true, amount: calculated, display: formatINR(calculated) };
    }
  }

  // Extract daily rate from text
  const dailyRatePatterns = [
    /(?:Rs\.?\s*|₹\s*)?([\d,]+(?:\.\d+)?)\s*(?:per\s*day|\/day)/i,
    /^([\d,]+(?:\.\d+)?)\s*(?:per\s*day|\/day)/i,
  ];

  for (const pattern of dailyRatePatterns) {
    const dailyMatch = penalty.match(pattern);
    if (dailyMatch) {
      const dailyRate = parseFloat(dailyMatch[1].replace(/,/g, ''));
      if (!isNaN(dailyRate) && dailyRate > 0) {
        let calculated = dailyRate * daysDelayed;

        // Check for max cap
        const maxPatterns = [
          /max\.?\s*(?:Rs\.?\s*|₹\s*)?([\d,]+)/i,
          /(?:Rs\.?\s*|₹\s*)([\d.]+)\s*(?:Lakh|L)\s*max/i,
        ];
        for (const maxPattern of maxPatterns) {
          const maxMatch = penalty.match(maxPattern);
          if (maxMatch) {
            let maxCap = parseFloat(maxMatch[1].replace(/,/g, ''));
            if (maxMatch[0].toLowerCase().includes('lakh')) {
              maxCap *= 100000;
            }
            if (!isNaN(maxCap) && maxCap > 0) {
              calculated = Math.min(calculated, maxCap);
            }
          }
        }

        return { success: true, amount: calculated, display: formatINR(calculated) };
      }
    }
  }

  // Interest/percentage based - needs amount
  if (/Interest\s*@?\s*[\d.]+%/i.test(penalty) || /[\d.]+%\s*p\.?a\.?/i.test(penalty)) {
    return { success: false, display: 'Needs tax amount', needs_amount: 'tax_due' };
  }

  if (/% of Turnover/i.test(penalty) || /% TO/i.test(penalty)) {
    return { success: false, display: 'Needs turnover', needs_amount: 'turnover' };
  }

  // Range penalties
  const rangeMatch = penalty.match(/(?:Rs\.?\s*)?([\d,]+)(?:k|L)?\s*(?:to|-)\s*(?:Rs\.?\s*)?([\d,]+)(?:k|L)?/i);
  if (rangeMatch) {
    let minAmount = parseFloat(rangeMatch[1].replace(/,/g, ''));
    if (rangeMatch[0].toLowerCase().includes('k')) minAmount *= 1000;
    if (rangeMatch[0].toLowerCase().includes('l')) minAmount *= 100000;

    if (!isNaN(minAmount) && minAmount > 0) {
      return {
        success: true,
        amount: minAmount,
        display: formatCurrency(minAmount, countryCode),
        warning: 'Showing minimum from range'
      };
    }
  }

  // As per Act references
  if (/as per.*Act/i.test(penalty) || /as per.*guidelines/i.test(penalty)) {
    return { success: false, display: 'Refer to Act' };
  }

  return { success: false, display: 'Cannot calculate' };
}
