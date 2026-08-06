export const MINUTES_PER_DAY = 24 * 60
export const HOUR_WIDTH = 92
export const COLLAPSED_GAP_WIDTH = 64
export const COLLAPSE_THRESHOLD_MINUTES = 3 * 60
export const PROMPT_CARD_WIDTH = 156
export const PROMPT_CARD_GAP = 8
export const ROW_LANE_HEIGHT = 44

interface UnknownRecord {
  [key: string]: unknown
}

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === 'object' ? value as UnknownRecord : null
}

function firstString(record: UnknownRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function pathTail(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? path
}

export function dateKeyFromDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function dateFromKey(dateKey: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey)
  if (!match) return new Date(Number.NaN)
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12)
}

export function shiftDateKey(dateKey: string, days: number): string {
  const date = dateFromKey(dateKey)
  if (Number.isNaN(date.getTime())) return dateKey
  date.setDate(date.getDate() + days)
  return dateKeyFromDate(date)
}

export interface DailySessionSummary {
  path: string
  id: string
  name: string
  cwd: string
  createdAt: string | null
  modifiedAt: string | null
}

export function normalizeSession(value: unknown): DailySessionSummary | null {
  const record = asRecord(value)
  if (!record) return null

  const path = firstString(record, ['path', 'session_path', 'sessionPath'])
  if (!path) return null

  const cwd = firstString(record, ['cwd', 'project_path', 'projectPath']) ?? ''
  const firstMessage = firstString(record, ['first_message', 'firstMessage'])
  const explicitName = firstString(record, ['name', 'session_name', 'sessionName'])
  const fallbackName = firstMessage?.slice(0, 72) || pathTail(cwd) || pathTail(path)

  return {
    path,
    id: firstString(record, ['id', 'session_id', 'sessionId']) ?? path,
    name: explicitName ?? fallbackName,
    cwd,
    createdAt: firstString(record, ['created', 'created_at', 'created_time', 'createdAt']),
    modifiedAt: firstString(record, ['modified', 'modified_at', 'modified_time', 'modifiedAt']),
  }
}

function parseTimestamp(value: string | null): number | null {
  if (!value) return null
  const parsed = Date.parse(value)
  return Number.isNaN(parsed) ? null : parsed
}

export function sessionOverlapsDay(session: DailySessionSummary, dateKey: string): boolean {
  const date = dateFromKey(dateKey)
  if (Number.isNaN(date.getTime())) return false

  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime()
  const created = parseTimestamp(session.createdAt)
  const modified = parseTimestamp(session.modifiedAt)

  return (created === null || created < end) && (modified === null || modified >= start)
}

function collectText(value: unknown, output: string[]): void {
  if (typeof value === 'string') {
    const text = value.trim()
    if (text) output.push(text)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) collectText(item, output)
    return
  }

  const record = asRecord(value)
  if (!record) return

  const type = typeof record.type === 'string' ? record.type : ''
  if ((type === 'text' || type === 'input_text' || !type) && typeof record.text === 'string') {
    const text = record.text.trim()
    if (text) output.push(text)
  }

  if ('content' in record) collectText(record.content, output)
}

export function extractMessageText(content: unknown): string {
  const parts: string[] = []
  collectText(content, parts)
  return parts.join('\n\n').trim()
}

export interface DailyPrompt {
  id: string
  sessionPath: string
  sessionId: string
  sessionName: string
  cwd: string
  timestamp: string
  minuteOfDay: number
  text: string
  preview: string
}

export function extractDailyPrompts(
  entries: unknown[],
  session: DailySessionSummary,
  dateKey: string,
): DailyPrompt[] {
  const prompts: DailyPrompt[] = []

  entries.forEach((value, index) => {
    const entry = asRecord(value)
    if (!entry || entry.type !== 'message') return

    const message = asRecord(entry.message)
    if (!message || message.role !== 'user') return

    const timestamp = typeof entry.timestamp === 'string' ? entry.timestamp : null
    if (!timestamp) return

    const date = new Date(timestamp)
    if (Number.isNaN(date.getTime()) || dateKeyFromDate(date) !== dateKey) return

    const text = extractMessageText(message.content)
    if (!text) return

    const minuteOfDay = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60
    const entryId = typeof entry.id === 'string' && entry.id ? entry.id : String(index)
    prompts.push({
      id: `${session.id}:${entryId}`,
      sessionPath: session.path,
      sessionId: session.id,
      sessionName: session.name,
      cwd: session.cwd,
      timestamp,
      minuteOfDay,
      text,
      preview: text.replace(/\s+/g, ' ').slice(0, 150),
    })
  })

  return prompts.sort((left, right) => left.minuteOfDay - right.minuteOfDay || left.id.localeCompare(right.id))
}

export interface TimelineSegment {
  id: string
  startMinute: number
  endMinute: number
  durationMinutes: number
  kind: 'activity' | 'gap'
  collapsed: boolean
  left: number
  width: number
}

interface MinuteSpan {
  start: number
  end: number
}

function mergeActivitySpans(minutes: number[]): MinuteSpan[] {
  const spans = minutes
    .map((minute) => ({
      start: Math.max(0, Math.floor(minute / 60) * 60 - 60),
      end: Math.min(MINUTES_PER_DAY, Math.ceil((minute + 1) / 60) * 60 + 60),
    }))
    .sort((left, right) => left.start - right.start)

  const merged: MinuteSpan[] = []
  for (const span of spans) {
    const previous = merged[merged.length - 1]
    if (!previous || span.start - previous.end > 90) {
      merged.push({ ...span })
    } else {
      previous.end = Math.max(previous.end, span.end)
    }
  }
  return merged
}

