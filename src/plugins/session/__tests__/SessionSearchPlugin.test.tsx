import { describe, expect, it } from 'vitest'
import { SessionSearchPlugin } from '../SessionSearchPlugin'
import type { SearchContext } from '@/plugins/types'

function createMockContext(overrides?: Partial<SearchContext>): SearchContext {
  return {
    sessions: [],
    selectedProject: null,
    setSelectedProject: () => {},
    searchCurrentProjectOnly: false,
    selectedSession: null,
    setSelectedSession: () => {},
    closeCommandMenu: () => {},
    t: (key: string, options?: { count?: number }) => {
      if (key === 'session.messageCount') {
        return `${options?.count ?? 0} messages`
      }

      return key
    },
    ...overrides,
  }
}

describe('SessionSearchPlugin', () => {
  it('uses the session name as title and shows the short session id in subtitle', async () => {
    const plugin = new SessionSearchPlugin()
    const sessions = [
      {
        id: '1234567890abcdef',
        path: '/projects/alpha/session1.jsonl',
        cwd: '/projects/alpha',
        name: 'My Session',
        message_count: 10,
        first_message: 'Hello world',
        modified: '2025-01-01T00:00:00Z',
      },
    ]
    const context = createMockContext({ sessions })

    const results = await plugin.search('session', context)

    expect(results.length).toBeGreaterThan(0)
    expect(results[0].title).toBe('My Session')
    expect(results[0].subtitle).toBe('alpha · 1234567890ab')
  })

  it('keeps quoted session-id lookups exact-only', async () => {
    const plugin = new SessionSearchPlugin()
    const sessions = [
      {
        id: 'abc123def456',
        path: '/projects/demo/session1.jsonl',
        cwd: '/projects/demo',
        name: 'Demo Session',
        message_count: 1,
        first_message: 'Hello world',
        modified: '2025-01-01T00:00:00Z',
      },
    ]
    const context = createMockContext({ sessions })

    const prefixResults = await plugin.search('"abc"', context)
    expect(prefixResults).toHaveLength(0)

    const exactResults = await plugin.search('"abc123def456"', context)
    expect(exactResults).toHaveLength(1)
    expect(exactResults[0].id).toBe('session-abc123def456')
  })
})
