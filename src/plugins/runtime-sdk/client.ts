import type {
  CreatePsmClientOptions,
  DbPluginRecord,
  PluginRecord,
  PluginRecordListParams,
  PluginRecordSearchHit,
  PluginRecordSearchParams,
  PluginRecordUpsertParams,
  PsmCapabilityClient,
  PsmCreateTagParams,
  PsmFullTextSearchParams,
  PsmModelOption,
  PsmSessionListParams,
  PsmSessionOpenOptions,
  PsmSessionReadChunkOptions,
  PsmSideChatAskParams,
  PsmSideChatResponse,
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

function toSideChatPayload(params: PsmSideChatAskParams) {
  return {
    path: params.sessionPath,
    question: params.question,
    language: params.language,
    provider: params.provider,
    model: params.model,
    thinkingLevel: params.thinkingLevel,
    limit: params.limit,
  }
}

export function createPluginCapabilityClient(options: CreatePsmClientOptions): PsmCapabilityClient {
  const { transport } = options

  const records = {
    async search(params: PluginRecordSearchParams) {
      const hits = await transport.invoke<PluginRecordSearchHit[]>('search_plugin_records', {
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
      const records = await transport.invoke<DbPluginRecord[]>('list_plugin_records_for_scope', {
        scopeType: params.scopeType,
        scopeId: params.scopeId,
        recordType: params.recordType,
        limit: params.limit,
      })
      return records.map(parsePayload)
    },

    async upsert(params: PluginRecordUpsertParams) {
      await transport.invoke<void>('upsert_plugin_record', {
        record: {
          id: `${params.pluginId}:${params.scopeType}:${params.scopeId}:${params.recordType}`,
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
      })
    },

    async refreshSessionIntelligence(params: { path: string; provider?: string; model?: string; language?: string }) {
      const record = await transport.invoke<DbPluginRecord>('refresh_session_intelligence_record', {
        path: params.path,
        provider: params.provider,
        model: params.model,
        language: params.language,
      })
      return parsePayload(record)
    },
  }

  return {
    records,
    sessions: {
      scan() {
        return transport.invoke<unknown[]>('scan_sessions')
      },
      list(params) {
        return transport.invoke('scan_sessions_paginated', toSessionListPayload(params))
      },
      readEntries(sessionPath, _readOptions) {
        return transport.invoke<unknown[]>('get_session_entries', {
          path: sessionPath,
        })
      },
      readFileChunk(sessionPath, readOptions?: PsmSessionReadChunkOptions) {
        return transport.invoke('read_session_file_chunk', {
          path: sessionPath,
          offset: readOptions?.offset,
          maxBytes: readOptions?.maxBytes,
        })
      },
      getLabels(sessionPath) {
        return transport.invoke<Record<string, string>>('get_session_labels', {
          path: sessionPath,
        })
      },
      async open(sessionPath, openOptions?: PsmSessionOpenOptions) {
        if (openOptions?.target === 'terminal') {
          await transport.invoke<void>('open_session_in_terminal', {
            path: sessionPath,
            cwd: openOptions.cwd ?? '',
            terminal: openOptions.terminal,
            piPath: openOptions.piPath,
            resumeCommand: openOptions.resumeCommand,
          })
          return
        }

        await transport.invoke<void>('open_session_in_browser', { path: sessionPath })
      },
    },
    search: {
      fulltext(params) {
        return transport.invoke('full_text_search', toFulltextPayload(params))
      },
      pluginRecords(params) {
        return records.search(params)
      },
    },
    sidechat: {
      ask(params) {
        return transport.invoke<PsmSideChatResponse>('ask_session_sidechat', toSideChatPayload(params))
      },
    },
    models: {
      listOptions() {
        return transport.invoke<PsmModelOption[]>('list_model_options_fast')
      },
    },
    kanban: {
      listTags() {
        return transport.invoke('get_all_tags')
      },
      createTag(params) {
        return transport.invoke('create_tag', toCreateTagPayload(params))
      },
      async assignTag(sessionId, tagId) {
        await transport.invoke<void>('assign_tag', { sessionId, tagId })
      },
      async removeTag(sessionId, tagId) {
        await transport.invoke<void>('remove_tag_from_session', { sessionId, tagId })
      },
      async listSessionTags(sessionId) {
        const tags = await transport.invoke<Array<{ sessionId?: string; session_id?: string; tagId?: string; tag_id?: string; position: number; assignedAt?: string; assigned_at?: string }>>('get_all_session_tags')
        if (!sessionId) return tags
        return tags.filter((tag) => (tag.sessionId ?? tag.session_id) === sessionId)
      },
    },
  }
}
