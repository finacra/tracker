'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { HotTable } from '@handsontable/react'
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
  validateCell,
  validateAll,
  ValidationResult,
  CellValidation,
  getColumnName
} from '@/lib/compliance/validators'

// Register all Handsontable modules
registerAllModules()

interface BulkTemplateUploadProps {
  onUpload: (templates: ParsedTemplate[]) => Promise<{ success: boolean; created: number; errors: string[] }>
  onClose: () => void
}

type UploadState = 'upload' | 'editing' | 'uploading' | 'success' | 'error'

export default function BulkTemplateUpload({ onUpload, onClose }: BulkTemplateUploadProps) {
  const [state, setState] = useState<UploadState>('upload')
  const [data, setData] = useState<string[][]>([])
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [cellErrors, setCellErrors] = useState<Map<string, string>>(new Map())
  const [uploadResult, setUploadResult] = useState<{ created: number; errors: string[] } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hotTableRef = useRef<any>(null)

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
    const rows = dataToRows(tableData)
    const result = validateAll(rows)
    setValidation(result)

    // Build cell errors map
    const errors = new Map<string, string>()
    result.errors.forEach(error => {
      errors.set(`${error.row}-${error.columnIndex}`, error.message || 'Invalid')
    })
    setCellErrors(errors)
  }, [dataToRows])

  // Handle file selection
  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      if (content) {
        const rows = parseCSV(content)
        if (rows.length === 0) {
          alert('No data found in CSV file. Make sure it has headers and at least one data row.')
          return
        }
        
        // Convert to 2D array for Handsontable
        const tableData = rows.map(row => CSV_COLUMNS.map(col => row[col]))
        setData(tableData)
        runValidation(tableData)
        setState('editing')
      }
    }
    reader.readAsText(file)
  }, [runValidation])

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file && (file.name.endsWith('.csv') || file.type === 'text/csv')) {
      handleFile(file)
    } else {
      alert('Please upload a CSV file')
    }
  }, [handleFile])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      handleFile(file)
    }
  }, [handleFile])

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

  // Add empty row
  const addRow = useCallback(() => {
    const emptyRow = CSV_COLUMNS.map(() => '')
    setData(prev => {
      const newData = [...prev, emptyRow]
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

  // Cell renderer for validation highlighting
  const cellRenderer = useCallback((
    instance: Handsontable.Core,
    td: HTMLTableCellElement,
    row: number,
    col: number,
    _prop: string | number,
    value: unknown,
    _cellProperties: Handsontable.CellProperties
  ) => {
    td.textContent = value as string || ''
    
    const errorKey = `${row}-${col}`
    if (cellErrors.has(errorKey)) {
      td.style.backgroundColor = '#ff000030'
      td.style.borderColor = '#ff0000'
      td.title = cellErrors.get(errorKey) || ''
    } else {
      td.style.backgroundColor = ''
      td.style.borderColor = ''
      td.title = ''
    }
  }, [cellErrors])

  // Handle upload
  const handleUpload = useCallback(async () => {
    if (!validation?.valid) {
      alert('Please fix all validation errors before uploading')
      return
    }

    setState('uploading')
    
    try {
      const rows = dataToRows(data)
      const templates = rows.map(row => csvRowToTemplate(row))
      const result = await onUpload(templates)
      
      setUploadResult({ created: result.created, errors: result.errors })
      setState(result.success ? 'success' : 'error')
    } catch (error) {
      setUploadResult({ created: 0, errors: [(error as Error).message] })
      setState('error')
    }
  }, [data, dataToRows, onUpload, validation])

  // Dropdown options for specific columns
  const getDropdownSource = (column: keyof CSVTemplateRow): string[] | null => {
    switch (column) {
      case 'category':
        return [...CATEGORIES]
      case 'compliance_type':
        return [...COMPLIANCE_TYPES]
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
    
    const numericColumns = ['due_date_offset', 'due_month', 'due_day', 'penalty_rate', 'penalty_cap']
    if (numericColumns.includes(column)) return 'numeric'
    
    if (column === 'due_date') return 'date'
    
    return 'text'
  }

  // Render upload state
  if (state === 'upload') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-2xl mx-4 p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-white">Bulk Upload Compliance Templates</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-4">
            {/* Download Template Button */}
            <div className="text-center">
              <p className="text-gray-300 mb-3">
                First, download the CSV template with examples:
              </p>
              <button
                onClick={downloadCSVTemplate}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download CSV Template
              </button>
            </div>

            <div className="border-t border-gray-700 my-6"></div>

            {/* Upload Zone */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${
                dragOver
                  ? 'border-primary-orange bg-primary-orange/10'
                  : 'border-gray-600 hover:border-gray-500'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileInput}
                className="hidden"
              />
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-gray-300 mb-2">
                Drag and drop your filled CSV file here
              </p>
              <p className="text-gray-500 text-sm">
                or click to browse
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Render editing state
  if (state === 'editing') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-[95vw] max-h-[95vh] mx-4 flex flex-col">
          {/* Header */}
          <div className="flex justify-between items-center p-4 border-b border-gray-700">
            <div className="flex items-center gap-4">
              <h2 className="text-xl font-semibold text-white">Edit Templates</h2>
              {validation && (
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                    validation.valid
                      ? 'bg-green-500/20 text-green-400'
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {validation.valid
                      ? `✓ ${validation.validRows} rows valid`
                      : `✗ ${validation.invalidRows} rows with errors`
                    }
                  </span>
                  {!validation.valid && (
                    <span className="text-gray-400 text-sm">
                      ({validation.errors.length} errors to fix)
                    </span>
                  )}
                </div>
              )}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Toolbar */}
          <div className="flex items-center gap-2 p-3 border-b border-gray-700 bg-gray-800/50">
            <button
              onClick={addRow}
              className="px-3 py-1.5 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
            >
              + Add Row
            </button>
            <button
              onClick={removeSelectedRows}
              className="px-3 py-1.5 bg-gray-700 hover:bg-red-600 text-white text-sm rounded transition-colors"
            >
              Remove Selected
            </button>
            <div className="flex-1"></div>
            <span className="text-gray-400 text-sm">
              {data.length} templates • Paste from Excel supported
            </span>
          </div>

          {/* Handsontable Grid */}
          <div className="flex-1 overflow-auto p-4 min-h-0">
            <HotTable
              ref={hotTableRef}
              data={data}
              rowHeaders={true}
              colHeaders={CSV_COLUMNS.map(col => CSV_COLUMN_HEADERS[col].replace(' *', ''))}
              width="100%"
              height="100%"
              licenseKey="non-commercial-and-evaluation"
              contextMenu={true}
              copyPaste={true}
              afterChange={handleAfterChange}
              stretchH="all"
              manualColumnResize={true}
              manualRowResize={true}
              className="htDark"
              cells={(row, col) => {
                const colName = getColumnName(col)
                if (!colName) return {}
                
                return {
                  renderer: cellRenderer,
                  type: getColumnType(colName),
                  source: getDropdownSource(colName) || undefined,
                  strict: colName === 'category' || colName === 'compliance_type'
                }
              }}
            />
          </div>

          {/* Error List */}
          {validation && !validation.valid && (
            <div className="p-4 border-t border-gray-700 max-h-32 overflow-y-auto bg-red-900/20">
              <h3 className="text-red-400 font-medium mb-2">Validation Errors:</h3>
              <ul className="text-sm text-red-300 space-y-1">
                {validation.errors.slice(0, 10).map((error, idx) => (
                  <li key={idx}>
                    Row {error.row + 1}, {error.column}: {error.message}
                  </li>
                ))}
                {validation.errors.length > 10 && (
                  <li className="text-red-400">
                    ... and {validation.errors.length - 10} more errors
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-between items-center p-4 border-t border-gray-700">
            <button
              onClick={() => setState('upload')}
              className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              ← Back to Upload
            </button>
            <button
              onClick={handleUpload}
              disabled={!validation?.valid}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                validation?.valid
                  ? 'bg-primary-orange hover:bg-primary-orange/90 text-white'
                  : 'bg-gray-700 text-gray-500 cursor-not-allowed'
              }`}
            >
              Upload {validation?.validRows || 0} Templates
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Render uploading state
  if (state === 'uploading') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 border border-gray-700 rounded-xl p-8 text-center">
          <div className="animate-spin w-12 h-12 border-4 border-primary-orange border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-white text-lg">Uploading templates...</p>
          <p className="text-gray-400 text-sm mt-2">This may take a moment</p>
        </div>
      </div>
    )
  }

  // Render success state
  if (state === 'success') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md mx-4 p-6 text-center">
          <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Upload Successful!</h2>
          <p className="text-gray-300 mb-4">
            {uploadResult?.created || 0} compliance templates have been created.
          </p>
          {uploadResult?.errors && uploadResult.errors.length > 0 && (
            <div className="bg-yellow-900/20 border border-yellow-700 rounded-lg p-3 mb-4 text-left">
              <p className="text-yellow-400 text-sm font-medium mb-1">Warnings:</p>
              <ul className="text-yellow-300 text-xs space-y-1">
                {uploadResult.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          <button
            onClick={onClose}
            className="px-6 py-2 bg-primary-orange hover:bg-primary-orange/90 text-white rounded-lg font-medium transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  // Render error state
  if (state === 'error') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-md mx-4 p-6 text-center">
          <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-white mb-2">Upload Failed</h2>
          <p className="text-gray-300 mb-4">
            {uploadResult?.created || 0} templates were created before the error.
          </p>
          {uploadResult?.errors && uploadResult.errors.length > 0 && (
            <div className="bg-red-900/20 border border-red-700 rounded-lg p-3 mb-4 text-left">
              <p className="text-red-400 text-sm font-medium mb-1">Errors:</p>
              <ul className="text-red-300 text-xs space-y-1 max-h-40 overflow-y-auto">
                {uploadResult.errors.map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => setState('editing')}
              className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition-colors"
            >
              Back to Editor
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-primary-orange hover:bg-primary-orange/90 text-white rounded-lg font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
