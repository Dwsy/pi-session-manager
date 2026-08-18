import { afterEach, describe, expect, it } from 'vitest'

import { getDemoSessions, getDemoStats, resetDemoStore } from './store'

afterEach(() => {
  resetDemoStore()
})

describe('getDemoStats', () => {
  it('scopes aggregates to the sessions passed by the runtime provider', () => {
    const sessions = getDemoSessions()
    const scoped = sessions.slice(0, 3)
    const stats = getDemoStats(scoped)

    expect(stats.total_sessions).toBe(scoped.length)
    expect(stats.total_messages).toBe(
      scoped.reduce((sum, session) => sum + session.message_count, 0),
    )
    expect(Object.values(stats.sessions_by_project).reduce((sum, count) => sum + count, 0)).toBe(
      scoped.length,
    )
    expect(
      Object.values(stats.sessions_by_model).reduce((sum, count) => sum + count, 0),
    ).toBeLessThanOrEqual(scoped.length)
  })
})
