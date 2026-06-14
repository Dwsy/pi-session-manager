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
 * Compare two filesystem paths for equality across platforms.
 *
 * - Normalizes both `\` and `/` separators
 * - Strips trailing separators
 * - On Windows (case-insensitive filesystem), compares case-insensitively
 *
 * Use this anywhere `cwd`/`path` is matched against a stored key instead of
 * raw `===`, so project grouping, favorites, and filtering survive the Windows
 * filesystem's case-insensitivity (e.g. `C:\Code\Foo` vs `c:\code\foo`).
 */
export function pathsEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return false
  const normA = trimTrailingPathSeparators(a)
  const normB = trimTrailingPathSeparators(b)
  if (normA === normB) return true
  // Detect Windows via the same heuristic the rest of the app uses
  // (navigator.userAgent). Default to case-insensitive when either path is a
  // drive-letter path, since those are always Windows and always case-insensitive.
  const isWindows =
    typeof navigator !== 'undefined' && /Win/i.test(navigator.userAgent || navigator.platform || '') ||
    /^[A-Za-z]:[\\/]/.test(normA) ||
    /^[A-Za-z]:[\\/]/.test(normB)
  return isWindows ? normA.toLowerCase() === normB.toLowerCase() : normA === normB
}
