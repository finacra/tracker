'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
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
} from '@/lib/compliance/csv-template'
import {
  validateAll,
  ValidationResult,
  getColumnName
} from '@/lib/compliance/validators'
import { bulkCreateComplianceTemplates } from '@/app/data-room/actions'

export default function BulkUploadPage() {
  const router = useRouter()
  const [data, setData] = useState<string[][]>([])
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [cellErrors, setCellErrors] = useState<Map<string, string>>(new Map())
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ created: number; errors: string[] } | null>(null)
  const [isClient, setIsClient] = useState(false)
  const [hotInstance, setHotInstance] = useState<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
    const nonEmptyData = tableData.filter(row => row.some(cell => cell && cell.trim()))
    const rows = dataToRows(nonEmptyData)
    const result = validateAll(rows)
    setValidation(result)

    const errors = new Map<string, string>()
    result.errors.forEach(error => {
      errors.set(`${error.row}-${error.columnIndex}`, error.message || 'Invalid')
    })
    setCellErrors(errors)
  }, [dataToRows])

  // Initialize Handsontable on client side only
  useEffect(() => {
    console.log('[BulkUpload] useEffect starting...')
    setIsClient(true)
    
    // Dynamic import of Handsontable
    const initHandsontable = async () => {
      console.log('[BulkUpload] initHandsontable called')
      console.log('[BulkUpload] containerRef.current:', containerRef.current)
      
      if (!containerRef.current) {
        console.error('[BulkUpload] Container ref is null!')
        return
      }
      
      console.log('[BulkUpload] Container dimensions:', {
        width: containerRef.current.offsetWidth,
        height: containerRef.current.offsetHeight,
        clientWidth: containerRef.current.clientWidth,
        clientHeight: containerRef.current.clientHeight
      })
      
      try {
        console.log('[BulkUpload] Importing Handsontable...')
        // Import Handsontable dynamically
        const Handsontable = (await import('handsontable')).default
        console.log('[BulkUpload] Handsontable imported:', typeof Handsontable)
        
        const { registerAllModules } = await import('handsontable/registry')
        console.log('[BulkUpload] registerAllModules imported')
        
        registerAllModules()
        console.log('[BulkUpload] Modules registered')

        // Check for stored data
        const storedData = sessionStorage.getItem('bulkUploadData')
        let initialData: string[][]
        if (storedData) {
          initialData = JSON.parse(storedData)
          sessionStorage.removeItem('bulkUploadData')
        } else {
          initialData = Array(10).fill(null).map(() => CSV_COLUMNS.map(() => ''))
        }
        
        console.log('[BulkUpload] Initial data rows:', initialData.length)
        setData(initialData)

      // Dropdown sources
      const getDropdownSource = (column: keyof CSVTemplateRow): string[] | undefined => {
        switch (column) {
          case 'category': return [...CATEGORIES]
          case 'compliance_type': return [...COMPLIANCE_TYPES]
          case 'entity_types': return [...ENTITY_TYPES]
          case 'industries': return [...INDUSTRIES]
          case 'industry_categories': return [...INDUSTRY_CATEGORIES]
          case 'penalty_type': return ['daily', 'flat', 'interest', 'percentage']
          case 'is_critical':
          case 'is_active': return ['true', 'false']
          default: return undefined
        }
      }

      // Column configurations
      const columns = CSV_COLUMNS.map((col, idx) => {
        const base: any = { data: idx }
        
        const dropdownColumns = ['category', 'compliance_type', 'penalty_type', 'is_critical', 'is_active']
        const autocompleteColumns = ['entity_types', 'industries', 'industry_categories']
        const numericColumns = ['due_date_offset', 'due_month', 'due_day', 'penalty_rate', 'penalty_cap']
        
        if (dropdownColumns.includes(col)) {
          base.type = 'dropdown'
          base.source = getDropdownSource(col)
          base.strict = col === 'category' || col === 'compliance_type'
        } else if (autocompleteColumns.includes(col)) {
          base.type = 'autocomplete'
          base.source = getDropdownSource(col)
          base.strict = false
        } else if (numericColumns.includes(col)) {
          base.type = 'numeric'
        } else if (col === 'due_date') {
          base.type = 'date'
          base.dateFormat = 'YYYY-MM-DD'
        }
        
        return base
      })

      console.log('[BulkUpload] Creating Handsontable instance...')
      console.log('[BulkUpload] Columns configured:', columns.length)
      
      // Create the Handsontable instance
      const hot = new Handsontable(containerRef.current, {
        data: initialData,
        rowHeaders: true,
        colHeaders: CSV_COLUMNS.map(col => {
          const header = CSV_COLUMN_HEADERS[col]
          return header.replace(' *', '<span style="color:#f97316"> *</span>')
        }),
        columns: columns,
        width: '100%',
        height: '100%',
        licenseKey: 'non-commercial-and-evaluation',
        contextMenu: true,
        copyPaste: true,
        stretchH: 'all',
        manualColumnResize: true,
        manualRowResize: true,
        autoColumnSize: true,
        minSpareRows: 1,
        colWidths: CSV_COLUMNS.map(col => {
          if (col === 'description' || col === 'possible_legal_action') return 200
          if (col === 'requirement' || col === 'required_documents') return 180
          if (col === 'entity_types' || col === 'industries' || col === 'industry_categories') return 180
          return 120
        }),
        afterChange: (changes, source) => {
          if (!changes) return
          const newData = hot.getData() as string[][]
          setData(newData)
          // Validate
          const nonEmptyData = newData.filter(row => row.some(cell => cell && cell.trim()))
          const rows = dataToRows(nonEmptyData)
          const result = validateAll(rows)
          setValidation(result)
          const errors = new Map<string, string>()
          result.errors.forEach(error => {
            errors.set(`${error.row}-${error.columnIndex}`, error.message || 'Invalid')
          })
          setCellErrors(errors)
        },
        cells: function(row, col) {
          const cellProperties: any = {}
          const errorKey = `${row}-${col}`
          // This would require re-rendering which is complex in vanilla Handsontable
          return cellProperties
        }
      })

      console.log('[BulkUpload] Handsontable instance created:', hot)
      console.log('[BulkUpload] Instance methods available:', Object.keys(hot).slice(0, 10))
      
      setHotInstance(hot)
      
      // Force render
      setTimeout(() => {
        console.log('[BulkUpload] Calling render...')
        hot.render()
        console.log('[BulkUpload] Render called, checking dimensions...')
        console.log('[BulkUpload] Container after render:', {
          width: containerRef.current?.offsetWidth,
          height: containerRef.current?.offsetHeight
        })
      }, 100)
      
      // Initial validation
      const nonEmptyData = initialData.filter(row => row.some(cell => cell && cell.trim()))
      if (nonEmptyData.length > 0) {
        const rows = dataToRows(nonEmptyData)
        const result = validateAll(rows)
        setValidation(result)
      }
      
      console.log('[BulkUpload] Initialization complete!')
      
      } catch (error) {
        console.error('[BulkUpload] Error initializing Handsontable:', error)
      }
    }

    initHandsontable()

    return () => {
      if (hotInstance) {
        hotInstance.destroy()
      }
    }
  }, [])

  // Add rows
  const addRows = useCallback((count: number = 1) => {
    if (hotInstance) {
      const currentRowCount = hotInstance.countRows()
      hotInstance.alter('insert_row_below', currentRowCount - 1, count)
    }
  }, [hotInstance])

  // Remove selected rows
  const removeSelectedRows = useCallback(() => {
    if (hotInstance) {
      const selected = hotInstance.getSelected()
      if (selected) {
        const rowsToDelete: number[] = []
        selected.forEach((selection: [number, number, number, number]) => {
          const [startRow, , endRow] = selection
          for (let i = Math.min(startRow, endRow); i <= Math.max(startRow, endRow); i++) {
            if (!rowsToDelete.includes(i)) {
              rowsToDelete.push(i)
            }
          }
        })
        // Sort descending to delete from bottom up
        rowsToDelete.sort((a, b) => b - a)
        rowsToDelete.forEach(row => {
          hotInstance.alter('remove_row', row, 1)
        })
      }
    }
  }, [hotInstance])

  // Clear all
  const clearAll = useCallback(() => {
    if (hotInstance) {
      const emptyData = Array(10).fill(null).map(() => CSV_COLUMNS.map(() => ''))
      hotInstance.loadData(emptyData)
      setData(emptyData)
      setValidation(null)
      setCellErrors(new Map())
    }
  }, [hotInstance])

  // Import CSV file
  const handleFileImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !hotInstance) return

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
        hotInstance.loadData(tableData)
        setData(tableData)
        runValidation(tableData)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [hotInstance, runValidation])

  // Handle upload
  const handleUpload = useCallback(async () => {
    if (!hotInstance) return
    
    const currentData = hotInstance.getData() as string[][]
    const nonEmptyData = currentData.filter(row => row.some(cell => cell && cell.trim()))
    
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
  }, [hotInstance, dataToRows])

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
          Ctrl+C/V to copy/paste • Right-click for options • Click cells for dropdowns
        </span>
      </div>

      {/* Spreadsheet Container */}
      <div className="flex-1 relative" style={{ minHeight: 'calc(100vh - 180px)' }}>
        <div 
          ref={containerRef} 
          className="absolute inset-0"
          style={{ overflow: 'hidden' }}
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

      {/* Dark mode styles for Handsontable */}
      <style jsx global>{`
        .handsontable {
          font-family: inherit;
          color: #e5e7eb;
        }
        .handsontable table {
          border-collapse: collapse;
        }
        .handsontable th,
        .handsontable td {
          background: #111827;
          border: 1px solid #374151;
          color: #e5e7eb;
        }
        .handsontable th {
          background: #1f2937;
          color: #9ca3af;
          font-weight: 500;
        }
        .handsontable .ht_master tr th {
          background: #1f2937;
        }
        .handsontable tbody tr:hover td {
          background: #1a2332;
        }
        .handsontable td.current,
        .handsontable td.area {
          background: #1e3a5f !important;
        }
        .handsontable .htCore td.htInvalid {
          background: rgba(239, 68, 68, 0.3) !important;
        }
        .handsontable input,
        .handsontable textarea {
          background: #1f2937;
          color: #e5e7eb;
          border: 2px solid #f97316;
        }
        .handsontable .htAutocompleteArrow {
          color: #9ca3af;
        }
        .htDropdownMenu,
        .htContextMenu {
          background: #1f2937 !important;
          border: 1px solid #374151 !important;
        }
        .htDropdownMenu td,
        .htContextMenu td {
          background: #1f2937 !important;
          color: #e5e7eb !important;
        }
        .htDropdownMenu td:hover,
        .htContextMenu td:hover,
        .htDropdownMenu td.current,
        .htContextMenu td.current {
          background: #374151 !important;
        }
        .handsontable .htDimmed {
          color: #6b7280;
        }
        .handsontable .htNoWrap {
          white-space: nowrap;
        }
        .handsontable .htAutocomplete {
          position: relative;
        }
        .handsontable .htAutocomplete::after {
          content: '▼';
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 8px;
          color: #6b7280;
        }
        .ht_clone_top,
        .ht_clone_left,
        .ht_clone_top_left_corner {
          z-index: 100;
        }
        .htMenu {
          z-index: 1000;
        }
      `}</style>
    </div>
  )
}
