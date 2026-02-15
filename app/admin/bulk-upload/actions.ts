'use server'

// OpenAI client will be imported inline
import {
  CSVTemplateRow,
  CSV_COLUMNS,
  CATEGORIES,
  COMPLIANCE_TYPES,
  ENTITY_TYPES,
  INDUSTRIES,
  INDUSTRY_CATEGORIES
} from '@/lib/compliance/csv-template'
import { validateAll, type ValidationResult } from '@/lib/compliance/validators'

// Get Azure OpenAI client
function getAzureOpenAIClient(): any {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT
  const apiKey = process.env.AZURE_OPENAI_API_KEY
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5.2-chat'
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION || '2025-04-01-preview'

  if (!endpoint || !apiKey) {
    console.warn('Azure OpenAI credentials not found in environment variables')
    return null
  }

  try {
    // Dynamic import to avoid issues in server actions
    const openai = require('openai')
    const { AzureOpenAI } = openai
    return new AzureOpenAI({
      endpoint,
      apiKey,
      deployment,
      apiVersion
    })
  } catch (error) {
    console.error('Failed to initialize Azure OpenAI client:', error)
    return null
  }
}

interface ErrorFix {
  row: number
  column: string
  columnIndex: number
  originalValue: string
  fixedValue: string
  reason: string
}

/**
 * Use AI to fix validation errors in the spreadsheet data
 * @param mode - 'auto' for automatic resolution, 'custom' for user-provided instructions
 * @param customInstructions - User-provided instructions for custom mode
 */
