import type { Content, SessionEntry } from '../types'
import MarkdownContent from './MarkdownContent'
import ThinkingBlock from './ThinkingBlock'
import ToolCallList from './ToolCallList'
import { useSessionView } from '../contexts/SessionViewContext'
import { formatDate } from '../utils/format'
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

  const textBlocks = useMemo(
    () => content.filter(c => c.type === 'text' && c.text),
    [content],
  )
  const thinkingBlocks = useMemo(
    () => content.filter(c => c.type === 'thinking' && c.thinking),
    [content],
  )
  const toolCalls = useMemo(
    () => content.filter(c => c.type === 'toolCall'),
    [content],
  )

  // Combine all text blocks for copying
  const allText = useMemo(() => textBlocks.map(b => b.text).join('\n'), [textBlocks])

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

      {/* Thinking content */}
      {showThinking && thinkingBlocks.map((block, index) => (
        <ThinkingBlock key={`thinking-${index}`} content={block.thinking!} />
      ))}

      {/* Text content with copy button */}
      {textBlocks.map((block, index) => (
        <div key={`text-${index}`} className="assistant-text">
          <MarkdownContent content={block.text!} searchQuery={searchQuery} />
        </div>
      ))}
      {textBlocks.length > 0 && (
        <div className="flex justify-end mt-2">
          <button
            onClick={handleCopy}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCopy();
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

      {/* Tool calls */}
      {toolCalls.length > 0 && <ToolCallList toolCalls={toolCalls} toolResultByCallId={toolResultByCallId} />}
    </div>
  )
}

export default memo(AssistantMessage)
