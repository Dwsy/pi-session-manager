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

  it('sends session, search, and kanban commands with backend-compatible payloads', async () => {
    const calls: Array<{ command: string; payload?: unknown }> = []
    const transport: PsmTransport = {
      invoke: async (command, payload) => {
        calls.push({ command, payload })
        if (command === 'scan_sessions_paginated') {
          return { sessions: [], total: 0, offset: 0, limit: 10, has_more: false }
        }
        if (command === 'read_session_file_chunk') {
          return { content: 'chunk', next_offset: 5, file_size: 5, has_more: false }
        }
        if (command === 'full_text_search') {
          return { hits: [], total_hits: 0, has_more: false }
        }
        if (command === 'get_all_tags') {
          return []
        }
        if (command === 'get_all_session_tags') {
          return [{ sessionId: '/repo/session.jsonl', tagId: 'tag-active', position: 0, assignedAt: '2026-05-23T00:00:00Z' }]
        }
        if (command === 'create_tag') {
          return { id: 'tag-active', name: 'Active', color: '#22c55e', sortOrder: 0, isBuiltin: false, createdAt: '2026-05-23T00:00:00Z' }
        }
        return null
      },
    }

    const client = createPluginCapabilityClient({ transport })
    await client.sessions.list({ offset: 0, limit: 10, projectFilter: '/repo', filterTagIds: ['tag-active'], sortBy: 'modified_desc' })
    await client.sessions.readFileChunk('/repo/session.jsonl', { offset: 0, maxBytes: 1024 })
    await client.sessions.getLabels('/repo/session.jsonl')
    await client.sessions.open('/repo/session.jsonl', { cwd: '/repo', target: 'browser' })
    await client.search.fulltext({ query: 'summary', roleFilter: 'all', page: 0, pageSize: 20, matchMode: 'smart', sortOrder: 'newest' })
    await client.kanban.listTags()
    await client.kanban.createTag({ name: 'Active', color: '#22c55e' })
    await client.kanban.assignTag('/repo/session.jsonl', 'tag-active')
    await client.kanban.removeTag('/repo/session.jsonl', 'tag-active')
    await client.kanban.listSessionTags('/repo/session.jsonl')

    expect(calls).toEqual([
      {
        command: 'scan_sessions_paginated',
        payload: {
          offset: 0,
          limit: 10,
          search_query: undefined,
          project_filter: '/repo',
          filter_tag_ids: ['tag-active'],
          source_filter_slugs: undefined,
          sort_by: 'modified_desc',
        },
      },
      { command: 'read_session_file_chunk', payload: { path: '/repo/session.jsonl', offset: 0, maxBytes: 1024 } },
      { command: 'get_session_labels', payload: { path: '/repo/session.jsonl' } },
      { command: 'open_session_in_browser', payload: { path: '/repo/session.jsonl' } },
      {
        command: 'full_text_search',
        payload: {
          query: 'summary',
          role_filter: 'all',
          glob_pattern: undefined,
          project_path: undefined,
          page: 0,
          page_size: 20,
          match_mode: 'smart',
          sort_order: 'newest',
          source_filter: undefined,
          from: undefined,
          to: undefined,
        },
      },
      { command: 'get_all_tags', payload: undefined },
      { command: 'create_tag', payload: { name: 'Active', color: '#22c55e', icon: undefined, parentId: undefined } },
      { command: 'assign_tag', payload: { sessionId: '/repo/session.jsonl', tagId: 'tag-active' } },
      { command: 'remove_tag_from_session', payload: { sessionId: '/repo/session.jsonl', tagId: 'tag-active' } },
      { command: 'get_all_session_tags', payload: undefined },
    ])
  })
})
