import { createContext, useContext, useState, useCallback, ReactNode } from 'react'

interface SessionViewContextType {
  showThinking: boolean
  toggleThinking: () => void
  toolsExpanded: boolean
  toggleToolsExpanded: () => void
  expandAllTools: () => void
  collapseAllTools: () => void
  expandedToolIds: Set<string>
  toggleToolExpanded: (id: string) => void
  isToolExpanded: (id: string) => boolean
}

const SessionViewContext = createContext<SessionViewContextType | undefined>(undefined)

export function SessionViewProvider({ children }: { children: ReactNode }) {
  const [showThinking, setShowThinking] = useState(true)
  const [toolsExpanded, setToolsExpanded] = useState(false)
  // 当 toolsExpanded=true 时，这里存储"被手动折叠的工具"
  // 当 toolsExpanded=false 时，这里存储"被手动展开的工具"
  const [expandedToolIds, setExpandedToolIds] = useState<Set<string>>(new Set())

  const toggleThinking = () => setShowThinking(prev => !prev)
  const toggleToolsExpanded = () => {
    setToolsExpanded(prev => !prev)
    setExpandedToolIds(new Set()) // 切换全局状态时清空
  }
  const expandAllTools = () => {
    setToolsExpanded(true)
    setExpandedToolIds(new Set())
  }
  const collapseAllTools = () => {
    setToolsExpanded(false)
    setExpandedToolIds(new Set())
  }

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
    // 全局展开时：不在排除列表中 = 展开
    // 全局折叠时：在展开列表中 = 展开
    return toolsExpanded ? !expandedToolIds.has(id) : expandedToolIds.has(id)
  }, [toolsExpanded, expandedToolIds])

  return (
    <SessionViewContext.Provider
      value={{
        showThinking,
        toggleThinking,
        toolsExpanded,
        toggleToolsExpanded,
        expandAllTools,
        collapseAllTools,
        expandedToolIds,
        toggleToolExpanded,
        isToolExpanded,
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
