import type {
  CreatePsmClientOptions,
  DbPluginRecord,
  PluginRecord,
  PluginRecordIndexValue,
  PluginRecordListParams,
  PluginRecordSearchHit,
  PluginRecordSearchParams,
  PluginRecordUpsertParams,
  PsmAgentCreateSessionParams,
  PsmAgentRunParams,
  PsmAgentRunResult,
  PsmAgentRunStreamHandlers,
  PsmAgentSessionHandle,
  PsmCapabilityClient,
  PsmCreateTagParams,
  PsmFullTextSearchParams,
  PsmFsClient,
  PsmFsReadOptions,
  PsmModelOption,
  PsmWidgetRecord,
  PsmPermissionContext,
  PsmSessionListParams,
  PsmSessionOpenOptions,
  PsmSessionReadChunkOptions,
  PsmWindowOpenParams,
} from './types'

function parsePayload(record: DbPluginRecord): PluginRecord {
  let payload: unknown = null
  try {
    payload = JSON.parse(record.payload_json)
  } catch {
    payload = null
  }

  return {
    ...record,
    payload,
  }
}

function toSessionListPayload(params: PsmSessionListParams = {}) {
  return {
    offset: params.offset,
    limit: params.limit,
    searchQuery: params.searchQuery,
    projectFilter: params.projectFilter,
    filterTagIds: params.filterTagIds,
    sourceFilterSlugs: params.sourceFilterSlugs,
    sortBy: params.sortBy,
  }
}

function toFulltextPayload(params: PsmFullTextSearchParams) {
  return {
    query: params.query,
    roleFilter: params.roleFilter ?? 'all',
    globPattern: params.globPattern,
    projectPath: params.projectPath,
    page: params.page ?? 0,
    pageSize: params.pageSize ?? 20,
    matchMode: params.matchMode,
    sortOrder: params.sortOrder,
    sourceFilter: params.sourceFilter,
    from: params.from,
    to: params.to,
  }
}

function toCreateTagPayload(params: PsmCreateTagParams) {
  return {
    name: params.name,
    color: params.color,
    icon: params.icon,
    parentId: params.parentId,
  }
}

function toPluginRecordIndexValues(params: PluginRecordUpsertParams): PluginRecordIndexValue[] | undefined {
  const recordId = params.id || `${params.pluginId}:${params.scopeType}:${params.scopeId}:${params.recordType}`
  return params.indexValues?.map((value): PluginRecordIndexValue => ({
    recordId: value.recordId || recordId,
    pluginId: value.pluginId,
    recordType: value.recordType,
    indexName: value.indexName,
    valueText: value.valueText ?? null,
    valueNumber: value.valueNumber ?? null,
    valueDatetime: value.valueDatetime ?? null,
  }))
}

function withPermissionContext(payload: Record<string, unknown> | undefined, permissions: PsmPermissionContext | undefined) {
  if (!permissions?.pluginId && (!permissions?.permissions || permissions.permissions.length === 0)) {
    return payload
  }

  return {
    ...(payload ?? {}),
    __psm: {
      pluginId: permissions.pluginId,
      permissions: permissions.permissions,
    },
  }
}

