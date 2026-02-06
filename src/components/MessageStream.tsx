import { useEffect, useRef } from 'react'
import type { RefObject, ReactNode } from 'react'
import type { Virtualizer } from '@tanstack/react-virtual'
import type { SessionEntry } from '../types'

function LoadMoreSentinel({ onLoadMore }: { onLoadMore?: () => void }) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el || !onLoadMore) return
    if (typeof IntersectionObserver === 'undefined') return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMore()
        }
      },
      { rootMargin: '200px 0px 0px 0px', threshold: 0.01 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [onLoadMore])

  return (
    <div ref={ref} className="flex justify-center py-3 sticky top-0 z-10">
      <button
        type="button"
        className="text-xs px-3 py-1 rounded-full bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors border border-[var(--border-primary)]"
        onClick={onLoadMore}
      >
        加载更早的消息
      </button>
    </div>
  )
}

interface MessageStreamProps {
  entries: SessionEntry[]
  virtualizer: Virtualizer<HTMLDivElement, Element>
  renderEntry: (entry: SessionEntry) => ReactNode
  gap: number
  bottomSentinelRef: RefObject<HTMLDivElement>
  emptyState: ReactNode
  topPadding?: number
  hasMore?: boolean
  onLoadMore?: () => void
}

export default function MessageStream({
  entries,
  virtualizer,
  renderEntry,
  gap,
  bottomSentinelRef,
  emptyState,
  topPadding = 0,
  hasMore,
  onLoadMore,
}: MessageStreamProps) {
  return (
    <div className="messages" style={topPadding ? { paddingTop: `${topPadding}px` } : undefined}>
      {entries.length > 0 ? (
        <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
          {hasMore && (
            <LoadMoreSentinel onLoadMore={onLoadMore} />
          )}
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const entry = entries[virtualRow.index]
            if (!entry) return null
            return (
              <div
                key={entry.id}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  paddingBottom: virtualRow.index === entries.length - 1 ? 0 : gap,
                }}
              >
                {renderEntry(entry)}
              </div>
            )
          })}
        </div>
      ) : (
        emptyState
      )}
      <div ref={bottomSentinelRef} className="messages-bottom-sentinel" />
    </div>
  )
}
