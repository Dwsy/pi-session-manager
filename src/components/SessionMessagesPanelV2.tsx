import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { Loader2 } from 'lucide-react'
import React from 'react'

import AssistantMessage from './AssistantMessage'
import BranchSummary from './BranchSummary'
import UserMessage from './UserMessage'
import Compaction from './Compaction'
import CustomMessage from './CustomMessage'
import ModelChange from './ModelChange'
import RPCBanner from './RPCBanner'
import SessionHeader from './SessionHeader'
import UnreadIndicator from './UnreadIndicator'

import type { RPCBannerConfig } from './RPCBanner'
import type { LegacySessionStats, SessionEntry } from '../types'

const ITEMS_PER_PAGE = 30
const BOTTOM_THRESHOLD_PX = 20
const RESIZE_DEBOUNCE_MS = 80
const SKIP_SMOOTH_AFTER_INSTANT_MS = 500
const REVEAL_DELAY_MS = 250

// ── Props ─────────────────────────────────────────────────────────
interface SessionMessagesPanelV2Props {
  showLoading: boolean
  error: string | null
  rpcBanner: RPCBannerConfig | null
  headerEntry?: SessionEntry
  sessionId: string
  stats: LegacySessionStats
  entries: SessionEntry[]
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
  autoFollowRef: React.MutableRefObject<boolean>
  isAtBottomRef: React.MutableRefObject<boolean>
  pendingScrollToBottomRef: React.MutableRefObject<boolean>
  setIsAtBottom: (v: boolean) => void
  clearUnreadState: () => void
}

