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

  // 临时替换 HTML 标签，避免在标签内搜索
  const tagPlaceholders: string[] = []
  let processedHtml = html.replace(/<[^>]+>/g, (tagMatch) => {
    const placeholder = `__TAG_${tagPlaceholders.length}__`
    tagPlaceholders.push(tagMatch)
    return placeholder
  })

  // 高亮搜索关键词
  processedHtml = processedHtml.replace(regex, '<mark class="search-highlight">$1</mark>')

  // 恢复 HTML 标签
  tagPlaceholders.forEach((tag, index) => {
    processedHtml = processedHtml.replace(`__TAG_${index}__`, tag)
  })

  return processedHtml
}

/**
 * 在纯文本中搜索关键词
 * @param text - 纯文本
 * @param searchQuery - 搜索关键词
 * @returns 是否包含关键词
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
 * 提取消息的纯文本内容（用于搜索）
 * @param html - HTML 字符串
 * @returns 纯文本
 */
export function extractTextFromHTML(html: string): string {
  // 移除 HTML 标签
  const text = html.replace(/<[^>]+>/g, ' ')
  // 解码 HTML 实体
  const textarea = document.createElement('textarea')
  textarea.innerHTML = text
  return textarea.value
}
