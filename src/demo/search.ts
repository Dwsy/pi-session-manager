import type { FullTextSearchHit, Match, SearchResult, SessionEntry, SessionInfo } from '@/types'
import { filterSessionsBySearchQuery } from '@/utils/sessionFilters'
import { getSessionIdMatchKind } from '@/utils/session'
import { parseQuotedQuery } from '@/utils/search'

import type {
  DemoFullTextSearchOptions,
  DemoListSessionsOptions,
  DemoPaginatedSessionsResponse,
  DemoSearchOptions,
  DemoStore,
} from './types'

function normalizeForSearch(value: string | undefined): string {
  return (value || '').toLowerCase()
}

function stringIncludes(source: string | undefined, target: string): boolean {
  return normalizeForSearch(source).includes(target)
}

function matchesSessionIdPrefix(sessionId: string | undefined, target: string): boolean {
  return getSessionIdMatchKind(sessionId, target) !== null
}

function collectSessionMatches(query: string, session: SessionInfo): Match[] {
  const normalized = query.toLowerCase()
  const matches: Match[] = []

  if (matchesSessionIdPrefix(session.id, normalized)) {
    matches.push({
      entry_id: `${session.id}-session-id`,
      role: 'session',
      snippet: session.id,
      timestamp: session.modified,
    })
  }

  if (stringIncludes(session.name, normalized)) {
    matches.push({
      entry_id: `${session.id}-name`,
      role: 'name',
      snippet: session.name || '',
      timestamp: session.modified,
    })
  }

  if (stringIncludes(session.first_message, normalized)) {
    matches.push({
      entry_id: `${session.id}-first-message`,
      role: 'user',
      snippet: session.first_message,
      timestamp: session.created,
    })
  }

  if (stringIncludes(session.last_message, normalized)) {
    matches.push({
      entry_id: `${session.id}-last-message`,
      role: 'assistant',
      snippet: session.last_message,
      timestamp: session.modified,
    })
  }

  if (stringIncludes(session.cwd, normalized)) {
    matches.push({
      entry_id: `${session.id}-cwd`,
      role: 'cwd',
      snippet: session.cwd,
      timestamp: session.modified,
    })
  }

  return matches
}

function matchPathWithGlob(path: string, globPattern: string | null | undefined): boolean {
  if (!globPattern || !globPattern.trim()) {
    return true
  }

  const pattern = globPattern.trim().replace(/\\/g, '/').toLowerCase()
  const normalizedPath = path.replace(/\\/g, '/').toLowerCase()

  if (!pattern.includes('*') && !pattern.includes('?')) {
    return normalizedPath.includes(pattern)
  }

  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.')

  const regex = new RegExp(`^${escaped}$`)
  return regex.test(normalizedPath)
}

function extractMessageText(entry: SessionEntry, includeThinking = true): string {
  if (entry.type !== 'message' || !entry.message?.content) {
    return ''
  }

  const pieces: string[] = []

  for (const item of entry.message.content) {
    if (item.type === 'text' && item.text) {
      pieces.push(item.text)
      continue
    }

    if (includeThinking && item.type === 'thinking' && item.thinking) {
      pieces.push(item.thinking)
      continue
    }

    if (item.type === 'toolCall') {
      const argsText = item.arguments ? JSON.stringify(item.arguments) : ''
      pieces.push(`${item.name || 'tool'} ${argsText}`)
    }
  }

  return pieces.join('\n').trim()
}

function parseQueryTerms(rawQuery: string): string[] {
  const parsed = parseQuotedQuery(rawQuery)

  if (!parsed.hasPhrases) {
    return parsed.remainderTokens
      .map((term) => term.toLowerCase())
      .filter(Boolean)
  }

  return [...parsed.phrases, ...parsed.remainderTokens]
    .map((term) => term.toLowerCase())
    .filter(Boolean)
}

function matchMessageByTerms(content: string, terms: string[], matchMode: 'any' | 'all'): boolean {
  if (!terms.length) {
    return false
  }

  const lower = content.toLowerCase()

  if (matchMode === 'all') {
    return terms.every((term) => lower.includes(term))
  }

  return terms.some((term) => lower.includes(term))
}

function rankContent(content: string, terms: string[]): number {
  const lower = content.toLowerCase()
  return terms.reduce((score, term) => {
    if (!term) return score
    const pieces = lower.split(term)
    if (pieces.length <= 1) return score
    return score + (pieces.length - 1)
  }, 0)
}

interface ResolvedLabel {
  text: string
  labeledAt: string
}

function resolveLatestLabels(entries: SessionEntry[]): Map<string, ResolvedLabel> {
  const labels = new Map<string, ResolvedLabel>()

  for (const entry of entries) {
    if (entry.type !== 'label' || typeof entry.targetId !== 'string' || !entry.targetId) {
      continue
    }

    const label = typeof entry.label === 'string' ? entry.label : ''
    if (label.trim()) {
      labels.set(entry.targetId, {
        text: label,
        labeledAt: entry.timestamp,
      })
      continue
    }

    labels.delete(entry.targetId)
  }

  return labels
}

