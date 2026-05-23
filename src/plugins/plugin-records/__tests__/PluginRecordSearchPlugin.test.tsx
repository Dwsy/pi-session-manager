// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest'

import { PluginRecordSearchPlugin } from '../PluginRecordSearchPlugin'
import type { SearchContext } from '@/plugins/types'

const { mockSearchPluginRecords } = vi.hoisted(() => ({
  mockSearchPluginRecords: vi.fn(),
}))

vi.mock('@/plugins/runtime-host/appTransport', () => ({
  appPsmTransport: { invoke: vi.fn() },
}))

vi.mock('@pi-session-manager/plugin-sdk', () => ({
  createPluginCapabilityClient: () => ({
    records: {
      search: mockSearchPluginRecords,
    },
  }),
}))

function createContext(): SearchContext {
  return {
    sessions: [
      {
        id: 'session-1',
        path: '/repo/session.jsonl',
        cwd: '/repo',
        name: 'Runtime SDK Design',
        message_count: 12,
        first_message: 'Discuss plugin records',
        modified: '2026-05-23T00:00:00Z',
      },
    ],
    selectedProject: null,
    selectedSession: null,
    searchCurrentProjectOnly: false,
    setSelectedSession: vi.fn(),
    setSelectedProject: vi.fn(),
    closeCommandMenu: vi.fn(),
    t: (_key: string, fallback?: string) => fallback || _key,
  }
}

describe('PluginRecordSearchPlugin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSearchPluginRecords.mockResolvedValue([
      {
        id: 'record-1',
        plugin_id: 'builtin.session-summary',
        scope_type: 'session',
        scope_id: '/repo/session.jsonl',
        record_type: 'session.intelligence',
        schema_version: 1,
        payload_json: '{"summary":"Build generic plugin storage","status":"active","topics":["sqlite","plugins"]}',
        payload: {
          summary: 'Build generic plugin storage',
          status: 'active',
          topics: ['sqlite', 'plugins'],
        },
        searchable_text: 'Build generic plugin storage sqlite plugins',
        updated_at: '2026-05-23T00:00:00Z',
        score: 18,
      },
    ])
  })

  it('queries session.intelligence records and maps hits to session results', async () => {
    const plugin = new PluginRecordSearchPlugin()
    const context = createContext()

    const results = await plugin.search('generic storage', context)

    expect(mockSearchPluginRecords).toHaveBeenCalledWith({
      query: 'generic storage',
      recordType: 'session.intelligence',
      limit: 20,
    })
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({
      id: 'plugin-record-record-1',
      pluginId: 'plugin-record-search',
      title: 'Build generic plugin storage',
      subtitle: 'Runtime SDK Design',
      description: 'active · sqlite, plugins',
      score: 18,
    })
    expect(results[0].metadata?.session).toBe(context.sessions[0])
  })

  it('opens the session associated with the selected record', async () => {
    const plugin = new PluginRecordSearchPlugin()
    const context = createContext()
    const [result] = await plugin.search('generic storage', context)

    plugin.onSelect(result, context)

    expect(context.setSelectedSession).toHaveBeenCalledWith(context.sessions[0])
    expect(context.closeCommandMenu).toHaveBeenCalled()
  })
})
