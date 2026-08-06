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

/**
 * Strip a trailing `.jsonl` extension (case-insensitive, since Windows
 * filesystems are case-insensitive and a session may be saved as `.JSONL`).
 */
export function stripJsonlExt(name: string): string {
  return name.replace(/\.jsonl$/i, '')
}

/**
 * Create a stable key for filesystem path comparisons and grouping.
 *
 * Separators and trailing separators are normalized on every platform. On
 * Windows, paths are also lower-cased to match the filesystem's
 * case-insensitivity. Drive-letter paths retain Windows semantics even when
 * evaluated outside a Windows browser environment.
 */
export function getPathComparisonKey(path: string): string {
  const normalized = trimTrailingPathSeparators(path)
  const isWindows =
    (typeof navigator !== 'undefined' &&
      /Win/i.test(navigator.userAgent || navigator.platform || '')) ||
    /^[A-Za-z]:\//.test(normalized)
  return isWindows ? normalized.toLowerCase() : normalized
}

/**
 * Compare two filesystem paths for equality across platforms.
 *
 * Use this anywhere `cwd`/`path` is matched against a stored key instead of
 * raw `===`, so project grouping, favorites, and filtering survive Windows
 * path casing and separator differences.
 */
export function pathsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return getPathComparisonKey(a) === getPathComparisonKey(b)
}
