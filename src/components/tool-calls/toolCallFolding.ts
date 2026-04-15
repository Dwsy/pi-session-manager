import type { Content, SessionEntry } from '@/types'
import { defaultResolveData } from '@/plugins/tools-render/utils/resolveData'
import type { AssistantProcessStep } from '@/components/messages/assistantProcess'

export interface ProcessToolCallItem {
  toolCall: Content
  index: number
  sourceEntryId: string
}

export interface ToolCallStat {
  name: string
  count: number
  duration: number
}

export interface ToolCallSummary {
  toolStats: ToolCallStat[]
  totalDuration: number
  statsText: string
}

export function formatToolCallDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}m${secs}s`
}

export function getToolCallDuration(result?: SessionEntry): number {
  const details = result?.message?.details as Record<string, unknown> | undefined
  const duration = details?.duration
  return typeof duration === 'number' ? duration : 0
}

export function flattenProcessToolCalls(steps: AssistantProcessStep[]): ProcessToolCallItem[] {
  const merged: ProcessToolCallItem[] = []
  let offset = 0

  for (const step of steps) {
    if (step.kind !== 'assistant') continue

    const stepToolCalls = step.content.filter((item: Content) => item.type === 'toolCall')
    stepToolCalls.forEach((toolCall: Content, idx: number) => {
      merged.push({
        toolCall,
        index: idx + offset,
        sourceEntryId: step.entryId,
      })
    })
    offset += stepToolCalls.length
  }

  return merged
}

export function summarizeToolCalls(
  items: ProcessToolCallItem[],
  toolResultByCallId: Map<string, SessionEntry>,
): ToolCallSummary {
  const statsMap = new Map<string, ToolCallStat>()
  let totalDuration = 0

  for (const item of items) {
    const name = item.toolCall.name || 'unknown'
    const resolvedData = defaultResolveData(item.toolCall, item.index, toolResultByCallId)
    const duration = getToolCallDuration(resolvedData?.result)
    totalDuration += duration

    const existing = statsMap.get(name)
    if (existing) {
      existing.count += 1
      existing.duration += duration
    } else {
      statsMap.set(name, {
        name,
        count: 1,
        duration,
      })
    }
  }

  const toolStats = Array.from(statsMap.values()).sort((a, b) => b.count - a.count)

  return {
    toolStats,
    totalDuration,
    statsText: toolStats.map((item) => `${item.name}(${item.count})`).join(' '),
  }
}

export interface ViewportAnchorSnapshot {
  scrollContainer: HTMLElement | null
  top: number
}

function findScrollContainer(element: HTMLElement): HTMLElement | null {
  const sessionViewer = element.closest('.session-viewer')
  if (sessionViewer instanceof HTMLElement) return sessionViewer

  let current: HTMLElement | null = element.parentElement
  while (current) {
    const style = window.getComputedStyle(current)
    if (/(auto|scroll)/.test(style.overflowY || style.overflow)) {
      return current
    }
    current = current.parentElement
  }

  return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null
}

export function captureViewportAnchor(anchorElement: HTMLElement | null): ViewportAnchorSnapshot | null {
  if (!anchorElement) return null
  return {
    scrollContainer: findScrollContainer(anchorElement),
    top: anchorElement.getBoundingClientRect().top,
  }
}

export function restoreViewportAnchor(
  anchorElement: HTMLElement | null,
  snapshot: ViewportAnchorSnapshot | null,
): void {
  if (!anchorElement || !snapshot?.scrollContainer) return

  const afterTop = anchorElement.getBoundingClientRect().top
  const delta = afterTop - snapshot.top
  if (Math.abs(delta) > 0.5) {
    snapshot.scrollContainer.scrollTop += delta
  }
}
