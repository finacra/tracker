/**
 * Input validation utilities to prevent SQL injection and other security issues
 */

/**
 * UUID validation regex (matches standard UUID v4 format)
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * Validate if a string is a valid UUID
 * @param id - String to validate
 * @returns true if valid UUID, false otherwise
 */
export function isValidUUID(id: string | null | undefined): boolean {
  if (!id || typeof id !== 'string') {
    return false
  }
  return UUID_REGEX.test(id.trim())
}

/**
 * Sanitize a folder path to prevent SQL injection
 * Only allows alphanumeric characters, spaces, hyphens, underscores, and forward slashes
 * @param path - Folder path to sanitize
 * @returns Sanitized path or null if invalid
 */
export function sanitizeFolderPath(path: string | null | undefined): string | null {
  if (!path || typeof path !== 'string') {
    return null
  }
  
  // Remove any characters that could be used for SQL injection
  // Allow: alphanumeric, spaces, hyphens, underscores, forward slashes
  const sanitized = path.trim().replace(/[^a-zA-Z0-9\s\-_\/]/g, '')
  
  // Check for dangerous patterns
  if (sanitized.includes('..') || sanitized.includes('//') || sanitized.startsWith('/') || sanitized.endsWith('/')) {
    return null
  }
  
  return sanitized.length > 0 ? sanitized : null
}

/**
 * Sanitize a string input: trims whitespace, enforces max length, and strips
 * control characters (null bytes, ASCII control chars).
 *
 * SQL injection protection is provided by Prisma's parameterised queries, NOT
 * by keyword blocking. Keyword blocking was removed because it falsely rejected
 * legitimate document names (e.g. "Select Committee Report", "CREATE Company").
 *
 * @param input - String to validate
 * @param maxLength - Maximum allowed length (default: 1000)
 * @returns Sanitized string or null if invalid/empty
 */
export function sanitizeStringInput(input: string | null | undefined, maxLength: number = 1000): string | null {
  if (!input || typeof input !== 'string') {
    return null
  }

  const trimmed = input.trim()

  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return null
  }

  // Strip null bytes and ASCII control characters (keep printable chars only)
  const sanitized = trimmed.replace(/[\x00-\x1F\x7F]/g, '')

  return sanitized.length > 0 ? sanitized : null
}

/**
 * Validate a company ID (must be a valid UUID)
 * @param companyId - Company ID to validate
 * @returns true if valid, false otherwise
 */
export function validateCompanyId(companyId: string | null | undefined): boolean {
  return isValidUUID(companyId)
}

/**
 * Validate a user ID (must be a valid UUID)
 * @param userId - User ID to validate
 * @returns true if valid, false otherwise
 */
export function validateUserId(userId: string | null | undefined): boolean {
  return isValidUUID(userId)
}

/**
 * Validate an email address format
 * @param email - Email to validate
 * @returns true if valid email format, false otherwise
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== 'string') {
    return false
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email.trim())
}

/**
 * Escape special characters in a string for use in LIKE queries
 * This helps prevent issues with LIKE patterns containing % or _
 * @param input - String to escape
 * @returns Escaped string safe for LIKE queries
 */
export function escapeLikePattern(input: string): string {
  if (!input || typeof input !== 'string') {
    return ''
  }
  
  // Escape % and _ which are special in LIKE patterns
  return input.replace(/[%_]/g, '\\$&')
}
