export function normalizePathSeparators(path: string): string {
  return path.replace(/\\/g, '/')
}

export function trimTrailingPathSeparators(path: string): string {
  return normalizePathSeparators(path).replace(/\/+$/, '')
}

export function splitPathSegments(path: string): string[] {
  return normalizePathSeparators(path).split('/').filter(Boolean)
}

export function hasPathSeparator(path: string): boolean {
  return /[\\/]/.test(path)
}

export function getPathBasename(path: string): string {
  const normalized = trimTrailingPathSeparators(path)
  if (!normalized) return path

  const parts = normalized.split('/')
  return parts[parts.length - 1] || path
}

export function getPathParentName(path: string): string {
  const parts = splitPathSegments(trimTrailingPathSeparators(path))
  if (parts.length >= 2) return parts[parts.length - 2]
  return parts[0] ?? path
}

export function getLastPathSegments(path: string, count: number): string {
  const parts = splitPathSegments(path)
  if (parts.length === 0) return path
  return parts.slice(-count).join('/')
}
