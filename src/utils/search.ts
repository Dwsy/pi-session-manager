import type { FullTextSearchSourceFilter } from '@/types'

import { escapeHtml } from './markdown'

/**
 * Parsed query with support for exact phrases wrapped in double quotes
 */
export interface ParsedQuotedQuery {
  phrases: string[]
  remainder: string
  remainderTokens: string[]
  hasPhrases: boolean
}

export interface SearchMatchRange {
  start: number
  end: number
  text: string
}

export type SearchSourceFilter = FullTextSearchSourceFilter

export interface ParsedLeadingSourceFilterToken {
  sourceFilter: SearchSourceFilter | null
  normalizedQuery: string
  token: '#all' | '#labels' | '#content' | null
}

const SEARCH_HIGHLIGHT_MARKUP = '<mark class="search-highlight">'

// ── Single-value memoization for hot-path query parsing ────────────────────
let _cachedQuotedQueryInput = ''
let _cachedQuotedQueryResult: ParsedQuotedQuery | null = null

function getCachedParsedQuotedQuery(query: string): ParsedQuotedQuery {
  if (query !== _cachedQuotedQueryInput || !_cachedQuotedQueryResult) {
    _cachedQuotedQueryInput = query
    _cachedQuotedQueryResult = parseQuotedQuery(query)
  }
  return _cachedQuotedQueryResult
}

let _cachedRegexQueryInput = ''
let _cachedRegexSource: string | null = null
let _cachedRegexFlags = ''

function getCachedSearchRegex(searchQuery: string): RegExp | null {
  if (searchQuery !== _cachedRegexQueryInput || _cachedRegexSource === null) {
    _cachedRegexQueryInput = searchQuery
    const regex = getSearchRegex(searchQuery)
    if (regex) {
      _cachedRegexSource = regex.source
      _cachedRegexFlags = regex.flags
    } else {
      _cachedRegexSource = null
      _cachedRegexFlags = ''
    }
  }
  // Always return a fresh RegExp to avoid stateful lastIndex issues
  return _cachedRegexSource ? new RegExp(_cachedRegexSource, _cachedRegexFlags) : null
}

