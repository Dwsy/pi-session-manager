export type MarkdownLinkTarget =
  | { kind: 'external-url'; href: string }
  | { kind: 'local-file'; href: string; path: string }
  | { kind: 'anchor'; href: string }
  | { kind: 'unsupported'; href: string; reason: string }

const ABSOLUTE_UNIX_PATH = /^\//
const ABSOLUTE_WINDOWS_PATH = /^[a-zA-Z]:[\\/]/
const UNC_WINDOWS_PATH = /^\\\\[^\\/]+[\\/][^\\/]+/

export function normalizeFileHref(href: string): string {
  if (!href.toLowerCase().startsWith('file:')) {
    return href
  }

  try {
    const url = new URL(href)
    const decodedPath = decodeURIComponent(url.pathname)
    return decodedPath.replace(/^\/([a-zA-Z]:\/)/, '$1')
  } catch {
    return href.replace(/^file:\/\//i, '')
  }
}

function isAbsoluteLocalPath(href: string): boolean {
  return ABSOLUTE_UNIX_PATH.test(href) || ABSOLUTE_WINDOWS_PATH.test(href) || UNC_WINDOWS_PATH.test(href) || href.startsWith('~/')
}

export function classifyMarkdownLink(rawHref: string | null | undefined): MarkdownLinkTarget {
  const href = rawHref?.trim() ?? ''
  if (!href) {
    return { kind: 'unsupported', href, reason: 'Empty link target' }
  }

  if (href.startsWith('#')) {
    return { kind: 'anchor', href }
  }

  if (/^https?:\/\//i.test(href)) {
    return { kind: 'external-url', href }
  }

  if (/^file:/i.test(href)) {
    return { kind: 'local-file', href, path: normalizeFileHref(href) }
  }

  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(href)) {
    return { kind: 'unsupported', href, reason: 'Unsupported link protocol' }
  }

  if (isAbsoluteLocalPath(href)) {
    return { kind: 'local-file', href, path: href }
  }

  return { kind: 'unsupported', href, reason: 'Relative file links are not opened automatically' }
}

export function getMarkdownLinkConfirmationMessage(target: MarkdownLinkTarget): string {
  if (target.kind === 'external-url') {
    return `Open this URL in your default browser?\n\n${target.href}`
  }
  if (target.kind === 'local-file') {
    return `Open this local path with the default app?\n\n${target.path}`
  }
  return target.kind === 'unsupported' ? `${target.reason}: ${target.href}` : target.href
}