// ── Component ─────────────────────────────────────────────────────
export default function SessionMessagesPanelV2({
  showLoading,
  error,
  rpcBanner,
  headerEntry,
  sessionId,
  stats,
  entries,
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
  autoFollowRef,
  isAtBottomRef,
  pendingScrollToBottomRef,
  setIsAtBottom,
  clearUnreadState,
}: SessionMessagesPanelV2Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const prevSessionIdRef = useRef<string | null>(null)
  const skipSmoothUntilRef = useRef(0)
  // ── Content visibility: hidden until scroll positioned ──────────
  // Content renders in DOM with opacity:0 so Streamdown can render async.
  // After REVEAL_DELAY_MS (letting Streamdown finish), scroll to bottom + reveal.
  const [contentVisible, setContentVisible] = useState(false)

  // ── Reverse pagination ──────────────────────────────────────────
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_PAGE)

  const renderableEntries = useMemo(() => {
    return entries.filter(
      (e) => e.type === 'message' || e.type === 'model_change' || e.type === 'compaction' || e.type === 'branch_summary' || e.type === 'custom_message'
    )
  }, [entries])

  const startIndex = Math.max(0, renderableEntries.length - visibleCount)
  const visibleEntries = renderableEntries.slice(startIndex)
  const hasMoreAbove = startIndex > 0

  // ── Session switch → reset ──────────────────────────────────────
  useEffect(() => {
    const isSwitch = prevSessionIdRef.current !== null && prevSessionIdRef.current !== sessionId
    if (isSwitch) {
      autoFollowRef.current = true
      setVisibleCount(ITEMS_PER_PAGE)
      setContentVisible(false)
    }
    prevSessionIdRef.current = sessionId
  }, [sessionId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Reveal sequence: entries loaded → wait → scroll → show ──────
  // Uses contentVisible (not a ref) so re-render from setContentVisible(false)
  // during session switch will correctly re-trigger this effect.
  useEffect(() => {
    if (contentVisible) return
    if (visibleEntries.length === 0) return

    const timer = setTimeout(() => {
      const el = messagesContainerRef.current
      if (el) {
        el.scrollTop = el.scrollHeight - el.clientHeight
      }
      skipSmoothUntilRef.current = Date.now() + SKIP_SMOOTH_AFTER_INSTANT_MS
      setContentVisible(true)
    }, REVEAL_DELAY_MS)

    return () => clearTimeout(timer)
  }, [contentVisible, visibleEntries.length, messagesContainerRef])

  // ── Scroll event: stick-to-bottom + load more ──────────────────
  const handleScroll = useCallback(() => {
    const viewport = messagesContainerRef.current
    if (!viewport) return
    const { scrollTop, scrollHeight, clientHeight } = viewport
    const dist = scrollHeight - scrollTop - clientHeight
    const atBottom = dist < BOTTOM_THRESHOLD_PX
    isAtBottomRef.current = atBottom
    setIsAtBottom(atBottom)
    if (atBottom) {
      autoFollowRef.current = true
      clearUnreadState()
    }
    if (scrollTop < 100 && hasMoreAbove) {
      const prevScrollHeight = viewport.scrollHeight
      setVisibleCount((prev) => {
        const currentStart = Math.max(0, renderableEntries.length - prev)
        if (currentStart <= 0) return prev
        requestAnimationFrame(() => {
          const newScrollHeight = viewport.scrollHeight
          viewport.scrollTop = newScrollHeight - prevScrollHeight + scrollTop
        })
        return prev + ITEMS_PER_PAGE
      })
    }
  }, [messagesContainerRef, hasMoreAbove, renderableEntries.length, isAtBottomRef, autoFollowRef, setIsAtBottom, clearUnreadState])

  useEffect(() => {
    const viewport = messagesContainerRef.current
    if (!viewport) return
    viewport.addEventListener('scroll', handleScroll, { passive: true })
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [handleScroll, messagesContainerRef])

  // ── Wheel: cancel auto-follow on scroll up ─────────────────────
  useEffect(() => {
    const viewport = messagesContainerRef.current
    if (!viewport) return
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        autoFollowRef.current = false
        pendingScrollToBottomRef.current = false
      }
    }
    viewport.addEventListener('wheel', onWheel, { passive: true })
    return () => viewport.removeEventListener('wheel', onWheel)
  }, [messagesContainerRef, autoFollowRef, pendingScrollToBottomRef])

  // ── ResizeObserver: auto-scroll during streaming ───────────────
  useEffect(() => {
    const viewport = messagesContainerRef.current
    if (!viewport || typeof ResizeObserver === 'undefined') return

    let debounceTimer: ReturnType<typeof setTimeout> | null = null

    const observer = new ResizeObserver(() => {
      if (!autoFollowRef.current) return
      if (!contentVisible) return
      if (debounceTimer) clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        if (!autoFollowRef.current) return
        if (Date.now() < skipSmoothUntilRef.current) {
          const el = messagesContainerRef.current
          if (el) el.scrollTop = el.scrollHeight - el.clientHeight
        } else {
          messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
        }
      }, RESIZE_DEBOUNCE_MS)
    })

    const content = viewport.firstElementChild
    if (content) observer.observe(content)
    return () => {
      observer.disconnect()
      if (debounceTimer) clearTimeout(debounceTimer)
    }
  }, [messagesContainerRef, autoFollowRef, contentVisible])

  // ── Render entry ────────────────────────────────────────────────
  const entriesRef = useRef(entries)
  entriesRef.current = entries

  const renderEntry = useCallback(
    (entry: SessionEntry) => {
      switch (entry.type) {
        case 'message': {
          if (!entry.message) return null
          const role = entry.message.role
          if (role === 'user') {
            return <UserMessageMemo key={entry.id} content={entry.message.content} timestamp={entry.timestamp} id={entry.id} />
          }
          if (role === 'assistant') {
            const isEntryStreaming = Boolean(isStreaming && streamingEntryId && entry.id === streamingEntryId)
            return (
              <AssistantMessageMemo
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
          return <ModelChange key={entry.id} provider={entry.provider} modelId={entry.modelId} timestamp={entry.timestamp} />
        case 'compaction':
          return <Compaction key={entry.id} tokensBefore={entry.tokensBefore} summary={entry.summary} />
        case 'branch_summary':
          return <BranchSummary key={entry.id} summary={entry.summary} timestamp={entry.timestamp} />
        case 'custom_message':
          return <CustomMessage key={entry.id} customType={entry.customType} content={entry.content} timestamp={entry.timestamp} />
        default:
          return null
      }
    },
    [isStreaming, streamingEntryId]
  )

  // ── Loading / Error states ──────────────────────────────────────
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

  // ── Main render ─────────────────────────────────────────────────
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
        style={{ opacity: contentVisible || visibleEntries.length === 0 ? 1 : 0 }}
      >
        <div key={sessionId} className="messages" style={{ paddingTop: 12 }}>
          {visibleEntries.length > 0 ? (
            <>
              {hasMoreAbove && (
                <div className="text-center text-[var(--text-secondary)] text-xs py-3 select-none">
                  ↑ 上滑加载更早消息 ({startIndex} 条)
                </div>
              )}
              {visibleEntries.map((entry) => (
                <div key={entry.id} style={{ paddingBottom: 16 }}>
                  {renderEntry(entry)}
                </div>
              ))}
            </>
          ) : (
            emptyState
          )}
          <div ref={messagesEndRef} />
          <div ref={bottomSentinelRef} className="messages-bottom-sentinel" />
        </div>
      </div>
    </div>
  )
}

// ── Memoized wrappers ─────────────────────────────────────────────
const UserMessageMemo = React.memo(UserMessage)
const AssistantMessageMemo = React.memo(AssistantMessage)
