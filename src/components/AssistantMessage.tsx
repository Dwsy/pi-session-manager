import type { Content, SessionEntry } from '../types'
import MarkdownContent from './MarkdownContent'
import ThinkingBlock from './ThinkingBlock'
import ToolCallList from './ToolCallList'

interface AssistantMessageProps {
  content: Content[]
  timestamp?: string
  entryId: string
  entries?: SessionEntry[]
}

export default function AssistantMessage({ content, timestamp, entryId, entries = [] }: AssistantMessageProps) {
  const textBlocks = content.filter(c => c.type === 'text' && c.text)
  const thinkingBlocks = content.filter(c => c.type === 'thinking' && c.thinking)
  const toolCalls = content.filter(c => c.type === 'toolCall')

  return (
    <div className="assistant-message" id={`entry-${entryId}`}>
      {timestamp && <div className="message-timestamp">{timestamp}</div>}

      {/* Text content */}
      {textBlocks.map((block, index) => (
        <div key={`text-${index}`} className="assistant-text markdown-content">
          <MarkdownContent content={block.text!} />
        </div>
      ))}

      {/* Thinking content */}
      {thinkingBlocks.map((block, index) => (
        <ThinkingBlock key={`thinking-${index}`} content={block.thinking!} />
      ))}

      {/* Tool calls */}
      {toolCalls.length > 0 && <ToolCallList toolCalls={toolCalls} entries={entries} />}
    </div>
  )
}