/**
 * Shared review-question registry used by the tracker's evaluation panel
 * and (historically) the filing register. Lifted out so both paths
 * render the same inline prompts for low-confidence assessments.
 */

export interface ReviewQuestion {
  question: string
  factKind: string
  unit: string
  placeholder: string
}

export const TRIGGER_QUESTIONS: Record<string, ReviewQuestion> = {
  rent_payment_above: {
    question: 'What is the highest monthly rent you pay to any single landlord?',
    factKind: 'rent.monthly_payment',
    unit: 'rupees_per_month',
    placeholder: 'e.g. 22000',
  },
  contractor_payment_above: {
    question: 'What is the largest single payment to any contractor this FY?',
    factKind: 'contractor.annual_spend',
    unit: 'rupees_per_year',
    placeholder: 'e.g. 50000',
  },
  professional_fee_above: {
    question: 'Total professional/technical fees paid to any single payee this FY?',
    factKind: 'contractor.annual_spend',
    unit: 'rupees_per_year',
    placeholder: 'e.g. 30000',
  },
  turnover_above: {
    question: 'What is your annual turnover?',
    factKind: 'turnover.annual',
    unit: 'rupees_per_year',
    placeholder: 'e.g. 10000000',
  },
  employee_count_above: {
    question: 'How many employees do you have?',
    factKind: 'headcount.total',
    unit: 'count',
    placeholder: 'e.g. 15',
  },
  net_worth_above: {
    question: "What is your company's net worth (in ₹)?",
    factKind: 'net_worth.total',
    unit: 'rupees',
    placeholder: 'e.g. 50000000',
  },
  salary_above: {
    question: 'Total annual salary bill?',
    factKind: 'salary.annual_bill',
    unit: 'rupees_per_year',
    placeholder: 'e.g. 1200000',
  },
}

/**
 * Map a rule name + category to the question we should ask when its
 * trigger_kind is 'always' — otherwise every "always" rule would show
 * up as a yes/no confirm instead of collecting useful data.
 */
export function inferQuestionFromRuleName(ruleName: string, category: string): ReviewQuestion | null {
  const n = ruleName.toLowerCase()
  if (n.includes('rent') && n.includes('tds')) return TRIGGER_QUESTIONS.rent_payment_above
  if (n.includes('contractor') && n.includes('tds')) return TRIGGER_QUESTIONS.contractor_payment_above
  if ((n.includes('professional') || n.includes('194j')) && n.includes('tds')) return TRIGGER_QUESTIONS.professional_fee_above
  if (n.includes('tds') && (n.includes('return') || n.includes('payment'))) {
    return {
      question: 'Do you deduct any TDS this FY? (If yes, enter the total TDS amount)',
      factKind: 'tds.annual_total',
      unit: 'rupees_per_year',
      placeholder: 'e.g. 50000 (or 0 if none)',
    }
  }
  if (n.includes('advance tax')) {
    return {
      question: 'Your estimated annual tax liability this FY (advance tax applies if > ₹10,000)',
      factKind: 'tax.estimated_liability',
      unit: 'rupees_per_year',
      placeholder: 'e.g. 200000',
    }
  }
  if (n.includes('itr')) {
    return {
      question: 'What is your annual turnover? (determines ITR form type)',
      factKind: 'turnover.annual',
      unit: 'rupees_per_year',
      placeholder: 'e.g. 10000000',
    }
  }
  if (n.includes('tax audit')) {
    return {
      question: 'Annual turnover? (Tax audit applies > ₹1Cr for business, > ₹50L for profession)',
      factKind: 'turnover.annual',
      unit: 'rupees_per_year',
      placeholder: 'e.g. 10000000',
    }
  }
  if (n.includes('gstr') || n.includes('gst')) {
    return {
      question: 'Your monthly aggregate turnover (₹)',
      factKind: 'turnover.monthly',
      unit: 'rupees_per_month',
      placeholder: 'e.g. 500000',
    }
  }
  if (category === 'Payroll' || n.includes('pf') || n.includes('provident')) {
    return TRIGGER_QUESTIONS.employee_count_above
  }
  if (n.includes('esi')) {
    return {
      question: 'How many employees earn ≤ ₹21,000/month?',
      factKind: 'esi.eligible_employees',
      unit: 'count',
      placeholder: 'e.g. 5 (or 0)',
    }
  }
  if (n.includes('professional tax') || n.includes('pt ')) {
    return {
      question: 'Number of employees in this state',
      factKind: 'headcount.state',
      unit: 'count',
      placeholder: 'e.g. 10',
    }
  }
  if (category === 'RoC' && (n.includes('aoc') || n.includes('mgt'))) {
    return null
  }
  if (n.includes('csr')) {
    return {
      question: 'Net profit for last 3 years average (₹ crores). CSR applies if ≥ ₹5 Cr profit or ₹500 Cr turnover.',
      factKind: 'net_profit.3yr_average',
      unit: 'rupees_per_year',
      placeholder: 'e.g. 50000000',
    }
  }
  return null
}

export const KEY_FACT_KINDS = [
  'rent.monthly_payment',
  'contractor.annual_spend',
  'headcount.total',
  'turnover.annual',
]
