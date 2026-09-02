import type { SessionInfo } from '@/types'

const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS

export interface KanbanRoadmapDomain {
  startMs: number
  endMs: number
}

export interface KanbanRoadmapPosition {
  startMs: number
  endMs: number
  leftPercent: number
  widthPercent: number
}

function timestamp(value: string): number | null {
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function sessionRange(session: SessionInfo): { startMs: number; endMs: number } | null {
  const created = timestamp(session.created)
  const modified = timestamp(session.modified)
  if (created === null && modified === null) return null

  const first = created ?? modified!
  const last = modified ?? created!
  return {
    startMs: Math.min(first, last),
    endMs: Math.max(first, last),
  }
}

export function buildKanbanRoadmapDomain(sessions: SessionInfo[]): KanbanRoadmapDomain {
  const ranges = sessions
    .map(sessionRange)
    .filter((range): range is { startMs: number; endMs: number } => Boolean(range))

  if (ranges.length === 0) {
    const endMs = Date.now()
    return { startMs: endMs - DAY_MS, endMs }
  }

  const earliest = Math.min(...ranges.map((range) => range.startMs))
  const latest = Math.max(...ranges.map((range) => range.endMs))
  const rawSpan = Math.max(latest - earliest, HOUR_MS)
  const pad = Math.max(rawSpan * 0.04, HOUR_MS)
  let startMs = earliest - pad
  let endMs = latest + pad

  if (endMs - startMs < DAY_MS) {
    const center = (earliest + latest) / 2
    startMs = center - DAY_MS / 2
    endMs = center + DAY_MS / 2
  }

  return { startMs, endMs }
}

export function getKanbanRoadmapPosition(
  session: SessionInfo,
  domain: KanbanRoadmapDomain,
): KanbanRoadmapPosition {
  const range = sessionRange(session) ?? { startMs: domain.startMs, endMs: domain.startMs }
  const span = Math.max(domain.endMs - domain.startMs, 1)
  const leftPercent = Math.max(0, Math.min(100, ((range.startMs - domain.startMs) / span) * 100))
  const naturalWidth = ((range.endMs - range.startMs) / span) * 100
  const widthPercent = Math.max(1.2, Math.min(100 - leftPercent, naturalWidth))

  return {
    ...range,
    leftPercent,
    widthPercent,
  }
}

export function buildKanbanRoadmapTicks(
  domain: KanbanRoadmapDomain,
  count = 7,
): number[] {
  const safeCount = Math.max(2, Math.floor(count))
  const span = domain.endMs - domain.startMs
  return Array.from({ length: safeCount }, (_, index) => (
    domain.startMs + (span * index) / (safeCount - 1)
  ))
}
