import { describe, expect, it } from 'vitest'

import { createPluginCapabilityClient } from '../client'
import { validatePsmPluginManifest } from '../manifest'
import type { PsmPluginManifest, PsmTransport } from '../types'

describe('runtime-sdk manifest contract', () => {
  it('accepts pi-flavored PSM plugins with records declarations', () => {
    const manifest: PsmPluginManifest = {
      id: 'builtin.session-summary',
      name: 'Session Summary',
      version: '0.1.0',
      permissions: ['sessions:read', 'records:read', 'records:write'],
      records: [
        {
          type: 'session.intelligence',
          scope: 'session',
          schemaVersion: 1,
          searchable: ['summary', 'objective', 'topics', 'nextSteps'],
          indexes: [
            { name: 'status', path: '$.status', type: 'text' },
            { name: 'updatedAt', path: '$.updatedAt', type: 'datetime' },
          ],
        },
      ],
    }

    expect(validatePsmPluginManifest(manifest)).toEqual({ ok: true, errors: [] })
  })

  it('rejects plugin-host style manifests without stable identity or record schema', () => {
    const manifest = {
      id: '',
      name: 'Bad',
      version: '0.1.0',
      permissions: ['records:delete'],
      records: [
        {
          type: '',
          scope: '',
          schemaVersion: 0,
          searchable: ['summary'],
          indexes: [{ name: '', path: 'status', type: 'jsonb' }],
        },
      ],
    }

    const result = validatePsmPluginManifest(manifest)

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('id is required')
    expect(result.errors).toContain('permissions[0] is not supported')
    expect(result.errors).toContain('records[0].type is required')
    expect(result.errors).toContain('records[0].scope is required')
    expect(result.errors).toContain('records[0].schemaVersion must be >= 1')
    expect(result.errors).toContain('records[0].indexes[0].name is required')
    expect(result.errors).toContain('records[0].indexes[0].path must be a JSON path')
    expect(result.errors).toContain('records[0].indexes[0].type is not supported')
  })
})

describe('plugin capability client', () => {
  it('sends typed record RPC through the provided PSM transport', async () => {
    const calls: Array<{ command: string; payload?: unknown }> = []
    const transport: PsmTransport = {
      invoke: async (command, payload) => {
        calls.push({ command, payload })
        return [
          {
            record: {
              id: 'record-1',
              plugin_id: 'builtin.session-summary',
              scope_type: 'session',
              scope_id: '/repo/session.jsonl',
              record_type: 'session.intelligence',
              schema_version: 1,
              payload_json: '{"summary":"Build plugin records","status":"active"}',
              searchable_text: 'Build plugin records',
              created_at: '2026-05-23T00:00:00Z',
              updated_at: '2026-05-23T00:00:00Z',
            },
            snippet: 'Build plugin records',
            rank: 12,
          },
        ]
      },
    }

    const client = createPluginCapabilityClient({ transport })
    const result = await client.records.search({
      query: 'plugin',
      recordType: 'session.intelligence',
      limit: 5,
    })

    expect(calls).toEqual([
      {
        command: 'search_plugin_records',
        payload: { query: 'plugin', record_type: 'session.intelligence', plugin_id: undefined, limit: 5 },
      },
    ])
    expect(result[0].payload).toEqual({ summary: 'Build plugin records', status: 'active' })
  })

  it('refreshes session intelligence records through the PSM transport', async () => {
    const calls: Array<{ command: string; payload?: unknown }> = []
    const transport: PsmTransport = {
      invoke: async (command, payload) => {
        calls.push({ command, payload })
        return {
          id: 'builtin.session-summary:/repo/session.jsonl',
          plugin_id: 'builtin.session-summary',
          scope_type: 'session',
          scope_id: '/repo/session.jsonl',
          record_type: 'session.intelligence',
          schema_version: 1,
          payload_json: '{"summary":"AI generated summary","status":"active"}',
          searchable_text: 'AI generated summary',
          created_at: '2026-05-23T00:00:00Z',
          updated_at: '2026-05-23T00:00:00Z',
        }
      },
    }

    const client = createPluginCapabilityClient({ transport })
    const result = await client.records.refreshSessionIntelligence({
      path: '/repo/session.jsonl',
      provider: 'local',
      model: 'test-model',
    })

    expect(calls).toEqual([
      {
        command: 'refresh_session_intelligence_record',
        payload: { path: '/repo/session.jsonl', provider: 'local', model: 'test-model' },
      },
    ])
    expect(result.payload).toEqual({ summary: 'AI generated summary', status: 'active' })
  })
})
