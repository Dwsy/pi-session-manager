import type { Content, SessionEntry } from '@/types'
import MarkdownContent from '@/components/ui/MarkdownContent'
import ThinkingBlock from './ThinkingBlock'
import ToolCallList from '@/components/tool-calls/ToolCallList'
import { useSessionView } from '@/contexts/SessionViewContext'
import { useSettings } from '@/hooks/useSettings'
import { toolRenderRegistry } from '@/plugins/tools-render/registry'
import { defaultResolveData } from '@/plugins/tools-render/utils/resolveData'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useAppearance } from '@/hooks/useAppearance'
import { useClipboard } from '@/hooks/useClipboard'
import { useTranslation } from 'react-i18next'
import { formatDate } from '@/utils/format'
import { ansiToMarkdown } from '@/utils/assistantContent'
import { memo, useMemo, useState } from 'react'
import { Copy, Check } from 'lucide-react'

import {
  buildAssistantProcessSteps,
  shouldCollapseProcess,
} from './assistantProcess'

/**
 * Assistant Message Renderer
 *
 * Renders an assistant message with optional foldEntries (merged tool-only entries).
 *
 * Two rendering modes based on collapseToolCalls setting:
 *
 * COLLAPSED (default):
 *   - Shows ToolCallList with summary header
 *   - Click header to expand/collapse tool calls
 *
 * EXPANDED:
 *   - Shows each tool call directly without grouping
 *   - Uses plugin components for individual rendering
 */

interface AssistantMessageProps {
  /** Content blocks of this message */
  content: Content[]
  timestamp?: string
  entryId: string
  toolResultByCallId?: Map<string, SessionEntry>
  searchQuery?: string
  isStreaming?: boolean
  previewMode?: boolean
  /** Previous assistant entries (tools only, no text) merged into this message */
  foldEntries?: SessionEntry[]
}

function AssistantMessage({
  content,
  timestamp,
  entryId,
  toolResultByCallId = new Map(),
  searchQuery = '',
  isStreaming = false,
  previewMode = false,
  foldEntries,
}: AssistantMessageProps) {
  const { t } = useTranslation()
  const { showThinking } = useSessionView()
  const { settings } = useSettings()
  const { appearance } = useAppearance()
  const isMobile = useIsMobile()
  const { copyText } = useClipboard()
  const [copied, setCopied] = useState(false)

  // Theme
  const theme = appearance.theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : appearance.theme as 'light' | 'dark'
  const disableSuccessStyle = settings.appearance.disableToolSuccessStyle

  // User preference: collapse tool calls into summary
  const collapseEnabled = settings.session.collapseToolCalls !== false

  // Build process steps from foldEntries + current content
  const processSteps = useMemo(
    () => buildAssistantProcessSteps(entryId, content, foldEntries),
    [content, entryId, foldEntries],
  )

  // Decide rendering mode: collapsed summary vs expanded list
  const collapsed = shouldCollapseProcess(processSteps, collapseEnabled)

  // Extract blocks for rendering
  const { thinkingBlocks, textBlocks } = useMemo(() => {
    const thinking = content.filter(
      (item): item is Content & { type: 'thinking'; thinking: string } =>
        item.type === 'thinking' && Boolean(item.thinking),
    )
    const text = content.filter(
      (item): item is Content & { type: 'text'; text: string } =>
        item.type === 'text' && Boolean(item.text?.trim()),
    )
    return {
      thinkingBlocks: thinking.map((item) => item.thinking),
      textBlocks: text.map((item) => item.text),
    }
  }, [content])

  // Tool calls for expanded mode (direct rendering)
  const toolCalls = useMemo(
    () => content.filter((item): item is Content & { type: 'toolCall' } => item.type === 'toolCall'),
    [content],
  )

  const allText = useMemo(() => textBlocks.join('\n'), [textBlocks])

  const handleCopy = async () => {
    try {
      await copyText(allText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy assistant text:', err)
    }
  }

  return (
    <div className="assistant-message" id={`entry-${entryId}`}>
      {/* Timestamp */}
      {timestamp && (textBlocks.length > 0 || thinkingBlocks.length > 0) && (
        <div className="message-timestamp">{formatDate(timestamp)}</div>
      )}

      {/* Tool Calls */}
      {collapsed && processSteps.length > 0 && (
        <ToolCallList
          processSteps={processSteps}
          toolResultByCallId={toolResultByCallId}
          searchQuery={searchQuery}
        />
      )}

      {/* Direct tool call rendering (when not collapsed) */}
      {!collapsed && toolCalls.length > 0 && (
        <div className="assistant-direct-tools">
          {toolCalls.map((toolCall, index) => (
            <DirectToolCall
              key={`direct-tool-${index}`}
              toolCall={toolCall}
              index={index}
              toolResultByCallId={toolResultByCallId}
              searchQuery={searchQuery}
              theme={theme}
              isMobile={isMobile}
              t={t}
              copyText={copyText}
              disableSuccessStyle={disableSuccessStyle}
            />
          ))}
        </div>
      )}

      {/* Thinking blocks */}
      {showThinking && thinkingBlocks.length > 0 && (
        <>
          {thinkingBlocks.map((thinking, index) => (
            <ThinkingBlock
              key={`thinking-${index}`}
              content={ansiToMarkdown(thinking, { stripColor: true })}
              searchQuery={searchQuery}
            />
          ))}
        </>
      )}

      {/* Text content */}
      {textBlocks.map((text, index) => (
        <div key={`text-${index}`} className="assistant-text">
          <MarkdownContent content={text} searchQuery={searchQuery} />
          {isStreaming && index === textBlocks.length - 1 && (
            <span className="typing-cursor" />
          )}
        </div>
      ))}

      {/* Copy button */}
      {textBlocks.length > 0 && !previewMode && (
        <div className="flex justify-end mt-2">
          <button
            onClick={handleCopy}
            className="tool-copy-button"
            aria-label={copied ? 'Copied' : 'Copy text'}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Render a single tool call directly (for expanded mode)
 */
interface DirectToolCallProps {
  toolCall: Content & { type: 'toolCall' }
  index: number
  toolResultByCallId: Map<string, SessionEntry>
  searchQuery: string
  theme: 'light' | 'dark'
  isMobile: boolean
  t: ReturnType<typeof useTranslation>['t']
  copyText: (text: string) => Promise<void>
  disableSuccessStyle: boolean
}

function DirectToolCall({
  toolCall,
  index,
  toolResultByCallId,
  searchQuery,
  theme,
  isMobile,
  t,
  copyText,
  disableSuccessStyle,
}: DirectToolCallProps) {
  const { isToolExpanded, toggleToolExpanded } = useSessionView()
  const plugin = toolRenderRegistry.findPlugin(toolCall)
  const resolvedData = plugin.resolveData?.(toolCall, index, toolResultByCallId)
    ?? defaultResolveData(toolCall, index, toolResultByCallId)
  const Component = plugin.component
  const entryId = resolvedData.entryId

  return (
    <Component
      toolCall={toolCall}
      resolvedData={resolvedData}
      searchQuery={searchQuery}
      context={{
        isExpanded: isToolExpanded(entryId),
        toggleExpanded: () => toggleToolExpanded(entryId),
        ensureExpanded: () => {},
        theme,
        isMobile,
        t,
        copyToClipboard: copyText,
        disableSuccessStyle,
      }}
    />
  )
}

export default memo(AssistantMessage)
