import { memo } from 'react'

import type { Content, SessionEntry } from '../types'
import { formatDate } from '../utils/format'

import MessagePartsRenderer from './MessagePartsRenderer'

interface AssistantMessageProps {
  content: Content[]
  timestamp?: string
  entryId: string
  entries?: SessionEntry[]
  showToolCalls?: boolean
  hiddenToolCallIds?: string[]
  isStreaming?: boolean
}

export default memo(function AssistantMessage({
  content,
  timestamp,
  entryId,
  entries = [],
  showToolCalls = true,
  hiddenToolCallIds = [],
  isStreaming = false,
}: AssistantMessageProps) {
  return (
    <div className="assistant-message" id={`entry-${entryId}`}>
      {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}
      <MessagePartsRenderer
        role="assistant"
        content={content}
        entries={entries}
        showToolCalls={showToolCalls}
        hiddenToolCallIds={hiddenToolCallIds}
        isStreaming={isStreaming}
      />
    </div>
  )
})
