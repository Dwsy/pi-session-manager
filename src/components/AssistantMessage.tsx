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

interface SplitTextBlocks {
  thinking: string[]
  text: string[]
}

function looksLikeThinkingText(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return false

  // Typical prefixes/markers seen in reasoning-like plain text streams.
  if (
    normalized.startsWith('thinking ...') ||
    normalized.startsWith('thinking…') ||
    normalized.startsWith('thinking:') ||
    normalized.startsWith('reasoning:') ||
    normalized.startsWith('思考：') ||
    normalized.startsWith('思考:') ||
    normalized.startsWith('推理：') ||
    normalized.startsWith('推理:')
  ) {
    return true
  }

  // XML-ish think tags used by some models.
  if (normalized.includes('<think>') || normalized.includes('</think>')) {
    return true
  }

  return false
}

function splitThinkTaggedText(text: string): SplitTextBlocks {
  const result: SplitTextBlocks = { thinking: [], text: [] }
  const raw = text || ''
  if (!raw.trim()) return result

  const hasOpenTag = raw.includes('<think>')
  const hasCloseTag = raw.includes('</think>')

  // No tags: keep current heuristic behavior.
  if (!hasOpenTag && !hasCloseTag) {
    if (looksLikeThinkingText(raw)) {
      result.thinking.push(raw.trim())
    } else {
      result.text.push(raw)
    }
    return result
  }

  // Some providers return orphan closing tags (missing <think>),
  // e.g. "...reasoning...</think>final answer".
  if (!hasOpenTag && hasCloseTag) {
    const closeTagIndex = raw.indexOf('</think>')
    const thinkingPart = raw.slice(0, closeTagIndex).trim()
    const textPart = raw.slice(closeTagIndex + '</think>'.length).trim()

    if (thinkingPart) result.thinking.push(thinkingPart)
    if (textPart) result.text.push(textPart)
    return result
  }

  // Parse normal <think>...</think> blocks.
  const thinkPattern = /<think>([\s\S]*?)(?:<\/think>|$)/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = thinkPattern.exec(raw)) !== null) {
    const before = raw.slice(lastIndex, match.index).trim()
    if (before) {
      result.text.push(before)
    }

    const thinkingPart = (match[1] || '').trim()
    if (thinkingPart) {
      result.thinking.push(thinkingPart)
    }

    lastIndex = thinkPattern.lastIndex
  }

  const tail = raw.slice(lastIndex).trim()
  if (tail) {
    result.text.push(tail)
  }

  if (result.thinking.length === 0 && result.text.length === 0) {
    if (looksLikeThinkingText(raw)) {
      result.thinking.push(raw.trim())
    } else {
      result.text.push(raw)
    }
  }

  return result
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

  const extractedTextBlocks = useMemo(
    () => textBlocks.map(block => splitThinkTaggedText(block.text || '')),
    [textBlocks],
  )

  const thinkingBlocks = useMemo(
    () =>
      content
        .filter(c => c.type === 'thinking' && c.thinking)
        .map(c => c.thinking as string),
    [content],
  )

  const inferredThinkingTextBlocks = useMemo(
    () => extractedTextBlocks.flatMap(block => block.thinking),
    [extractedTextBlocks],
  )

  const normalTextBlocks = useMemo(
    () => extractedTextBlocks.flatMap(block => block.text),
    [extractedTextBlocks],
  )

  const toolCalls = useMemo(
    () => content.filter(c => c.type === 'toolCall'),
    [content],
  )

  const displayedThinkingBlocks = useMemo(
    () => [...thinkingBlocks, ...inferredThinkingTextBlocks],
    [thinkingBlocks, inferredThinkingTextBlocks],
  )

  // Combine all non-thinking text blocks for copying
  const allText = useMemo(() => normalTextBlocks.join('\n'), [normalTextBlocks])

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
      {showThinking && displayedThinkingBlocks.map((thinkingText, index) => (
        <ThinkingBlock key={`thinking-${index}`} content={thinkingText} />
      ))}

      {/* Text content with copy button */}
      {normalTextBlocks.map((text, index) => (
        <div key={`text-${index}`} className="assistant-text">
          <MarkdownContent content={text} searchQuery={searchQuery} />
        </div>
      ))}
      {normalTextBlocks.length > 0 && (
        <div className="flex justify-end mt-2">
          <button
            onClick={handleCopy}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
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

      {/* Tool calls */}
      {toolCalls.length > 0 && <ToolCallList toolCalls={toolCalls} toolResultByCallId={toolResultByCallId} />}
    </div>
  )
}

export default memo(AssistantMessage)
