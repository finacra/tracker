'use server'

import { createAdminClient } from '@/utils/supabase/admin'
import { createServerContainer } from '@/lib/composition/server-container'
import { processDocumentContent } from '@/lib/utils/document-processor'
import { validateCompanyId, sanitizeStringInput, isValidUUID } from '@/lib/utils/input-validation'
import { handleActionError } from '@/lib/errors/handle-error'
import { prisma } from '@/lib/prisma'
import { validateGSTN, parseGSTN } from '@/lib/utils/gstn'
import { recordOnboardingFacts } from '@/lib/compliance/facts'
import { ensureSystemFolders } from '@/lib/vault/folders'

async function requireCurrentUser() {
  const { authService } = createServerContainer()
  return authService.requireCurrentUser()
}

interface DirectorInput {
  firstName: string
  lastName: string
  middleName?: string
  din?: string
  designation?: string
  dob?: string
  pan?: string
  email?: string
  mobile?: string
  verified?: boolean
  source?: 'cin' | 'din' | 'manual'
}

export async function completeOnboarding(
  formData: {
    companyName: string
    companyType: string
    panNumber?: string
    cinNumber: string
    industries: string[]
    address: string
    city: string
    state: string
    pinCode: string
    phoneNumber?: string
    email?: string
    landline?: string
    other?: string
    dateOfIncorporation: string
    industryCategories: string[]
    otherIndustryCategory?: string
    yearType?: 'FY' | 'CY'
    countryCode?: string
    companyStage?: string
    confidenceScore?: string
    documents: Array<{ type: string; path: string; name: string }>
    exDirectors?: string
    // Compliance intelligence fields
    employeeCount?: string
    annualTurnover?: string
    isGstRegistered?: boolean
    gstNumber?: string
    gstRegistrations?: Array<{ gstin: string; state: string }>
    netWorth?: string
    isMsme?: string
    msmeCategory?: string
    hasImportsExports?: boolean
    isStartupDpiit?: boolean
    // CIN API fields (auto-populated)
    authorisedCapital?: string
    paidUpCapital?: string
    subscribedCapital?: string
    companyCategory?: string
    companySubcategory?: string
    classOfCompany?: string
    rocName?: string
    companyStatus?: string
    dateOfLastAgm?: string
    balanceSheetDate?: string
  },
  directors: DirectorInput[]
) {
  // Top-level try/catch so every failure path returns a structured
  // error instead of throwing. The onboarding client's submit handler
  // previously had no else-branch for {success: false}, so any
  // thrown error produced a silent "button stops spinning" UX.
  // Throwing also bypasses handleActionError's logging path.
  console.log('[completeOnboarding] enter', {
    companyName: formData.companyName,
    countryCode: formData.countryCode,
    directorCount: directors?.length ?? 0,
    docCount: (formData as any).documents?.length ?? 0,
  })
  try {
  const {
    companyRepository,
    companyMembershipRepository,
    directorRepository,
    documentRepository,
    subscriptionRepository
  } = createServerContainer()
  const user = await requireCurrentUser()

  // Get region from country code
  const { getCountryConfig } = await import('@/lib/config/countries')
  const countryConfig = getCountryConfig(formData.countryCode || 'IN')
  const region = countryConfig?.region || 'APAC'

  // For Indian companies, extract NIC code and listing status from CIN
  let nicCode: string | null = null
  let isListed: boolean | null = null
  if ((formData.countryCode || 'IN') === 'IN' && formData.cinNumber) {
    const { parseCIN } = await import('@/utils/cin-parser')
    const parsed = parseCIN(formData.cinNumber)
    if (parsed.nicCode) nicCode = parsed.nicCode
    if (parsed.isListed !== null) isListed = parsed.isListed
  }

  // 1. Insert Company
  // For backward compatibility, set industry to first industry from industries array
  const firstIndustry = formData.industries.length > 0 ? formData.industries[0] : null

  // Parse ex-directors: split by comma or newline, trim, and filter empty strings
  const exDirectorsArray = formData.exDirectors
    ? formData.exDirectors
      .split(/[,\n]/)
      .map((name: string) => name.trim())
      .filter((name: string) => name.length > 0)
    : null

  // PAN is required for Indian companies — downstream tax-compliance rules
  // (ITR, TDS returns, advance tax instalments) all key off it. The client
  // form enforces this already; the server re-enforces to prevent API-level
  // bypass and to surface a clear error rather than a cryptic constraint
  // failure later.
  const trimmedPan = (formData.panNumber || '').trim()
  if ((formData.countryCode || 'IN') === 'IN' && !trimmedPan) {
    throw new Error('PAN is required for Indian companies')
  }

  let company
  try {
  company = await companyRepository.create({
    userId: user.id,
    appUserId: user.canonicalId,
    name: formData.companyName,
    type: formData.companyType,
    taxId: trimmedPan || null,
    registrationId: formData.cinNumber,
    industry: firstIndustry,
    industries: formData.industries.length > 0 ? formData.industries : null,
    industryCategories: formData.industryCategories,
    otherIndustryCategory: formData.otherIndustryCategory || null,
    incorporationDate: formData.dateOfIncorporation,
    address: formData.address,
    city: formData.city,
    state: formData.state,
    pinCode: formData.pinCode,
    phoneNumber: formData.phoneNumber || null,
    email: formData.email || null,
    landline: formData.landline || null,
    otherInfo: formData.other || null,
    stage: formData.companyStage || null,
    confidenceScore: formData.confidenceScore || null,
    yearType: formData.yearType || 'FY',
    countryCode: formData.countryCode || 'IN',
    region: region,
    exDirectors: exDirectorsArray,
    nicCode,
    isListed,
    employeeCount: formData.employeeCount ? parseInt(formData.employeeCount, 10) : null,
    annualTurnover: formData.annualTurnover ? parseFloat(formData.annualTurnover) : null,
    isGstRegistered: formData.isGstRegistered ?? null,
    gstNumber: formData.gstNumber || null,
    netWorth: formData.netWorth ? parseFloat(formData.netWorth) : null,
    isMsme: formData.isMsme === 'yes' ? true : formData.isMsme === 'no' ? false : null,
    msmeCategory: formData.msmeCategory || null,
    hasImportsExports: formData.hasImportsExports ?? null,
    isStartupDpiit: formData.isStartupDpiit ?? null,
    authorisedCapital: formData.authorisedCapital ? parseFloat(formData.authorisedCapital) : null,
    paidUpCapital: formData.paidUpCapital ? parseFloat(formData.paidUpCapital) : null,
    subscribedCapital: formData.subscribedCapital ? parseFloat(formData.subscribedCapital) : null,
    companyCategory: formData.companyCategory || null,
    companySubcategory: formData.companySubcategory || null,
    classOfCompany: formData.classOfCompany || null,
    rocName: formData.rocName || null,
    companyStatus: formData.companyStatus || null,
    dateOfLastAgm: formData.dateOfLastAgm || null,
    balanceSheetDate: formData.balanceSheetDate || null,
  })
  } catch (createErr) {
    // Re-throw so the outer try/catch (added at function top) returns
    // the raw error message. handleActionError redacts to a generic
    // "Something went wrong" in production, which made every company-
    // creation failure look identical and un-diagnosable.
    console.error('[completeOnboarding] company create failed',
      createErr instanceof Error ? createErr.message : String(createErr),
      createErr instanceof Error ? createErr.stack : '')
    throw createErr
  }

  // 1a. Persist GSTIN registrations — one row per GSTIN, with state stamped
  // at save time (derived from the GSTIN's first two digits when available,
  // otherwise taken verbatim from the form). Invalid/blank entries are
  // silently dropped so an empty repeater row doesn't block the submit.
  const normalizedGstRegistrations = (formData.gstRegistrations || [])
    .map((reg) => {
      const gstin = (reg.gstin || '').toUpperCase().trim()
      if (!gstin) return null
      const derivedState = parseGSTN(gstin)?.stateName
      return { gstin, state: (reg.state || derivedState || '').trim() || null }
    })
    .filter((r): r is { gstin: string; state: string | null } => r !== null && validateGSTN(r.gstin))

  if (normalizedGstRegistrations.length > 0) {
    await prisma.gstRegistration.createMany({
      data: normalizedGstRegistrations.map((r) => ({
        company_id: company.id,
        gstin: r.gstin,
        state: r.state,
      })),
      skipDuplicates: true,
    })
  }

  // 1b. Assign admin role to the company creator
  try {
    // For Passport users, use app_user_id (user.id) and set user_id to NULL
    await companyMembershipRepository.addRole(
      user.id,
      company.id,
      'admin',
      user.id // Pass user.id as app_user_id for Passport users
    )
  } catch (roleError) {
    console.error('Role assignment error:', roleError)
    // Don't throw - the company owner can still access via user_id on companies table
  }

  // 1d. Seed the five system top-level folders + their nested sub-folders
  // (PRD §2.2 / §3.1). Idempotent; safe to call again later if a company
  // onboarded before this rollout.
  try {
    await ensureSystemFolders(company.id)
  } catch (folderErr) {
    console.error('[onboarding] Vault folder seed failed (non-fatal):', folderErr instanceof Error ? folderErr.message : folderErr)
  }

  // 1c. Record declared facts into the fact store so the new applicability
  // engine can reason over them alongside document-extracted evidence.
  // Non-blocking — a failure here must not prevent company creation.
  try {
    await recordOnboardingFacts({
      companyId: company.id,
      createdBy: user.id,
      employeeCount: formData.employeeCount ? parseInt(formData.employeeCount, 10) : null,
      annualTurnoverRupees: formData.annualTurnover
        ? Math.round(parseFloat(formData.annualTurnover) * 100000) // form collects lakhs
        : null,
      netWorthRupees: formData.netWorth
        ? Math.round(parseFloat(formData.netWorth) * 10000000) // form collects crores
        : null,
      isGstRegistered: formData.isGstRegistered ?? null,
      isMsme: formData.isMsme === 'yes' ? true : formData.isMsme === 'no' ? false : null,
      msmeCategory: formData.msmeCategory || null,
      hasImportsExports: formData.hasImportsExports ?? null,
      isStartupDpiit: formData.isStartupDpiit ?? null,
    })
  } catch (factErr) {
    // Non-fatal but loud: a silent swallow here is exactly what made
    // intake re-prompt for users who DID fill onboarding — facts never
    // landed and refreshIntakeStatus correctly reported needsIntake=true.
    // Log full stack so the failure mode is debuggable next time.
    console.error('[onboarding] recordOnboardingFacts failed (non-fatal, but intake will re-prompt):',
      factErr instanceof Error ? factErr.message : factErr,
      factErr instanceof Error ? factErr.stack : '')
  }

  // 2. Insert Directors
  if (directors.length > 0) {
    await directorRepository.createMany(
      directors.map((dir) => ({
        companyId: company.id,
        firstName: dir.firstName,
        lastName: dir.lastName,
        middleName: dir.middleName || null,
        din: dir.din || null,
        designation: dir.designation || null,
        dob: dir.dob || null,
        pan: dir.pan || null,
        email: dir.email || null,
        mobile: dir.mobile || null,
        isVerified: dir.verified || false,
        source: dir.source || 'manual'
      }))
    )
  }

  // 3. Insert document metadata into internal table
  if (formData.documents.length > 0) {
    const templates = await documentRepository.getTemplateMappings()
    const insertedDocs = await documentRepository.createCompanyDocuments(
      formData.documents.map((doc: { type: string; path: string; name: string }) => {
        const template = templates.find(t => t.documentName === doc.type)
        // We deliberately do NOT call generateEmbedding here. It used to
        // run inside this Promise.all and added 500ms-2s per document on
        // the critical path of company creation — which the user notices
        // as a 30-second wait. The "embedding" of just `type + name` is
        // useless metadata anyway (not the actual document content), and
        // PrismaDocumentRepository.createCompanyDocuments doesn't even
        // persist the embedding field. The real, document-content-based
        // embeddings are generated below by processDocumentContent, which
        // already runs as a fire-and-forget background task.
        return {
          companyId: company.id,
          documentType: doc.type,
          filePath: doc.path,
          fileName: doc.name,
          folderName: template?.folderName || 'Constitutional Documents',
          registrationDate: formData.dateOfIncorporation,
          frequency: template?.defaultFrequency || 'annually',
          embedding: null,
        }
      })
    )

    // Background process: Extract text content from each PDF for AI understanding
    if (insertedDocs) {
      for (const doc of insertedDocs) {
        // We don't await this so the user doesn't wait for parsing
        processDocumentContent(doc.id, company.id, doc.filePath).catch(err =>
          console.error(`Async processing failed for ${doc.id}:`, err)
        )

        // Smart-ingest queue: PAN / GST / COI / MOA-AOA / etc. cert
        // images get OCR'd and parsed for entity facts (PAN number,
        // GSTN, CIN, incorporation date, authorized capital). Those
        // facts back-fill `company_facts` with `confidence=0.7,
        // sourceKind=document_extracted` while the user-typed values
        // already in `company_facts` carry `confidence=1.0,
        // sourceKind=user_declared` — the reader prefers typed on
        // conflict, so OCR fills gaps without overriding correct
        // entries. Fire-and-forget; failure logs but doesn't block
        // onboarding completion.
        const { enqueueIngestJob } = await import('@/lib/compliance/ingest-worker')
        enqueueIngestJob({
          documentId: doc.id,
          companyId: company.id,
          source: 'onboarding',
        }).catch(err => {
          console.error(`Onboarding ingest enqueue failed for ${doc.id}:`,
            err instanceof Error ? err.message : err)
        })
      }
    }
  }

  // 4. Ensure company has either trial or subscription.
  // If user doesn't have a subscription, automatically create a trial
  // for this company. We track whether the resulting state gives the
  // user active access so the client can skip the /subscribe gate
  // and land them directly on /data-room.
  let companyHasActiveAccess = false
  try {
    const [companySubData, userSubData] = await Promise.all([
      subscriptionRepository.getCompanySubscriptionState(company.id),
      subscriptionRepository.getUserSubscriptionState(user.id),
    ])

    const companyHasSubscription = companySubData?.hasSubscription === true
    const userHasSubscription = userSubData?.hasSubscription === true
    const userTier = userSubData?.tier ?? null
    const isEnterprise = userTier === 'enterprise'

    // Logic:
    // - Enterprise tier: User-level subscription/trial covers ALL companies (don't create company-level trial)
    // - Starter/Professional tiers: Each company needs its own subscription/trial (create company-level trial)
    // - If user has no subscription: Create company-level trial for the new company
    if (!companyHasSubscription && !isEnterprise) {
      try {
        await subscriptionRepository.createCompanyTrial(user.id, company.id, user.canonicalId)
        companyHasActiveAccess = true  // trial just created → access granted
      } catch (error: unknown) {
        console.error('[completeOnboarding] Error creating trial:', error)
        // Don't throw - company is created, trial creation can be retried
        // User can manually start trial via subscribe page
      }
    }

    // Already-granted access (pre-existing company sub or enterprise
    // user sub covering all companies) should also skip the gate.
    if (companyHasSubscription || (isEnterprise && userHasSubscription)) {
      companyHasActiveAccess = true
    }
  } catch (trialErr) {
    console.error('[completeOnboarding] Error checking/creating trial:', trialErr)
    // Don't throw - company is created successfully
  }

  // Trigger AI compliance intelligence generation in the background
  // (non-blocking — company creation succeeds regardless)
  // Use formData values since CompanyRecord only has id/name
  if (nicCode) {
    const incorpDateParsed = formData.dateOfIncorporation ? new Date(formData.dateOfIncorporation) : null
    import('@/lib/services/compliance-intelligence').then(async ({ generateComplianceIntelligence }) => {
      // Wait briefly for the DB trigger to apply templates first
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Fetch template-applied requirements so AI skips them
      const { Prisma: PNS } = await import('@prisma/client')
      const { prisma: db } = await import('@/lib/prisma')
      const existingRows = await db.$queryRaw<any[]>(
        PNS.sql`SELECT category, requirement, compliance_type
          FROM regulatory_requirements
          WHERE company_id = ${company.id}::uuid`
      )
      const existingCompliances = (existingRows || []).map((r: any) => ({
        category: r.category as string,
        requirement: r.requirement as string,
        compliance_type: r.compliance_type as string | null,
      }))

      generateComplianceIntelligence({
        id: company.id,
        name: formData.companyName,
        type: formData.companyType ?? null,
        nic_code: nicCode ?? null,
        state: formData.state ?? null,
        is_listed: isListed ?? null,
        incorporation_date: incorpDateParsed,
        country_code: formData.countryCode ?? 'IN',
        industries: formData.industries ?? [],
        industry_categories: formData.industryCategories ?? [],
      }, existingCompliances).then(async (result) => {
        if (result.success && result.requirements.length > 0) {
          // Bulk insert AI-generated requirements (reuse PNS and db from above)
          for (const req of result.requirements) {
            const dueDateStr = req.due_date ? req.due_date.toISOString().split('T')[0] : null
            const requiredDocsJson = JSON.stringify(req.required_documents || [])
            await db.$queryRaw(
              PNS.sql`INSERT INTO regulatory_requirements (
                company_id, category, requirement, description, status, due_date, penalty,
                is_critical, compliance_type, entity_type, industry, industry_category,
                year_type, country_code, required_documents, source, confidence_score,
                needs_ca_review, source_url, act, section, authority, due_date_formula,
                applicability_reason, ai_batch_id, app_created_by, app_updated_by, created_at, updated_at
              ) VALUES (
                ${company.id}::uuid, ${req.category}::text, ${req.requirement}::text,
                ${req.description || null}::text, ${req.status}::text, ${dueDateStr}::date,
                ${req.penalty || null}::text, ${req.is_critical}::boolean,
                ${req.compliance_type || null}::text, ${req.entity_type || null}::text,
                ${req.industry || null}::text, ${req.industry_category || null}::text,
                ${req.year_type || 'FY'}::text, ${req.country_code || 'IN'}::text,
                ${requiredDocsJson}::jsonb, ${req.source}::text, ${req.confidence_score}::double precision,
                ${req.needs_ca_review}::boolean, ${req.source_url || null}::text,
                ${req.act || null}::text, ${req.section || null}::text, ${req.authority || null}::text,
                ${req.due_date_formula || null}::text, ${req.applicability_reason || null}::text,
                ${req.ai_batch_id || null}::text, ${user.id}::uuid, ${user.id}::uuid, NOW(), NOW()
              )`
            )
          }
          console.log(`[completeOnboarding] AI compliance: ${result.requirements.length} items generated for company ${company.id}`)
        }
      }).catch((err) => {
        console.error('[completeOnboarding] AI compliance generation error (non-blocking):', err)
      })
    }).catch(() => {
      // Module import failed — non-blocking
    })
  }

  console.log('[completeOnboarding] ok', { companyId: company.id, hasActiveAccess: companyHasActiveAccess })
  return { success: true, companyId: company.id, hasActiveAccess: companyHasActiveAccess }
  } catch (error) {
    // Surface raw error to the client so the onboarding form can show
    // a useful toast. In production handleActionError redacts, but the
    // stack still lands in Vercel runtime logs with the tag below.
    console.error('[completeOnboarding] threw',
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error.stack : '')
    return {
      success: false as const,
      error: error instanceof Error ? error.message : 'Company creation failed',
    }
  }
}

