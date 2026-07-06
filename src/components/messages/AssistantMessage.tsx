import type { Content, SessionEntry } from '@/types'
import MarkdownContent from '@/components/ui/MarkdownContent'
import ThinkingBlock from './ThinkingBlock'
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
import { psmPluginHost } from '@/plugins/runtime-host'
import { requestToolReview } from '@/contexts/toolReviewBus'

/**
 * Assistant Message Renderer
 *
 * Renders assistant text, thinking blocks, and direct tool-call entries.
 * Conversation-level process folding is handled by ConversationPreviewMessages.
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
  processEntries?: SessionEntry[]
}

function AssistantMessage({
  content,
  timestamp,
  entryId,
  toolResultByCallId = new Map(),
  searchQuery = '',
  isStreaming = false,
  previewMode = false,
  processEntries,
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

  // Tool calls render directly; conversation-level folding owns grouped summaries.
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

      {/* Tool call rendering */}
      {toolCalls.length > 0 && (
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
              processEntries={processEntries}
            />
          ))}
        </div>
      )}

      {/* Thinking blocks */}
      {thinkingBlocks.length > 0 && (
        <>
          {thinkingBlocks.map((thinking, index) => (
            <ThinkingBlock
              key={`thinking-${index}`}
              content={ansiToMarkdown(thinking, { stripColor: true })}
              searchQuery={searchQuery}
              collapsed={!showThinking}
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
  processEntries?: SessionEntry[]
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
  processEntries,
}: DirectToolCallProps) {
  const { isToolExpanded, toggleToolExpanded } = useSessionView()
  const plugin = toolRenderRegistry.findPlugin(toolCall)
  const resolvedData = plugin.resolveData?.(toolCall, index, toolResultByCallId)
    ?? defaultResolveData(toolCall, index, toolResultByCallId)
  const Component = plugin.component
  const entryId = resolvedData.entryId

  const codeReviewPlugin = psmPluginHost.listPlugins().find(p => p.id === 'builtin.code-review')
  const isCodeReviewActive = codeReviewPlugin && codeReviewPlugin.enabled && codeReviewPlugin.state === 'active'
  const isInterceptEnabled = isCodeReviewActive && (codeReviewPlugin.settings?.interceptExpand ?? true)

  const reviewableToolNames = ["write", "write_file", "edit", "edit_file", "multiedit", "apply_patch", "read", "read_file", "bash", "shell", "exec", "task"]
  const isSupportedByReview = toolCall.name && reviewableToolNames.includes(toolCall.name.toLowerCase())

  const handleToggleExpanded = () => {
    const expanded = isToolExpanded(entryId)
    if (!expanded && isInterceptEnabled && isSupportedByReview) {
      const fallbackEntry: SessionEntry = {
        id: entryId,
        type: 'message',
        message: {
          role: 'assistant',
          content: [toolCall]
        },
        timestamp: new Date().toISOString()
      }
      requestToolReview({
        entries: processEntries && processEntries.length > 0 ? processEntries : [fallbackEntry],
        toolResultByCallId,
      })
    } else {
      toggleToolExpanded(entryId)
    }
  }

  return (
    <Component
      toolCall={toolCall}
      resolvedData={resolvedData}
      searchQuery={searchQuery}
      context={{
        isExpanded: isToolExpanded(entryId),
        toggleExpanded: handleToggleExpanded,
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
