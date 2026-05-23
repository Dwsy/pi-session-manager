import type {
  CreatePsmClientOptions,
  DbPluginRecord,
  PluginRecord,
  PluginRecordListParams,
  PluginRecordSearchHit,
  PluginRecordSearchParams,
  PluginRecordUpsertParams,
  PsmCapabilityClient,
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

export function createPluginCapabilityClient(options: CreatePsmClientOptions): PsmCapabilityClient {
  const { transport } = options

  const records = {
    async search(params: PluginRecordSearchParams) {
      const hits = await transport.invoke<PluginRecordSearchHit[]>('search_plugin_records', {
        query: params.query,
        record_type: params.recordType,
        plugin_id: params.pluginId,
        limit: params.limit,
      })
      return hits.map((hit) => ({
        ...parsePayload(hit.record),
        score: hit.rank,
      }))
    },

    async listForScope(params: PluginRecordListParams) {
      const records = await transport.invoke<DbPluginRecord[]>('list_plugin_records_for_scope', {
        scope_type: params.scopeType,
        scope_id: params.scopeId,
        record_type: params.recordType,
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
  }

  return {
    records,
    sessions: {
      readEntries(sessionId, readOptions) {
        return transport.invoke<unknown[]>('read_session_entries', {
          sessionId,
          limit: readOptions?.limit,
        })
      },
    },
    search: {
      pluginRecords(params) {
        return records.search(params)
      },
    },
  }
}
