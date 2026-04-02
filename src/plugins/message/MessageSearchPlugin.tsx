import type { ReactNode } from 'react'
import { MessageSquare, Bot, User } from 'lucide-react'
import { invoke } from '../../transport'
import { BaseSearchPlugin } from '../base/BaseSearchPlugin'
import type { SearchContext, SearchPluginResult } from '../types'
import type {
  SessionInfo,
  FullTextSearchHit,
  FullTextSearchResponse,
} from '../../types'
import { getPathBasename, getPathParentName } from '../../utils/path'
import { parseQuotedQuery } from '../../utils/search'
import { formatShortSessionId } from '../../utils/session'
import { getCachedSettings } from '../../utils/settingsApi'
import { fullTextSearchDemo, getDemoSessionByPath, isDemoModeEnabled } from '../../demo'

interface MessageResultMetadata {
  sessionId: string
  sessionPath: string
  session?: SessionInfo
  sessionName?: string
  entryId: string
  snippetLines: string[]
  queryTerms: string[]
  truncatedHead: boolean
  truncatedTail: boolean
  role: string
  timestamp: string
  matchReason?: FullTextSearchHit['match_reason']
}

const MAX_RESULTS = 24
const MAX_HITS_TO_FETCH = 40
const MAX_SESSION_PREFETCH = 12
const MAX_SNIPPET_LINES = 3
const MAX_SNIPPET_LINE_LENGTH = 180

/**
 * Message search plugin
 * Uses full-text message search and returns message-level hits with context snippets
 */
export class MessageSearchPlugin extends BaseSearchPlugin {
  id = 'message-search'
  icon = MessageSquare
  keywords = ['message', 'content', 'text', 'conversation', 'message', 'Content', 'conversation']
  priority = 80
  private readonly sessionCache = new Map<string, SessionInfo>()

  get name(): string {
    return this.context?.t('plugins.message.name', 'Message Search') || 'message搜索'
  }

  get description(): string {
    return this.context?.t('plugins.message.description', 'Search user messages and assistant replies') || '搜索用户message和助手回复'
  }

  private truncateText(text: string, maxLength: number): string {
    if (!text) return ''
    if (text.length <= maxLength) return text
    return `${text.slice(0, maxLength)}…`
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  }

  private getHighlightTerms(query: string): string[] {
    if (!query.trim()) {
      return []
    }

    const parsed = parseQuotedQuery(query)
    const terms = parsed.hasPhrases
      ? [...parsed.phrases, ...parsed.remainderTokens]
      : parsed.remainderTokens

    return Array.from(new Set(terms.filter(Boolean)))
      .map(term => term.trim())
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
  }

  private findFirstMatchIndex(text: string, terms: string[]): number {
    const lowerText = text.toLowerCase()
    let firstIndex = -1

    for (const term of terms) {
      const index = lowerText.indexOf(term.toLowerCase())
      if (index !== -1 && (firstIndex === -1 || index < firstIndex)) {
        firstIndex = index
      }
    }

    return firstIndex
  }

  private trimSnippetLine(line: string, terms: string[]): string {
    const normalizedLine = line.trim()
    if (!normalizedLine) {
      return ' '
    }

    if (normalizedLine.length <= MAX_SNIPPET_LINE_LENGTH) {
      return normalizedLine
    }

    const firstMatch = this.findFirstMatchIndex(normalizedLine, terms)
    if (firstMatch < 0) {
      return `${normalizedLine.slice(0, MAX_SNIPPET_LINE_LENGTH)}…`
    }

    const halfWindow = Math.floor(MAX_SNIPPET_LINE_LENGTH / 2)
    let start = Math.max(0, firstMatch - halfWindow)
    let end = Math.min(normalizedLine.length, start + MAX_SNIPPET_LINE_LENGTH)

    if (end - start < MAX_SNIPPET_LINE_LENGTH) {
      start = Math.max(0, end - MAX_SNIPPET_LINE_LENGTH)
    }

    const prefix = start > 0 ? '…' : ''
    const suffix = end < normalizedLine.length ? '…' : ''

    return `${prefix}${normalizedLine.slice(start, end)}${suffix}`
  }

