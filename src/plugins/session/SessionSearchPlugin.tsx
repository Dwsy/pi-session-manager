import { FileText } from 'lucide-react'
import { BaseSearchPlugin } from '../base/BaseSearchPlugin'
import type { SearchContext, SearchPluginResult } from '../types'
import { getPathBasename } from '../../utils/path'
import { parseQuotedQuery } from '../../utils/search'

/**
 * Session search plugin
 * Searches session names and metadata
 */
export class SessionSearchPlugin extends BaseSearchPlugin {
  id = 'session-search'
  icon = FileText
  keywords = ['session', 'file', 'conversation', 'session', 'file', 'conversation']
  priority = 60
  
  get name(): string {
    return this.context?.t('plugins.session.name', 'Session Search') || 'session搜索'
  }
  
  get description(): string {
    return this.context?.t('plugins.session.description', 'Search session names and metadata') || '搜索sessionName和元数据'
  }
  
  async search(
    query: string,
    context: SearchContext
  ): Promise<SearchPluginResult[]> {
    // Save context for i18n access
    this.setContext(context)
    
    try {
      const results: SearchPluginResult[] = []
      
      // Filter session list if 'Search current project only' is enabled
      const sessionsToSearch = context.searchCurrentProjectOnly && context.selectedProject
        ? context.sessions.filter(s => s.cwd === context.selectedProject)
        : context.sessions
      
      const parsedQuery = parseQuotedQuery(query)
      const phraseTerms = parsedQuery.phrases.map(phrase => phrase.toLowerCase())
      const remainderTerms = parsedQuery.remainderTokens.map(term => term.toLowerCase())
      const hasPhraseMode = parsedQuery.hasPhrases

      for (const session of sessionsToSearch) {
        const sessionName = session.name || ''
        const firstMessage = session.first_message
        const sessionPath = session.path
        const sessionCwd = session.cwd

        const fields = [sessionName, firstMessage, sessionPath, sessionCwd]
        const lowerFields = fields.map(field => field.toLowerCase())

        if (hasPhraseMode) {
          const phrasesMatched = phraseTerms.every(
            phrase => lowerFields.some(field => field.includes(phrase))
          )

          if (!phrasesMatched) {
            continue
          }

          const remainderMatched = remainderTerms.every(
            term => fields.some(field => this.fuzzyMatch(term, field) > 0)
          )

          if (!remainderMatched) {
            continue
          }
        }

        // Search session name
        const nameScore = sessionName
          ? this.fuzzyMatch(query, sessionName)
          : 0

        // Search first message
        const messageScore = this.fuzzyMatch(query, firstMessage) * 0.8

        // Search path
        const pathScore = this.fuzzyMatch(query, sessionPath) * 0.5

        // Search project path
        const cwdScore = this.fuzzyMatch(query, sessionCwd) * 0.3

        const score = hasPhraseMode
          ? Math.max(
              ...[...phraseTerms, ...remainderTerms].map(term => Math.max(
                this.fuzzyMatch(term, sessionName),
                this.fuzzyMatch(term, firstMessage) * 0.8,
                this.fuzzyMatch(term, sessionPath) * 0.5,
                this.fuzzyMatch(term, sessionCwd) * 0.3,
              ))
            )
          : Math.max(nameScore, messageScore, pathScore, cwdScore)

        if (score > 0) {
          const highlightTerms = hasPhraseMode ? [...phraseTerms, ...remainderTerms] : [query]

          results.push({
            id: `session-${session.id}`,
            pluginId: this.id,
            title: session.name || this.truncateText(session.first_message, 60),
            subtitle: this.getProjectName(session.cwd),
            description: this.getSessionDescription(session, context),
            icon: <FileText className="w-4 h-4 text-green-400" />,
            metadata: {
              session
            },
            score,
            highlights: highlightTerms.flatMap(term => [
              ...this.calculateHighlights(term, session.name || '', 'title'),
              ...this.calculateHighlights(term, session.first_message, 'title')
            ])
          })
        }
      }
      
      const finalResults = results.sort((a, b) => b.score - a.score).slice(0, 20)
      return finalResults
    } catch (error) {
      console.error('[SessionSearchPlugin] Search failed:', error)
      return []
    }
  }
  
  onSelect(result: SearchPluginResult, context: SearchContext): void {
    // Open session
    const session = result.metadata?.session
    
    if (session) {
      context.setSelectedSession(session)
      context.closeCommandMenu()
    }
  }
  
  /**
   * Get session description
   */
  private getSessionDescription(session: any, context: SearchContext): string {
    const parts: string[] = []
    
    // Message count
    parts.push(context.t('session.messageCount', {
      count: session.message_count,
      defaultValue: 'messages'
    }))
    
    // Modified time
    parts.push(this.formatRelativeTime(session.modified))
    
    return parts.join(' • ')
  }
  
  /**
   * Format relative time
   */
  private formatRelativeTime(timestamp: string): string {
    if (!this.context) return timestamp
    
    try {
      const date = new Date(timestamp)
      const now = new Date()
      const diff = now.getTime() - date.getTime()
      const seconds = Math.floor(diff / 1000)
      
      // Less than 1 minute
      if (seconds < 60) {
        return this.context.t('time.justNow')
      }
      
      // Less than 1 hour
      const minutes = Math.floor(seconds / 60)
      if (minutes < 60) {
        return this.context.t('time.minutesAgo', { count: minutes })
      }
      
      // Less than 24 hours
      const hours = Math.floor(minutes / 60)
      if (hours < 24) {
        return this.context.t('time.hoursAgo', { count: hours })
      }
      
      // Less than 7 days
      const days = Math.floor(hours / 24)
      if (days < 7) {
        return this.context.t('time.daysAgo', { count: days })
      }
      
      // Less than 30 days
      const weeks = Math.floor(days / 7)
      if (weeks < 4) {
        return this.context.t('time.weeksAgo', { count: weeks })
      }
      
      // Show date
      return date.toLocaleDateString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      })
    } catch {
      return timestamp
    }
  }
  
  /**
   * Truncate text
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
  }
  
  /**
   * Get project name
   */
  private getProjectName(path: string): string {
    return getPathBasename(path)
  }
}
