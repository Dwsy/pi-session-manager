import { describe, expect, it } from 'vitest'

import { createPluginCapabilityClient } from '../client'
import { validatePsmPackageManifest, validatePsmPluginManifest } from '../manifest'
import type { PsmPermissionContext, PsmPluginManifest, PsmTransport } from '../types'

describe('runtime-sdk manifest contract', () => {
  it('accepts pi-flavored PSM plugins with records declarations', () => {
    const manifest: PsmPluginManifest = {
      id: 'builtin.session-summary',
      name: 'Session Summary',
      version: '0.1.0',
      permissions: ['sessions:read', 'records:read', 'records:write', 'config:read', 'config:write'],
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

  it('accepts npm-installable plugin metadata without requiring app internals', () => {
    const manifest: PsmPluginManifest = {
      manifestVersion: 1,
      id: 'npm.example.session-summary',
      name: 'Example Session Summary',
      version: '1.0.0',
      runtime: {
        sdk: '^0.1.0',
        host: '>=0.6.3',
      },
      package: {
        name: '@example/psm-session-summary',
        export: '.',
      },
      permissions: ['sessions:read', 'records:read', 'records:write', 'model:invoke'],
      records: [
        {
          type: 'session.intelligence',
          scope: 'session',
          schemaVersion: 1,
        },
      ],
    }

    expect(validatePsmPluginManifest(manifest)).toEqual({ ok: true, errors: [] })
  })

  it('accepts event subscription permissions', () => {
    const manifest: PsmPluginManifest = {
      id: 'builtin.event-listener',
      name: 'Event Listener',
      version: '1.0.0',
      permissions: ['events:read'],
    }

    expect(validatePsmPluginManifest(manifest)).toEqual({ ok: true, errors: [] })
  })

  it('rejects plugin-host style manifests without stable identity or record schema', () => {
    const manifest = {
      manifestVersion: 2,
      id: '',
      name: 'Bad',
      version: '0.1.0',
      runtime: {
        sdk: '',
        host: '',
      },
      package: {
        name: '',
        export: '',
      },
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
    expect(result.errors).toContain('manifestVersion is not supported')
    expect(result.errors).toContain('id is required')
    expect(result.errors).toContain('runtime.sdk is required')
    expect(result.errors).toContain('runtime.host must be a non-empty string')
    expect(result.errors).toContain('package.name must be a non-empty string')
    expect(result.errors).toContain('package.export must be a non-empty string')
    expect(result.errors).toContain('permissions[0] is not supported')
    expect(result.errors).toContain('records[0].type is required')
    expect(result.errors).toContain('records[0].scope is required')
    expect(result.errors).toContain('records[0].schemaVersion must be >= 1')
    expect(result.errors).toContain('records[0].indexes[0].name is required')
    expect(result.errors).toContain('records[0].indexes[0].path must be a JSON path')
    expect(result.errors).toContain('records[0].indexes[0].type is not supported')
  })
})

describe('PSM package manifest contract', () => {
  it('accepts package.json psm extensions entries', () => {
    expect(validatePsmPackageManifest({
      extensions: ['./dist/index.js', './dist/other.js'],
    })).toEqual({ ok: true, errors: [] })
  })

  it('rejects invalid package.json psm extensions entries', () => {
    const result = validatePsmPackageManifest({
      extensions: ['./dist/index.js', ''],
    })

    expect(result.ok).toBe(false)
    expect(result.errors).toContain('psm.extensions[1] must be a non-empty string')
  })
})

describe('plugin capability client', () => {
  const pluginPermissions: PsmPermissionContext = {
    pluginId: 'builtin.session-summary',
    permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'],
  }

  it('reads and writes plugin-scoped JSON config through the PSM transport', async () => {
    const calls: Array<{ command: string; payload?: unknown }> = []
    const configPermissions: PsmPermissionContext = {
      pluginId: 'builtin.config-test',
      permissions: ['config:read', 'config:write'],
    }
    const transport: PsmTransport = {
      invoke: async (command, payload) => {
        calls.push({ command, payload })
        if (command === 'read_psm_plugin_json_config') return { layout: 'compact' }
        return null
      },
    }

    const client = createPluginCapabilityClient({ transport, permissions: configPermissions })
    const result = await client.config.read('workspace', { defaultValue: { layout: 'default' } })
    await client.config.write('workspace', { layout: 'wide' })

    expect(result).toEqual({ layout: 'compact' })
    expect(calls).toEqual([
      {
        command: 'read_psm_plugin_json_config',
        payload: {
          key: 'workspace',
          defaultValue: { layout: 'default' },
          __psm: {
            pluginId: 'builtin.config-test',
            permissions: ['config:read', 'config:write'],
          },
        },
      },
      {
        command: 'write_psm_plugin_json_config',
        payload: {
          key: 'workspace',
          value: { layout: 'wide' },
          __psm: {
            pluginId: 'builtin.config-test',
            permissions: ['config:read', 'config:write'],
          },
        },
      },
    ])
  })

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

    const client = createPluginCapabilityClient({ transport, permissions: pluginPermissions })
    const result = await client.records.search({
      query: 'plugin',
      recordType: 'session.intelligence',
      limit: 5,
    })

    expect(calls).toEqual([
      {
        command: 'search_plugin_records',
        payload: {
          query: 'plugin',
          recordType: 'session.intelligence',
          pluginId: undefined,
          limit: 5,
          __psm: {
            pluginId: 'builtin.session-summary',
            permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'],
          },
        },
      },
    ])
    expect(result[0].payload).toEqual({ summary: 'Build plugin records', status: 'active' })
  })

  it('lists plugin records with Tauri-compatible camelCase payload keys', async () => {
    const calls: Array<{ command: string; payload?: unknown }> = []
    const transport: PsmTransport = {
      invoke: async (command, payload) => {
        calls.push({ command, payload })
        return [
          {
            id: 'record-1',
            plugin_id: 'builtin.session-summary',
            scope_type: 'session',
            scope_id: '/repo/session.jsonl',
            record_type: 'session.intelligence',
            schema_version: 1,
            payload_json: '{"summary":"Existing summary","status":"active"}',
            searchable_text: 'Existing summary',
            created_at: '2026-05-23T00:00:00Z',
            updated_at: '2026-05-23T00:00:00Z',
          },
        ]
      },
    }

    const client = createPluginCapabilityClient({ transport, permissions: pluginPermissions })
    const result = await client.records.listForScope({
      scopeType: 'session',
      scopeId: '/repo/session.jsonl',
      recordType: 'session.intelligence',
      limit: 1,
    })

    expect(calls).toEqual([
      {
        command: 'list_plugin_records_for_scope',
        payload: {
          scopeType: 'session',
          scopeId: '/repo/session.jsonl',
          recordType: 'session.intelligence',
          limit: 1,
          __psm: {
            pluginId: 'builtin.session-summary',
            permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'],
          },
        },
      },
    ])
    expect(result[0].payload).toEqual({ summary: 'Existing summary', status: 'active' })
  })

  it('sends session, search, and tag commands with backend-compatible payloads', async () => {
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
        if (command === 'get_session_entries') {
          return [
            {
              id: 'entry-1',
              timestamp: '2026-05-24T00:00:00Z',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: 'The current blocker is model routing.' }],
              },
            },
          ]
        }
        if (command === 'invoke_model_text') {
          return { text: 'The current blocker is model routing.', provider: 'openai', model: 'gpt-5.5' }
        }
        if (command === 'full_text_search') {
          return { hits: [], total_hits: 0, has_more: false }
        }
        if (command === 'get_all_tags') {
          return []
        }
        if (command === 'list_model_options_fast') {
          return [{ provider: 'openai', model: 'gpt-5.5' }]
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

    const client = createPluginCapabilityClient({ transport, permissions: pluginPermissions })
    await client.sessions.list({ offset: 0, limit: 10, projectFilter: '/repo', filterTagIds: ['tag-active'], sortBy: 'modified_desc' })
    await client.sessions.readFileChunk('/repo/session.jsonl', { offset: 0, maxBytes: 1024 })
    await client.sessions.getLabels('/repo/session.jsonl')
    await client.sessions.open('/repo/session.jsonl', { cwd: '/repo', target: 'browser' })
    await client.search.fulltext({ query: 'summary', roleFilter: 'all', page: 0, pageSize: 20, matchMode: 'smart', sortOrder: 'newest' })
    await client.sidechat.ask({ sessionPath: '/repo/session.jsonl', question: 'What is blocked?', language: 'zh-CN', provider: 'openai', model: 'gpt-5.5', thinkingLevel: 'high', limit: 8 })
    await client.models.listOptions()
    await client.tags.listTags()
    await client.tags.createTag({ name: 'Active', color: '#22c55e' })
    await client.tags.assignTag('/repo/session.jsonl', 'tag-active')
    await client.tags.removeTag('/repo/session.jsonl', 'tag-active')
    await client.tags.listSessionTags('/repo/session.jsonl')

    expect(calls).toEqual([
      {
        command: 'scan_sessions_paginated',
        payload: {
          offset: 0,
          limit: 10,
          searchQuery: undefined,
          projectFilter: '/repo',
          filterTagIds: ['tag-active'],
          sourceFilterSlugs: undefined,
          sortBy: 'modified_desc',
          __psm: {
            pluginId: 'builtin.session-summary',
            permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'],
          },
        },
      },
      { command: 'read_session_file_chunk', payload: { path: '/repo/session.jsonl', offset: 0, maxBytes: 1024, __psm: { pluginId: 'builtin.session-summary', permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'] } } },
      { command: 'get_session_labels', payload: { path: '/repo/session.jsonl', __psm: { pluginId: 'builtin.session-summary', permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'] } } },
      { command: 'open_session_in_browser', payload: { path: '/repo/session.jsonl', __psm: { pluginId: 'builtin.session-summary', permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'] } } },
      {
        command: 'full_text_search',
        payload: {
          query: 'summary',
          roleFilter: 'all',
          globPattern: undefined,
          projectPath: undefined,
          page: 0,
          pageSize: 20,
          matchMode: 'smart',
          sortOrder: 'newest',
          sourceFilter: undefined,
          from: undefined,
          to: undefined,
          __psm: {
            pluginId: 'builtin.session-summary',
            permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'],
          },
        },
      },
      {
        command: 'get_session_entries',
        payload: {
          path: '/repo/session.jsonl',
          __psm: {
            pluginId: 'builtin.session-summary',
            permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'],
          },
        },
      },
      {
        command: 'invoke_model_text',
        payload: {
          systemPrompt: expect.stringContaining('zh-CN'),
          prompt: expect.stringContaining('model routing'),
          provider: 'openai',
          model: 'gpt-5.5',
          reasoning: 'high',
          __psm: {
            pluginId: 'builtin.session-summary',
            permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'],
          },
        },
      },
      { command: 'list_model_options_fast', payload: { __psm: { pluginId: 'builtin.session-summary', permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'] } } },
      { command: 'get_all_tags', payload: { __psm: { pluginId: 'builtin.session-summary', permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'] } } },
      { command: 'create_tag', payload: { name: 'Active', color: '#22c55e', icon: undefined, parentId: undefined, __psm: { pluginId: 'builtin.session-summary', permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'] } } },
      { command: 'assign_tag', payload: { sessionId: '/repo/session.jsonl', tagId: 'tag-active', __psm: { pluginId: 'builtin.session-summary', permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'] } } },
      { command: 'remove_tag_from_session', payload: { sessionId: '/repo/session.jsonl', tagId: 'tag-active', __psm: { pluginId: 'builtin.session-summary', permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'] } } },
      { command: 'get_all_session_tags', payload: { __psm: { pluginId: 'builtin.session-summary', permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'] } } },
    ])
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

    const client = createPluginCapabilityClient({ transport, permissions: pluginPermissions })
    const result = await client.records.refreshSessionIntelligence({
      path: '/repo/session.jsonl',
      provider: 'local',
      model: 'test-model',
      language: 'zh-CN',
    })

    expect(calls).toEqual([
      {
        command: 'refresh_session_intelligence_record',
        payload: {
          path: '/repo/session.jsonl',
          provider: 'local',
          model: 'test-model',
          language: 'zh-CN',
          __psm: {
            pluginId: 'builtin.session-summary',
            permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'],
          },
        },
      },
    ])
    expect(result.payload).toEqual({ summary: 'AI generated summary', status: 'active' })
  })

  it('composes sidechat streaming from session reads and generic AI stream', async () => {
    const calls: Array<{ command: string; payload?: unknown }> = []
    const streamCalls: Array<{ command: string; payload?: unknown }> = []
    const transport: PsmTransport = {
      invoke: async (command, payload) => {
        calls.push({ command, payload })
        if (command === 'get_session_entries') {
          return [
            {
              id: 'entry-1',
              timestamp: '2026-05-24T00:00:00Z',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: 'This session is about sidechat streaming.' }],
              },
            },
          ]
        }
        throw new Error(`unexpected invoke: ${command}`)
      },
      stream: async (command, payload, handlers) => {
        streamCalls.push({ command, payload })
        handlers.onEvent?.({ type: 'delta', delta: 'hello' })
        handlers.onEvent?.({ type: 'done', response: { text: 'hello', provider: 'local', model: 'test' } })
        return { text: 'hello', provider: 'local', model: 'test' }
      },
    }

    const deltas: string[] = []
    const client = createPluginCapabilityClient({ transport, permissions: pluginPermissions })
    const response = await client.sidechat.askStream(
      { sessionPath: '/repo/session.jsonl', question: 'Summarize', language: 'zh-CN', thinkingLevel: 'high' },
      { onDelta: (delta) => deltas.push(delta) },
    )

    expect(deltas).toEqual(['hello'])
    expect(response.answer).toBe('hello')
    expect(response.citations).toHaveLength(1)
    expect(calls).toEqual([
      {
        command: 'get_session_entries',
        payload: {
          path: '/repo/session.jsonl',
          __psm: {
            pluginId: 'builtin.session-summary',
            permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'],
          },
        },
      },
    ])
    expect(streamCalls).toEqual([
      {
        command: 'invoke_model_text_stream',
        payload: {
          systemPrompt: expect.stringContaining('zh-CN'),
          prompt: expect.stringContaining('sidechat streaming'),
          provider: undefined,
          model: undefined,
          reasoning: 'high',
          __psm: {
            pluginId: 'builtin.session-summary',
            permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'],
          },
        },
      },
    ])
  })

  it('falls back to generic non-stream AI when the host lacks generic AI stream dispatch', async () => {
    const calls: Array<{ command: string; payload?: unknown }> = []
    const streamCalls: Array<{ command: string; payload?: unknown }> = []
    const transport: PsmTransport = {
      invoke: async (command, payload) => {
        calls.push({ command, payload })
        if (command === 'get_session_entries') {
          return [
            {
              id: 'entry-1',
              timestamp: '2026-05-24T00:00:00Z',
              message: {
                role: 'assistant',
                content: [{ type: 'text', text: 'This session is about stream fallback.' }],
              },
            },
          ]
        }
        if (command === 'invoke_model_text') {
          return { text: 'fallback answer', provider: 'local', model: 'test' }
        }
        throw new Error(`unexpected invoke: ${command}`)
      },
      stream: async (command, payload) => {
        streamCalls.push({ command, payload })
        throw new Error('Unknown command: invoke_model_text_stream')
      },
    }

    const deltas: string[] = []
    const client = createPluginCapabilityClient({ transport, permissions: pluginPermissions })
    const response = await client.sidechat.askStream(
      { sessionPath: '/repo/session.jsonl', question: 'Summarize', language: 'zh-CN' },
      { onDelta: (delta) => deltas.push(delta) },
    )

    expect(response.answer).toBe('fallback answer')
    expect(deltas).toEqual(['fallback answer'])
    expect(streamCalls).toEqual([
      {
        command: 'invoke_model_text_stream',
        payload: expect.objectContaining({
          prompt: expect.stringContaining('stream fallback'),
        }),
      },
    ])
    expect(calls.map((call) => call.command)).toEqual(['get_session_entries', 'invoke_model_text'])
  })
})