  private buildSnippet(content: string, terms: string[]): {
    lines: string[]
    truncatedHead: boolean
    truncatedTail: boolean
  } {
    const normalized = (content || '').replace(/\r\n/g, '\n')
    const lines = normalized.split('\n')

    if (lines.length === 0) {
      return {
        lines: [''],
        truncatedHead: false,
        truncatedTail: false,
      }
    }

    let targetLineIndex = lines.findIndex(line => this.findFirstMatchIndex(line, terms) >= 0)
    if (targetLineIndex < 0) {
      targetLineIndex = 0
    }

    let start = Math.max(0, targetLineIndex - 1)
    let end = Math.min(lines.length, targetLineIndex + 2)

    if (end - start < MAX_SNIPPET_LINES) {
      const shortBy = MAX_SNIPPET_LINES - (end - start)
      start = Math.max(0, start - shortBy)
      end = Math.min(lines.length, end + shortBy)
    }

    const snippetLines = lines
      .slice(start, end)
      .map(line => this.trimSnippetLine(line, terms))

    return {
      lines: snippetLines,
      truncatedHead: start > 0,
      truncatedTail: end < lines.length,
    }
  }

  private highlightText(text: string, terms: string[]): ReactNode {
    if (!text || !terms.length) {
      return text || ' '
    }

    const uniqueTerms = Array.from(new Set(terms.map(term => term.toLowerCase())))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)

    if (!uniqueTerms.length) {
      return text
    }

    const pattern = new RegExp(`(${uniqueTerms.map(term => this.escapeRegExp(term)).join('|')})`, 'gi')
    const parts = text.split(pattern)

