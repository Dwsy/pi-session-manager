/**
 * Parsed query with support for exact phrases wrapped in double quotes
 */
export interface ParsedQuotedQuery {
  phrases: string[]
  remainder: string
  remainderTokens: string[]
  hasPhrases: boolean
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

/**
 * Get lowercased search terms for matching/highlighting
 */
export function getQueryTerms(searchQuery: string): string[] {
  const parsed = parseQuotedQuery(searchQuery)
  if (!parsed.hasPhrases) {
    const trimmed = parsed.remainder.trim()
    return trimmed ? [trimmed.toLowerCase()] : []
  }

  return [...parsed.phrases, ...parsed.remainderTokens]
    .map(term => term.toLowerCase())
    .filter(Boolean)
}

/**
 * Highlight search keywords in HTML string
 * @param html - Original HTML string
 * @param searchQuery - Search query
 * @returns Highlighted HTML string
 */
export function highlightSearchInHTML(html: string, searchQuery: string): string {
  const terms = getQueryTerms(searchQuery)
  if (!terms.length) {
    return html
  }

  const escapedTerms = [...new Set(terms)]
    .sort((a, b) => b.length - a.length)
    .map(term => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))

  if (!escapedTerms.length) {
    return html
  }

  const regex = new RegExp(`(${escapedTerms.join('|')})`, 'gi')

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
  const parsed = parseQuotedQuery(searchQuery)

  if (!parsed.hasPhrases) {
    const trimmed = parsed.remainder.trim().toLowerCase()
    return trimmed ? textLower.includes(trimmed) : false
  }

  const phraseMatched = parsed.phrases.every(phrase => textLower.includes(phrase.toLowerCase()))
  const remainderMatched = parsed.remainderTokens.every(token => textLower.includes(token.toLowerCase()))

  return phraseMatched && remainderMatched
}

/**
 * Extract plain-text message content (for search)
 * @param html - HTML string
 * @returns Plain text
 */
export function extractTextFromHTML(html: string): string {
  // Remove HTML tags
  const text = html.replace(/<[^>]+>/g, ' ')
  // Decode HTML entities
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}
