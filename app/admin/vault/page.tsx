'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import SubtleCircuitBackground from '@/components/SubtleCircuitBackground'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  getDocumentTemplates,
  createDocumentTemplate,
  updateDocumentTemplate,
  deleteDocumentTemplate,
  testServerAction,
  type FolderInfo,
  type DocumentTemplate,
} from './actions'
import {
  parseFolderPath,
  buildBreadcrumb,
  getFolderName,
  getParentPath,
} from '@/lib/vault/folder-utils'

export default function VaultManagementPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [folders, setFolders] = useState<FolderInfo[]>([])
  const [templates, setTemplates] = useState<DocumentTemplate[]>([])
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false)
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false)
  const [showCreateTemplateModal, setShowCreateTemplateModal] = useState(false)
  const [editingFolder, setEditingFolder] = useState<FolderInfo | null>(null)
  const [editingTemplate, setEditingTemplate] = useState<DocumentTemplate | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  // Form states
  const [folderForm, setFolderForm] = useState({ name: '', description: '' })
  const [templateForm, setTemplateForm] = useState({
    name: '',
    frequency: 'monthly' as 'one-time' | 'monthly' | 'quarterly' | 'yearly',
    category: '',
    description: '',
    isMandatory: false,
  })

  useEffect(() => {
    console.log('[VAULT PAGE] useEffect triggered:', {
      hasUser: !!user,
      userId: user?.id,
      selectedFolderPath,
      pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
    })

    if (!user) {
      console.log('[VAULT PAGE] No user, redirecting to /')
      router.push('/')
      return
    }
    
    console.log('[VAULT PAGE] User exists, loading data...')
    // Only load data if user exists, don't redirect immediately
    // Let loadData handle the superadmin check and redirect
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, selectedFolderPath]) // Removed router from dependencies to prevent infinite loops

  const loadData = async () => {
    console.log('[VAULT PAGE] loadData called')
    setIsLoading(true)
    try {
      // Test if server actions work at all
      console.log('[VAULT PAGE] Testing server action...')
      try {
        const testResult = await testServerAction()
        console.log('[VAULT PAGE] Test server action result:', testResult)
      } catch (testErr) {
        console.error('[VAULT PAGE] Test server action failed:', testErr)
      }
      
      console.log('[VAULT PAGE] Calling getFolders and getDocumentTemplates...')
      console.log('[VAULT PAGE] Selected folder path:', selectedFolderPath)
      
      console.log('[VAULT PAGE] About to call getFolders...')
      const foldersPromise = getFolders().catch((err) => {
        console.error('[VAULT PAGE] getFolders promise rejected:', err)
        return { success: false, error: err.message || 'Unknown error' }
      })
      
      console.log('[VAULT PAGE] About to call getDocumentTemplates...')
      const templatesPromise = getDocumentTemplates(selectedFolderPath).catch((err) => {
        console.error('[VAULT PAGE] getDocumentTemplates promise rejected:', err)
        return { success: false, error: err.message || 'Unknown error' }
      })
      
      console.log('[VAULT PAGE] Promises created, awaiting...')
      console.log('[VAULT PAGE] Promise objects:', {
        foldersPromise: typeof foldersPromise,
        templatesPromise: typeof templatesPromise,
        foldersPromiseThen: typeof foldersPromise.then,
        templatesPromiseThen: typeof templatesPromise.then,
      })
      
      // Use Promise.allSettled with a timeout wrapper
      const timeout = 30000 // 30 seconds
      const resultsPromise = Promise.allSettled([
        foldersPromise,
        templatesPromise,
      ])
      
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout)
      })
      
      let results: PromiseSettledResult<any>[]
      try {
        results = await Promise.race([resultsPromise, timeoutPromise])
      } catch (error) {
        // Timeout occurred
        throw error
      }
      
      const foldersResult = results[0].status === 'fulfilled' 
        ? results[0].value 
        : { success: false, error: results[0].status === 'rejected' ? results[0].reason?.message || 'Unknown error' : 'Promise rejected' }
      const templatesResult = results[1].status === 'fulfilled'
        ? results[1].value
        : { success: false, error: results[1].status === 'rejected' ? results[1].reason?.message || 'Unknown error' : 'Promise rejected' }
      
      console.log('[VAULT PAGE] Promise results status:', {
        foldersStatus: results[0].status,
        templatesStatus: results[1].status,
        foldersError: results[0].status === 'rejected' ? results[0].reason : null,
        templatesError: results[1].status === 'rejected' ? results[1].reason : null,
      })

      console.log('[VAULT PAGE] Results received:', {
        foldersSuccess: foldersResult.success,
        foldersError: foldersResult.error,
        foldersCount: 'folders' in foldersResult ? foldersResult.folders?.length || 0 : 0,
        templatesSuccess: templatesResult.success,
        templatesError: templatesResult.error,
        templatesCount: 'templates' in templatesResult ? templatesResult.templates?.length || 0 : 0,
      })

      // Check if user is not superadmin and redirect
      if (!foldersResult.success && foldersResult.error?.includes('superadmin')) {
        console.log('[VAULT PAGE] User is not superadmin, redirecting to data-room')
        router.push('/data-room')
        return
      }

      // Check for other errors
      if (!foldersResult.success) {
        console.error('[VAULT PAGE] Failed to load folders:', foldersResult.error)
        alert(`Failed to load folders: ${foldersResult.error}`)
      }

      if (!templatesResult.success) {
        console.error('[VAULT PAGE] Failed to load templates:', templatesResult.error)
        // Don't alert for template errors, just log
      }

      if (foldersResult.success && 'folders' in foldersResult && foldersResult.folders) {
        console.log('[VAULT PAGE] Setting folders:', foldersResult.folders.length)
        setFolders(foldersResult.folders)
      } else {
        console.log('[VAULT PAGE] No folders to set')
        setFolders([])
      }

      if (templatesResult.success && 'templates' in templatesResult && templatesResult.templates) {
        console.log('[VAULT PAGE] Setting templates:', templatesResult.templates.length)
        setTemplates(templatesResult.templates)
      } else {
        console.log('[VAULT PAGE] No templates to set')
        setTemplates([])
      }
    } catch (error) {
      console.error('[VAULT PAGE] Error loading vault data:', error)
      console.error('[VAULT PAGE] Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      })
      alert(`Error loading vault data: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsLoading(false)
      console.log('[VAULT PAGE] loadData completed, isLoading set to false')
    }
  }

  const handleCreateFolder = async () => {
    if (!folderForm.name.trim()) {
      alert('Please enter a folder name')
      return
    }

    setIsCreatingFolder(true)
    try {
      const result = await createFolder(
        folderForm.name.trim(),
        selectedFolderPath,
        folderForm.description.trim() || null
      )

      if (result.success) {
        setShowCreateFolderModal(false)
        setFolderForm({ name: '', description: '' })
        loadData()
      } else {
        alert(result.error || 'Failed to create folder')
      }
    } catch (error) {
      console.error('Error creating folder:', error)
      alert('Failed to create folder')
    } finally {
      setIsCreatingFolder(false)
    }
  }

  const handleUpdateFolder = async () => {
    if (!editingFolder || !folderForm.name.trim()) {
      return
    }

    setIsCreatingFolder(true)
    try {
      // Build new path
      const parentPath = getParentPath(editingFolder.path)
      const newPath = parentPath 
        ? `${parentPath}/${folderForm.name.trim()}`
        : folderForm.name.trim()

      const result = await updateFolder(
        editingFolder.path,
        newPath,
        folderForm.description.trim() || null
      )

      if (result.success) {
        setEditingFolder(null)
        setFolderForm({ name: '', description: '' })
        // If we renamed the selected folder, update selection
        if (selectedFolderPath === editingFolder.path) {
          setSelectedFolderPath(newPath)
        }
        loadData()
      } else {
        alert(result.error || 'Failed to update folder')
      }
    } catch (error) {
      console.error('Error updating folder:', error)
      alert('Failed to update folder')
    } finally {
      setIsCreatingFolder(false)
    }
  }

  const handleDeleteFolder = async (folderPath: string) => {
    if (!confirm('Are you sure you want to delete this folder? This will delete all document templates in this folder and subfolders. This action cannot be undone.')) {
      return
    }

    try {
      const result = await deleteFolder(folderPath)

      if (result.success) {
        if (selectedFolderPath === folderPath) {
          setSelectedFolderPath(null)
        }
        loadData()
      } else {
        alert(result.error || 'Failed to delete folder')
      }
    } catch (error) {
      console.error('Error deleting folder:', error)
      alert('Failed to delete folder')
    }
  }

  const handleCreateTemplate = async () => {
    if (!templateForm.name.trim()) {
      alert('Please enter a document name')
      return
    }

    setIsCreatingTemplate(true)
    try {
      const result = await createDocumentTemplate(
        templateForm.name.trim(),
        selectedFolderPath,
        templateForm.frequency,
        templateForm.category.trim() || null,
        templateForm.description.trim() || null,
        templateForm.isMandatory
      )

      if (result.success) {
        setShowCreateTemplateModal(false)
        setTemplateForm({
          name: '',
          frequency: 'monthly',
          category: '',
          description: '',
          isMandatory: false,
        })
        loadData()
      } else {
        alert(result.error || 'Failed to create document template')
      }
    } catch (error) {
      console.error('Error creating document template:', error)
      alert('Failed to create document template')
    } finally {
      setIsCreatingTemplate(false)
    }
  }

  const handleUpdateTemplate = async () => {
    if (!editingTemplate || !templateForm.name.trim()) {
      return
    }

    setIsCreatingTemplate(true)
    try {
      const result = await updateDocumentTemplate(
        editingTemplate.id!,
        templateForm.name.trim(),
        selectedFolderPath,
        templateForm.frequency,
        templateForm.category.trim() || null,
        templateForm.description.trim() || null,
        templateForm.isMandatory
      )

      if (result.success) {
        setEditingTemplate(null)
        setTemplateForm({
          name: '',
          frequency: 'monthly',
          category: '',
          description: '',
          isMandatory: false,
        })
        loadData()
      } else {
        alert(result.error || 'Failed to update document template')
      }
    } catch (error) {
      console.error('Error updating document template:', error)
      alert('Failed to update document template')
    } finally {
      setIsCreatingTemplate(false)
    }
  }

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this document template? This action cannot be undone.')) {
      return
    }

    try {
      const result = await deleteDocumentTemplate(templateId)

      if (result.success) {
        loadData()
      } else {
        alert(result.error || 'Failed to delete document template')
      }
    } catch (error) {
      console.error('Error deleting document template:', error)
      alert('Failed to delete document template')
    }
  }

  const toggleFolderExpansion = (folderPath: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(folderPath)) {
      newExpanded.delete(folderPath)
    } else {
      newExpanded.add(folderPath)
    }
    setExpandedFolders(newExpanded)
  }

  const renderFolderTree = (folderList: FolderInfo[], level: number = 0) => {
    return folderList.map(folder => {
      const isExpanded = expandedFolders.has(folder.path)
      const isSelected = selectedFolderPath === folder.path
      const hasChildren = folder.children && folder.children.length > 0

      return (
        <div key={folder.path}>
          <div
            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors ${
              isSelected ? 'bg-primary-orange/20 border border-primary-orange/50' : ''
            }`}
            style={{ paddingLeft: `${level * 20 + 8}px` }}
            onClick={() => setSelectedFolderPath(folder.path)}
          >
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFolderExpansion(folder.path)
                }}
                className="w-4 h-4 flex items-center justify-center text-gray-400 hover:text-white"
              >
                {isExpanded ? '▼' : '▶'}
              </button>
            )}
            {!hasChildren && <div className="w-4" />}
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="text-primary-orange"
            >
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            </svg>
            <span className="flex-1 text-sm text-white">{folder.name}</span>
            <span className="text-xs text-gray-500">({folder.documentCount})</span>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingFolder(folder)
                  setFolderForm({ name: folder.name, description: '' })
                }}
                className="p-1 text-gray-400 hover:text-primary-orange transition-colors"
                title="Edit folder"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteFolder(folder.path)
                }}
                className="p-1 text-gray-400 hover:text-red-400 transition-colors"
                title="Delete folder"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </div>
          </div>
          {isExpanded && hasChildren && folder.children && (
            <div>{renderFolderTree(folder.children, level + 1)}</div>
          )}
        </div>
      )
    })
  }

  const getFrequencyBadgeColor = (frequency: string) => {
    switch (frequency) {
      case 'one-time':
        return 'bg-gray-600'
      case 'monthly':
        return 'bg-blue-600'
      case 'quarterly':
        return 'bg-purple-600'
      case 'yearly':
        return 'bg-green-600'
      default:
        return 'bg-gray-600'
    }
  }

  const getFrequencyLabel = (frequency: string) => {
    switch (frequency) {
      case 'one-time':
        return 'One-Time'
      case 'monthly':
        return 'Monthly'
      case 'quarterly':
        return 'Quarterly'
      case 'yearly':
        return 'Yearly'
      default:
        return frequency
    }
  }

  console.log('[VAULT PAGE] Render state:', {
    isLoading,
    hasUser: !!user,
    foldersCount: folders.length,
    templatesCount: templates.length,
    selectedFolderPath,
    pathname: typeof window !== 'undefined' ? window.location.pathname : 'unknown',
  })

  if (isLoading) {
    console.log('[VAULT PAGE] Rendering loading state')
    return (
      <div className="min-h-screen bg-primary-dark">
        <Header />
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="w-8 h-8 border-2 border-primary-orange border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  const breadcrumb = selectedFolderPath ? buildBreadcrumb(selectedFolderPath) : []
  const currentFolderName = selectedFolderPath ? getFolderName(selectedFolderPath) : 'Root'

  return (
    <div className="min-h-screen bg-primary-dark">
      <Header />
      <SubtleCircuitBackground />
      <div className="container mx-auto px-4 py-8 relative z-10">
        <div className="mb-6">
          <h1 className="text-3xl font-light text-white mb-2">Compliance Vault</h1>
          <p className="text-gray-400">Manage global folder structure and document templates for all companies</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Folder Tree Sidebar */}
          <div className="lg:col-span-1">
            <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white">Folders</h2>
                <button
                  onClick={() => {
                    setEditingFolder(null)
                    setFolderForm({ name: '', description: '' })
                    setShowCreateFolderModal(true)
                  }}
                  className="px-3 py-1.5 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors text-sm font-medium"
                >
                  + New Folder
                </button>
              </div>

              {/* Root level button */}
              <button
                onClick={() => setSelectedFolderPath(null)}
                className={`w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-800 transition-colors mb-2 ${
                  selectedFolderPath === null ? 'bg-primary-orange/20 border border-primary-orange/50' : ''
                }`}
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="text-primary-orange"
                >
                  <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <polyline points="9 22 9 12 15 12 15 22" />
                </svg>
                <span className="text-sm text-white">Root</span>
              </button>

              <div className="space-y-1 max-h-[600px] overflow-y-auto">
                {renderFolderTree(folders)}
              </div>
            </div>
          </div>

          {/* Document Templates List */}
          <div className="lg:col-span-2">
            <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {currentFolderName} Documents
                  </h2>
                  {breadcrumb.length > 0 && (
                    <div className="flex items-center gap-2 mt-2 text-sm text-gray-400">
                      {breadcrumb.map((crumb, idx) => (
                        <span key={crumb.path}>
                          {idx > 0 && <span className="mx-1">/</span>}
                          <button
                            onClick={() => setSelectedFolderPath(crumb.path)}
                            className="hover:text-primary-orange transition-colors"
                          >
                            {crumb.name}
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => {
                    setEditingTemplate(null)
                    setTemplateForm({
                      name: '',
                      frequency: 'monthly',
                      category: '',
                      description: '',
                      isMandatory: false,
                    })
                    setShowCreateTemplateModal(true)
                  }}
                  className="px-4 py-2 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors text-sm font-medium"
                >
                  + New Document
                </button>
              </div>

              {templates.length === 0 ? (
                <div className="text-center py-12">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-gray-600 mx-auto mb-4"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                    <line x1="16" y1="13" x2="8" y2="13" />
                    <line x1="16" y1="17" x2="8" y2="17" />
                  </svg>
                  <p className="text-gray-400">No document templates in this folder</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {templates.map(template => (
                    <div
                      key={template.id || template.document_name}
                      className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-white font-medium truncate">{template.document_name}</h3>
                          <span className={`px-2 py-0.5 rounded text-xs font-medium text-white ${getFrequencyBadgeColor(template.default_frequency)}`}>
                            {getFrequencyLabel(template.default_frequency)}
                          </span>
                          {template.is_mandatory && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-600 text-white">
                              Mandatory
                            </span>
                          )}
                        </div>
                        {template.description && (
                          <p className="text-sm text-gray-400 truncate mb-2">{template.description}</p>
                        )}
                        <div className="flex items-center gap-4 text-xs text-gray-500">
                          {template.category && (
                            <span className="px-2 py-0.5 bg-primary-orange/20 text-primary-orange rounded">
                              {template.category}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setEditingTemplate(template)
                            setTemplateForm({
                              name: template.document_name,
                              frequency: (template.default_frequency === 'annually' ? 'yearly' : template.default_frequency) as 'one-time' | 'monthly' | 'quarterly' | 'yearly',
                              category: template.category || '',
                              description: template.description || '',
                              isMandatory: template.is_mandatory,
                            })
                          }}
                          className="p-2 text-gray-400 hover:text-primary-orange transition-colors"
                          title="Edit"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => template.id && handleDeleteTemplate(template.id)}
                          className="p-2 text-gray-400 hover:text-red-400 transition-colors"
                          title="Delete"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Create/Edit Folder Modal */}
      {(showCreateFolderModal || editingFolder) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold text-white mb-4">
              {editingFolder ? 'Edit Folder' : 'Create New Folder'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Folder Name</label>
                <input
                  type="text"
                  value={folderForm.name}
                  onChange={(e) => setFolderForm({ ...folderForm, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange"
                  placeholder="Enter folder name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description (Optional)</label>
                <textarea
                  value={folderForm.description}
                  onChange={(e) => setFolderForm({ ...folderForm, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange"
                  placeholder="Enter folder description"
                  rows={3}
                />
              </div>
              {selectedFolderPath && !editingFolder && (
                <div className="text-sm text-gray-400">
                  Creating in: <span className="text-primary-orange">{selectedFolderPath}</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={editingFolder ? handleUpdateFolder : handleCreateFolder}
                  disabled={isCreatingFolder || !folderForm.name.trim()}
                  className="flex-1 px-4 py-2 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingFolder ? 'Saving...' : editingFolder ? 'Update' : 'Create'}
                </button>
                <button
                  onClick={() => {
                    setShowCreateFolderModal(false)
                    setEditingFolder(null)
                    setFolderForm({ name: '', description: '' })
                  }}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create/Edit Document Template Modal */}
      {(showCreateTemplateModal || editingTemplate) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold text-white mb-4">
              {editingTemplate ? 'Edit Document Template' : 'Create New Document Template'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Document Name</label>
                <input
                  type="text"
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange"
                  placeholder="e.g., GSTR-3B Filed Copy"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Frequency</label>
                  <select
                  value={templateForm.frequency}
                  onChange={(e) => {
                    const value = e.target.value as 'one-time' | 'monthly' | 'quarterly' | 'yearly'
                    setTemplateForm({ ...templateForm, frequency: value })
                  }}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange"
                >
                  <option value="one-time">One-Time</option>
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Category (Optional)</label>
                <input
                  type="text"
                  value={templateForm.category}
                  onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange"
                  placeholder="e.g., GST, Income Tax"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description (Optional)</label>
                <textarea
                  value={templateForm.description}
                  onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange"
                  placeholder="Enter document description"
                  rows={3}
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isMandatory"
                  checked={templateForm.isMandatory}
                  onChange={(e) => setTemplateForm({ ...templateForm, isMandatory: e.target.checked })}
                  className="w-4 h-4 text-primary-orange bg-gray-900 border-gray-700 rounded focus:ring-primary-orange"
                />
                <label htmlFor="isMandatory" className="text-sm text-gray-300">
                  Mandatory Document
                </label>
              </div>
              {selectedFolderPath && (
                <div className="text-sm text-gray-400">
                  Creating in: <span className="text-primary-orange">{selectedFolderPath}</span>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
                  disabled={isCreatingTemplate || !templateForm.name.trim()}
                  className="flex-1 px-4 py-2 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isCreatingTemplate ? 'Saving...' : editingTemplate ? 'Update' : 'Create'}
                </button>
                <button
                  onClick={() => {
                    setShowCreateTemplateModal(false)
                    setEditingTemplate(null)
                    setTemplateForm({
                      name: '',
                      frequency: 'monthly',
                      category: '',
                      description: '',
                      isMandatory: false,
                    })
                  }}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