export function buildTimelineSegments(
  prompts: DailyPrompt[],
  expandedGapIds: ReadonlySet<string> = new Set(),
): TimelineSegment[] {
  if (prompts.length === 0) return []

  const activitySpans = mergeActivitySpans(prompts.map((prompt) => prompt.minuteOfDay))
  const rawSegments: Array<Omit<TimelineSegment, 'left' | 'width' | 'collapsed'>> = []
  let cursor = 0

  for (const span of activitySpans) {
    if (span.start > cursor) {
      rawSegments.push({
        id: `gap:${cursor}:${span.start}`,
        startMinute: cursor,
        endMinute: span.start,
        durationMinutes: span.start - cursor,
        kind: 'gap',
      })
    }
    rawSegments.push({
      id: `activity:${span.start}:${span.end}`,
      startMinute: span.start,
      endMinute: span.end,
      durationMinutes: span.end - span.start,
      kind: 'activity',
    })
    cursor = span.end
  }

  if (cursor < MINUTES_PER_DAY) {
    rawSegments.push({
      id: `gap:${cursor}:${MINUTES_PER_DAY}`,
      startMinute: cursor,
      endMinute: MINUTES_PER_DAY,
      durationMinutes: MINUTES_PER_DAY - cursor,
      kind: 'gap',
    })
  }

  let left = 0
  return rawSegments.map((segment) => {
    const collapsed = segment.kind === 'gap'
      && segment.durationMinutes >= COLLAPSE_THRESHOLD_MINUTES
      && !expandedGapIds.has(segment.id)
    const width = collapsed
      ? COLLAPSED_GAP_WIDTH
      : Math.max(1, segment.durationMinutes / 60 * HOUR_WIDTH)
    const positioned: TimelineSegment = { ...segment, collapsed, left, width }
    left += width
    return positioned
  })
}

export function timelineWidth(segments: TimelineSegment[]): number {
  const last = segments[segments.length - 1]
  return last ? last.left + last.width : 0
}

export function minuteToTimelineX(minute: number, segments: TimelineSegment[]): number {
  const clampedMinute = Math.min(MINUTES_PER_DAY, Math.max(0, minute))
  const segment = segments.find((candidate, index) => {
    const isLast = index === segments.length - 1
    return clampedMinute >= candidate.startMinute
      && (clampedMinute < candidate.endMinute || (isLast && clampedMinute <= candidate.endMinute))
  })
  if (!segment) return 0
  if (segment.collapsed) return segment.left + segment.width / 2
  const ratio = segment.durationMinutes === 0
    ? 0
    : (clampedMinute - segment.startMinute) / segment.durationMinutes
  return segment.left + ratio * segment.width
}

export interface PositionedPrompt {
  prompt: DailyPrompt
  left: number
  lane: number
}

export interface DailySessionRow {
  sessionPath: string
  sessionId: string
  sessionName: string
  cwd: string
  prompts: DailyPrompt[]
  positionedPrompts: PositionedPrompt[]
  laneCount: number
  compact: boolean
  height: number
  firstMinute: number
}

export function layoutSessionRows(
  prompts: DailyPrompt[],
  segments: TimelineSegment[],
): DailySessionRow[] {
  const grouped = new Map<string, DailyPrompt[]>()
  for (const prompt of prompts) {
    const group = grouped.get(prompt.sessionPath)
    if (group) group.push(prompt)
    else grouped.set(prompt.sessionPath, [prompt])
  }

  const width = timelineWidth(segments)
  return [...grouped.values()].map((group) => {
    const sorted = [...group].sort((left, right) => left.minuteOfDay - right.minuteOfDay)
    const laneEnds: number[] = []
    const positionedPrompts = sorted.map((prompt) => {
      const rawLeft = minuteToTimelineX(prompt.minuteOfDay, segments)
      const left = Math.max(8, Math.min(rawLeft, Math.max(8, width - PROMPT_CARD_WIDTH - 8)))
      let lane = laneEnds.findIndex((end) => end + PROMPT_CARD_GAP <= left)
      if (lane === -1) lane = laneEnds.length
      laneEnds[lane] = left + PROMPT_CARD_WIDTH
      return { prompt, left, lane }
    })

    const laneCount = Math.max(1, laneEnds.length)
    const compact = sorted.length > 6 || laneCount > 3
    const first = sorted[0]
    return {
      sessionPath: first.sessionPath,
      sessionId: first.sessionId,
      sessionName: first.sessionName,
      cwd: first.cwd,
      prompts: sorted,
      positionedPrompts,
      laneCount,
      compact,
      height: compact ? 82 : Math.max(68, 12 + laneCount * ROW_LANE_HEIGHT),
      firstMinute: first.minuteOfDay,
    }
  }).sort((left, right) => left.firstMinute - right.firstMinute || left.sessionName.localeCompare(right.sessionName))
}

export function formatMinute(minute: number): string {
  const clamped = Math.min(MINUTES_PER_DAY, Math.max(0, Math.round(minute)))
  const hours = Math.floor(clamped / 60)
  const minutes = clamped % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function formatDuration(minutes: number): string {
  const rounded = Math.max(0, Math.round(minutes))
  const hours = Math.floor(rounded / 60)
  const remainder = rounded % 60
  if (hours === 0) return `${remainder}m`
  if (remainder === 0) return `${hours}h`
  return `${hours}h ${remainder}m`
}
