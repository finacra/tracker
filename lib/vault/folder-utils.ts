/**
 * Utility functions for working with hierarchical folder paths
 * Uses path format: "Parent/Child" for hierarchical folders
 */

/**
 * Split a folder path into an array of parts
 * @param path - Folder path (e.g., "GST Returns/Returns Filed")
 * @returns Array of folder names (e.g., ["GST Returns", "Returns Filed"])
 */
export function parseFolderPath(path: string | null): string[] {
  if (!path || path === '') {
    return []
  }
  return path.split('/').filter(part => part.trim().length > 0)
}

/**
 * Build a folder path from an array of parts
 * @param parts - Array of folder names (e.g., ["GST Returns", "Returns Filed"])
 * @returns Folder path (e.g., "GST Returns/Returns Filed")
 */
export function buildFolderPath(parts: string[]): string {
  return parts.filter(part => part.trim().length > 0).join('/')
}

/**
 * Get the parent folder path from a hierarchical path
 * @param path - Folder path (e.g., "GST Returns/Returns Filed")
 * @returns Parent path (e.g., "GST Returns") or null if root level
 */
export function getParentPath(path: string | null): string | null {
  if (!path || path === '') {
    return null
  }
  
  const parts = parseFolderPath(path)
  if (parts.length <= 1) {
    return null // Root level folder
  }
  
  return buildFolderPath(parts.slice(0, -1))
}

/**
 * Get the folder name (last part) from a hierarchical path
 * @param path - Folder path (e.g., "GST Returns/Returns Filed")
 * @returns Folder name (e.g., "Returns Filed")
 */
export function getFolderName(path: string | null): string | null {
  if (!path || path === '') {
    return null
  }
  
  const parts = parseFolderPath(path)
  if (parts.length === 0) {
    return null
  }
  
  return parts[parts.length - 1]
}

/**
 * Check if a folder path is a subfolder of another
 * @param childPath - Child folder path (e.g., "GST Returns/Returns Filed/Monthly")
 * @param parentPath - Parent folder path (e.g., "GST Returns")
 * @returns true if childPath is under parentPath
 */
export function isSubfolder(childPath: string | null, parentPath: string | null): boolean {
  if (!parentPath || parentPath === '') {
    // Empty parent means root, so everything is a subfolder
    return childPath !== null && childPath !== ''
  }
  
  if (!childPath || childPath === '') {
    return false
  }
  
  // Exact match
  if (childPath === parentPath) {
    return true
  }
  
  // Check if child starts with parent + '/'
  return childPath.startsWith(parentPath + '/')
}

/**
 * Get the depth level of a folder path
 * @param path - Folder path (e.g., "GST Returns/Returns Filed")
 * @returns Depth level (0 for root, 1 for first level, etc.)
 */
export function getFolderDepth(path: string | null): number {
  if (!path || path === '') {
    return 0
  }
  
  return parseFolderPath(path).length
}

/**
 * Build a breadcrumb array from a folder path
 * @param path - Folder path (e.g., "GST Returns/Returns Filed")
 * @returns Array of {name, path} objects for breadcrumb navigation
 */
export function buildBreadcrumb(path: string | null): Array<{ name: string; path: string }> {
  if (!path || path === '') {
    return []
  }
  
  const parts = parseFolderPath(path)
  const breadcrumb: Array<{ name: string; path: string }> = []
  
  for (let i = 0; i < parts.length; i++) {
    const currentPath = buildFolderPath(parts.slice(0, i + 1))
    breadcrumb.push({
      name: parts[i],
      path: currentPath,
    })
  }
  
  return breadcrumb
}

/**
 * Validate a folder path format
 * @param path - Folder path to validate
 * @returns true if path is valid
 */
export function isValidFolderPath(path: string | null): boolean {
  if (!path || path === '') {
    return false
  }
  
  // Check for invalid characters (no leading/trailing slashes, no double slashes)
  if (path.startsWith('/') || path.endsWith('/') || path.includes('//')) {
    return false
  }
  
  // Check for empty parts
  const parts = parseFolderPath(path)
  return parts.every(part => part.trim().length > 0)
}

/**
 * Normalize a folder path (trim whitespace, remove empty parts)
 * @param path - Folder path to normalize
 * @returns Normalized folder path
 */
export function normalizeFolderPath(path: string | null): string | null {
  if (!path || path === '') {
    return null
  }
  
  const parts = parseFolderPath(path)
    .map(part => part.trim())
    .filter(part => part.length > 0)
  
  if (parts.length === 0) {
    return null
  }
  
  return buildFolderPath(parts)
}