    return parts.map((part, index) => {
      const isMatch = uniqueTerms.includes(part.toLowerCase())
      if (!isMatch) {
        return <span key={`${part}-${index}`}>{part}</span>
      }

      return (
        <mark
          key={`${part}-${index}`}
          className="rounded bg-warning/35 text-foreground px-0.5 font-semibold"
        >
          {part}
        </mark>
      )
    })
  }

  private getRoleLabel(role: string): string {
    if (!this.context) {
      return role
    }

    if (role === 'assistant') {
      return this.context.t('search.fullText.role.assistant', 'AI')
    }

    if (role === 'user') {
      return this.context.t('search.fullText.role.user', 'User')
    }

    return role
  }

  private getRoleBadgeClass(role: string): string {
    if (role === 'assistant') {
      return 'bg-info/12 text-info border-info/30'
    }

    if (role === 'user') {
      return 'bg-surface-dark/90 text-foreground/90 border-border'
    }

    return 'bg-surface-dark/80 text-foreground/85 border-border/80'
  }

  private getRoleIcon(role: string): ReactNode {
    if (role === 'assistant') {
      return <Bot className="w-3 h-3 opacity-90" />
    }

    if (role === 'user') {
      return <User className="w-3 h-3 opacity-85" />
    }

    return <MessageSquare className="w-3 h-3 opacity-80" />
  }

  private warmSessionCache(sessions: SessionInfo[]): void {
    for (const session of sessions) {
      this.sessionCache.set(session.path, session)
    }
  }

  private async resolveSessionByPath(path: string): Promise<SessionInfo | null> {
    const cached = this.sessionCache.get(path)
    if (cached) {
      return cached
    }

    try {
      const session = isDemoModeEnabled()
        ? getDemoSessionByPath(path)
        : await invoke<SessionInfo>('get_session_by_path', { path })
      if (session) {
        this.sessionCache.set(path, session)
        return session
      }
    } catch {
      // Ignore per-item resolution failure
    }

    return null
  }

  private async prefetchSessionsByPath(paths: string[]): Promise<void> {
    if (!paths.length) {
      return
    }

    const uniquePaths = Array.from(new Set(paths)).filter(path => !this.sessionCache.has(path))
    if (!uniquePaths.length) {
      return
    }

    await Promise.all(
      uniquePaths.map(async (path) => {
        const session = await this.resolveSessionByPath(path)
        if (session) {
          this.sessionCache.set(path, session)
        }
      })
    )
  }

  private fallbackSessionTitle(hit: FullTextSearchHit): string {
    if (hit.session_name?.trim()) {
      return hit.session_name.trim()
    }

    const firstLine = hit.content?.split('\n')[0]?.trim() || ''
    return firstLine ? this.truncateText(firstLine, 60) : this.truncateText(hit.session_path, 60)
  }

  private fallbackProjectName(hit: FullTextSearchHit): string {
    const maybeParent = getPathParentName(hit.session_path)

    if (maybeParent && maybeParent !== 'sessions' && maybeParent !== hit.session_path) {
      return maybeParent
    }

    return this.context?.t('command.allProjects', 'All Projects') || 'Project'
  }

  async search(
    query: string,
    context: SearchContext
  ): Promise<SearchPluginResult[]> {
    this.setContext(context)
    this.warmSessionCache(context.sessions)

    try {
      const response: FullTextSearchResponse = isDemoModeEnabled()
        ? fullTextSearchDemo({
          query,
          roleFilter: 'all',
          globPattern: null,
          projectPath: context.searchCurrentProjectOnly ? context.selectedProject : null,
          includeThinking: getCachedSettings().search.includeThinkingInSearch,
          page: 0,
          pageSize: MAX_HITS_TO_FETCH,
          matchMode: 'any',
        })
        : await invoke<FullTextSearchResponse>('full_text_search', {
          query,
          roleFilter: 'all',
          globPattern: null,
          projectPath: context.searchCurrentProjectOnly ? context.selectedProject : null,
          includeThinking: getCachedSettings().search.includeThinkingInSearch,
          page: 0,
          pageSize: MAX_HITS_TO_FETCH,
          matchMode: 'any',
        })

      const hits = response.hits.slice(0, MAX_HITS_TO_FETCH)
      if (!hits.length) {
        return []
      }

      const missingPaths = hits
        .map(hit => hit.session_path)
        .filter(path => !this.sessionCache.has(path))
      await this.prefetchSessionsByPath(missingPaths.slice(0, MAX_SESSION_PREFETCH))

      const queryTerms = this.getHighlightTerms(query)
      const results: SearchPluginResult[] = []

      for (let index = 0; index < hits.length; index++) {
        const hit = hits[index]
        const session = this.sessionCache.get(hit.session_path)

        const snippet = this.buildSnippet(hit.content, queryTerms)
        const metadata: MessageResultMetadata = {
          sessionId: hit.session_id,
          sessionPath: hit.session_path,
          session,
          sessionName: hit.session_name,
          entryId: hit.entry_id,
          snippetLines: snippet.lines,
          queryTerms,
          truncatedHead: snippet.truncatedHead,
          truncatedTail: snippet.truncatedTail,
          role: hit.role,
          timestamp: hit.timestamp,
          matchReason: hit.match_reason,
        }

        results.push(this.createSearchResult(hit, index, hits.length, metadata))
      }

      return results.slice(0, MAX_RESULTS)
    } catch (error) {
      console.error('[MessageSearchPlugin] full_text_search failed:', error)
      return []
    }
  }

  private createSearchResult(
    hit: FullTextSearchHit,
    index: number,
    total: number,
    metadata: MessageResultMetadata,
  ): SearchPluginResult {
    const session = metadata.session
    const projectName = session
      ? this.getProjectName(session.cwd)
      : this.fallbackProjectName(hit)
    const title = session?.name || this.fallbackSessionTitle(hit)
    const relativePositionScore = 1 - index / Math.max(total, 1)

    return {
      id: `${hit.session_id}-${hit.entry_id}`,
      pluginId: this.id,
      title,
      subtitle: `${projectName} · ${formatShortSessionId(hit.session_id)} · ${this.truncateText(hit.session_path, 60)}`,
      description: `${this.getRoleLabel(hit.role)} · ${this.formatDate(hit.timestamp)}`,
      icon: <MessageSquare className="w-4 h-4 text-info" />,
      metadata,
      score: Math.max(0.05, relativePositionScore),
      highlights: [],
    }
  }

  onSelect(result: SearchPluginResult, context: SearchContext): void {
    void this.handleSelect(result, context)
  }

  private async handleSelect(result: SearchPluginResult, context: SearchContext): Promise<void> {
    const metadata = result.metadata as MessageResultMetadata | undefined
    if (!metadata) {
      console.warn('[MessageSearchPlugin] Result metadata is missing')
      return
    }

    let session: SessionInfo | null | undefined = metadata.session || this.sessionCache.get(metadata.sessionPath)
    if (!session) {
      session = await this.resolveSessionByPath(metadata.sessionPath)
    }
    if (!session) {
      console.warn('[MessageSearchPlugin] Failed to resolve session by path:', metadata.sessionPath)
      return
    }

    this.sessionCache.set(session.path, session)
    context.setSelectedSession(session)
    context.setSelectedProject(session.cwd)

    if (metadata.entryId && context.setPendingScrollEntryId) {
      context.setPendingScrollEntryId(metadata.entryId)
    }

    context.closeCommandMenu()
  }

  renderItem(result: SearchPluginResult): ReactNode {
    const metadata = result.metadata as MessageResultMetadata | undefined
    if (!metadata) {
      return null
    }

    const roleLabel = this.getRoleLabel(metadata.role)
    const isSessionIdMatch = metadata.matchReason === 'session_id_exact' || metadata.matchReason === 'session_id_prefix'

    return (
      <div className="w-full min-w-0">
        <div className="flex items-start gap-2.5">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-foreground truncate">
              {result.title}
            </div>
            {result.subtitle && (
              <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                {result.subtitle}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2.5 flex-shrink-0">
            {isSessionIdMatch && (
              <span className="inline-flex items-center h-5 px-2 rounded-md text-[11px] font-medium tracking-[0.01em] border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                {this.context?.t('search.fullText.sessionIdMatch', 'session id') || 'session id'}
              </span>
            )}
            <span className={`inline-flex items-center gap-1.5 h-5 px-2 rounded-md text-[11px] font-medium tracking-[0.01em] border ${this.getRoleBadgeClass(metadata.role)}`}>
              {this.getRoleIcon(metadata.role)}
              <span>{roleLabel}</span>
            </span>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {this.formatDate(metadata.timestamp)}
            </span>
          </div>
        </div>

        <div className="mt-2 rounded-lg border border-border/70 bg-surface/70 px-3 py-2">
          {metadata.truncatedHead && (
            <p className="text-[11px] leading-5 text-muted-foreground/80">...</p>
          )}
          {metadata.snippetLines.map((line, lineIndex) => (
            <p
              key={`${metadata.entryId}-${lineIndex}`}
              className="text-xs leading-5 text-foreground/90 break-words"
            >
              {this.highlightText(line, metadata.queryTerms)}
            </p>
          ))}
          {metadata.truncatedTail && (
            <p className="text-[11px] leading-5 text-muted-foreground/80">...</p>
          )}
        </div>
      </div>
    )
  }

  private getProjectName(cwd: string): string {
    return getPathBasename(cwd)
  }

  private formatDate(date: Date | string): string {
    if (!this.context) return String(date)

    const dateObj = typeof date === 'string' ? new Date(date) : date
    const now = new Date()
    const diff = now.getTime() - dateObj.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) return this.context.t('time.today')
    if (days === 1) return this.context.t('time.yesterday')
    if (days < 7) return this.context.t('time.daysAgo', { count: days })
    if (days < 30) {
      const weeks = Math.floor(days / 7)
      return this.context.t('time.weeksAgo', { count: weeks })
    }
    if (days < 365) {
      const months = Math.floor(days / 30)
      return this.context.t('time.monthsAgo', { count: months })
    }
    const years = Math.floor(days / 365)
    return this.context.t('time.yearsAgo', { count: years })
  }
}
