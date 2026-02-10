'use client'

import { useState, useEffect } from 'react'
import Header from '@/components/Header'
import SubtleCircuitBackground from '@/components/SubtleCircuitBackground'
import { useAuth } from '@/hooks/useAuth'
import { useRouter } from 'next/navigation'
import {
  createFolder,
  updateFolder,
  deleteFolder,
  getFolders,
  uploadFile,
  getFiles,
  updateFile,
  deleteFile,
  getFileDownloadUrl,
  type VaultFolder,
  type VaultFile,
} from './actions'

export default function VaultManagementPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [folders, setFolders] = useState<VaultFolder[]>([])
  const [files, setFiles] = useState<VaultFile[]>([])
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [isUploadingFile, setIsUploadingFile] = useState(false)
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false)
  const [showUploadFileModal, setShowUploadFileModal] = useState(false)
  const [editingFolder, setEditingFolder] = useState<VaultFolder | null>(null)
  const [editingFile, setEditingFile] = useState<VaultFile | null>(null)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())

  // Form states
  const [folderForm, setFolderForm] = useState({ name: '', description: '' })
  const [fileForm, setFileForm] = useState({ name: '', description: '', tags: '', file: null as File | null })

  useEffect(() => {
    if (!user) {
      router.push('/')
      return
    }
    loadData()
  }, [user, router, selectedFolderId])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const [foldersResult, filesResult] = await Promise.all([
        getFolders(),
        getFiles(selectedFolderId),
      ])

      if (foldersResult.success && foldersResult.folders) {
        setFolders(foldersResult.folders)
      }

      if (filesResult.success && filesResult.files) {
        setFiles(filesResult.files)
      }
    } catch (error) {
      console.error('Error loading vault data:', error)
    } finally {
      setIsLoading(false)
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
        selectedFolderId,
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
      const result = await updateFolder(
        editingFolder.id,
        folderForm.name.trim(),
        folderForm.description.trim() || null
      )

      if (result.success) {
        setEditingFolder(null)
        setFolderForm({ name: '', description: '' })
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

  const handleDeleteFolder = async (folderId: string) => {
    if (!confirm('Are you sure you want to delete this folder? This action cannot be undone.')) {
      return
    }

    try {
      const result = await deleteFolder(folderId)

      if (result.success) {
        if (selectedFolderId === folderId) {
          setSelectedFolderId(null)
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

  const handleUploadFile = async () => {
    if (!fileForm.file || !fileForm.name.trim()) {
      alert('Please select a file and enter a name')
      return
    }

    setIsUploadingFile(true)
    try {
      const tags = fileForm.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)

      const result = await uploadFile(
        fileForm.file,
        selectedFolderId,
        fileForm.name.trim(),
        fileForm.description.trim() || null,
        tags
      )

      if (result.success) {
        setShowUploadFileModal(false)
        setFileForm({ name: '', description: '', tags: '', file: null })
        loadData()
      } else {
        alert(result.error || 'Failed to upload file')
      }
    } catch (error) {
      console.error('Error uploading file:', error)
      alert('Failed to upload file')
    } finally {
      setIsUploadingFile(false)
    }
  }

  const handleUpdateFile = async () => {
    if (!editingFile || !fileForm.name.trim()) {
      return
    }

    setIsUploadingFile(true)
    try {
      const tags = fileForm.tags
        .split(',')
        .map(tag => tag.trim())
        .filter(tag => tag.length > 0)

      const result = await updateFile(
        editingFile.id,
        fileForm.name.trim(),
        fileForm.description.trim() || null,
        tags
      )

      if (result.success) {
        setEditingFile(null)
        setFileForm({ name: '', description: '', tags: '', file: null })
        loadData()
      } else {
        alert(result.error || 'Failed to update file')
      }
    } catch (error) {
      console.error('Error updating file:', error)
      alert('Failed to update file')
    } finally {
      setIsUploadingFile(false)
    }
  }

  const handleDeleteFile = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file? This action cannot be undone.')) {
      return
    }

    try {
      const result = await deleteFile(fileId)

      if (result.success) {
        loadData()
      } else {
        alert(result.error || 'Failed to delete file')
      }
    } catch (error) {
      console.error('Error deleting file:', error)
      alert('Failed to delete file')
    }
  }

  const handleDownloadFile = async (file: VaultFile) => {
    try {
      const result = await getFileDownloadUrl(file.file_path)

      if (result.success && result.url) {
        window.open(result.url, '_blank')
      } else {
        alert(result.error || 'Failed to get file URL')
      }
    } catch (error) {
      console.error('Error downloading file:', error)
      alert('Failed to download file')
    }
  }

  const toggleFolderExpansion = (folderId: string) => {
    const newExpanded = new Set(expandedFolders)
    if (newExpanded.has(folderId)) {
      newExpanded.delete(folderId)
    } else {
      newExpanded.add(folderId)
    }
    setExpandedFolders(newExpanded)
  }

  const buildFolderTree = (parentId: string | null = null): VaultFolder[] => {
    return folders
      .filter(f => f.parent_id === parentId)
      .map(folder => ({
        ...folder,
        children: buildFolderTree(folder.id),
      }))
  }

  const renderFolderTree = (folderList: VaultFolder[], level: number = 0) => {
    return folderList.map(folder => {
      const isExpanded = expandedFolders.has(folder.id)
      const isSelected = selectedFolderId === folder.id
      const hasChildren = folder.children && folder.children.length > 0

      return (
        <div key={folder.id}>
          <div
            className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer hover:bg-gray-800 transition-colors ${
              isSelected ? 'bg-primary-orange/20 border border-primary-orange/50' : ''
            }`}
            style={{ paddingLeft: `${level * 20 + 8}px` }}
            onClick={() => setSelectedFolderId(folder.id)}
          >
            {hasChildren && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  toggleFolderExpansion(folder.id)
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
            <span className="text-xs text-gray-500">({folder.file_count || 0})</span>
            <div className="flex items-center gap-1">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setEditingFolder(folder)
                  setFolderForm({ name: folder.name, description: folder.description || '' })
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
                  handleDeleteFolder(folder.id)
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

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return 'Unknown'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary-dark">
        <Header />
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="w-8 h-8 border-2 border-primary-orange border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  const rootFolders = buildFolderTree()
  const currentFolder = folders.find(f => f.id === selectedFolderId)

  return (
    <div className="min-h-screen bg-primary-dark">
      <Header />
      <SubtleCircuitBackground />
      <div className="container mx-auto px-4 py-8 relative z-10">
        <div className="mb-6">
          <h1 className="text-3xl font-light text-white mb-2">Compliance Vault</h1>
          <p className="text-gray-400">Manage folders and files for compliance documents</p>
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
                onClick={() => setSelectedFolderId(null)}
                className={`w-full flex items-center gap-2 p-2 rounded-lg hover:bg-gray-800 transition-colors mb-2 ${
                  selectedFolderId === null ? 'bg-primary-orange/20 border border-primary-orange/50' : ''
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
                {renderFolderTree(rootFolders)}
              </div>
            </div>
          </div>

          {/* Files List */}
          <div className="lg:col-span-2">
            <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {currentFolder ? currentFolder.name : 'Root'} Files
                  </h2>
                  {currentFolder?.description && (
                    <p className="text-sm text-gray-400 mt-1">{currentFolder.description}</p>
                  )}
                </div>
                <button
                  onClick={() => {
                    setEditingFile(null)
                    setFileForm({ name: '', description: '', tags: '', file: null })
                    setShowUploadFileModal(true)
                  }}
                  className="px-4 py-2 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors text-sm font-medium"
                >
                  + Upload File
                </button>
              </div>

              {files.length === 0 ? (
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
                  <p className="text-gray-400">No files in this folder</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map(file => (
                    <div
                      key={file.id}
                      className="flex items-center gap-4 p-4 bg-gray-900/50 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="text-primary-orange flex-shrink-0"
                          >
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                            <polyline points="14 2 14 8 20 8" />
                          </svg>
                          <h3 className="text-white font-medium truncate">{file.name}</h3>
                        </div>
                        {file.description && (
                          <p className="text-sm text-gray-400 truncate">{file.description}</p>
                        )}
                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                          <span>{formatFileSize(file.file_size)}</span>
                          {file.mime_type && <span>{file.mime_type}</span>}
                          {file.tags && file.tags.length > 0 && (
                            <div className="flex items-center gap-1">
                              {file.tags.map((tag, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 bg-primary-orange/20 text-primary-orange rounded"
                                >
                                  {tag}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDownloadFile(file)}
                          className="p-2 text-gray-400 hover:text-primary-orange transition-colors"
                          title="Download"
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                            <polyline points="7 10 12 15 17 10" />
                            <line x1="12" y1="15" x2="12" y2="3" />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            setEditingFile(file)
                            setFileForm({
                              name: file.name,
                              description: file.description || '',
                              tags: file.tags.join(', '),
                              file: null,
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
                          onClick={() => handleDeleteFile(file.id)}
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

      {/* Upload/Edit File Modal */}
      {(showUploadFileModal || editingFile) && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-primary-dark-card border border-gray-800 rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-semibold text-white mb-4">
              {editingFile ? 'Edit File' : 'Upload New File'}
            </h2>
            <div className="space-y-4">
              {!editingFile && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Select File</label>
                  <input
                    type="file"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) {
                        setFileForm({ ...fileForm, file, name: fileForm.name || file.name })
                      }
                    }}
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">File Name</label>
                <input
                  type="text"
                  value={fileForm.name}
                  onChange={(e) => setFileForm({ ...fileForm, name: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange"
                  placeholder="Enter file name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Description (Optional)</label>
                <textarea
                  value={fileForm.description}
                  onChange={(e) => setFileForm({ ...fileForm, description: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange"
                  placeholder="Enter file description"
                  rows={3}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Tags (comma-separated)</label>
                <input
                  type="text"
                  value={fileForm.tags}
                  onChange={(e) => setFileForm({ ...fileForm, tags: e.target.value })}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-primary-orange"
                  placeholder="e.g., tax, gst, compliance"
                />
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={editingFile ? handleUpdateFile : handleUploadFile}
                  disabled={isUploadingFile || !fileForm.name.trim() || (!editingFile && !fileForm.file)}
                  className="flex-1 px-4 py-2 bg-primary-orange text-white rounded-lg hover:bg-primary-orange/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUploadingFile ? 'Saving...' : editingFile ? 'Update' : 'Upload'}
                </button>
                <button
                  onClick={() => {
                    setShowUploadFileModal(false)
                    setEditingFile(null)
                    setFileForm({ name: '', description: '', tags: '', file: null })
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
