import type { Content, SessionEntry } from '../types'
import MarkdownContent from './MarkdownContent'
import ThinkingBlock from './ThinkingBlock'
import ToolCallList from './ToolCallList'
import { useSessionView } from '../contexts/SessionViewContext'
import { formatDate } from '../utils/format'
import { getAssistantDisplayedBlocks } from '../utils/assistantContent'
import { Copy, Check } from 'lucide-react'
import { memo, useMemo, useState } from 'react'

interface AssistantMessageProps {
  content: Content[]
  timestamp?: string
  entryId: string
  toolResultByCallId?: Map<string, SessionEntry>
  searchQuery?: string
}

function AssistantMessage({
  content,
  timestamp,
  entryId,
  toolResultByCallId = new Map(),
  searchQuery = '',
}: AssistantMessageProps) {
  const { showThinking } = useSessionView()
  const [copied, setCopied] = useState(false)

  const { thinkingBlocks, textBlocks } = useMemo(
    () => getAssistantDisplayedBlocks(content),
    [content],
  )

  const toolCalls = useMemo(
    () => content.filter((item) => item.type === 'toolCall'),
    [content],
  )

  const allText = useMemo(() => textBlocks.join('\n'), [textBlocks])

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(allText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy assistant text:', err)
    }
  }

  return (
    <div className="assistant-message" id={`entry-${entryId}`}>
      {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}

      {showThinking && thinkingBlocks.map((thinkingText, index) => (
        <ThinkingBlock
          key={`thinking-${index}`}
          content={thinkingText}
          searchQuery={searchQuery}
        />
      ))}

      {textBlocks.map((text, index) => (
        <div key={`text-${index}`} className="assistant-text">
          <MarkdownContent content={text} searchQuery={searchQuery} />
        </div>
      ))}
      {textBlocks.length > 0 && (
        <div className="flex justify-end mt-2">
          <button
            onClick={handleCopy}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                handleCopy()
              }
            }}
            className="tool-copy-button"
            aria-label={copied ? 'Copied' : 'Copy text'}
            title={copied ? 'Copied!' : 'Copy text'}
          >
            {copied ? (
              <Check className="w-4 h-4" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      )}

      {toolCalls.length > 0 && (
        <ToolCallList
          toolCalls={toolCalls}
          toolResultByCallId={toolResultByCallId}
          searchQuery={searchQuery}
        />
      )}
    </div>
  )
}

export default memo(AssistantMessage)