function sourcePrecedence(sourceType: FullTextSearchHit['source_type']): number {
  switch (sourceType) {
    case 'label':
      return 0
    case 'user':
      return 1
    case 'assistant':
      return 2
    default:
      return 3
  }
}

function chooseWinningHit(
  existing: FullTextSearchHit | undefined,
  candidate: FullTextSearchHit,
): FullTextSearchHit {
  if (!existing) {
    return candidate
  }

  const precedenceDiff = sourcePrecedence(candidate.source_type) - sourcePrecedence(existing.source_type)
  if (precedenceDiff < 0) {
    return candidate
  }
  if (precedenceDiff > 0) {
    return existing
  }

  if (candidate.timestamp > existing.timestamp) {
    return candidate
  }

  return existing
}

function compareBySort(
  left: SessionInfo,
  right: SessionInfo,
  sortBy: string,
  sortOrder: 'asc' | 'desc',
  state: DemoStore,
): number {
  const direction = sortOrder === 'asc' ? 1 : -1

  if (sortBy === 'created') {
    const primary = left.created.localeCompare(right.created) * direction
    if (primary !== 0) return primary
    const fallback = right.modified.localeCompare(left.modified)
    if (fallback !== 0) return fallback
    return left.path.localeCompare(right.path)
  }

  if (sortBy === 'name') {
    const leftName = (left.name || left.first_message || '').toLowerCase()
    const rightName = (right.name || right.first_message || '').toLowerCase()
    const primary = leftName.localeCompare(rightName) * direction
    if (primary !== 0) return primary
    const fallback = right.modified.localeCompare(left.modified)
    if (fallback !== 0) return fallback
    return left.path.localeCompare(right.path)
  }

  if (sortBy === 'size') {
    const leftSize = state.sizeBytesByPath.get(left.path) || 0
    const rightSize = state.sizeBytesByPath.get(right.path) || 0
    const primary = (leftSize - rightSize) * direction
    if (primary !== 0) return primary
    const fallback = right.modified.localeCompare(left.modified)
    if (fallback !== 0) return fallback
    return left.path.localeCompare(right.path)
  }

  const primary = left.modified.localeCompare(right.modified) * direction
  if (primary !== 0) return primary
  return left.path.localeCompare(right.path)
}

function sortFullTextHits(
  hits: FullTextSearchHit[],
  sortOrder: 'score' | 'newest' | 'oldest',
): FullTextSearchHit[] {
  return [...hits].sort((left, right) => {
    if (sortOrder === 'newest') {
      return right.timestamp.localeCompare(left.timestamp)
    }
    if (sortOrder === 'oldest') {
      return left.timestamp.localeCompare(right.timestamp)
    }

    return (
      right.score - left.score ||
      right.timestamp.localeCompare(left.timestamp) ||
      left.session_path.localeCompare(right.session_path)
    )
  })
}

export function searchDemoSessionsInStore(state: DemoStore, options: DemoSearchOptions): SearchResult[] {
  const queryText = options.query.trim().toLowerCase()
  if (!queryText) {
    return []
  }

  const allowedIds = options.sessions ? new Set(options.sessions.map((session) => session.id)) : null

  const matched: SearchResult[] = []

  for (const session of state.sessions) {
    if (allowedIds && !allowedIds.has(session.id)) {
      continue
    }

    const matches = collectSessionMatches(queryText, session)
    if (matches.length === 0) {
      continue
    }

    matched.push({
      session_id: session.id,
      session_path: session.path,
      session_name: session.name,
      first_message: session.first_message,
      matches,
      score: matches.length * 10,
    })
  }

  return matched.sort((left, right) => right.score - left.score)
}