export function createPluginCapabilityClient(options: CreatePsmClientOptions): PsmCapabilityClient {
  const { transport, permissions, agent } = options

  const invoke = <T>(command: string, payload?: Record<string, unknown>) => transport.invoke<T>(command, withPermissionContext(payload, permissions))

  const records = {
    async search(params: PluginRecordSearchParams) {
      const hits = await invoke<PluginRecordSearchHit[]>('search_plugin_records', {
        query: params.query,
        recordType: params.recordType,
        pluginId: params.pluginId,
        limit: params.limit,
      })
      return hits.map((hit) => ({
        ...parsePayload(hit.record),
        score: hit.rank,
      }))
    },

    async listForScope(params: PluginRecordListParams) {
      const records = await invoke<DbPluginRecord[]>('list_plugin_records_for_scope', {
        scopeType: params.scopeType,
        scopeId: params.scopeId,
        recordType: params.recordType,
        limit: params.limit,
      })
      return records.map(parsePayload)
    },

    async upsert(params: PluginRecordUpsertParams) {
      await invoke<void>('upsert_plugin_record', {
        record: {
          id: params.id || `${params.pluginId}:${params.scopeType}:${params.scopeId}:${params.recordType}`,
          plugin_id: params.pluginId,
          scope_type: params.scopeType,
          scope_id: params.scopeId,
          record_type: params.recordType,
          schema_version: params.schemaVersion,
          payload_json: JSON.stringify(params.payload),
          searchable_text: params.searchableText ?? null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        indexValues: toPluginRecordIndexValues(params),
      })
    },
  }

  const transportAgent = {
    createSession(params: PsmAgentCreateSessionParams) {
      return invoke<PsmAgentSessionHandle>('plugin_agent_create_session', params as unknown as Record<string, unknown>)
    },
    run(params: PsmAgentRunParams) {
      return invoke<PsmAgentRunResult>('plugin_agent_run', {
        sessionId: params.sessionId,
        prompt: params.prompt,
        streamingBehavior: params.streamingBehavior,
      })
    },
    async runStream(params: PsmAgentRunParams, handlers?: PsmAgentRunStreamHandlers) {
      try {
        const result = await this.run(params)
        if (result.text) handlers?.onDelta?.(result.text)
        handlers?.onDone?.(result)
        return result
      } catch (error) {
        handlers?.onError?.(error instanceof Error ? error.message : String(error))
        throw error
      }
    },
    async abort(sessionId: string) {
      await invoke<void>('plugin_agent_abort', { sessionId })
    },
    async dispose(sessionId: string) {
      await invoke<void>('plugin_agent_dispose', { sessionId })
    },
  }

  const fsClient: PsmFsClient = {
    roots() {
      return invoke('plugin_fs_roots')
    },
    list(rootId, path) {
      return invoke('plugin_fs_list', { rootId, path })
    },
    read(rootId, path, readOptions?: PsmFsReadOptions) {
      return invoke('plugin_fs_read', {
        rootId,
        path,
        encoding: readOptions?.encoding,
        maxBytes: readOptions?.maxBytes,
      })
    },
    stat(rootId, path) {
      return invoke('plugin_fs_stat', { rootId, path })
    },
  }

  const readWidgetIndex = async (): Promise<PsmWidgetRecord[]> => {
    try {
      const result = await fsClient.read('widgets', 'index.json', { maxBytes: 1024 * 1024 })
      const parsed = JSON.parse(result.content)
      return Array.isArray(parsed) ? parsed as PsmWidgetRecord[] : []
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('File not found')) return []
      throw error
    }
  }

  return {
    records,
    sessions: {
      scan() {
        return invoke<unknown[]>('scan_sessions')
      },
      list(params) {
        return invoke('scan_sessions_paginated', toSessionListPayload(params))
      },
      readEntries(sessionPath, options) {
        return invoke<unknown[]>('get_session_entries', {
          path: sessionPath,
        }).then((entries) => (options?.limit === undefined ? entries : entries.slice(0, options.limit)))
      },
      readFileChunk(sessionPath, readOptions?: PsmSessionReadChunkOptions) {
        return invoke('read_session_file_chunk', {
          path: sessionPath,
          offset: readOptions?.offset,
          maxBytes: readOptions?.maxBytes,
        })
      },
      getLabels(sessionPath) {
        return invoke<Record<string, string>>('get_session_labels', {
          path: sessionPath,
        })
      },
      async open(sessionPath, openOptions?: PsmSessionOpenOptions) {
        if (openOptions?.target === 'terminal') {
          await invoke<void>('open_session_in_terminal', {
            path: sessionPath,
            cwd: openOptions.cwd ?? '',
            terminal: openOptions.terminal,
            piPath: openOptions.piPath,
            resumeCommand: openOptions.resumeCommand,
          })
          return
        }

        await invoke<void>('open_session_in_browser', { path: sessionPath })
      },
    },
    search: {
      fulltext(params) {
        return invoke('full_text_search', toFulltextPayload(params))
      },
      pluginRecords(params) {
        return records.search(params)
      },
    },
    agent: agent ?? transportAgent,
    models: {
      listOptions() {
        return invoke<PsmModelOption[]>('list_model_options_fast')
      },
    },
    tags: {
      listTags() {
        return invoke('get_all_tags')
      },
      createTag(params) {
        return invoke('create_tag', toCreateTagPayload(params))
      },
      async assignTag(sessionId, tagId) {
        await invoke<void>('assign_tag', { sessionId, tagId })
      },
      async removeTag(sessionId, tagId) {
        await invoke<void>('remove_tag_from_session', { sessionId, tagId })
      },
      async listSessionTags(sessionId) {
        const tags = await invoke<Array<{ sessionId?: string; session_id?: string; tagId?: string; tag_id?: string; position: number; assignedAt?: string; assigned_at?: string }>>('get_all_session_tags')
        if (!sessionId) return tags
        return tags.filter((tag) => (tag.sessionId ?? tag.session_id) === sessionId)
      },
    },
    config: {
      read(key, options) {
        return invoke('read_psm_plugin_json_config', {
          key,
          defaultValue: options?.defaultValue,
        })
      },
      async write(key, value) {
        await invoke<void>('write_psm_plugin_json_config', {
          key,
          value,
        })
      },
    },
    fs: fsClient,
    widgets: {
      async list(options) {
        let records = await readWidgetIndex()
        if (!options?.includeArchived) records = records.filter((record) => !record.archivedAt)
        if (options?.cwd) records = records.filter((record) => record.cwd === options.cwd)
        return options?.limit === undefined ? records : records.slice(0, options.limit)
      },
      async get(file) {
        const records = await readWidgetIndex()
        return records.find((record) => record.file === file) ?? null
      },
      async readHtml(file, options) {
        const [record, result] = await Promise.all([
          this.get(file),
          fsClient.read('widgets', file, { maxBytes: options?.maxBytes }),
        ])
        return {
          record: record ?? {
            id: file,
            title: file,
            timestamp: '',
            file,
            width: 0,
            height: 0,
            isSVG: file.toLowerCase().endsWith('.svg'),
          },
          html: result.content,
          bytes: result.bytes,
        }
      },
    },
    windows: {
      async open(params: PsmWindowOpenParams) {
        const handle = await invoke<{ id: string }>('plugin_window_open', params as unknown as Record<string, unknown>)
        return {
          id: handle.id,
          close() {
            return invoke<void>('plugin_window_close', { id: handle.id })
          },
        }
      },
    },
  }
}
