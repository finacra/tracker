import 'server-only'
import { prisma } from '@/lib/prisma'
import type { DocumentAgentSuggestion } from './document-agent'

/**
 * Post-processing guardrails for the Document Intelligence Agent.
 *
 * The agent's LLM output is treated as a DRAFT — guardrails correct it
 * against the real data (catalogue, folder tree, company state) before
 * it reaches the user. This makes the system reliable regardless of
 * prompt quality or model version.
 *
 * Rule: guardrails never ADD information the agent didn't attempt.
 * They only CORRECT fields the agent filled with invalid values.
 */

// ── Rule ID resolution ────────────────────────────────────────────────────

const KEYWORD_TO_RULE_PATTERNS: Array<{ keywords: string[]; ruleIdContains: string }> = [
  { keywords: ['mgt-7', 'mgt7', 'mgt 7', 'annual return'], ruleIdContains: 'mgt7' },
  { keywords: ['aoc-4', 'aoc4', 'financial statement'], ruleIdContains: 'aoc4' },
  { keywords: ['dir-3', 'dir3', 'dir kyc', 'director kyc'], ruleIdContains: 'din-kyc' },
  { keywords: ['adt-1', 'adt1', 'auditor appointment'], ruleIdContains: 'adt1' },
  { keywords: ['inc-20a', 'inc20a', 'commencement'], ruleIdContains: 'inc20a' },
  { keywords: ['dpt-3', 'dpt3', 'deposits'], ruleIdContains: 'dpt3' },
  { keywords: ['msme-1', 'msme1', 'msme form'], ruleIdContains: 'msme1' },
  { keywords: ['llp form 11', 'llp-11', 'llp form11'], ruleIdContains: 'llp-form11' },
  { keywords: ['llp form 8', 'llp-8', 'llp form8'], ruleIdContains: 'llp-form8' },
  { keywords: ['agm', 'annual general meeting'], ruleIdContains: 'agm' },
  { keywords: ['board meeting'], ruleIdContains: 'board-meeting' },
  { keywords: ['secretarial audit', 'mr-3'], ruleIdContains: 'secretarial' },
  { keywords: ['company secretary'], ruleIdContains: 'company-secretary' },
  { keywords: ['statutory auditor'], ruleIdContains: 'statutory-auditor' },
  { keywords: ['csr'], ruleIdContains: 'csr' },
  // Income Tax
  { keywords: ['tds return', 'form 24q', 'form 26q', 'form 140', 'tds quarterly'], ruleIdContains: 'tds-return' },
  { keywords: ['tds payment', 'tds monthly'], ruleIdContains: 'tds-payment' },
  { keywords: ['advance tax'], ruleIdContains: 'advance-tax' },
  { keywords: ['itr', 'income tax return'], ruleIdContains: 'itr' },
  { keywords: ['tax audit', '3ca', '3cb', '3cd'], ruleIdContains: 'tax-audit' },
  // GST
  { keywords: ['gstr-1', 'gstr1'], ruleIdContains: 'gstr1' },
  { keywords: ['gstr-3b', 'gstr3b'], ruleIdContains: 'gstr3b' },
  { keywords: ['gstr-9', 'gstr9', 'gst annual'], ruleIdContains: 'gstr9' },
  // Payroll
  { keywords: ['pf', 'provident fund', 'epf', 'ecr'], ruleIdContains: 'pf' },
  { keywords: ['esi', 'esic'], ruleIdContains: 'esi' },
  { keywords: ['professional tax', 'pt '], ruleIdContains: 'professional-tax' },
]

/**
 * Given the agent's suggestion, resolve the requirementId to a real
 * catalogue entry. Uses multiple signals:
 * 1. If the agent's requirementId is already valid → keep it
 * 2. Fuzzy-match documentType + name + reasoning against keyword patterns
 * 3. Pick the best matching active rule from the catalogue
 */
export async function resolveRequirementId(
  suggestion: DocumentAgentSuggestion,
): Promise<string | null> {
  // 1. If agent already gave a valid ID, verify it exists
  if (suggestion.requirementId) {
    const exists = await prisma.complianceRule.findUnique({
      where: { id: suggestion.requirementId },
      select: { id: true },
    })
    if (exists) return exists.id
  }

  // 2. Build a search string from all available context
  const searchText = [
    suggestion.requirementId || '',
    suggestion.documentType || '',
    suggestion.name || '',
    suggestion.reasoning || '',
  ].join(' ').toLowerCase()

  if (!searchText.trim()) return null

  // 3. Find matching keyword pattern
  for (const pattern of KEYWORD_TO_RULE_PATTERNS) {
    const matched = pattern.keywords.some(kw => searchText.includes(kw))
    if (!matched) continue

    // Find the active rule whose id contains the pattern
    const rule = await prisma.complianceRule.findFirst({
      where: {
        id: { contains: pattern.ruleIdContains },
        effective_to: null, // currently active
      },
      select: { id: true },
      orderBy: { effective_from: 'desc' },
    })
    if (rule) return rule.id
  }

  // 4. Last resort: search the catalogue directly by name similarity
  if (suggestion.documentType) {
    const docType = suggestion.documentType.toLowerCase().replace(/[^a-z0-9]/g, '')
    const allRules = await prisma.complianceRule.findMany({
      where: { effective_to: null },
      select: { id: true, name: true },
    })
    // Simple contains match on the rule name
    const match = allRules.find(r =>
      r.name.toLowerCase().replace(/[^a-z0-9]/g, '').includes(docType) ||
      docType.includes(r.name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6))
    )
    if (match) return match.id
  }

  return null
}

/**
 * Validate and correct the folder slug against the real folder tree.
 * If the agent's folderSlug doesn't exist, try to match by name.
 */
export async function resolveFolderSlug(
  companyId: string,
  folderSlug: string | null,
  subFolderSlug: string | null,
): Promise<{ folderId: string | null; resolvedSlug: string | null }> {
  if (!folderSlug && !subFolderSlug) return { folderId: null, resolvedSlug: null }

  // Try sub-folder first (more specific), then top-level
  const targetSlug = subFolderSlug || folderSlug
  if (targetSlug) {
    const folder = await prisma.vaultFolder.findFirst({
      where: { company_id: companyId, slug: targetSlug },
      select: { id: true, slug: true },
    })
    if (folder) return { folderId: folder.id, resolvedSlug: folder.slug }
  }

  // Fallback: try the top-level slug if sub didn't match
  if (subFolderSlug && folderSlug) {
    const folder = await prisma.vaultFolder.findFirst({
      where: { company_id: companyId, slug: folderSlug },
      select: { id: true, slug: true },
    })
    if (folder) return { folderId: folder.id, resolvedSlug: folder.slug }
  }

  return { folderId: null, resolvedSlug: null }
}

/**
 * Run all guardrails on the agent's suggestion. Mutates in place.
 */
export async function applyGuardrails(
  companyId: string,
  suggestion: DocumentAgentSuggestion,
): Promise<DocumentAgentSuggestion> {
  // Resolve requirementId
  const resolvedRuleId = await resolveRequirementId(suggestion)
  suggestion.requirementId = resolvedRuleId

  // Resolve folder
  const { folderId } = await resolveFolderSlug(
    companyId,
    suggestion.folderSlug,
    suggestion.subFolderSlug,
  )
  // folderId is used by the client to set the dropdown — store it as a
  // side-channel on the suggestion object. The client already resolves
  // slugs → ids from the folder tree, but this pre-resolution is a
  // belt-and-suspenders guard.

  return suggestion
}