export function fullTextSearchDemoInStore(state: DemoStore, options: DemoFullTextSearchOptions): {
  hits: FullTextSearchHit[]
  total_hits: number
  has_more: boolean
} {
  const query = options.query?.trim() || ''
  const sourceFilter = options.sourceFilter || 'all'
  const isLabelsBrowseMode = sourceFilter === 'labels_only' && !query

  if (!query && !isLabelsBrowseMode) {
    return { hits: [], total_hits: 0, has_more: false }
  }

  const roleFilter = options.roleFilter || 'all'
  const page = Math.max(0, options.page || 0)
  const pageSize = Math.max(1, options.pageSize || 20)
  const matchMode = options.matchMode || 'any'
  const sortOrder = options.sortOrder || 'score'

  const terms = parseQueryTerms(query)
  if (!terms.length && !isLabelsBrowseMode) {
    return { hits: [], total_hits: 0, has_more: false }
  }

  const includeSessionIdMatches = sourceFilter === 'all'
  const includeLabelHits = sourceFilter !== 'content_only'
  const includeContentHits = sourceFilter !== 'labels_only'

  const idHits: FullTextSearchHit[] = []
  const hits: FullTextSearchHit[] = []

  for (const session of state.sessions) {
    if (!matchPathWithGlob(session.path, options.globPattern)) {
      continue
    }

    if (options.projectPath && session.cwd !== options.projectPath) {
      continue
    }

    if (includeSessionIdMatches) {
      const sessionIdMatchKind = getSessionIdMatchKind(session.id, query)
      if (sessionIdMatchKind) {
        const preview = session.last_message || session.first_message || session.name || session.cwd
        const role = session.last_message_role === 'user' ? 'user' : 'assistant'
        if (roleFilter === 'all' || roleFilter === role) {
          idHits.push({
            session_id: session.id,
            session_path: session.path,
            session_name: session.name,
            entry_id: '',
            role,
            source_type: role,
            content: preview,
            timestamp: session.modified,
            score: sessionIdMatchKind === 'exact' ? 1_000_000 : 999_000,
            match_reason: sessionIdMatchKind === 'exact' ? 'session_id_exact' : 'session_id_prefix',
          })
        }
      }
    }

    const entries = state.entriesByPath.get(session.path)
    if (!entries) continue

    const bestHitsByEntryId = new Map<string, FullTextSearchHit>()
    const entriesById = new Map(entries.map((entry) => [entry.id, entry]))

    if (includeLabelHits) {
      const labelsByTargetId = resolveLatestLabels(entries)

      for (const [targetId, resolvedLabel] of labelsByTargetId) {
        const targetEntry = entriesById.get(targetId)
        if (targetEntry?.type !== 'message') {
          continue
        }

        const role = targetEntry.message?.role
        if (role !== 'user' && role !== 'assistant') {
          continue
        }
        if (roleFilter !== 'all' && role !== roleFilter) {
          continue
        }
        if (!isLabelsBrowseMode && !matchMessageByTerms(resolvedLabel.text, terms, matchMode)) {
          continue
        }

        const candidate: FullTextSearchHit = {
          session_id: session.id,
          session_path: session.path,
          session_name: session.name,
          entry_id: targetEntry.id,
          role,
          source_type: 'label',
          content: resolvedLabel.text,
          timestamp: resolvedLabel.labeledAt,
          score: 10_000 + (isLabelsBrowseMode ? 0 : rankContent(resolvedLabel.text, terms)),
          match_reason: 'label',
        }
        bestHitsByEntryId.set(
          targetEntry.id,
          chooseWinningHit(bestHitsByEntryId.get(targetEntry.id), candidate),
        )
      }
    }

    if (includeContentHits) {
      for (const entry of entries) {
        if (entry.type !== 'message') continue
        const role = entry.message?.role
        if (role !== 'user' && role !== 'assistant') continue
        if (roleFilter !== 'all' && role !== roleFilter) continue

        const content = extractMessageText(entry, options.includeThinking === true)
        if (!content) continue
        if (!matchMessageByTerms(content, terms, matchMode)) continue

        const score = rankContent(content, terms) + 1
        const candidate: FullTextSearchHit = {
          session_id: session.id,
          session_path: session.path,
          session_name: session.name,
          entry_id: entry.id,
          role,
          source_type: role,
          content,
          timestamp: entry.timestamp,
          score,
          match_reason: 'content',
        }
        bestHitsByEntryId.set(
          entry.id,
          chooseWinningHit(bestHitsByEntryId.get(entry.id), candidate),
        )
      }
    }

    hits.push(...bestHitsByEntryId.values())
  }

  const combinedHits = [
    ...sortFullTextHits(idHits, 'score'),
    ...sortFullTextHits(hits, sortOrder),
  ]
  const start = page * pageSize
  const end = start + pageSize
  const pagedHits = combinedHits.slice(start, end)

  return {
    hits: pagedHits,
    total_hits: combinedHits.length,
    has_more: end < combinedHits.length,
  }
}

export function listDemoSessionsPaginatedInStore(
  state: DemoStore,
  options: DemoListSessionsOptions,
): DemoPaginatedSessionsResponse {
  const offset = Math.max(0, options.offset || 0)
  const limit = Math.max(1, options.limit || 100)
  const sortBy = options.sortBy || 'modified'
  const sortOrder = options.sortOrder || 'desc'

  let sessions = state.sessions.map((session) => ({ ...session }))

  if (options.projectFilter) {
    sessions = sessions.filter((session) => session.cwd === options.projectFilter)
  }

  const filterTagIds = options.filterTagIds || []
  if (filterTagIds.length > 0) {
    const sessionIdSet = new Set(
      state.sessionTags
        .filter((st) => filterTagIds.includes(st.tagId))
        .map((st) => st.sessionId)
    )
    sessions = sessions.filter((session) => sessionIdSet.has(session.id))
  }

  if (options.searchQuery?.trim()) {
    sessions = filterSessionsBySearchQuery(sessions, options.searchQuery, {
      includeId: true,
    })
  }

  sessions.sort((left, right) => compareBySort(left, right, sortBy, sortOrder, state))

  const total = sessions.length
  const paged = sessions.slice(offset, offset + limit)

  return {
    sessions: paged,
    total,
    offset,
    limit,
    has_more: offset + limit < total,
  }
}
