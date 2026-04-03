import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import type { Content, SessionEntry } from '../types'
import { parseMarkdown } from '../utils/markdown'
import { getAssistantDisplayedBlocks } from '../utils/assistantContent'
import {
  getSearchableToolCallRenderedHtmlSegments,
} from '../plugins/tools-render/utils/searchSegments'
import { toolRenderRegistry } from '../plugins/tools-render/registry'
import { defaultResolveData } from '../plugins/tools-render/utils/resolveData'
import { countSearchHighlightsInHTML } from '../utils/search'

export type SessionSearchScope = 'all' | 'messages' | 'user'

export interface SessionSearchTarget {
  rowEntryId: string
  matchElementId: string
  occurrenceIndexInElement: number
}

interface UseSessionViewerInMessageSearchOptions {
  renderableEntries: SessionEntry[]
  toolResultByCallId: Map<string, SessionEntry>
  showThinking: boolean
  sessionPath: string
}

interface SessionSearchMatch extends SessionSearchTarget {
  key: string
}

export interface UseSessionViewerInMessageSearchResult {
  isSearchOpen: boolean
  searchQuery: string
  searchScope: SessionSearchScope
  totalMatches: number
  currentMatchNumber: number
  currentTarget: SessionSearchTarget | null
  openSearch: () => void
  closeSearch: () => void
  clearSearch: () => void
  setSearchQuery: (query: string) => void
  setSearchScope: (scope: SessionSearchScope) => void
  goToNextMatch: () => void
  goToPreviousMatch: () => void
}

function getUserSearchHtmlSegments(content: Content[]): string[] {
  const userText = content
    .filter((item) => item.type === 'text' && item.text)
    .map((item) => item.text)
    .join('\n')

  return userText.trim() ? [parseMarkdown(userText)] : []
}

function getSearchMatchEntries(
  rowEntryId: string,
  matchElementId: string,
  renderedHtmlSegments: string[],
  searchQuery: string,
): SessionSearchMatch[] {
  const matches: SessionSearchMatch[] = []
  let occurrenceIndexInElement = 0

  for (const renderedHtml of renderedHtmlSegments) {
    const segmentMatchCount = countSearchHighlightsInHTML(renderedHtml, searchQuery)
    if (segmentMatchCount === 0) {
      continue
    }

    for (let segmentIndex = 0; segmentIndex < segmentMatchCount; segmentIndex += 1) {
      matches.push({
        rowEntryId,
        matchElementId,
        occurrenceIndexInElement,
        key: `${matchElementId}:${occurrenceIndexInElement}`,
      })
      occurrenceIndexInElement += 1
    }
  }

  return matches
}

function getAssistantSearchMatches(
  entry: SessionEntry,
  showThinking: boolean,
  searchQuery: string,
  searchScope: SessionSearchScope,
  toolResultByCallId: Map<string, SessionEntry>,
): SessionSearchMatch[] {
  if (!entry.message) {
    return []
  }

  const { thinkingBlocks, textBlocks } = getAssistantDisplayedBlocks(
    entry.message.content,
  )
  const visibleBlocks = [
    ...(showThinking ? thinkingBlocks : []),
    ...textBlocks,
  ]
  const textMatches = getSearchMatchEntries(
    entry.id,
    entry.id,
    visibleBlocks
      .map((block) => parseMarkdown(block))
      .filter(Boolean),
    searchQuery,
  )

  if (searchScope !== 'all') {
    return textMatches
  }

  const toolMatches = entry.message.content
    .filter((item) => item.type === 'toolCall')
    .flatMap((toolCall, index) => {
      // Use plugin system to resolve entryId
      const plugin = toolRenderRegistry.findPlugin(toolCall)
      const resolvedData = plugin.resolveData?.(
        toolCall,
        index,
        toolResultByCallId
      ) ?? defaultResolveData(toolCall, index, toolResultByCallId)

      return getSearchMatchEntries(
        entry.id,
        resolvedData.entryId,
        getSearchableToolCallRenderedHtmlSegments(
          toolCall,
          index,
          toolResultByCallId,
        ),
        searchQuery,
      )
    })

  return [...textMatches, ...toolMatches]
}

