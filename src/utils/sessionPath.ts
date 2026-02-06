function normalizeSessionPath(path: string): string {
  const trimmed = path.trim()
  if (!trimmed) return ''

  // Keep draft URI untouched to avoid corrupting protocol form.
  if (trimmed.startsWith('draft://')) {
    return trimmed
  }

  let normalized = trimmed.replace(/\\/g, '/')

  // Accept `file://` forms from different runtimes.
  normalized = normalized.replace(/^file:\/\//i, '')

  if (normalized.length > 1) {
    normalized = normalized.replace(/\/+$/, '')
  }

  return normalized
}

function isAbsolutePath(path: string): boolean {
  return (
    path.startsWith('/') ||
    path.startsWith('//') ||
    /^[a-zA-Z]:\//.test(path)
  )
}

function isWindowsLikePath(path: string): boolean {
  return path.startsWith('//') || /^[a-zA-Z]:\//.test(path)
}

function getBaseName(path: string): string | null {
  const parts = path.split('/')
  const name = parts[parts.length - 1]
  return name || null
}

export function sessionPathMatches(expected: string, actual: string): boolean {
  const normalizedExpected = normalizeSessionPath(expected)
  const normalizedActual = normalizeSessionPath(actual)

  if (!normalizedExpected || !normalizedActual) return false

  if (normalizedExpected === normalizedActual) return true

  // Windows/UNC path comparison should be case-insensitive.
  if (
    (isWindowsLikePath(normalizedExpected) || isWindowsLikePath(normalizedActual)) &&
    normalizedExpected.toLowerCase() === normalizedActual.toLowerCase()
  ) {
    return true
  }

  // For absolute paths, require full-path match to avoid cross-project collisions.
  if (isAbsolutePath(normalizedExpected) && isAbsolutePath(normalizedActual)) {
    return false
  }

  // Compatibility fallback: allow basename matching only when at least one side
  // is not a full path (e.g. legacy short name from external runtimes).
  const expectedName = getBaseName(normalizedExpected)
  const actualName = getBaseName(normalizedActual)
  if (!expectedName || !actualName) return false

  const expectedHasDir = normalizedExpected.includes('/')
  const actualHasDir = normalizedActual.includes('/')
  if (!expectedHasDir || !actualHasDir) {
    return expectedName === actualName
  }

  return false
}