export async function resolveErrorsWithAI(
  data: string[][],
  validationResult: ValidationResult,
  mode: 'auto' | 'custom' = 'auto',
  customInstructions?: string
): Promise<{ success: boolean; fixedData: string[][]; fixes: ErrorFix[]; error?: string }> {
  const client = getAzureOpenAIClient()
  if (!client) {
    return {
      success: false,
      fixedData: data,
      fixes: [],
      error: 'OpenAI client not initialized. Check environment variables.'
    }
  }

  try {
    // Prepare error context for AI - include ALL errors with full row context
    const errors = validationResult.errors.map(err => ({
      row: err.row,
      column: err.column,
      columnIndex: err.columnIndex,
      value: data[err.row]?.[err.columnIndex] || '',
      message: err.message,
      fullRow: data[err.row] || []
    }))

    if (errors.length === 0) {
      return {
        success: true,
        fixedData: data,
        fixes: []
      }
    }

    // Group errors by row for row-by-row processing
    const errorsByRow = new Map<number, typeof errors>()
    errors.forEach(err => {
      if (!errorsByRow.has(err.row)) {
        errorsByRow.set(err.row, [])
      }
      errorsByRow.get(err.row)!.push(err)
    })

    // Group errors by type/pattern for batch processing
    const errorGroups = {
      caseSensitivity: errors.filter(e => 
        e.message && e.message.toLowerCase().includes('invalid') && 
        (e.message.toLowerCase().includes('category') || 
         e.message.toLowerCase().includes('type') ||
         e.message.toLowerCase().includes('allowed'))
      ),
      dropdownMismatch: errors.filter(e => 
        e.message && e.message.toLowerCase().includes('invalid') && 
        !e.message.toLowerCase().includes('required')
      ),
      required: errors.filter(e => 
        e.message && e.message.toLowerCase().includes('required')
      ),
      format: errors.filter(e => 
        e.message && (e.message.toLowerCase().includes('format') || 
        e.message.toLowerCase().includes('must be'))
      ),
      multiSelect: errors.filter(e => 
        ['entity_types', 'industries', 'industry_categories'].includes(e.column)
      )
    }

    // Build context with allowed values and column mappings
    const allowedValues = {
      categories: CATEGORIES,
      compliance_types: COMPLIANCE_TYPES,
      entity_types: ENTITY_TYPES,
      industries: INDUSTRIES,
      industry_categories: INDUSTRY_CATEGORIES,
      penalty_types: ['daily', 'flat', 'interest', 'percentage'],
      boolean_values: ['true', 'false']
    }

    const columnMappings = CSV_COLUMNS.map((col, idx) => ({
      index: idx,
      name: col,
      allowedValues: col === 'category' ? allowedValues.categories :
                     col === 'compliance_type' ? allowedValues.compliance_types :
                     col === 'entity_types' ? allowedValues.entity_types :
                     col === 'industries' ? allowedValues.industries :
                     col === 'industry_categories' ? allowedValues.industry_categories :
                     col === 'penalty_type' ? allowedValues.penalty_types :
                     col === 'is_critical' || col === 'is_active' ? allowedValues.boolean_values :
                     null
    }))

    // Create enhanced prompt for AI
    let systemMessage: string
    if (mode === 'custom' && customInstructions) {
      // Custom mode: User provides specific instructions
      systemMessage = `You are an expert data quality specialist for financial compliance management systems. You have FULL ACCESS to the entire spreadsheet data and must follow the user's specific instructions to resolve errors.

YOUR TASK:
Follow the user's custom instructions EXACTLY to resolve the specified errors in the spreadsheet.

IMPORTANT:
1. You have access to the COMPLETE spreadsheet data - all rows and all columns
2. Follow the user's instructions precisely
3. Only fix errors that match the user's instructions
4. You can analyze the entire spreadsheet to understand context and patterns
5. Preserve all valid data - only modify cells as instructed
6. If the user's instructions are unclear, make reasonable inferences based on the spreadsheet context

Return STRICT JSON ONLY (no markdown, no explanations) with this EXACT structure:
{
  "fixes": [
    {
      "row": number,
      "columnIndex": number,
      "originalValue": string,
      "fixedValue": string,
      "reason": string
    }
  ],
  "summary": {
    "totalErrors": ${errors.length},
    "fixesProvided": number,
    "rowsProcessed": number
  }
}`
    } else {
      // Auto mode: Standard automatic resolution
      systemMessage = `You are an expert data quality specialist for financial compliance management systems. Your CRITICAL task is to fix ALL validation errors in spreadsheet data in a SINGLE response.

WORKFLOW (MANDATORY):
Step 1: ANALYZE all errors - identify patterns, group similar errors
Step 2: FIX systematically - process row by row, ensuring each row is completely fixed
Step 3: VERIFY - ensure every single error is addressed

RULES:
1. You MUST fix ALL ${errors.length} errors in this single response - no partial fixes
2. Process row-by-row: For each row with errors, fix ALL errors in that row before moving to the next
3. Group similar errors: Identify patterns (e.g., "15 rows have case sensitivity in 'category'") and fix them in batches
4. Case sensitivity: Match EXACT case of allowed values (e.g., "income tax" -> "Income Tax", "gst" -> "GST")
5. Dropdown selections: Replace invalid values with the CLOSEST matching allowed value
6. Boolean values: Convert "yes"/"no", "1"/"0", "Y"/"N", "Yes"/"No" to "true"/"false"
7. Multi-select values: Ensure comma-separated values match allowed options EXACTLY (case-sensitive)
8. Preserve valid data: ONLY fix cells with errors, leave all other cells unchanged
9. Numeric fields: Ensure proper number format (no text, no special characters)
10. Date fields: Ensure YYYY-MM-DD format

ERROR GROUPS IDENTIFIED:
- Case sensitivity issues: ${errorGroups.caseSensitivity.length} errors
- Dropdown mismatches: ${errorGroups.dropdownMismatch.length} errors
- Required fields: ${errorGroups.required.length} errors
- Format issues: ${errorGroups.format.length} errors
- Multi-select issues: ${errorGroups.multiSelect.length} errors

Return STRICT JSON ONLY (no markdown, no explanations) with this EXACT structure:
{
  "fixes": [
    {
      "row": number,
      "columnIndex": number,
      "originalValue": string,
      "fixedValue": string,
      "reason": string
    }
  ],
  "summary": {
    "totalErrors": ${errors.length},
    "fixesProvided": number,
    "rowsProcessed": number
  }
}

CRITICAL: You must provide fixes for ALL ${errors.length} errors. The "fixesProvided" count must equal ${errors.length}.`
    }

    // Build comprehensive user prompt
    let userPrompt: string
    
    if (mode === 'custom' && customInstructions) {
      // Custom mode: Include full spreadsheet data and user instructions
      const fullSpreadsheetData = data.map((row, idx) => 
        `Row ${idx + 1}: ${CSV_COLUMNS.map((col, colIdx) => `${col}="${row[colIdx] || ''}"`).join(', ')}`
      ).join('\n')
      
      const errorRowsData = Array.from(errorsByRow.entries()).map(([rowNum, rowErrors]) => {
        const row = data[rowNum]
        return `Row ${rowNum + 1} (${rowErrors.length} error${rowErrors.length > 1 ? 's' : ''}):
  Full Row Data: ${CSV_COLUMNS.map((col, idx) => `${col}="${row?.[idx] || ''}"`).join(', ')}
  Errors:
${rowErrors.map(e => `    - Column "${e.column}" (index ${e.columnIndex}): "${e.value}" -> ${e.message}`).join('\n')}`
      }).join('\n\n')

      userPrompt = `You have FULL ACCESS to the complete spreadsheet data. Follow the user's custom instructions to resolve errors.

COMPLETE SPREADSHEET DATA (${data.length} rows):
${fullSpreadsheetData}

COLUMN DEFINITIONS:
${columnMappings.map(c => 
  `  ${c.index}: ${c.name}${c.allowedValues ? ` (Allowed: ${c.allowedValues.join(', ')})` : ''}`
).join('\n')}

ERRORS FOUND (${errors.length} total errors in ${errorsByRow.size} rows):
${errorRowsData}

USER'S CUSTOM INSTRUCTIONS:
${customInstructions}

IMPORTANT:
- Follow the user's instructions EXACTLY
- You can see the entire spreadsheet, so use context from all rows to make informed decisions
- Only fix errors that match the user's instructions
- If the instructions are about specific patterns, apply them across all matching rows
- Return JSON with fixes for errors that match the instructions`
    } else {
      // Auto mode: Standard error resolution
      const errorRowsData = Array.from(errorsByRow.entries()).map(([rowNum, rowErrors]) => {
        const row = data[rowNum]
        return `Row ${rowNum + 1} (${rowErrors.length} error${rowErrors.length > 1 ? 's' : ''}):
  Full Row Data: ${CSV_COLUMNS.map((col, idx) => `${col}="${row?.[idx] || ''}"`).join(', ')}
  Errors:
${rowErrors.map(e => `    - Column "${e.column}" (index ${e.columnIndex}): "${e.value}" -> ${e.message}`).join('\n')}`
      }).join('\n\n')

      userPrompt = `Fix ALL ${errors.length} validation errors in the spreadsheet data. You MUST fix every single error in this response.

COLUMN DEFINITIONS:
${columnMappings.map(c => 
  `  ${c.index}: ${c.name}${c.allowedValues ? ` (Allowed: ${c.allowedValues.join(', ')})` : ''}`
).join('\n')}

ALL ERROR ROWS (${errorsByRow.size} rows with errors):
${errorRowsData}

ERROR SUMMARY:
- Total errors: ${errors.length}
- Rows with errors: ${errorsByRow.size}
- Errors by column:
${Array.from(new Set(errors.map(e => e.column))).map(col => {
  const colErrors = errors.filter(e => e.column === col)
  return `  - ${col}: ${colErrors.length} error${colErrors.length > 1 ? 's' : ''}`
}).join('\n')}

INSTRUCTIONS:
1. Analyze ALL errors and identify patterns
2. Group similar errors (e.g., all case sensitivity issues in 'category' column)
3. Process row-by-row: Fix ALL errors in Row 1, then Row 2, etc.
4. For each error, provide the exact fix using the allowed values
5. Ensure your response includes fixes for ALL ${errors.length} errors

Return the JSON with fixes for ALL errors.`
    }

    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5.2-chat'
    
    const response = await client.chat.completions.create({
      messages: [
        { role: 'system', content: systemMessage },
        { role: 'user', content: userPrompt }
      ],
      max_completion_tokens: Math.max(4000, errors.length * 50), // Scale tokens based on error count
      model: deployment
      // Note: gpt-5.2-chat only supports default temperature (1), so we don't set it
    })

    const content = response.choices[0]?.message?.content
    if (!content) {
      return {
        success: false,
        fixedData: data,
        fixes: [],
        error: 'No response from AI'
      }
    }

    // Parse JSON response
    let parsed: { fixes: ErrorFix[]; summary?: { totalErrors?: number; fixesProvided?: number; rowsProcessed?: number } }
    try {
      const trimmed = content.trim()
      const firstBrace = trimmed.indexOf('{')
      const lastBrace = trimmed.lastIndexOf('}')
      if (firstBrace === -1 || lastBrace === -1) {
        throw new Error('No JSON found in response')
      }
      const jsonText = trimmed.slice(firstBrace, lastBrace + 1)
      parsed = JSON.parse(jsonText)
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError)
      return {
        success: false,
        fixedData: data,
        fixes: [],
        error: 'Failed to parse AI response'
      }
    }

    // Validate that all errors are addressed
    const providedFixes = parsed.fixes || []
    const expectedErrorCount = errors.length
    const providedFixCount = providedFixes.length

    // Create a map of error locations for validation
    const errorLocationMap = new Map<string, boolean>()
    errors.forEach(err => {
      errorLocationMap.set(`${err.row}-${err.columnIndex}`, false)
    })

    // Apply fixes to data row by row
    const fixedData = data.map(row => [...row])
    const appliedFixes: ErrorFix[] = []
    const processedRows = new Set<number>()

    // Sort fixes by row to process row-by-row
    const sortedFixes = [...providedFixes].sort((a, b) => a.row - b.row)

    for (const fix of sortedFixes) {
      const { row, columnIndex, originalValue, fixedValue, reason } = fix
      
      // Validate fix bounds
      if (row < 0 || row >= fixedData.length) {
        console.warn(`Fix skipped: Invalid row ${row}`)
        continue
      }
      if (columnIndex < 0 || columnIndex >= CSV_COLUMNS.length) {
        console.warn(`Fix skipped: Invalid columnIndex ${columnIndex}`)
        continue
      }
      
      const errorKey = `${row}-${columnIndex}`
      const currentValue = fixedData[row][columnIndex]
      
      // Apply fix if the value matches (or if it's an error location)
      if (currentValue === originalValue || errorLocationMap.has(errorKey)) {
        fixedData[row][columnIndex] = fixedValue
        processedRows.add(row)
        errorLocationMap.set(errorKey, true)
        
        appliedFixes.push({
          row,
          column: CSV_COLUMNS[columnIndex],
          columnIndex,
          originalValue: currentValue,
          fixedValue,
          reason: reason || 'Fixed by AI'
        })
      }
    }

    // Check if all errors were addressed
    const unaddressedErrors = Array.from(errorLocationMap.entries())
      .filter(([_, addressed]) => !addressed)
      .map(([key]) => key)

    if (unaddressedErrors.length > 0) {
      console.warn(`Warning: ${unaddressedErrors.length} errors were not addressed by AI`)
    }

    // Log summary
    if (parsed.summary) {
      console.log('AI Fix Summary:', {
        totalErrors: expectedErrorCount,
        fixesProvided: providedFixCount,
        fixesApplied: appliedFixes.length,
        rowsProcessed: processedRows.size,
        unaddressed: unaddressedErrors.length
      })
    }

    return {
      success: true,
      fixedData,
      fixes: appliedFixes
    }
  } catch (error: any) {
    console.error('AI error resolution failed:', error)
    return {
      success: false,
      fixedData: data,
      fixes: [],
      error: error.message || 'Failed to resolve errors with AI'
    }
  }
}