export function useSessionViewerInMessageSearch({
  renderableEntries,
  toolResultByCallId,
  showThinking,
  sessionPath,
}: UseSessionViewerInMessageSearchOptions): UseSessionViewerInMessageSearchResult {
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [searchQuery, setSearchQueryState] = useState('')
  const [searchScope, setSearchScopeState] = useState<SessionSearchScope>('all')
  const [currentMatchIndex, setCurrentMatchIndex] = useState(-1)
  const previousSearchSignatureRef = useRef('')

  const matches = useMemo<SessionSearchMatch[]>(() => {
    if (!searchQuery.trim()) {
      return []
    }

    return renderableEntries.flatMap((entry) => {
      if (entry.type !== 'message' || !entry.message) {
        return []
      }

      if (entry.message.role === 'user') {
        return getSearchMatchEntries(
          entry.id,
          entry.id,
          getUserSearchHtmlSegments(entry.message.content),
          searchQuery,
        )
      }

      if (entry.message.role === 'assistant') {
        if (searchScope === 'user') {
          return []
        }

        return getAssistantSearchMatches(
          entry,
          showThinking,
          searchQuery,
          searchScope,
          toolResultByCallId,
        )
      }

      return []
    })
  }, [renderableEntries, searchQuery, searchScope, showThinking, toolResultByCallId])

  useEffect(() => {
    previousSearchSignatureRef.current = ''
    setIsSearchOpen(false)
    setSearchQueryState('')
    setSearchScopeState('all')
    setCurrentMatchIndex(-1)
  }, [sessionPath])

  useEffect(() => {
    const searchSignature = `${searchScope}::${searchQuery}`
    const searchSignatureChanged = previousSearchSignatureRef.current !== searchSignature
    previousSearchSignatureRef.current = searchSignature

    if (!searchQuery.trim() || matches.length === 0) {
      setCurrentMatchIndex(-1)
      return
    }

    setCurrentMatchIndex((previousIndex) => {
      if (searchSignatureChanged || previousIndex < 0) {
        return 0
      }

      const currentMatch = matches[previousIndex]
      if (!currentMatch) {
        return 0
      }

      const preservedIndex = matches.findIndex(
        (match) => match.key === currentMatch.key,
      )
      return preservedIndex === -1 ? 0 : preservedIndex
    })
  }, [matches, searchQuery, searchScope])

  const openSearch = useCallback(() => {
    setIsSearchOpen(true)
  }, [])

  const clearSearch = useCallback(() => {
    previousSearchSignatureRef.current = ''
    setSearchQueryState('')
    setCurrentMatchIndex(-1)
  }, [])

  const closeSearch = useCallback(() => {
    clearSearch()
    setSearchScopeState('all')
    setIsSearchOpen(false)
  }, [clearSearch])

  const setSearchQuery = useCallback((query: string) => {
    setSearchQueryState(query)
  }, [])

  const setSearchScope = useCallback((scope: SessionSearchScope) => {
    setSearchScopeState(scope)
  }, [])

  const goToNextMatch = useCallback(() => {
    if (matches.length === 0) {
      return
    }

    setCurrentMatchIndex((previousIndex) => {
      if (previousIndex < 0) {
        return 0
      }

      return (previousIndex + 1) % matches.length
    })
  }, [matches.length])

  const goToPreviousMatch = useCallback(() => {
    if (matches.length === 0) {
      return
    }

    setCurrentMatchIndex((previousIndex) => {
      if (previousIndex < 0) {
        return matches.length - 1
      }

      return (previousIndex - 1 + matches.length) % matches.length
    })
  }, [matches.length])

  const currentTarget = currentMatchIndex >= 0 ? matches[currentMatchIndex] : null

  return {
    isSearchOpen,
    searchQuery,
    searchScope,
    totalMatches: matches.length,
    currentMatchNumber: currentMatchIndex >= 0 ? currentMatchIndex + 1 : 0,
    currentTarget,
    openSearch,
    closeSearch,
    clearSearch,
    setSearchQuery,
    setSearchScope,
    goToNextMatch,
    goToPreviousMatch,
  }
}
