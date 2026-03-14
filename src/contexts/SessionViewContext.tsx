import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'

interface SessionViewContextType {
  showThinking: boolean
  toggleThinking: () => void
  showToolExpandIndicator: boolean
  toolsExpanded: boolean
  toggleToolsExpanded: () => void
  expandAllTools: () => void
  collapseAllTools: () => void
  expandedToolIds: Set<string>
  toggleToolExpanded: (id: string) => void
  ensureToolExpandedForSearch: (id: string) => void
  restoreSearchExpandedTools: () => void
  isToolExpanded: (id: string) => boolean
  resetToolExpansionOverrides: () => void
}

const SessionViewContext = createContext<SessionViewContextType | undefined>(undefined)

export function SessionViewProvider({ children }: { children: ReactNode }) {
  const [showThinking, setShowThinking] = useState(true)
  const [showToolExpandIndicator] = useState(false)
  const [toolsExpanded, setToolsExpanded] = useState(false)
  // When toolsExpanded=true, store tools manually collapsed here
  // When toolsExpanded=false, store tools manually expanded here
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set())
  const searchExpandedToolIdsRef = useRef<Set<string>>(new Set())

  const clearSearchExpandedToolIds = useCallback(() => {
    searchExpandedToolIdsRef.current = new Set()
  }, [])

  const toggleThinking = () => setShowThinking(prev => !prev)
  const toggleToolsExpanded = () => {
    setToolsExpanded(prev => !prev)
    setExpandedToolIds(new Set()) // Clear overrides when switching global state
    clearSearchExpandedToolIds()
  }
  const expandAllTools = () => {
    setToolsExpanded(true)
    setExpandedToolIds(new Set())
    clearSearchExpandedToolIds()
  }
  const collapseAllTools = () => {
    setToolsExpanded(false)
    setExpandedToolIds(new Set())
    clearSearchExpandedToolIds()
  }
  const resetToolExpansionOverrides = useCallback(() => {
    setExpandedToolIds(new Set())
    clearSearchExpandedToolIds()
  }, [clearSearchExpandedToolIds])

  const toggleToolExpanded = useCallback((id: string) => {
    searchExpandedToolIdsRef.current.delete(id)
    setExpandedToolIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [])

  const isToolExpanded = useCallback((id: string) => {
    // When globally expanded: not in the exclusion list = expanded
    // When globally collapsed: in the inclusion list = expanded
    return toolsExpanded ? !expandedToolIds.has(id) : expandedToolIds.has(id)
  }, [toolsExpanded, expandedToolIds])

  const ensureToolExpandedForSearch = useCallback((id: string) => {
    setExpandedToolIds((prev) => {
      const isExpanded = toolsExpanded ? !prev.has(id) : prev.has(id)
      if (isExpanded) {
        return prev
      }

      const next = new Set(prev)
      if (toolsExpanded) {
        next.delete(id)
      } else {
        next.add(id)
      }
      searchExpandedToolIdsRef.current.add(id)
      return next
    })
  }, [toolsExpanded])

  const restoreSearchExpandedTools = useCallback(() => {
    const searchExpandedToolIds = searchExpandedToolIdsRef.current
    if (searchExpandedToolIds.size === 0) {
      return
    }

    setExpandedToolIds((prev) => {
      const next = new Set(prev)
      searchExpandedToolIds.forEach((id) => {
        if (toolsExpanded) {
          next.add(id)
        } else {
          next.delete(id)
        }
      })
      return next
    })
    clearSearchExpandedToolIds()
  }, [clearSearchExpandedToolIds, toolsExpanded])

  return (
    <SessionViewContext.Provider
      value={{
        showThinking,
        toggleThinking,
        showToolExpandIndicator,
        toolsExpanded,
        toggleToolsExpanded,
        expandAllTools,
        collapseAllTools,
        expandedToolIds,
        toggleToolExpanded,
        ensureToolExpandedForSearch,
        restoreSearchExpandedTools,
        isToolExpanded,
        resetToolExpansionOverrides,
      }}
    >
      {children}
    </SessionViewContext.Provider>
  )
}

export function useSessionView() {
  const context = useContext(SessionViewContext)
  if (!context) {
    throw new Error('useSessionView must be used within SessionViewProvider')
  }
  return context
}
