import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Content, SessionEntry } from '../types'
import { toolRenderRegistry } from '../plugins/tools-render/registry'
import { defaultResolveData } from '../plugins/tools-render/utils/resolveData'
import { useSessionView } from '../contexts/SessionViewContext'
import { useIsMobile } from '../hooks/useIsMobile'
import { useAppearance } from '../hooks/useAppearance'
import { useClipboard } from '../hooks/useClipboard'

interface ToolCallListProps {
  toolCalls: Content[]
  toolResultByCallId?: Map<string, SessionEntry>
  searchQuery?: string
}

function ToolCallList({
  toolCalls,
  toolResultByCallId = new Map(),
  searchQuery = '',
}: ToolCallListProps) {
  const { t } = useTranslation()
  const { appearance } = useAppearance()
  const theme = appearance.theme
  const isMobile = useIsMobile()
  const {
    isToolExpanded,
    toggleToolExpanded,
    ensureToolExpandedForSearch
  } = useSessionView()
  const { copyText } = useClipboard()

  return (
    <div className="tool-call-list">
      {toolCalls.map((toolCall, index) => {
        // Find matching plugin for this tool call
        const plugin = toolRenderRegistry.findPlugin(toolCall)

        // Resolve data (prefer plugin's resolver, fallback to default)
        const resolvedData = plugin.resolveData?.(
          toolCall,
          index,
          toolResultByCallId
        ) ?? defaultResolveData(toolCall, index, toolResultByCallId)

        // If plugin resolver returns null, use default
        if (!resolvedData) {
          console.warn(`[ToolCallList] Plugin ${plugin.id} returned null data, using default`)
        }

        const data = resolvedData || defaultResolveData(toolCall, index, toolResultByCallId)
        const entryId = data.entryId

        // Build render context
        const context = {
          isExpanded: isToolExpanded(entryId),
          toggleExpanded: () => toggleToolExpanded(entryId),
          ensureExpanded: () => ensureToolExpandedForSearch(entryId),
          theme: theme === 'system'
            ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
            : theme as 'light' | 'dark',
          isMobile,
          t,
          copyToClipboard: copyText,
        }

        const Component = plugin.component

        return (
          <Component
            key={entryId}
            toolCall={toolCall}
            resolvedData={data}
            searchQuery={searchQuery}
            context={context}
          />
        )
      })}
    </div>
  )
}

export default memo(ToolCallList)