export async function updateCompany(
  companyId: string,
  formData: {
    companyName?: string
    companyType?: string
    panNumber?: string
    cinNumber?: string
    industries?: string[]
    address?: string
    city?: string
    state?: string
    pinCode?: string
    phoneNumber?: string
    email?: string
    landline?: string
    other?: string
    industryCategories?: string[]
    otherIndustryCategory?: string
    directors?: any[]
    exDirectors?: string
    // Compliance intelligence fields
    employeeCount?: string
    annualTurnover?: string
    isGstRegistered?: boolean
    gstNumber?: string
    gstRegistrations?: Array<{ gstin: string; state: string }>
    netWorth?: string
    isMsme?: string       // 'yes' | 'no' | ''
    msmeCategory?: string
    hasImportsExports?: boolean
    isStartupDpiit?: boolean
  }
) {
  // SECURITY: Validate companyId to prevent injection
  if (!validateCompanyId(companyId)) {
    throw new Error('Invalid company ID format')
  }

  const {
    companyRepository,
    directorRepository
  } = createServerContainer()
  const user = await requireCurrentUser()

  // Extract NIC code and listing status from CIN if available
  let nicCode: string | null | undefined = undefined
  let isListed: boolean | null | undefined = undefined
  if (formData.cinNumber) {
    const { parseCIN } = await import('@/utils/cin-parser')
    const parsed = parseCIN(formData.cinNumber)
    if (parsed.nicCode) nicCode = parsed.nicCode
    if (parsed.isListed !== null) isListed = parsed.isListed
  }

  // If the caller is explicitly updating PAN (string passed, even empty),
  // reject a blank value for Indian companies. Undefined = "no change", so
  // a partial update that doesn't touch PAN doesn't trigger this.
  if (typeof formData.panNumber === 'string') {
    const trimmed = formData.panNumber.trim()
    const existing = await companyRepository.getDetailsById(companyId)
    if (!trimmed && (existing?.countryCode || 'IN') === 'IN') {
      throw new Error('PAN is required for Indian companies')
    }
  }

  // Update Company in public schema
  const updateData: import('@/application/interfaces/CompanyRepository').UpdateCompanyInput = {
    name: formData.companyName,
    type: formData.companyType,
    taxId: formData.panNumber,
    industryCategories: formData.industryCategories,
    otherIndustryCategory: formData.otherIndustryCategory,
    address: formData.address,
    city: formData.city,
    state: formData.state,
    pinCode: formData.pinCode,
    phoneNumber: formData.phoneNumber,
    email: formData.email,
    landline: formData.landline,
    otherInfo: formData.other,
    // Compliance intelligence fields
    employeeCount: formData.employeeCount !== undefined
      ? (formData.employeeCount ? parseInt(formData.employeeCount, 10) || null : null)
      : undefined,
    annualTurnover: formData.annualTurnover !== undefined
      ? (formData.annualTurnover ? parseFloat(formData.annualTurnover) || null : null)
      : undefined,
    isGstRegistered: formData.isGstRegistered !== undefined ? formData.isGstRegistered : undefined,
    gstNumber: formData.gstNumber !== undefined ? (formData.gstNumber || null) : undefined,
    netWorth: formData.netWorth !== undefined
      ? (formData.netWorth ? parseFloat(formData.netWorth) || null : null)
      : undefined,
    isMsme: formData.isMsme !== undefined
      ? (formData.isMsme === 'yes' ? true : formData.isMsme === 'no' ? false : null)
      : undefined,
    msmeCategory: formData.msmeCategory !== undefined ? (formData.msmeCategory || null) : undefined,
    hasImportsExports: formData.hasImportsExports !== undefined ? formData.hasImportsExports : undefined,
    isStartupDpiit: formData.isStartupDpiit !== undefined ? formData.isStartupDpiit : undefined,
    nicCode,
    isListed,
  }

  // Add industries if provided
  if (formData.industries !== undefined) {
    updateData.industries = formData.industries.length > 0 ? formData.industries : null
  }

  // Add ex-directors if provided
  if (formData.exDirectors !== undefined) {
    const exDirectorsArray = formData.exDirectors
      ? formData.exDirectors
        .split(/[,\n]/)
        .map((name: string) => name.trim())
        .filter((name: string) => name.length > 0)
      : null
    updateData.exDirectors = exDirectorsArray
  }

  try {
    await companyRepository.update(companyId, updateData)
  } catch (companyError) {
    console.error('Company update error:', companyError)
    throw new Error('Failed to update company')
  }

  // Refresh declared facts from the edited form. Only fields the caller
  // actually submitted are touched — `undefined` means "no change", so a
  // partial update never wipes an existing fact.
  try {
    await recordOnboardingFacts({
      companyId,
      createdBy: user.id,
      employeeCount: formData.employeeCount !== undefined
        ? (formData.employeeCount ? parseInt(formData.employeeCount, 10) : null)
        : undefined,
      annualTurnoverRupees: formData.annualTurnover !== undefined
        ? (formData.annualTurnover ? Math.round(parseFloat(formData.annualTurnover) * 100000) : null)
        : undefined,
      netWorthRupees: formData.netWorth !== undefined
        ? (formData.netWorth ? Math.round(parseFloat(formData.netWorth) * 10000000) : null)
        : undefined,
      isGstRegistered: formData.isGstRegistered,
      isMsme: formData.isMsme !== undefined
        ? (formData.isMsme === 'yes' ? true : formData.isMsme === 'no' ? false : null)
        : undefined,
      msmeCategory: formData.msmeCategory,
      hasImportsExports: formData.hasImportsExports,
      isStartupDpiit: formData.isStartupDpiit,
    })
  } catch (factErr) {
    console.error('[updateCompany] Fact refresh failed (non-fatal):', factErr instanceof Error ? factErr.message : factErr)
  }

  // Sync GST registrations if provided. Replace-all semantics: delete every
  // row for this company, then re-insert whatever the form submitted (after
  // validation + dedupe). Done sequentially because PgBouncer transaction
  // mode rejects interactive prisma.$transaction (CLAUDE.md §12).
  if (formData.gstRegistrations !== undefined) {
    const normalized = formData.gstRegistrations
      .map((reg) => {
        const gstin = (reg.gstin || '').toUpperCase().trim()
        if (!gstin) return null
        const derivedState = parseGSTN(gstin)?.stateName
        return { gstin, state: (reg.state || derivedState || '').trim() || null }
      })
      .filter((r): r is { gstin: string; state: string | null } => r !== null && validateGSTN(r.gstin))

    // Dedupe by gstin (last write wins)
    const byGstin = new Map<string, { gstin: string; state: string | null }>()
    for (const r of normalized) byGstin.set(r.gstin, r)

    await prisma.gstRegistration.deleteMany({ where: { company_id: companyId } })

    if (byGstin.size > 0) {
      await prisma.gstRegistration.createMany({
        data: Array.from(byGstin.values()).map((r) => ({
          company_id: companyId,
          gstin: r.gstin,
          state: r.state,
        })),
        skipDuplicates: true,
      })
    }
  }

  // Update directors if provided
  if (formData.directors !== undefined) {
    // First, delete all existing directors for this company
    try {
      await directorRepository.deleteByCompanyId(companyId)
    } catch (deleteError) {
      console.error('Director deletion error:', deleteError)
      // Don't throw - continue with insert
    }

    // Then insert the new directors
    if (formData.directors.length > 0) {
      try {
        await directorRepository.createMany(
          formData.directors.map((dir: any) => ({
            companyId: companyId,
            firstName: dir.firstName,
            lastName: dir.lastName,
            middleName: dir.middleName || null,
            din: dir.din || null,
            designation: dir.designation || null,
            dob: dir.dob || null,
            pan: dir.pan || null,
            email: dir.email || null,
            mobile: dir.mobile || null,
            isVerified: dir.verified || false,
            source: dir.source || 'manual'
          }))
        )
      } catch (dirError) {
        console.error('Director insertion error:', dirError)
        // Don't throw - company update succeeded
      }
    }
  }

  return { success: true }
}

