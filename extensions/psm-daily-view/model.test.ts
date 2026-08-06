import { describe, expect, it } from 'vitest'

import {
  COLLAPSED_GAP_WIDTH,
  HOUR_WIDTH,
  buildTimelineSegments,
  dateKeyFromDate,
  extractDailyPrompts,
  layoutSessionRows,
  minuteToTimelineX,
  type DailyPrompt,
  type DailySessionSummary,
} from './model'

const SESSION: DailySessionSummary = {
  path: '/tmp/session.jsonl',
  id: 'session-1',
  name: 'Daily test',
  cwd: '/tmp/project',
  createdAt: null,
  modifiedAt: null,
}

function prompt(id: string, minuteOfDay: number, sessionPath = SESSION.path): DailyPrompt {
  return {
    id,
    sessionPath,
    sessionId: sessionPath,
    sessionName: sessionPath === SESSION.path ? SESSION.name : 'Other session',
    cwd: SESSION.cwd,
    timestamp: new Date(2026, 7, 6, Math.floor(minuteOfDay / 60), minuteOfDay % 60).toISOString(),
    minuteOfDay,
    text: `Prompt ${id}`,
    preview: `Prompt ${id}`,
  }
}

describe('daily view model', () => {
  it('extracts only user text messages from the selected local day', () => {
    const selectedDate = new Date(2026, 7, 6, 12)
    const selectedKey = dateKeyFromDate(selectedDate)
    const morning = new Date(2026, 7, 6, 9, 30).toISOString()
    const previousDay = new Date(2026, 7, 5, 23, 55).toISOString()

    const prompts = extractDailyPrompts([
      {
        type: 'message',
        id: 'user-1',
        timestamp: morning,
        message: {
          role: 'user',
          content: [
            { type: 'text', text: 'First line' },
            { type: 'input_text', text: 'Second line' },
          ],
        },
      },
      {
        type: 'message',
        id: 'assistant-1',
        timestamp: morning,
        message: { role: 'assistant', content: [{ type: 'text', text: 'Ignore me' }] },
      },
      {
        type: 'message',
        id: 'user-old',
        timestamp: previousDay,
        message: { role: 'user', content: [{ type: 'text', text: 'Wrong day' }] },
      },
    ], SESSION, selectedKey)

    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toMatchObject({
      id: 'session-1:user-1',
      sessionPath: SESSION.path,
      text: 'First line\n\nSecond line',
      minuteOfDay: 9 * 60 + 30,
    })
  })

  it('collapses long inactive spans and restores their proportional width when expanded', () => {
    const prompts = [prompt('morning', 8 * 60 + 15), prompt('evening', 17 * 60 + 5)]
    const collapsed = buildTimelineSegments(prompts)
    const gap = collapsed.find((segment) => segment.kind === 'gap' && segment.collapsed)

    expect(gap).toBeDefined()
    expect(gap?.width).toBe(COLLAPSED_GAP_WIDTH)

    const expanded = buildTimelineSegments(prompts, new Set([gap!.id]))
    const expandedGap = expanded.find((segment) => segment.id === gap!.id)

    expect(expandedGap?.collapsed).toBe(false)
    expect(expandedGap?.width).toBe((gap!.durationMinutes / 60) * HOUR_WIDTH)
    expect(minuteToTimelineX(gap!.startMinute, expanded)).toBe(expandedGap?.left)
  })

  it('places overlapping prompt cards on separate lanes while keeping sessions separate', () => {
    const prompts = [
      prompt('one', 9 * 60),
      prompt('two', 9 * 60 + 1),
      prompt('other', 10 * 60, '/tmp/other.jsonl'),
    ]
    const segments = buildTimelineSegments(prompts)
    const rows = layoutSessionRows(prompts, segments)
    const primaryRow = rows.find((row) => row.sessionPath === SESSION.path)
    const otherRow = rows.find((row) => row.sessionPath === '/tmp/other.jsonl')

    expect(rows).toHaveLength(2)
    expect(primaryRow?.laneCount).toBe(2)
    expect(primaryRow?.positionedPrompts.map((item) => item.lane)).toEqual([0, 1])
    expect(otherRow?.laneCount).toBe(1)
  })

  it('uses a bounded activity strip for dense sessions', () => {
    const prompts = Array.from({ length: 12 }, (_, index) => (
      prompt(`dense-${index}`, 8 * 60 + index * 4)
    ))
    const rows = layoutSessionRows(prompts, buildTimelineSegments(prompts))

    expect(rows).toHaveLength(1)
    expect(rows[0].compact).toBe(true)
    expect(rows[0].height).toBe(82)
  })

  it('switches four overlapping cards to the bounded activity strip', () => {
    const prompts = Array.from({ length: 4 }, (_, index) => (
      prompt(`stack-${index}`, 9 * 60 + index)
    ))
    const rows = layoutSessionRows(prompts, buildTimelineSegments(prompts))

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ compact: true, height: 82, laneCount: 4 })
  })
})
