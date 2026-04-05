import type { SearchPlugin, SearchContext, SearchPluginResult, HighlightRange } from '@/plugins/types'

/**
 * Base search plugin
 * Provides common functionality and default implementations
 */
export abstract class BaseSearchPlugin implements SearchPlugin {
  abstract id: string
  abstract name: string
  abstract icon: React.ComponentType<{ className?: string }>
  abstract description: string
  abstract keywords: string[]

  priority: number = 50 // Default priority

  // Store context for subclass i18n access
  protected context?: SearchContext

  /**
   * Set search context (includes i18n)
   */
  setContext(context: SearchContext): void {
    this.context = context
  }

  /**
   * Abstract search method, must be implemented by subclasses
   */
  abstract search(
    query: string,
    context: SearchContext
  ): Promise<SearchPluginResult[]>

  /**
   * Default selection handling (can be overridden)
   */
  onSelect(_result: SearchPluginResult, _context: SearchContext): void {
    // Default: do nothing, subclasses should override
  }

  /**
   * Default enable check (can be overridden)
   */
  isEnabled(_context: SearchContext): boolean {
    return true
  }

  /**
   * Utility method: fuzzy match
   * @param query Query string
   * @param text Target text
   * @returns Match score (0-1)
   */
  protected fuzzyMatch(query: string, text: string): number {
    const lowerQuery = query.toLowerCase()
    const lowerText = text.toLowerCase()

    // Exact match
    if (lowerText === lowerQuery) return 1.0

    // Contains match
    if (lowerText.includes(lowerQuery)) {
      const position = lowerText.indexOf(lowerQuery)
      const positionScore = 1 - (position / lowerText.length)
      return 0.8 * positionScore
    }

    // Fuzzy match (character order)
    let queryIndex = 0
    let textIndex = 0
    let matches = 0

    while (queryIndex < lowerQuery.length && textIndex < lowerText.length) {
      if (lowerQuery[queryIndex] === lowerText[textIndex]) {
        matches++
        queryIndex++
      }
      textIndex++
    }

    if (matches === lowerQuery.length) {
      return 0.5 * (matches / lowerText.length)
    }

    return 0
  }

  /**
   * Utility method: calculate highlight ranges
   * @param query Query string
   * @param text Target text
   * @param field Field name
   * @returns Highlight range array
   */
  protected calculateHighlights(
    query: string,
    text: string,
    field: 'title' | 'subtitle' | 'description'
  ): HighlightRange[] {
    const lowerQuery = query.toLowerCase()
    const lowerText = text.toLowerCase()
    const highlights: HighlightRange[] = []

    let index = lowerText.indexOf(lowerQuery)
    while (index !== -1) {
      highlights.push({
        start: index,
        end: index + query.length,
        field
      })
      index = lowerText.indexOf(lowerQuery, index + 1)
    }

    return highlights
  }
}
