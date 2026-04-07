import { useCallback, useMemo } from 'react'
import type { SessionEntry } from '@/types'

export interface TimelineNavItem {
  entryId: string
  role: string
  preview: string
  markerType: 'user' | 'assistant' | 'compaction'
  /** 0-1, position in the scroll area */
  top: number
}

interface UseSessionTimelineNavOptions {
  entries: SessionEntry[]
  enabled: boolean
  previewFallback: string
}

interface UseSessionTimelineNavResult {
  items: TimelineNavItem[]
  onNavigate: (entryId: string) => void
}

export function useSessionTimelineNav({
  entries,
  enabled,
  previewFallback,
}: UseSessionTimelineNavOptions): UseSessionTimelineNavResult {
  const getMessagePreview = useCallback(
    (entry: SessionEntry): string => {
      if (entry.type === 'compaction' || (entry.type === 'custom_message' && entry.customType === 'compaction')) {
        const summary = (entry.summary || entry.content || '').replace(/\s+/g, ' ').trim()
        return summary.length > 100 ? `📦 ${summary.slice(0, 100)}…` : `📦 ${summary}`
      }

      const content = entry.message?.content || []
      const text = content
        .filter((item) => item.type === 'text' && item.text)
        .map((item) => item.text)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      if (!text) return previewFallback
      return text.length > 100 ? `${text.slice(0, 100)}…` : text
    },
    [previewFallback],
  )

  const items = useMemo<TimelineNavItem[]>(() => {
    if (!enabled || entries.length === 0) return []

    const denominator = Math.max(entries.length - 1, 1)

    return entries
      .map((entry, index) => {
        let role: string | undefined
        let markerType: 'user' | 'assistant' | 'compaction' | undefined

        if (entry.type === 'message' && entry.message) {
          role = entry.message.role
          markerType = entry.message.role === 'user' ? 'user' : 'assistant'
        } else if (entry.type === 'compaction' || (entry.type === 'custom_message' && entry.customType === 'compaction')) {
          role = 'compaction'
          markerType = 'compaction'
        } else {
          return null
        }

        // top = index / total, clamped to [0, 1]
        const top = Math.min(Math.max(index / denominator, 0), 1)

        return {
          entryId: entry.id,
          role,
          preview: getMessagePreview(entry),
          markerType,
          top,
        }
      })
      .filter((item): item is TimelineNavItem => Boolean(item))
  }, [entries, enabled, getMessagePreview])

  const onNavigate = useCallback((_entryId: string) => {
    // Handled by parent via setScrollTargetId
  }, [])

  return { items, onNavigate }
}
