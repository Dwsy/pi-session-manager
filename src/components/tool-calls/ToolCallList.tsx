import { memo, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, ChevronRight, Clock } from 'lucide-react'

import type { Content, SessionEntry } from '@/types'
import { toolRenderRegistry } from '@/plugins/tools-render/registry'
import { defaultResolveData } from '@/plugins/tools-render/utils/resolveData'
import { useSessionView } from '@/contexts/SessionViewContext'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useAppearance } from '@/hooks/useAppearance'
import { useClipboard } from '@/hooks/useClipboard'
import { useSettings } from '@/hooks/useSettings'
import ThinkingBlock from '@/components/messages/ThinkingBlock'
import type { AssistantProcessStep } from '@/components/messages/assistantProcess'

import {
  flattenProcessToolCalls,
  formatToolCallDuration,
  preserveViewportAnchor,
  summarizeToolCalls,
} from './toolCallFolding'

interface ToolCallListProps {
  processSteps: AssistantProcessStep[]
  toolResultByCallId?: Map<string, SessionEntry>
  searchQuery?: string
}

function ToolCallList({
  processSteps,
  toolResultByCallId = new Map(),
  searchQuery = '',
}: ToolCallListProps) {
  const { t } = useTranslation()
  const { isToolExpanded, toggleToolExpanded, ensureToolExpandedForSearch } = useSessionView()
  const { appearance } = useAppearance()
  const isMobile = useIsMobile()
  const { settings } = useSettings()
  const { copyText } = useClipboard()

  const theme = appearance.theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : appearance.theme as 'light' | 'dark'
  const disableSuccessStyle = settings.appearance.disableToolSuccessStyle

  const [expanded, setExpanded] = useState(false)
  const headerRef = useRef<HTMLButtonElement>(null)

  const processToolCalls = useMemo(
    () => flattenProcessToolCalls(processSteps),
    [processSteps],
  )

  const summary = useMemo(
    () => summarizeToolCalls(processToolCalls, toolResultByCallId),
    [processToolCalls, toolResultByCallId],
  )

  const hasProcessContent = processSteps.some((step) => step.content.length > 0)
  if (!hasProcessContent) return null

  const renderToolCall = (toolCall: Content, index: number, key: string) => {
    const plugin = toolRenderRegistry.findPlugin(toolCall)
    const resolvedData = plugin.resolveData?.(
      toolCall,
      index,
      toolResultByCallId,
    ) ?? defaultResolveData(toolCall, index, toolResultByCallId)

    if (!resolvedData) {
      console.warn(`[ToolCallList] Plugin ${plugin.id} returned null data, using default`)
    }

    const data = resolvedData || defaultResolveData(toolCall, index, toolResultByCallId)
    const entryId = data.entryId
    const Component = plugin.component

    const context = {
      isExpanded: isToolExpanded(entryId),
      toggleExpanded: () => toggleToolExpanded(entryId),
      ensureExpanded: () => ensureToolExpandedForSearch(entryId),
      theme,
      isMobile,
      t,
      copyToClipboard: copyText,
      disableSuccessStyle,
    }

    return (
      <Component
        key={key}
        toolCall={toolCall}
        resolvedData={data}
        searchQuery={searchQuery}
        context={context}
      />
    )
  }

  return (
    <div className="assistant-fold-group">
      <button
        ref={headerRef}
        className="assistant-fold-header"
        type="button"
        onClick={() => preserveViewportAnchor(headerRef.current, () => setExpanded((value) => !value))}
      >
        <span className="assistant-fold-toggle">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <span className="assistant-fold-stats">{summary.statsText || 'agent process'}</span>
        {summary.totalDuration > 0 && (
          <span className="assistant-fold-duration">
            <Clock size={11} />
            {formatToolCallDuration(summary.totalDuration)}
          </span>
        )}
      </button>

      {expanded && (
        <div className="assistant-fold-body">
          {processSteps.map((step, stepIndex) => {
            let toolIndexOffset = processSteps
              .slice(0, stepIndex)
              .reduce((sum, item) => sum + item.content.filter((block) => block.type === 'toolCall').length, 0)

            return step.content.map((item, contentIndex) => {
              if (item.type === 'thinking') {
                return (
                  <ThinkingBlock
                    key={`process-thinking-${step.entryId}-${contentIndex}`}
                    content={item.thinking || ''}
                    searchQuery={searchQuery}
                  />
                )
              }

              if (item.type === 'toolCall') {
                const currentToolIndex = toolIndexOffset
                toolIndexOffset += 1
                return renderToolCall(
                  item,
                  currentToolIndex,
                  `process-tool-${step.entryId}-${contentIndex}`,
                )
              }

              return null
            })
          })}
        </div>
      )}
    </div>
  )
}

export default memo(ToolCallList)
