/**
 * System folder taxonomy — single source of truth for the five top-level
 * categories and their nested system sub-folders. Applied per-company at
 * company creation + on-demand when an existing company hasn't been
 * migrated yet. User-created folders live alongside these but can never
 * have `kind = "system"`.
 *
 * Slugs are stable machine identifiers used for routing + the agent's
 * suggestedFolderSlug output. Display names can be renamed per company
 * in a future iteration; today they are immutable.
 */

export interface SystemFolderDef {
  slug: string
  name: string
  children?: SystemFolderDef[]
}

export const SYSTEM_TAXONOMY: SystemFolderDef[] = [
  {
    slug: 'constitutional',
    name: 'Constitutional Documents',
    children: [
      { slug: 'moa',                 name: 'MOA' },
      { slug: 'aoa',                 name: 'AOA' },
      { slug: 'coi',                 name: 'COI' },
      { slug: 'pan',                 name: 'PAN' },
      { slug: 'tan',                 name: 'TAN' },
      { slug: 'share-certificates',  name: 'Share Certificates' },
      { slug: 'din-certificates',    name: 'DIN Certificates' },
    ],
  },
  { slug: 'licences', name: 'Licences' },
  {
    slug: 'statutory-compliances',
    name: 'Statutory Compliances',
    children: [
      { slug: 'advance-tax', name: 'Advance Tax' },
      { slug: 'tds',         name: 'TDS (Tax Deducted at Source)' },
      { slug: 'itr',         name: 'ITR Computation & Acknowledgement' },
      { slug: 'tax-audit',   name: 'Tax Audit' },
      { slug: 'gst',         name: 'GST' },
    ],
  },
  { slug: 'financials',  name: 'Financials' },
  { slug: 'mca-filings', name: 'MCA Filings' },
]

// ── Legacy folder_name → new system-folder slug mapping ───────────────────
// Used during the one-shot migration from CompanyDocument.folder_name
// (free-text string) to CompanyDocument.folder_id (FK). Unmatched values
// fall back to the top-level "Financials" or "Licences" bucket depending
// on the prefix — safe default that a user/agent can correct later.

export const LEGACY_FOLDER_MAP: Record<string, string> = {
  // Historical names from lib/compliance/csv-template.ts + seeds
  'Constitutional Documents':     'constitutional',
  'Constitutional Docs':          'constitutional',
  'MOA':                          'moa',
  'AOA':                          'aoa',
  'COI':                          'coi',
  'Certificate of Incorporation': 'coi',
  'PAN':                          'pan',
  'TAN':                          'tan',
  'Share Certificates':           'share-certificates',
  'DIN Certificates':             'din-certificates',

  'Licences':                     'licences',
  'Licenses':                     'licences',
  'License':                      'licences',
  'Trade License':                'licences',

  'Statutory Compliances':        'statutory-compliances',
  'Statutory Compliance':         'statutory-compliances',
  'Tax Returns':                  'statutory-compliances',
  'Advance Tax':                  'advance-tax',
  'TDS':                          'tds',
  'TDS Returns':                  'tds',
  'TDS Certificates':             'tds',
  'ITR':                          'itr',
  'Income Tax Returns':           'itr',
  'Income Tax':                   'itr',
  'Tax Audit':                    'tax-audit',
  'GST':                          'gst',
  'GST Returns':                  'gst',

  'Financials':                   'financials',
  'Financial Statements':         'financials',
  'Annual Report':                'financials',
  'Payroll':                      'financials',
  // Legacy top-level card names from the old DocumentsTab
  'Financials and licenses':      'financials',
  'Financials & licenses':        'financials',

  'Taxation & GST Compliance':    'statutory-compliances',
  'Tax Compliance':               'statutory-compliances',

  'MCA Filings':                  'mca-filings',
  'ROC Filings':                  'mca-filings',
  'Compliance':                   'mca-filings',
  'Regulatory & MCA Filings':     'mca-filings',
  'Regulatory Filings':           'mca-filings',
}