// Get directors for a company
export async function getCompanyDirectors(companyId: string) {
  // SECURITY: Validate companyId to prevent injection
  if (!validateCompanyId(companyId)) {
    return { success: false, directors: [], error: 'Invalid company ID format' }
  }

  const { directorRepository } = createServerContainer()

  try {
    await requireCurrentUser()
  } catch {
    return { success: false, directors: [], error: 'Unauthorized' }
  }

  try {
    const directors = await directorRepository.getByCompanyId(companyId)
    return { success: true, directors }
  } catch (error) {
    return { ...handleActionError(error), directors: [] }
  }
}

export async function uploadDocument(
  companyId: string,
  data: {
    folderName: string
    documentName: string
    registrationDate?: string
    expiryDate?: string
    isPortalRequired: boolean
    portalEmail?: string
    portalPassword?: string
    frequency: string
    filePath: string
    fileName: string
    // New period metadata fields
    periodType?: 'one-time' | 'monthly' | 'quarterly' | 'annual'
    periodFinancialYear?: string
    periodKey?: string
    periodStart?: string
    periodEnd?: string
    requirementId?: string
  }
) {
  // SECURITY: Validate companyId to prevent injection
  if (!validateCompanyId(companyId)) {
    throw new Error('Invalid company ID format')
  }

  // SECURITY: Sanitize string inputs
  const sanitizedFolderName = sanitizeStringInput(data.folderName, 500)
  const sanitizedDocumentName = sanitizeStringInput(data.documentName, 500)
  const sanitizedFileName = sanitizeStringInput(data.fileName, 500)

  if (!sanitizedFolderName || !sanitizedDocumentName || !sanitizedFileName) {
    throw new Error('Invalid input: folder name, document name, or file name contains invalid characters')
  }

  const { documentRepository } = createServerContainer()
  await requireCurrentUser()

  // No metadata-only embedding here — see the comment in
  // completeOnboarding's section 3 for why. Real document-content
  // embeddings are generated by processDocumentContent below.

  const [insertedDoc] = await documentRepository.createCompanyDocuments([{
    companyId,
    documentType: sanitizedDocumentName,
    folderName: sanitizedFolderName,
    registrationDate: data.registrationDate || null,
    expiryDate: data.expiryDate || null,
    isPortalRequired: data.isPortalRequired,
    portalEmail: data.portalEmail || null,
    portalPassword: data.portalPassword || null,
    frequency: data.frequency,
    filePath: data.filePath,
    fileName: sanitizedFileName,
    embedding: null,
    periodType: data.periodType || null,
    periodFinancialYear: data.periodFinancialYear || null,
    periodKey: data.periodKey || null,
    periodStart: data.periodStart || null,
    periodEnd: data.periodEnd || null,
    requirementId: data.requirementId || null,
  }])

  // Trigger content processing in background
  if (insertedDoc) {
    processDocumentContent(insertedDoc.id, companyId, insertedDoc.filePath).catch(err =>
      console.error(`Async processing failed for ${insertedDoc.id}:`, err)
    )
  }

  return { success: true, documentId: insertedDoc?.id }
}

