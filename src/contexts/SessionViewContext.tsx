import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

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

  const toggleThinking = () => setShowThinking(prev => !prev)
  const toggleToolsExpanded = () => {
    setToolsExpanded(prev => !prev)
    setExpandedToolIds(new Set()) // Clear overrides when switching global state
  }
  const expandAllTools = () => {
    setToolsExpanded(true)
    setExpandedToolIds(new Set())
  }
  const collapseAllTools = () => {
    setToolsExpanded(false)
    setExpandedToolIds(new Set())
  }
  const resetToolExpansionOverrides = useCallback(() => {
    setExpandedToolIds(new Set())
  }, [])

  const toggleToolExpanded = useCallback((id: string) => {
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
