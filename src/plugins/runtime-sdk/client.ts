import type {
  CreatePsmClientOptions,
  DbPluginRecord,
  PluginRecord,
  PluginRecordListParams,
  PluginRecordSearchParams,
  PluginRecordSearchResult,
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
      const result = await transport.invoke<PluginRecordSearchResult>('search_plugin_records', { ...params })
      return {
        hits: result.hits.map(parsePayload),
        totalHits: result.totalHits,
        hasMore: result.hasMore,
      }
    },

    async listForScope(params: PluginRecordListParams) {
      const result = await transport.invoke<{ records: DbPluginRecord[] }>('list_plugin_records_for_scope', { ...params })
      return result.records.map(parsePayload)
    },

    async upsert(params: PluginRecordUpsertParams) {
      const result = await transport.invoke<{ record: DbPluginRecord }>('upsert_plugin_record', {
        ...params,
        payloadJson: JSON.stringify(params.payload),
      })
      return parsePayload(result.record)
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
