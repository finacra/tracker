import { z } from 'zod'

/**
 * Zod Validation Schemas
 *
 * All server action inputs MUST be validated with these schemas.
 * Usage: const data = contactSchema.parse(rawInput)
 */

// --- Auth ---

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
})

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  fullName: z.string().min(1, 'Name is required').max(100),
})

export const forgotPasswordSchema = z.object({
  email: z.string().email('Invalid email address'),
})

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
})

// --- Contact ---

export const contactSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address'),
  company: z.string().max(255).optional(),
  phone: z.string().max(20).optional(),
  message: z.string().min(1, 'Message is required').max(5000),
})

// --- Onboarding ---

export const directorSchema = z.object({
  dinNumber: z.string().optional(),
  name: z.string().min(1, 'Director name is required'),
  designation: z.string().optional(),
  dateOfAppointment: z.string().optional(),
  isExisting: z.boolean().optional(),
})

export const onboardingSchema = z.object({
  companyName: z.string().min(1, 'Company name is required').max(255),
  companyType: z.string().min(1, 'Company type is required'),
  cinNumber: z.string().min(1, 'CIN is required'),
  panNumber: z.string().optional().or(z.literal('')),
  industries: z.array(z.string()).optional(),
  address: z.string().optional().or(z.literal('')),
  city: z.string().optional().or(z.literal('')),
  state: z.string().optional().or(z.literal('')),
  pinCode: z.string().optional().or(z.literal('')),
  phoneNumber: z.string().optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  landline: z.string().optional().or(z.literal('')),
  other: z.string().optional().or(z.literal('')),
  dateOfIncorporation: z.string().optional().or(z.literal('')),
  industryCategories: z.array(z.string()).optional(),
  otherIndustryCategory: z.string().optional().or(z.literal('')),
  yearType: z.enum(['FY', 'CY']).optional(),
  countryCode: z.string().optional(),
  companyStage: z.string().optional(),
  confidenceScore: z.string().optional(),
  documents: z.array(z.object({
    type: z.string(),
    path: z.string(),
    name: z.string(),
  })).optional(),
  exDirectors: z.string().optional(),
  // Compliance intelligence fields
  employeeCount: z.string().optional().or(z.literal('')),
  annualTurnover: z.string().optional().or(z.literal('')),
  isGstRegistered: z.boolean().optional(),
  gstNumber: z.string().optional().or(z.literal('')),
  netWorth: z.string().optional().or(z.literal('')),
  isMsme: z.string().optional().or(z.literal('')),
  msmeCategory: z.string().optional().or(z.literal('')),
  hasImportsExports: z.boolean().optional(),
  isStartupDpiit: z.boolean().optional(),
  // CIN API auto-populated fields
  authorisedCapital: z.string().optional(),
  paidUpCapital: z.string().optional(),
  subscribedCapital: z.string().optional(),
  companyCategory: z.string().optional(),
  companySubcategory: z.string().optional(),
  classOfCompany: z.string().optional(),
  rocName: z.string().optional(),
  companyStatus: z.string().optional(),
  dateOfLastAgm: z.string().optional(),
  balanceSheetDate: z.string().optional(),
})

// --- Requirements ---

const requirementStatus = z.enum(['not_started', 'upcoming', 'pending', 'overdue', 'completed'])
const complianceType = z.enum(['one-time', 'monthly', 'quarterly', 'annual'])

export const createRequirementSchema = z.object({
  category: z.string().min(1, 'Category is required'),
  requirement: z.string().min(1, 'Requirement name is required').max(500),
  description: z.string().optional(),
  due_date: z.string().min(1, 'Due date is required'),
  penalty: z.string().optional(),
  penalty_base_amount: z.number().nullable().optional(),
  penalty_config: z.record(z.string(), z.unknown()).nullable().optional(),
  possible_legal_action: z.string().nullable().optional(),
  required_documents: z.array(z.string()).optional(),
  is_critical: z.boolean().optional(),
  financial_year: z.string().optional(),
  compliance_type: complianceType.optional(),
  year: z.string().optional(),
})

export const updateRequirementSchema = createRequirementSchema.partial().extend({
  status: requirementStatus.optional(),
})

// --- Payments ---

export const paymentSchema = z.object({
  amount: z.number().positive('Amount must be positive'),
  currency: z.enum(['INR', 'USD', 'AED']),
  tier: z.enum(['Starter', 'Professional', 'Enterprise']),
  billingCycle: z.enum(['Monthly', 'Quarterly', 'Half-yearly', 'Annual']),
})

// --- Team ---

export const teamInvitationSchema = z.object({
  companyId: z.string().uuid('Invalid company ID'),
  email: z.string().email('Invalid email address'),
  role: z.enum(['viewer', 'editor', 'admin']),
  inviteeName: z.string().optional(),
})

// --- Email Preferences ---

export const emailPreferencesSchema = z.object({
  unsubscribe_status_changes: z.boolean(),
  unsubscribe_reminders: z.boolean(),
  unsubscribe_team_updates: z.boolean(),
  unsubscribe_all: z.boolean(),
  digest_frequency: z.enum(['daily', 'weekly', 'monthly', 'none']),
})

// --- Common ---

export const companyIdSchema = z.string().uuid('Invalid company ID')
export const emailSchema = z.string().email('Invalid email address')
export const uuidSchema = z.string().uuid('Invalid ID')
