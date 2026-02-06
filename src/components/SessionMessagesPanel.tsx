import { useCallback, useRef } from 'react'
import type { RefObject, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import type { Virtualizer } from '@tanstack/react-virtual'

import AssistantMessage from './AssistantMessage'
import BranchSummary from './BranchSummary'
import Compaction from './Compaction'
import CustomMessage from './CustomMessage'
import MessageStream from './MessageStream'
import ModelChange from './ModelChange'
import RPCBanner from './RPCBanner'
import SessionHeader from './SessionHeader'
import UnreadIndicator from './UnreadIndicator'
import UserMessage from './UserMessage'

import type { RPCBannerConfig } from './RPCBanner'
import type { LegacySessionStats, SessionEntry } from '../types'

interface SessionMessagesPanelProps {
  showLoading: boolean
  error: string | null
  rpcBanner: RPCBannerConfig | null
  headerEntry?: SessionEntry
  sessionId: string
  stats: LegacySessionStats
  entries: SessionEntry[]
  renderableEntries: SessionEntry[]
  virtualizer: Virtualizer<HTMLDivElement, Element>
  messagesContainerRef: RefObject<HTMLDivElement>
  bottomSentinelRef: RefObject<HTMLDivElement>
  isStreaming: boolean
  streamingEntryId: string | null
  isAtBottom: boolean
  hasNewMessages: boolean
  newMessageCount: number
  newMessagesButtonBottom: number
  onUnreadClick: () => void
  emptyState: ReactNode
  loadingLabel?: string
  errorLabel?: string
  newMessagesLabel?: string
  hasMore?: boolean
  onLoadMore?: () => void
  scrollReady?: boolean
}

export default function SessionMessagesPanel({
  showLoading,
  error,
  rpcBanner,
  headerEntry,
  sessionId,
  stats,
  entries,
  renderableEntries,
  virtualizer,
  messagesContainerRef,
  bottomSentinelRef,
  isStreaming,
  streamingEntryId,
  isAtBottom,
  hasNewMessages,
  newMessageCount,
  newMessagesButtonBottom,
  onUnreadClick,
  emptyState,
  loadingLabel = '加载中...',
  errorLabel = '加载失败',
  newMessagesLabel = '有新消息',
  hasMore,
  onLoadMore,
  scrollReady = true,
}: SessionMessagesPanelProps) {
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  const renderEntry = useCallback(
    (entry: SessionEntry) => {
      switch (entry.type) {
        case 'message': {
          if (!entry.message) return null
          const role = entry.message.role

          if (role === 'user') {
            return (
              <UserMessage
                key={entry.id}
                content={entry.message.content}
                timestamp={entry.timestamp}
                id={entry.id}
              />
            )
          }

          if (role === 'assistant') {
            const isEntryStreaming = Boolean(isStreaming && streamingEntryId && entry.id === streamingEntryId)
            return (
              <AssistantMessage
                key={entry.id}
                content={entry.message.content}
                timestamp={entry.timestamp}
                entryId={entry.id}
                entries={entriesRef.current}
                isStreaming={isEntryStreaming}
              />
            )
          }
          return null
        }

        case 'model_change':
          return (
            <ModelChange
              key={entry.id}
              provider={entry.provider}
              modelId={entry.modelId}
              timestamp={entry.timestamp}
            />
          )

        case 'compaction':
          return (
            <Compaction
              key={entry.id}
              tokensBefore={entry.tokensBefore}
              summary={entry.summary}
            />
          )

        case 'branch_summary':
          return (
            <BranchSummary
              key={entry.id}
              summary={entry.summary}
              timestamp={entry.timestamp}
            />
          )

        case 'custom_message':
          return (
            <CustomMessage
              key={entry.id}
              customType={entry.customType}
              content={entry.content}
              timestamp={entry.timestamp}
            />
          )

        default:
          return null
      }
    },
    [isStreaming, streamingEntryId]
  )

  if (showLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex items-center gap-2 text-[#6a6f85]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{loadingLabel}</span>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-red-400">
        <div className="text-center">
          <p className="mb-2">{errorLabel}</p>
          <p className="text-sm text-[#6a6f85]">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 relative min-h-0 overflow-hidden flex flex-col">
      <RPCBanner banner={rpcBanner} />
      <div className="session-header-wrapper">
        <SessionHeader
          sessionId={headerEntry?.id || sessionId}
          timestamp={headerEntry?.timestamp}
          stats={stats}
        />
      </div>
      <UnreadIndicator
        visible={!isAtBottom && hasNewMessages}
        count={newMessageCount}
        bottomOffset={newMessagesButtonBottom}
        label={newMessagesLabel}
        onClick={onUnreadClick}
      />
      <div
        className="flex-1 min-h-0 overflow-y-auto session-viewer"
        ref={messagesContainerRef}
        style={{ visibility: scrollReady ? 'visible' : 'hidden' }}
      >
        <MessageStream
          entries={renderableEntries}
          virtualizer={virtualizer}
          renderEntry={renderEntry}
          gap={16}
          bottomSentinelRef={bottomSentinelRef}
          topPadding={12}
          emptyState={emptyState}
          hasMore={hasMore}
          onLoadMore={onLoadMore}
        />
      </div>
    </div>
  )
}
