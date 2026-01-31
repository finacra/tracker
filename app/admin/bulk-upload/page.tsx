'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
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

const STORAGE_KEY_PREFIX = 'bulk_upload_spreadsheet_data'

export default function BulkUploadPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [data, setData] = useState<string[][]>([])
  const [validation, setValidation] = useState<ValidationResult | null>(null)
  const [cellErrors, setCellErrors] = useState<Map<string, string>>(new Map())
  const [isUploading, setIsUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState<{ created: number; errors: string[] } | null>(null)
  const [hotInstance, setHotInstance] = useState<any>(null)
  const [isInitialized, setIsInitialized] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const initRef = useRef(false) // Prevent double initialization
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Get user-specific storage key
  const getStorageKey = useCallback(() => {
    if (!user?.id) return null
    return `${STORAGE_KEY_PREFIX}_${user.id}`
  }, [user?.id])

  // Save to localStorage with user ID and timestamp
  const saveToLocalStorage = useCallback((tableData: string[][]) => {
    if (!user?.id) return
    
    try {
      const storageKey = getStorageKey()
      if (!storageKey) return
      
      const saveData = {
        userId: user.id,
        data: tableData,
        savedAt: new Date().toISOString()
      }
      
      localStorage.setItem(storageKey, JSON.stringify(saveData))
      setLastSaved(new Date())
      setIsSaving(false)
      console.log('[AutoSave] Data saved to localStorage for user:', user.id)
    } catch (error) {
      console.error('[AutoSave] Failed to save to localStorage:', error)
    }
  }, [user?.id, getStorageKey])

  // Load from localStorage (only if user matches)
  const loadFromLocalStorage = useCallback((): string[][] | null => {
    if (!user?.id) return null
    
    try {
      const storageKey = getStorageKey()
      if (!storageKey) return null
      
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = JSON.parse(saved) as { userId: string; data: string[][]; savedAt: string }
        
        // Verify user ID matches
        if (parsed.userId !== user.id) {
          console.log('[AutoSave] User ID mismatch, clearing old data')
          localStorage.removeItem(storageKey)
          return null
        }
        
        console.log('[AutoSave] Loaded data from localStorage:', parsed.data.length, 'rows, saved at:', parsed.savedAt)
        if (parsed.savedAt) {
          setLastSaved(new Date(parsed.savedAt))
        }
        return parsed.data
      }
    } catch (error) {
      console.error('[AutoSave] Failed to load from localStorage:', error)
    }
    return null
  }, [user?.id, getStorageKey])

  // Clear localStorage
  const clearLocalStorage = useCallback(() => {
    if (!user?.id) return
    
    try {
      const storageKey = getStorageKey()
      if (!storageKey) return
      
      localStorage.removeItem(storageKey)
      setLastSaved(null)
      console.log('[AutoSave] Cleared localStorage for user:', user.id)
    } catch (error) {
      console.error('[AutoSave] Failed to clear localStorage:', error)
    }
  }, [user?.id, getStorageKey])

  // Debounced auto-save
  const autoSave = useCallback((tableData: string[][]) => {
    setIsSaving(true)
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current)
    }
    // Save after 2 seconds of inactivity
    saveTimeoutRef.current = setTimeout(() => {
      saveToLocalStorage(tableData)
    }, 2000)
  }, [saveToLocalStorage])

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
    console.log('[BulkUpload] useEffect starting...', 'user:', user?.id)
    
    // Wait for user to be available
    if (!user?.id) {
      console.log('[BulkUpload] User not available yet, waiting...')
      return
    }
    
    // Prevent double initialization in React Strict Mode
    if (initRef.current) {
      console.log('[BulkUpload] Already initialized, skipping...')
      return
    }
    
    // Wait for container to be available
    const waitForContainer = () => {
      console.log('[BulkUpload] Waiting for container...')
      if (!containerRef.current) {
        console.log('[BulkUpload] Container not ready, retrying in 100ms...')
        setTimeout(waitForContainer, 100)
        return
      }
      console.log('[BulkUpload] Container found, initializing...')
      initRef.current = true
      initHandsontable()
    }
    
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

        // Load from localStorage or create empty data
        const savedData = loadFromLocalStorage()
        let initialData: string[][]
        if (savedData && savedData.length > 0) {
          initialData = savedData
          console.log('[BulkUpload] Loaded', initialData.length, 'rows from localStorage')
        } else {
          initialData = Array(10).fill(null).map(() => CSV_COLUMNS.map(() => ''))
          console.log('[BulkUpload] Starting with empty data')
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
          // Auto-save to localStorage (debounced)
          autoSave(newData)
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
      setIsInitialized(true)
      
      } catch (error) {
        console.error('[BulkUpload] Error initializing Handsontable:', error)
      }
    }

    // Start waiting for container
    waitForContainer()

    return () => {
      // Clear save timeout on unmount
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [user?.id, loadFromLocalStorage, dataToRows, autoSave])

  // Handle user changes (sign out/sign in)
  useEffect(() => {
    if (!hotInstance || !user?.id) return
    
    // When user changes, load their saved data
    const savedData = loadFromLocalStorage()
    if (savedData && savedData.length > 0) {
      hotInstance.loadData(savedData)
      setData(savedData)
      runValidation(savedData)
      console.log('[AutoSave] Loaded data for user after sign in:', user.id)
    }
  }, [user?.id, hotInstance, loadFromLocalStorage, runValidation])

  // Cleanup and save on unmount
  useEffect(() => {
    return () => {
      // Save current data before unmounting
      if (hotInstance && user?.id) {
        try {
          const storageKey = getStorageKey()
          if (!storageKey) return
          
          const currentData = hotInstance.getData() as string[][]
          if (currentData && currentData.length > 0 && currentData.some(row => row.some(cell => cell && cell.trim()))) {
            const saveData = {
              userId: user.id,
              data: currentData,
              savedAt: new Date().toISOString()
            }
            localStorage.setItem(storageKey, JSON.stringify(saveData))
            console.log('[AutoSave] Saved on unmount for user:', user.id)
          }
        } catch (error) {
          console.error('[AutoSave] Failed to save on unmount:', error)
        }
      }
    }
  }, [hotInstance, user?.id, getStorageKey])

  // Add rows
  const addRows = useCallback((count: number = 1) => {
    if (hotInstance) {
      const currentRowCount = hotInstance.countRows()
      hotInstance.alter('insert_row_below', currentRowCount - 1, count)
      // Trigger auto-save
      setTimeout(() => {
        const newData = hotInstance.getData() as string[][]
        autoSave(newData)
      }, 100)
    }
  }, [hotInstance, autoSave])

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
        // Trigger auto-save
        setTimeout(() => {
          const newData = hotInstance.getData() as string[][]
          autoSave(newData)
        }, 100)
      }
    }
  }, [hotInstance, autoSave])

  // Clear all
  const clearAll = useCallback(() => {
    if (hotInstance) {
      const emptyData = Array(10).fill(null).map(() => CSV_COLUMNS.map(() => ''))
      hotInstance.loadData(emptyData)
      setData(emptyData)
      setValidation(null)
      setCellErrors(new Map())
      // Clear localStorage and save empty data
      clearLocalStorage()
      saveToLocalStorage(emptyData)
    }
  }, [hotInstance, clearLocalStorage, saveToLocalStorage])

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
        // Auto-save imported data
        autoSave(tableData)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }, [hotInstance, runValidation, autoSave])

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
        // Clear localStorage after successful upload
        clearLocalStorage()
        // Clear the spreadsheet
        const emptyData = Array(10).fill(null).map(() => CSV_COLUMNS.map(() => ''))
        hotInstance.loadData(emptyData)
        setData(emptyData)
        setValidation(null)
        setCellErrors(new Map())
        alert(`Successfully created ${result.created} templates!`)
      }
    } catch (error) {
      setUploadResult({ created: 0, errors: [(error as Error).message] })
    } finally {
      setIsUploading(false)
    }
  }, [hotInstance, dataToRows, clearLocalStorage])

  // Get non-empty row count
  const nonEmptyRowCount = data.filter(row => row.some(cell => cell && cell.trim())).length

  return (
    <div className="min-h-screen bg-[#f3f3f3] flex flex-col">
      {/* Excel-style Header - Green ribbon */}
      <div className="bg-[#217346] px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/admin')}
              className="text-white/80 hover:text-white transition-colors text-sm flex items-center gap-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <div className="flex items-center gap-2">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.17 3H7.83A1.83 1.83 0 006 4.83v14.34A1.83 1.83 0 007.83 21h13.34A1.83 1.83 0 0023 19.17V4.83A1.83 1.83 0 0021.17 3zM12 17h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2zm4 8h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/>
              </svg>
              <h1 className="text-lg font-semibold text-white">Compliance Templates</h1>
            </div>
            {validation && (
              <span className={`px-3 py-1 rounded text-xs font-medium ${
                validation.valid
                  ? 'bg-white/20 text-white'
                  : 'bg-red-500 text-white'
              }`}>
                {nonEmptyRowCount} rows • {validation.valid ? 'Ready to upload' : `${validation.errors.length} errors`}
              </span>
            )}
            {/* Auto-save indicator */}
            {lastSaved && (
              <span className="px-3 py-1 rounded text-xs font-medium bg-white/10 text-white/80 flex items-center gap-1.5">
                {isSaving ? (
                  <>
                    <div className="w-3 h-3 border-2 border-white/50 border-t-transparent rounded-full animate-spin"></div>
                    Saving...
                  </>
                ) : (
                  <>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Saved {lastSaved.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </>
                )}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={downloadCSVTemplate}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Template
            </button>
            <label className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-sm rounded transition-colors cursor-pointer flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Import
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
              className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 shadow-md ${
                validation?.valid && nonEmptyRowCount > 0 && !isUploading
                  ? 'bg-white text-[#217346] hover:bg-gray-100 hover:shadow-lg'
                  : 'bg-white/30 text-white/50 cursor-not-allowed'
              }`}
            >
              {isUploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-[#217346] border-t-transparent rounded-full animate-spin"></div>
                  Creating Templates...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Upload {nonEmptyRowCount} Template{nonEmptyRowCount !== 1 ? 's' : ''}
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Excel-style Toolbar - Light gray ribbon */}
      <div className="bg-[#f3f3f3] border-b border-[#d4d4d4] px-4 py-1.5 flex items-center gap-1">
        <div className="flex items-center gap-0.5 border-r border-[#d4d4d4] pr-2 mr-2">
          <button
            onClick={() => addRows(1)}
            className="px-2 py-1 hover:bg-[#e5e5e5] text-[#333] text-xs rounded transition-colors flex items-center gap-1"
            title="Insert Row"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Row
          </button>
          <button
            onClick={() => addRows(5)}
            className="px-2 py-1 hover:bg-[#e5e5e5] text-[#333] text-xs rounded transition-colors"
            title="Insert 5 Rows"
          >
            +5
          </button>
        </div>
        <button
          onClick={removeSelectedRows}
          className="px-2 py-1 hover:bg-[#e5e5e5] text-[#333] text-xs rounded transition-colors flex items-center gap-1"
          title="Delete Selected Rows"
        >
          <svg className="w-4 h-4 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Delete
        </button>
        <button
          onClick={clearAll}
          className="px-2 py-1 hover:bg-[#e5e5e5] text-[#333] text-xs rounded transition-colors"
          title="Clear All Data"
        >
          Clear All
        </button>
        <div className="flex-1"></div>
        <span className="text-[#666] text-xs">
          Ctrl+C/V • Right-click for menu • Tab to move cells
        </span>
      </div>

      {/* Spreadsheet Container */}
      <div className="flex-1 relative bg-white border border-[#d4d4d4]" style={{ minHeight: 'calc(100vh - 120px)' }}>
        <div 
          ref={containerRef} 
          className="absolute inset-0"
          style={{ overflow: 'hidden' }}
        />
        {/* Loading overlay */}
        {!isInitialized && (
          <div className="absolute inset-0 bg-white flex items-center justify-center z-10">
            <div className="text-center">
              <div className="animate-spin w-12 h-12 border-4 border-[#217346] border-t-transparent rounded-full mx-auto mb-4"></div>
              <p className="text-[#666]">Loading spreadsheet...</p>
            </div>
          </div>
        )}
      </div>

      {/* Error Panel - Excel-style warning bar */}
      {validation && !validation.valid && (
        <div className="bg-[#fff3cd] border-t border-[#ffc107] px-4 py-2">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-[#856404]" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <span className="text-[#856404] text-sm font-medium">
              {validation.errors.length} validation error{validation.errors.length > 1 ? 's' : ''} found
            </span>
            <div className="flex-1 overflow-x-auto">
              <div className="flex gap-2">
                {validation.errors.slice(0, 5).map((error, idx) => (
                  <span key={idx} className="text-xs text-[#856404] bg-[#fff3cd] border border-[#ffc107] px-2 py-0.5 rounded whitespace-nowrap">
                    Row {error.row + 1}: {error.column}
                  </span>
                ))}
                {validation.errors.length > 5 && (
                  <span className="text-xs text-[#856404]">+{validation.errors.length - 5} more</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Result - Excel-style info bar */}
      {uploadResult && (
        <div className={`border-t px-4 py-2 ${uploadResult.errors.length > 0 ? 'bg-[#fff3cd] border-[#ffc107]' : 'bg-[#d4edda] border-[#28a745]'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className={`w-5 h-5 ${uploadResult.errors.length > 0 ? 'text-[#856404]' : 'text-[#155724]'}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className={`text-sm font-medium ${uploadResult.errors.length > 0 ? 'text-[#856404]' : 'text-[#155724]'}`}>
                {uploadResult.created} template{uploadResult.created !== 1 ? 's' : ''} saved successfully
              </span>
              {uploadResult.errors.length > 0 && (
                <span className="text-[#856404] text-sm">({uploadResult.errors.length} warnings)</span>
              )}
            </div>
            <button
              onClick={() => setUploadResult(null)}
              className="text-[#666] hover:text-[#333] p-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Excel-style styles for Handsontable */}
      <style jsx global>{`
        .handsontable {
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 12px;
          color: #333;
        }
        .handsontable table {
          border-collapse: collapse;
        }
        /* Cell styling - white background like Excel */
        .handsontable th,
        .handsontable td {
          background: #fff;
          border: 1px solid #d4d4d4;
          color: #333;
        }
        /* Column headers - gray like Excel */
        .handsontable th {
          background: linear-gradient(180deg, #f8f8f8 0%, #e8e8e8 100%);
          color: #333;
          font-weight: 600;
          font-size: 11px;
          border-bottom: 1px solid #b4b4b4;
        }
        /* Row headers - gray like Excel */
        .handsontable .ht_master tr th,
        .handsontable .ht_clone_left tr th {
          background: linear-gradient(90deg, #f8f8f8 0%, #e8e8e8 100%);
          color: #333;
          font-weight: 400;
          min-width: 50px;
        }
        /* Hover effect */
        .handsontable tbody tr:hover td {
          background: #f5f5f5;
        }
        /* Selection - blue like Excel */
        .handsontable td.current {
          background: #cce4f7 !important;
          border: 2px solid #0078d4 !important;
        }
        .handsontable td.area {
          background: #cce4f7 !important;
        }
        .handsontable .wtBorder {
          background-color: #0078d4 !important;
        }
        /* Invalid cells - red background */
        .handsontable .htCore td.htInvalid {
          background: #ffeaea !important;
          border-color: #ff6b6b !important;
        }
        /* Input styling - Excel blue border */
        .handsontable input,
        .handsontable textarea {
          background: #fff;
          color: #333;
          border: 2px solid #0078d4;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          font-size: 12px;
        }
        /* Autocomplete arrow */
        .handsontable .htAutocompleteArrow {
          color: #666;
        }
        /* Dropdown and context menus */
        .htDropdownMenu,
        .htContextMenu {
          background: #fff !important;
          border: 1px solid #d4d4d4 !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
        }
        .htDropdownMenu td,
        .htContextMenu td {
          background: #fff !important;
          color: #333 !important;
          font-size: 12px;
        }
        .htDropdownMenu td:hover,
        .htContextMenu td:hover,
        .htDropdownMenu td.current,
        .htContextMenu td.current {
          background: #e5f3ff !important;
        }
        /* Dimmed cells */
        .handsontable .htDimmed {
          color: #999;
        }
        .handsontable .htNoWrap {
          white-space: nowrap;
        }
        /* Autocomplete indicator */
        .handsontable .htAutocomplete {
          position: relative;
        }
        .handsontable .htAutocomplete::after {
          content: '▼';
          position: absolute;
          right: 4px;
          top: 50%;
          transform: translateY(-50%);
          font-size: 7px;
          color: #666;
        }
        /* Column resize handle */
        .handsontable .manualColumnResizer {
          background: #0078d4;
        }
        /* Corner and clone areas */
        .ht_clone_top,
        .ht_clone_left,
        .ht_clone_top_left_corner {
          z-index: 100;
        }
        .ht_clone_top_left_corner th {
          background: linear-gradient(135deg, #f0f0f0 0%, #e0e0e0 100%);
        }
        .htMenu {
          z-index: 1000;
        }
        /* Alternating row colors for better readability */
        .handsontable tbody tr:nth-child(even) td {
          background: #fafafa;
        }
        .handsontable tbody tr:nth-child(even) td.current,
        .handsontable tbody tr:nth-child(even) td.area {
          background: #cce4f7 !important;
        }
        /* Required column headers - green accent */
        .handsontable th span {
          color: #217346;
          font-weight: 700;
        }
        /* Scrollbar styling */
        .handsontable ::-webkit-scrollbar {
          width: 12px;
          height: 12px;
        }
        .handsontable ::-webkit-scrollbar-track {
          background: #f1f1f1;
        }
        .handsontable ::-webkit-scrollbar-thumb {
          background: #c1c1c1;
          border-radius: 6px;
        }
        .handsontable ::-webkit-scrollbar-thumb:hover {
          background: #a8a8a8;
        }
      `}</style>
    </div>
  )
}