// ── HTML entity decoding (DOM-free) ────────────────────────────────────────
const HTML_ENTITY_MAP: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>',
  '&quot;': '"', '&#039;': "'", '&#x27;': "'", '&apos;': "'",
  '&#39;': "'", '&nbsp;': ' ',
}
const HTML_ENTITY_REGEX = /&(?:amp|lt|gt|quot|nbsp|#039|#x27|apos|#39);/g
const HTML_NUMERIC_ENTITY_REGEX = /&#(\d+);/g
const SOURCE_FILTER_TOKEN_TO_VALUE = {
  '#all': 'all',
  '#labels': 'labels_only',
  '#content': 'content_only',
} as const

const SOURCE_FILTER_VALUE_TO_TOKEN: Record<SearchSourceFilter, '#all' | '#labels' | '#content'> = {
  all: '#all',
  labels_only: '#labels',
  content_only: '#content',
}

function escapeRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function getSearchRegex(searchQuery: string): RegExp | null {
  const terms = getQueryTerms(searchQuery)
  if (!terms.length) {
    return null
  }

  const escapedTerms = [...new Set(terms)]
    .sort((a, b) => b.length - a.length)
    .map((term) => escapeRegex(term))

  if (!escapedTerms.length) {
    return null
  }

  return new RegExp(`(${escapedTerms.join('|')})`, 'gi')
}

/**
 * Parse query into quoted phrases + unquoted remainder
 * Unbalanced quotes are treated as plain text (no phrase mode)
 */
export function parseQuotedQuery(query: string): ParsedQuotedQuery {
  const normalizedQuery = query.replace(/[“”]/g, '"')
  const quoteCount = (normalizedQuery.match(/"/g) || []).length

  if (quoteCount === 0) {
    return {
      phrases: [],
      remainder: normalizedQuery,
      remainderTokens: normalizedQuery.trim().split(/\s+/).filter(Boolean),
      hasPhrases: false,
    }
  }

  if (quoteCount % 2 !== 0) {
    const normalizedRemainder = normalizedQuery.replace(/"/g, ' ')

    return {
      phrases: [],
      remainder: normalizedRemainder,
      remainderTokens: normalizedRemainder.trim().split(/\s+/).filter(Boolean),
      hasPhrases: false,
    }
  }

  const phraseRegex = /"([^"]*)"/g
  const phrases: string[] = []
  const remainderParts: string[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null = null

  while ((match = phraseRegex.exec(normalizedQuery)) !== null) {
    const phrase = match[1].trim()
    if (phrase) {
      phrases.push(phrase)
    }
    remainderParts.push(normalizedQuery.slice(lastIndex, match.index))
    lastIndex = match.index + match[0].length
  }
  remainderParts.push(normalizedQuery.slice(lastIndex))

  const remainder = remainderParts.join('')
  const remainderTokens = remainder.trim().split(/\s+/).filter(Boolean)

  return {
    phrases,
    remainder,
    remainderTokens,
    hasPhrases: phrases.length > 0,
  }
}

export function parseLeadingSourceFilterToken(
  query: string,
): ParsedLeadingSourceFilterToken {
  const match = query.match(/^(#\S+)(?:\s+(.*))?$/)
  if (!match) {
    return {
      sourceFilter: null,
      normalizedQuery: query,
      token: null,
    }
  }

  const token = match[1].toLowerCase() as keyof typeof SOURCE_FILTER_TOKEN_TO_VALUE
  const sourceFilter = SOURCE_FILTER_TOKEN_TO_VALUE[token] ?? null
  if (!sourceFilter) {
    return {
      sourceFilter: null,
      normalizedQuery: query,
      token: null,
    }
  }

  return {
    sourceFilter,
    normalizedQuery: match[2] ?? '',
    token: token as '#all' | '#labels' | '#content',
  }
}

export function formatSourceFilterToken(sourceFilter: SearchSourceFilter): string {
  return SOURCE_FILTER_VALUE_TO_TOKEN[sourceFilter]
}

export function applyLeadingSourceFilterToken(
  query: string,
  sourceFilter: SearchSourceFilter,
): string {
  const parsed = parseLeadingSourceFilterToken(query)
  const normalizedQuery = parsed.sourceFilter ? parsed.normalizedQuery : query

  if (sourceFilter === 'all') {
    return normalizedQuery
  }

  const trimmed = normalizedQuery.trimStart()
  const prefix = formatSourceFilterToken(sourceFilter)
  return trimmed ? `${prefix} ${trimmed}` : `${prefix} `
}

/**
 * Get lowercased search terms for matching/highlighting
 */
export function getQueryTerms(searchQuery: string): string[] {
  const parsed = getCachedParsedQuotedQuery(searchQuery)
  if (!parsed.hasPhrases) {
    const trimmed = parsed.remainder.trim()
    return trimmed ? [trimmed.toLowerCase()] : []
  }

  return [...parsed.phrases, ...parsed.remainderTokens]
    .map((term) => term.toLowerCase())
    .filter(Boolean)
}

/**
 * Collect search match ranges from plain text using the same semantics as highlighting
 */
export function collectSearchMatches(
  text: string,
  searchQuery: string,
): SearchMatchRange[] {
  if (!text || !containsSearchQuery(text, searchQuery)) {
    return []
  }

  const regex = getSearchRegex(searchQuery)
  if (!regex) {
    return []
  }

  const matches: SearchMatchRange[] = []
  let match: RegExpExecArray | null = null

  while ((match = regex.exec(text)) !== null) {
    const matchedText = match[0] || ''
    if (!matchedText) {
      break
    }

    matches.push({
      start: match.index,
      end: match.index + matchedText.length,
      text: matchedText,
    })
  }

  return matches
}

/**
 * Highlight search keywords in HTML string
 * @param html - Original HTML string
 * @param searchQuery - Search query
 * @returns Highlighted HTML string
 */
export function highlightSearchInHTML(
  html: string,
  searchQuery: string,
  preCalculatedPlainText?: string,
): string {
  const regex = getCachedSearchRegex(searchQuery)
  if (!regex) {
    return html
  }

  const searchableText = preCalculatedPlainText ?? extractTextFromHTML(html)
  if (!containsSearchQuery(searchableText, searchQuery)) {
    return html
  }

  // Temporarily replace HTML tags to avoid searching inside tags
  const tagPlaceholders: string[] = []
  let processedHtml = html.replace(/<[^>]+>/g, (tagMatch) => {
    const placeholder = `__TAG_${tagPlaceholders.length}__`
    tagPlaceholders.push(tagMatch)
    return placeholder
  })

  // Highlight search keywords
  processedHtml = processedHtml.replace(regex, '<mark class="search-highlight">$1</mark>')

  // Restore HTML tags
  tagPlaceholders.forEach((tag, index) => {
    processedHtml = processedHtml.replace(`__TAG_${index}__`, tag)
  })

  return processedHtml
}

/**
 * Count search matches in HTML without building the full highlighted string.
 * Strips HTML tags and counts regex matches on text-only content.
 */
export function countSearchHighlightsInHTML(
  html: string,
  searchQuery: string,
  preCalculatedPlainText?: string,
): number {
  const regex = getCachedSearchRegex(searchQuery)
  if (!regex) return 0

  const searchableText = preCalculatedPlainText ?? extractTextFromHTML(html)
  if (!containsSearchQuery(searchableText, searchQuery)) return 0

  // Strip HTML tags and count regex matches on text-only content
  const textOnly = html.replace(/<[^>]+>/g, '')
  let count = 0
  while (regex.exec(textOnly) !== null) count++
  return count
}

export function countSearchHighlightsInText(text: string, searchQuery: string): number {
  return countSearchHighlightsInHTML(escapeHtml(text), searchQuery)
}

/**
 * Search keywords in plain text
 * @param text - Plain text
 * @param searchQuery - Search keywords
 * @returns Whether keywords are included
 */
export function containsSearchQuery(text: string, searchQuery: string): boolean {
  if (!searchQuery.trim()) {
    return false
  }

  const textLower = text.toLowerCase()
  const parsed = getCachedParsedQuotedQuery(searchQuery)

  if (!parsed.hasPhrases) {
    const trimmed = parsed.remainder.trim().toLowerCase()
    return trimmed ? textLower.includes(trimmed) : false
  }

  const phraseMatched = parsed.phrases.every((phrase) =>
    textLower.includes(phrase.toLowerCase()),
  )
  const remainderMatched = parsed.remainderTokens.every((token) =>
    textLower.includes(token.toLowerCase()),
  )

  return phraseMatched && remainderMatched
}

/**
 * Extract plain-text from HTML without DOM operations.
 * Strips tags, decodes common HTML entities via regex.
 */
export function extractTextFromHTML(html: string): string {
  const text = html.replace(/<[^>]+>/g, ' ')
  return text
    .replace(HTML_ENTITY_REGEX, (m) => HTML_ENTITY_MAP[m] ?? m)
    .replace(HTML_NUMERIC_ENTITY_REGEX, (_, code) => String.fromCharCode(Number(code)))
}
