// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import type { PiLiveSession } from '@/types/pi-live'
import { applyPiLiveChatEvent, patchPiLiveSessionList } from '../usePiLive'

const matches = (left: string, right: string) => left === right

const baseSession: PiLiveSession = {
  sessionId: 'session-1',
  sessionPath: '/tmp/session-1.jsonl',
  pid: 123,
  cwd: '/tmp',
  isStreaming: false,
  entryCount: 3,
  lastSeen: '2026-05-21T10:00:00.000Z',
}

describe('usePiLive session list reducers', () => {
  it('keeps previous array when patch does not change visible state', () => {
    const prev = [baseSession]

    const next = patchPiLiveSessionList(prev, 'session-1', {
      model: baseSession.model,
      isStreaming: baseSession.isStreaming,
      entryCount: baseSession.entryCount,
    }, matches)

    expect(next).toBe(prev)
  })

  it('ignores high-frequency chat update events for sidebar state', () => {
    const prev = [baseSession]

    const next = applyPiLiveChatEvent(prev, 'message_update', 'session-1', matches)

    expect(next).toBe(prev)
  })
})