export async function uploadFileToStorage(filePath: string, fileData: ArrayBuffer, contentType: string) {
  try {
    await requireCurrentUser()

    // SECURITY: Sanitize filePath
    const sanitizedFilePath = sanitizeStringInput(filePath, 1000)
    if (!sanitizedFilePath) {
      throw new Error('Invalid file path')
    }

    // Use admin client to bypass RLS for Passport users
    const adminSupabase = createAdminClient()

    const { error: uploadError } = await adminSupabase.storage
      .from('company-documents')
      .upload(sanitizedFilePath, fileData, {
        contentType: contentType,
        upsert: false, // Don't overwrite existing files
      })

    if (uploadError) throw uploadError
    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function getDownloadUrl(filePath: string) {
  try {
    await requireCurrentUser()

    // Use admin client to bypass RLS for Passport users
    const adminSupabase = createAdminClient()

    const { data, error } = await adminSupabase.storage
      .from('company-documents')
      .createSignedUrl(filePath, 3600) // 1 hour expiry for preview

    if (error) throw error
    return { success: true, url: data.signedUrl }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function deleteDocument(documentId: string, filePath: string) {
  try {
    // SECURITY: Validate documentId to prevent injection
    if (!isValidUUID(documentId)) {
      throw new Error('Invalid document ID format')
    }

    // SECURITY: Sanitize filePath
    const sanitizedFilePath = sanitizeStringInput(filePath, 1000)
    if (!sanitizedFilePath) {
      throw new Error('Invalid file path')
    }

    const { documentRepository } = createServerContainer()
    await requireCurrentUser()

    // 1. Delete from Storage
    const { createStorageAdapter } = await import('@/lib/storage/factory')
    const storage = createStorageAdapter()
    
    try {
      await storage.deleteFile('company-documents', [sanitizedFilePath])
    } catch (storageError) {
      // Continue anyway to try and clean up metadata
    }

    // 2. Delete from Metadata table
    await documentRepository.deleteCompanyDocument(documentId)

    return { success: true }
  } catch (error) {
    return handleActionError(error)
  }
}

export async function getDocumentTemplates() {
  try {
    const { documentRepository } = createServerContainer()
    const templates = await documentRepository.getTemplateMappings()
    return {
      success: true,
      templates: templates.map(template => ({
        document_name: template.documentName,
        folder_name: template.folderName,
        default_frequency: template.defaultFrequency,
      })),
    }
  } catch (error) {
    return { ...handleActionError(error), templates: [] }
  }
}

export async function getCompanyDocuments(companyId: string) {
  try {
    // SECURITY: Validate companyId to prevent injection
    if (!validateCompanyId(companyId)) {
      return { success: false, documents: [], error: 'Invalid company ID format' }
    }

    const { documentRepository, authService, accessService } = createServerContainer()

    // Check authentication
    const user = await authService.getCurrentUser()
    if (!user) {
      return { success: false, documents: [], error: 'Unauthorized' }
    }

    // Check access to company
    console.log('[getCompanyDocuments] Checking access for user:', user.id, 'company:', companyId, 'isPassportUser:', !!user.canonicalId)
    const accessSnapshot = await accessService.getCompanyAccessSnapshot(user.id, companyId)
    console.log('[getCompanyDocuments] Access snapshot:', {
      hasAccess: accessSnapshot.hasAccess,
      accessType: accessSnapshot.accessType,
      isOwner: accessSnapshot.isOwner,
      ownerSubscriptionExpired: accessSnapshot.ownerSubscriptionExpired
    })
    
    if (!accessSnapshot.hasAccess) {
      console.log('[getCompanyDocuments] Access denied for user:', user.id, 'company:', companyId, 'reason:', {
        accessType: accessSnapshot.accessType,
        isOwner: accessSnapshot.isOwner,
        ownerSubscriptionExpired: accessSnapshot.ownerSubscriptionExpired
      })
      return { success: false, documents: [], error: 'Access denied to this company' }
    }

    console.log('[getCompanyDocuments] Fetching documents for company:', companyId, 'user:', user.id)

    const documents = await documentRepository.getCompanyDocuments(companyId)
    console.log('[getCompanyDocuments] Found', documents.length, 'documents for company:', companyId)
    
    return {
      success: true,
      documents: documents.map(document => ({
        id: document.id,
        company_id: document.companyId,
        document_type: document.documentType,
        folder_name: document.folderName,
        file_path: document.filePath,
        file_name: document.fileName,
        created_at: document.createdAt,
        registration_date: document.registrationDate || null,
        expiry_date: document.expiryDate || null,
        period_type: document.periodType || null,
        period_financial_year: document.periodFinancialYear || null,
        period_key: document.periodKey || null,
        period_start: document.periodStart || null,
        period_end: document.periodEnd || null,
        requirement_id: document.requirementId || null,
      })),
    }
  } catch (error) {
    return { ...handleActionError(error), documents: [] }
  }
}
