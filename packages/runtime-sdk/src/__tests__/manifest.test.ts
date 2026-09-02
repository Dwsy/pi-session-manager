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

  it('accepts restricted local capability permissions', () => {
    const manifest: PsmPluginManifest = {
      id: 'builtin.generative-ui-renderer',
      name: 'Generative UI Renderer',
      version: '1.0.0',
      permissions: ['fs:read', 'windows:open'],
    }

    expect(validatePsmPluginManifest(manifest)).toEqual({ ok: true, errors: [] })
  })

  it('accepts agent usage permissions', () => {
    const manifest: PsmPluginManifest = {
      id: 'builtin.agent-usage',
      name: 'Agent Usage',
      version: '0.1.0',
      permissions: ['usage:read', 'config:read', 'config:write'],
    }

    expect(validatePsmPluginManifest(manifest)).toEqual({ ok: true, errors: [] })
  })

  it('accepts read-only terminal history permissions', () => {
    const manifest: PsmPluginManifest = {
      id: 'example.terminal-history',
      name: 'Terminal History',
      version: '0.1.0',
      permissions: ['terminal:read'],
    }

    expect(validatePsmPluginManifest(manifest)).toEqual({ ok: true, errors: [] })
  })

  it('accepts agent invocation permissions', () => {
    const manifest: PsmPluginManifest = {
      id: 'builtin.agent-search',
      name: 'Agent Search',
      version: '0.1.0',
      permissions: ['agent:invoke', 'model:invoke', 'search:read', 'sessions:read'],
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

  const agentPermissions: PsmPermissionContext = {
    pluginId: 'builtin.session-summary',
    permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke', 'agent:invoke'],
  }

  const usagePermissions: PsmPermissionContext = {
    pluginId: 'builtin.agent-usage',
    permissions: ['usage:read'],
  }

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

  it('upserts plugin records through the provided PSM transport', async () => {
    const calls: Array<{ command: string; payload?: unknown }> = []
    const transport: PsmTransport = {
      invoke: async (command, payload) => {
        calls.push({ command, payload })
        return null
      },
    }

    const client = createPluginCapabilityClient({ transport, permissions: pluginPermissions })
    await client.records.upsert({
      id: 'custom-record',
      pluginId: 'builtin.session-summary',
      scopeType: 'session',
      scopeId: '/repo/session.jsonl',
      recordType: 'session.intelligence',
      schemaVersion: 1,
      payload: { summary: 'Updated summary', status: 'active' },
      searchableText: 'Updated summary',
      indexValues: [
        {
          recordId: '',
          pluginId: 'builtin.session-summary',
          recordType: 'session.intelligence',
          indexName: 'status',
          valueText: 'active',
        },
      ],
    })

    expect(calls).toEqual([
      {
        command: 'upsert_plugin_record',
        payload: {
          record: {
            id: 'custom-record',
            plugin_id: 'builtin.session-summary',
            scope_type: 'session',
            scope_id: '/repo/session.jsonl',
            record_type: 'session.intelligence',
            schema_version: 1,
            payload_json: '{"summary":"Updated summary","status":"active"}',
            searchable_text: 'Updated summary',
            created_at: expect.any(String),
            updated_at: expect.any(String),
          },
          indexValues: [
            {
              recordId: 'custom-record',
              pluginId: 'builtin.session-summary',
              recordType: 'session.intelligence',
              indexName: 'status',
              valueText: 'active',
              valueNumber: null,
              valueDatetime: null,
            },
          ],
          __psm: {
            pluginId: 'builtin.session-summary',
            permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'],
          },
        },
      },
    ])
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
      { command: 'list_model_options_fast', payload: { __psm: { pluginId: 'builtin.session-summary', permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'] } } },
      { command: 'get_all_tags', payload: { __psm: { pluginId: 'builtin.session-summary', permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'] } } },
      { command: 'create_tag', payload: { name: 'Active', color: '#22c55e', icon: undefined, parentId: undefined, __psm: { pluginId: 'builtin.session-summary', permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'] } } },
      { command: 'assign_tag', payload: { sessionId: '/repo/session.jsonl', tagId: 'tag-active', __psm: { pluginId: 'builtin.session-summary', permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'] } } },
      { command: 'remove_tag_from_session', payload: { sessionId: '/repo/session.jsonl', tagId: 'tag-active', __psm: { pluginId: 'builtin.session-summary', permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'] } } },
      { command: 'get_all_session_tags', payload: { __psm: { pluginId: 'builtin.session-summary', permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke'] } } },
    ])
  })

  it('sends widget reads through the restricted filesystem transport', async () => {
    const widgetPermissions: PsmPermissionContext = {
      pluginId: 'builtin.generative-ui-renderer',
      permissions: ['fs:read'],
    }
    const calls: Array<{ command: string; payload?: unknown }> = []
    const transport: PsmTransport = {
      invoke: async (command, payload) => {
        calls.push({ command, payload })
        if (command === 'plugin_fs_read' && payload?.path === 'index.json') {
          return {
            rootId: 'widgets',
            path: 'index.json',
            content: JSON.stringify([{
              id: 'widget-1',
              title: 'Widget',
              timestamp: '2026-05-26T00-00-00',
              file: 'widget.html',
              width: 760,
              height: 420,
              isSVG: false,
            }]),
            encoding: 'utf-8',
            bytes: 128,
          }
        }
        if (command === 'plugin_fs_read' && payload?.path === 'widget.html') {
          return {
            rootId: 'widgets',
            path: 'widget.html',
            content: '<div>Widget</div>',
            encoding: 'utf-8',
            bytes: 17,
          }
        }
        return null
      },
    }

    const client = createPluginCapabilityClient({ transport, permissions: widgetPermissions })
    const result = await client.widgets.readHtml('widget.html', { maxBytes: 2048 })

    expect(result?.record.height).toBe(420)
    expect(calls).toEqual([
      {
        command: 'plugin_fs_read',
        payload: {
          rootId: 'widgets',
          path: 'index.json',
          encoding: undefined,
          maxBytes: 1024 * 1024,
          __psm: {
            pluginId: 'builtin.generative-ui-renderer',
            permissions: ['fs:read'],
          },
        },
      },
      {
        command: 'plugin_fs_read',
        payload: {
          rootId: 'widgets',
          path: 'widget.html',
          encoding: undefined,
          maxBytes: 2048,
          __psm: {
            pluginId: 'builtin.generative-ui-renderer',
            permissions: ['fs:read'],
          },
        },
      },
    ])
  })

  it('supports plugin-scoped agent bridge commands through the PSM transport', async () => {
    const calls: Array<{ command: string; payload?: unknown }> = []
    const transport: PsmTransport = {
      invoke: async (command, payload) => {
        calls.push({ command, payload })
        if (command === 'plugin_agent_create_session') {
          return {
            sessionId: 'agent-session-1',
            storageScope: 'plugin',
            storageKey: 'builtin.session-summary:semantic-search',
            model: { provider: 'openai', id: 'gpt-5.5' },
          }
        }
        if (command === 'plugin_agent_run') {
          return { sessionId: 'agent-session-1', text: 'found sessions', toolResults: [] }
        }
        if (command === 'plugin_agent_abort' || command === 'plugin_agent_dispose') {
          return null
        }
        throw new Error(`unexpected command: ${command}`)
      },
    }

    const client = createPluginCapabilityClient({ transport, permissions: agentPermissions })
    const created = await client.agent.createSession({
      purpose: 'semantic-search',
      cwd: '/repo',
      model: 'host-default',
      thinkingLevel: 'medium',
      tools: [
        { name: 'psm.search.fulltext', permission: 'search:read' },
        { name: 'psm.sessions.readEntries', permission: 'sessions:read' },
      ],
      storage: { scope: 'plugin', key: 'semantic-search' },
    })
    const run = await client.agent.run({ sessionId: created.sessionId, prompt: 'find auth sessions' })
    await client.agent.abort(created.sessionId)
    await client.agent.dispose(created.sessionId)

    expect(created).toMatchObject({
      sessionId: 'agent-session-1',
      storageScope: 'plugin',
      storageKey: 'builtin.session-summary:semantic-search',
    })
    expect(run.text).toBe('found sessions')
    expect(calls).toEqual([
      {
        command: 'plugin_agent_create_session',
        payload: {
          purpose: 'semantic-search',
          cwd: '/repo',
          model: 'host-default',
          thinkingLevel: 'medium',
          tools: [
            { name: 'psm.search.fulltext', permission: 'search:read' },
            { name: 'psm.sessions.readEntries', permission: 'sessions:read' },
          ],
          storage: { scope: 'plugin', key: 'semantic-search' },
          __psm: {
            pluginId: 'builtin.session-summary',
            permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke', 'agent:invoke'],
          },
        },
      },
      {
        command: 'plugin_agent_run',
        payload: {
          sessionId: 'agent-session-1',
          prompt: 'find auth sessions',
          streamingBehavior: undefined,
          __psm: {
            pluginId: 'builtin.session-summary',
            permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke', 'agent:invoke'],
          },
        },
      },
      {
        command: 'plugin_agent_abort',
        payload: {
          sessionId: 'agent-session-1',
          __psm: {
            pluginId: 'builtin.session-summary',
            permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke', 'agent:invoke'],
          },
        },
      },
      {
        command: 'plugin_agent_dispose',
        payload: {
          sessionId: 'agent-session-1',
          __psm: {
            pluginId: 'builtin.session-summary',
            permissions: ['records:read', 'records:write', 'sessions:read', 'search:read', 'tags:read', 'tags:write', 'model:invoke', 'agent:invoke'],
          },
        },
      },
    ])
  })

  it('simulates agent run streaming when only transport RPC is available', async () => {
    const transport: PsmTransport = {
      invoke: async (command) => {
        if (command === 'plugin_agent_run') {
          return { sessionId: 'agent-session-1', text: 'streamed by fallback', toolResults: [] }
        }
        throw new Error(`unexpected command: ${command}`)
      },
    }

    const deltas: string[] = []
    const done: string[] = []
    const client = createPluginCapabilityClient({ transport, permissions: agentPermissions })
    const result = await client.agent.runStream(
      { sessionId: 'agent-session-1', prompt: 'hello' },
      {
        onDelta: (delta) => deltas.push(delta),
        onDone: (run) => done.push(run.text),
      },
    )

    expect(result.text).toBe('streamed by fallback')
    expect(deltas).toEqual(['streamed by fallback'])
    expect(done).toEqual(['streamed by fallback'])
  })

  it('requests agent usage status through the usage transport', async () => {
    const calls: Array<{ command: string; payload?: unknown }> = []
    const transport: PsmTransport = {
      invoke: async (command, payload) => {
        calls.push({ command, payload })
        return {
          fetchedAt: '2026-07-13T00:00:00Z',
          providers: [
            {
              id: 'claude',
              name: 'Claude Code',
              fetchedAt: '2026-07-13T00:00:00Z',
              state: 'available',
              metrics: [{ label: '5h', usedPercent: 12 }],
            },
          ],
        }
      },
    }

    const client = createPluginCapabilityClient({ transport, permissions: usagePermissions })
    const status = await client.agentUsage.getStatus({ providerIds: ['claude'] })

    expect(status.providers[0]?.id).toBe('claude')
    expect(calls).toEqual([
      {
        command: 'get_agent_usage_status',
        payload: {
          providerIds: ['claude'],
          __psm: {
            pluginId: 'builtin.agent-usage',
            permissions: ['usage:read'],
          },
        },
      },
    ])
  })

  it('sends terminal transcript reads through the read-only terminal transport', async () => {
    const calls: Array<{ command: string; payload?: unknown }> = []
    const transport: PsmTransport = {
      invoke: async (command, payload) => {
        calls.push({ command, payload })
        if (command === 'plugin_terminal_history_list') return []
        return { id: 'term@1', entries: [], nextOffset: 12, fileSize: 12, hasMore: false }
      },
    }
    const permissions: PsmPermissionContext = {
      pluginId: 'example.terminal-history',
      permissions: ['terminal:read'],
    }
    const client = createPluginCapabilityClient({ transport, permissions })

    await client.terminalHistory.listSessions()
    await client.terminalHistory.readTranscript('term@1', { offset: 4, maxBytes: 1024 })

    expect(calls).toEqual([
      {
        command: 'plugin_terminal_history_list',
        payload: { __psm: { pluginId: 'example.terminal-history', permissions: ['terminal:read'] } },
      },
      {
        command: 'plugin_terminal_history_read',
        payload: {
          id: 'term@1',
          offset: 4,
          maxBytes: 1024,
          __psm: { pluginId: 'example.terminal-history', permissions: ['terminal:read'] },
        },
      },
    ])
  })
})
