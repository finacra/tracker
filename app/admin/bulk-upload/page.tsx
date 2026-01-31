'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import Handsontable from 'handsontable'
import { registerAllModules } from 'handsontable/registry'
import 'handsontable/dist/handsontable.full.min.css'
import {
  CSVTemplateRow,
  CSV_COLUMNS,
  CSV_COLUMN_HEADERS,
  CATEGORIES,
  COMPLIANCE_TYPES,
  ENTITY_TYPES,
  INDUSTRIES,
  INDUSTRY_CATEGORIES,
  parseCSV,
  csvRowToTemplate,
  downloadCSVTemplate,
  ParsedTemplate
} from '@/lib/compliance/csv-template'
import {
  validateAll,
  ValidationResult,
  getColumnName
} from '@/lib/compliance/validators'
import { bulkCreateComplianceTemplates } from '@/app/data-room/actions'

// Register all Handsontable modules
registerAllModules()

// Dynamically import HotTable to avoid SSR issues
const HotTable = dynamic(
  () => import('@handsontable/react').then((mod) => mod.HotTable),
  { ssr: false }
)

export default function BulkUploadPage() {
  const router = useRouter()
  const [data, setData] = useState<string[][]>([])
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [cellErrors, setCellErrors] = useState<Map<string, string>>(new Map())
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ created: number; errors: string[] } | null>(null)
  const [isClient, setIsClient] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hotTableRef = useRef<any>(null)

  useEffect(() => {
    setIsClient(true)
    // Check for data in sessionStorage (passed from modal)
    const storedData = sessionStorage.getItem('bulkUploadData')
    if (storedData) {
      const parsed = JSON.parse(storedData)
      setData(parsed)
      runValidation(parsed)
      sessionStorage.removeItem('bulkUploadData')
    } else {
      // Start with empty rows if no data
      const emptyRows = Array(10).fill(null).map(() => CSV_COLUMNS.map(() => ''))
      setData(emptyRows)
    }
  }, [])

  // Convert data array to CSVTemplateRow array for validation
  const dataToRows = useCallback((tableData: string[][]): CSVTemplateRow[] => {
    return tableData.map(row => {
      const obj: Partial<CSVTemplateRow> = {}
      CSV_COLUMNS.forEach((col, idx) => {
        obj[col] = row[idx] || ''
      })
      return obj as CSVTemplateRow
    })
  }, [])

  // Validate all data and update cell errors
  const runValidation = useCallback((tableData: string[][]) => {
    // Filter out completely empty rows
    const nonEmptyData = tableData.filter(row => row.some(cell => cell && cell.trim()))
    const rows = dataToRows(nonEmptyData)
    const result = validateAll(rows)
    setValidation(result)

    // Build cell errors map
    const errors = new Map<string, string>()
    result.errors.forEach(error => {
      errors.set(`${error.row}-${error.columnIndex}`, error.message || 'Invalid')
    })
    setCellErrors(errors)
  }, [dataToRows])

  // Handle data changes in Handsontable
  const handleAfterChange = useCallback((changes: Handsontable.CellChange[] | null, source: Handsontable.ChangeSource) => {
    if (!changes) return
    
    // Rebuild data from hot table
    const hot = hotTableRef.current?.hotInstance
    if (hot) {
      const newData = hot.getData() as string[][]
      setData(newData)
      runValidation(newData)
    }
  }, [runValidation])

  // Add empty rows
  const addRows = useCallback((count: number = 5) => {
    const emptyRows = Array(count).fill(null).map(() => CSV_COLUMNS.map(() => ''))
    setData(prev => {
      const newData = [...prev, ...emptyRows]
      runValidation(newData)
      return newData
    })
  }, [runValidation])

  // Remove selected rows
  const removeSelectedRows = useCallback(() => {
    const hot = hotTableRef.current?.hotInstance
    if (hot) {
      const selected = hot.getSelected()
      if (selected) {
        const rowsToDelete = new Set<number>()
        selected.forEach((selection: [number, number, number, number]) => {
          const [startRow, , endRow] = selection
          for (let i = Math.min(startRow, endRow); i <= Math.max(startRow, endRow); i++) {
            rowsToDelete.add(i)
          }
        })
        
        const newData = data.filter((_, idx) => !rowsToDelete.has(idx))
        setData(newData)
        runValidation(newData)
      }
    }
  }, [data, runValidation])

  // Clear all data
  const clearAll = useCallback(() => {
    const emptyRows = Array(10).fill(null).map(() => CSV_COLUMNS.map(() => ''))
    setData(emptyRows)
    setValidation(null)
    setCellErrors(new Map())
  }, [])

  // Import CSV file
  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const content = event.target?.result as string
      if (content) {
        const rows = parseCSV(content)
        if (rows.length === 0) {
          alert('No data found in CSV file')
          return
        }
        const tableData = rows.map(row => CSV_COLUMNS.map(col => row[col]))
        setData(tableData)
        runValidation(tableData)
      }
    }
    reader.readAsText(file)
    e.target.value = '' // Reset input
  }, [runValidation])

  // Dropdown options for specific columns
  const getDropdownSource = (column: keyof CSVTemplateRow): string[] | null => {
    switch (column) {
      case 'category':
        return [...CATEGORIES]
      case 'compliance_type':
        return [...COMPLIANCE_TYPES]
      case 'entity_types':
        return [...ENTITY_TYPES]
      case 'industries':
        return [...INDUSTRIES]
      case 'industry_categories':
        return [...INDUSTRY_CATEGORIES]
      case 'penalty_type':
        return ['daily', 'flat', 'interest', 'percentage']
      case 'is_critical':
      case 'is_active':
        return ['true', 'false']
      default:
        return null
    }
  }

  // Get column type
  const getColumnType = (column: keyof CSVTemplateRow): string => {
    const dropdownColumns = ['category', 'compliance_type', 'penalty_type', 'is_critical', 'is_active']
    if (dropdownColumns.includes(column)) return 'dropdown'
    
    const autocompleteColumns = ['entity_types', 'industries', 'industry_categories']
    if (autocompleteColumns.includes(column)) return 'autocomplete'
    
    const numericColumns = ['due_date_offset', 'due_month', 'due_day', 'penalty_rate', 'penalty_cap']
    if (numericColumns.includes(column)) return 'numeric'
    
    if (column === 'due_date') return 'date'
    
    return 'text'
  }

  // Handle upload
  const handleUpload = useCallback(async () => {
    // Filter out empty rows
    const nonEmptyData = data.filter(row => row.some(cell => cell && cell.trim()))
    
    if (nonEmptyData.length === 0) {
      alert('No data to upload')
      return
    }

    const rows = dataToRows(nonEmptyData)
    const validationResult = validateAll(rows)
    
    if (!validationResult.valid) {
      alert(`Please fix ${validationResult.errors.length} validation errors before uploading`)
      return
    }

    setIsUploading(true)
    
    try {
      const templates = rows.map(row => csvRowToTemplate(row))
      const result = await bulkCreateComplianceTemplates(templates)
      setUploadResult({ created: result.created, errors: result.errors })
      
      if (result.success) {
        alert(`Successfully created ${result.created} templates!`)
      }
    } catch (error) {
      setUploadResult({ created: 0, errors: [(error as Error).message] })
    } finally {
      setIsUploading(false)
    }
  }, [data, dataToRows])

  // Get non-empty row count
  const nonEmptyRowCount = data.filter(row => row.some(cell => cell && cell.trim())).length

  if (!isClient) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin w-12 h-12 border-4 border-primary-orange border-t-transparent rounded-full"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="bg-gray-900 border-b border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/admin')}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ← Back to Admin
            </button>
            <h1 className="text-xl font-semibold text-white">Bulk Template Upload</h1>
            {validation && (
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                validation.valid
                  ? 'bg-green-500/20 text-green-400'
                  : 'bg-red-500/20 text-red-400'
              }`}>
                {nonEmptyRowCount} rows • {validation.valid ? 'All valid' : `${validation.errors.length} errors`}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={downloadCSVTemplate}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Template
            </button>
            <label className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors cursor-pointer flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Import CSV
              <input
                type="file"
                accept=".csv"
                onChange={handleFileImport}
                className="hidden"
              />
            </label>
            <button
              onClick={handleUpload}
              disabled={isUploading || !validation?.valid || nonEmptyRowCount === 0}
              className={`px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2 ${
                validation?.valid && nonEmptyRowCount > 0 && !isUploading
                  ? 'bg-primary-orange hover:bg-primary-orange/90 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              {isUploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Uploading...
                </>
              ) : (
                <>Upload {nonEmptyRowCount} Templates</>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-gray-800 border-b border-gray-700 px-6 py-2 flex items-center gap-2">
        <button
          onClick={() => addRows(1)}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
        >
          + Add Row
        </button>
        <button
          onClick={() => addRows(5)}
          className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
        >
          + Add 5 Rows
        </button>
        <button
          onClick={removeSelectedRows}
          className="px-3 py-1.5 bg-gray-700 hover:bg-red-600 text-white text-sm rounded transition-colors"
        >
          Delete Selected
        </button>
        <button
          onClick={clearAll}
          className="px-3 py-1.5 bg-gray-700 hover:bg-red-600 text-white text-sm rounded transition-colors"
        >
          Clear All
        </button>
        <div className="flex-1"></div>
        <span className="text-gray-400 text-sm">
          Ctrl+C/V to copy/paste • Right-click for options • Click dropdown cells for options
        </span>
      </div>

      {/* Spreadsheet */}
      <div className="flex-1 overflow-hidden">
        <HotTable
          ref={hotTableRef}
          data={data}
          rowHeaders={true}
          colHeaders={CSV_COLUMNS.map(col => {
            const header = CSV_COLUMN_HEADERS[col]
            return header.includes('*') ? `<span style="color:#f97316">${header}</span>` : header
          })}
          width="100%"
          height="100%"
          licenseKey="non-commercial-and-evaluation"
          contextMenu={true}
          copyPaste={true}
          afterChange={handleAfterChange}
          stretchH="all"
          manualColumnResize={true}
          manualRowResize={true}
          autoColumnSize={true}
          autoRowSize={true}
          minSpareRows={1}
          colWidths={CSV_COLUMNS.map(col => {
            if (col === 'description' || col === 'possible_legal_action') return 200
            if (col === 'requirement' || col === 'required_documents') return 180
            if (col === 'entity_types' || col === 'industries' || col === 'industry_categories') return 180
            return 120
          })}
          className="htDark"
          cells={(row, col) => {
            const colName = getColumnName(col)
            if (!colName) return {}
            
            const cellProps: Handsontable.CellMeta = {
              type: getColumnType(colName),
              source: getDropdownSource(colName) || undefined,
              strict: colName === 'category' || colName === 'compliance_type',
              allowInvalid: true
            }

            // Check for validation errors
            const errorKey = `${row}-${col}`
            if (cellErrors.has(errorKey)) {
              cellProps.className = 'htInvalid'
              cellProps.comment = { value: cellErrors.get(errorKey) || 'Invalid' }
            }

            return cellProps
          }}
        />
      </div>

      {/* Error Panel */}
      {validation && !validation.valid && (
        <div className="bg-red-900/30 border-t border-red-700 p-4 max-h-40 overflow-y-auto">
          <h3 className="text-red-400 font-medium mb-2">
            Validation Errors ({validation.errors.length}):
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {validation.errors.slice(0, 20).map((error, idx) => (
              <div key={idx} className="text-sm text-red-300 bg-red-900/30 px-2 py-1 rounded">
                Row {error.row + 1}, {error.column}: {error.message}
              </div>
            ))}
            {validation.errors.length > 20 && (
              <div className="text-red-400 text-sm">
                ... and {validation.errors.length - 20} more errors
              </div>
            )}
          </div>
        </div>
      )}

      {/* Upload Result */}
      {uploadResult && (
        <div className={`border-t p-4 ${uploadResult.errors.length > 0 ? 'bg-yellow-900/30 border-yellow-700' : 'bg-green-900/30 border-green-700'}`}>
          <div className="flex items-center justify-between">
            <div>
              <span className={uploadResult.errors.length > 0 ? 'text-yellow-400' : 'text-green-400'}>
                Created {uploadResult.created} templates
              </span>
              {uploadResult.errors.length > 0 && (
                <span className="text-yellow-300 ml-2">
                  ({uploadResult.errors.length} warnings)
                </span>
              )}
            </div>
            <button
              onClick={() => setUploadResult(null)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Add custom styles for dark mode */}
      <style jsx global>{`
        .htDark {
          background: #111827 !important;
          color: #e5e7eb !important;
        }
        .htDark .htCore {
          border-color: #374151 !important;
        }
        .htDark th {
          background: #1f2937 !important;
          color: #9ca3af !important;
          border-color: #374151 !important;
        }
        .htDark td {
          background: #111827 !important;
          border-color: #374151 !important;
        }
        .htDark td.current {
          background: #1f2937 !important;
        }
        .htDark td.area {
          background: #1f2937 !important;
        }
        .htDark .htInvalid {
          background: rgba(239, 68, 68, 0.3) !important;
          border-color: #ef4444 !important;
        }
        .htDark .handsontableInput {
          background: #1f2937 !important;
          color: #e5e7eb !important;
          border-color: #f97316 !important;
        }
        .htDark .htAutocompleteArrow {
          color: #9ca3af !important;
        }
        .htDark .htDropdownMenu {
          background: #1f2937 !important;
          border-color: #374151 !important;
        }
        .htDark .htDropdownMenu td {
          background: #1f2937 !important;
          color: #e5e7eb !important;
        }
        .htDark .htDropdownMenu td.current {
          background: #374151 !important;
        }
        .htDark .ht_clone_top th {
          background: #1f2937 !important;
        }
        .handsontableInputHolder {
          z-index: 9999 !important;
        }
      `}</style>
    </div>
  )
}
