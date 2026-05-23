export type PsmPermission =
  | 'sessions:read'
  | 'records:read'
  | 'records:write'
  | 'search:read'
  | 'model:invoke'

export type PsmRecordScope = 'session' | 'project' | 'global' | 'entry'
export type PsmRecordIndexType = 'text' | 'number' | 'datetime' | 'boolean'

export interface PsmRecordIndexDeclaration {
  name: string
  path: string
  type: PsmRecordIndexType
}

export interface PsmRecordDeclaration {
  type: string
  scope: PsmRecordScope
  schemaVersion: number
  searchable?: string[]
  indexes?: PsmRecordIndexDeclaration[]
}

export interface PsmPluginManifest {
  id: string
  name: string
  version: string
  permissions?: PsmPermission[]
  records?: PsmRecordDeclaration[]
}

export interface PsmTransport {
  invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T>
}

export interface DbPluginRecord {
  id: string
  plugin_id: string
  scope_type: PsmRecordScope | string
  scope_id: string
  record_type: string
  schema_version: number
  payload_json: string
  searchable_text?: string | null
  created_at?: string
  updated_at: string
}

export interface PluginRecord extends Omit<DbPluginRecord, 'payload_json'> {
  payload_json: string
  payload: unknown
  score?: number
}

export interface PluginRecordSearchHit {
  record: DbPluginRecord
  snippet: string
  rank: number
}

export interface PluginRecordSearchParams {
  query: string
  recordType?: string
  pluginId?: string
  scopeType?: PsmRecordScope
  scopeId?: string
  limit?: number
}

export interface PluginRecordListParams {
  scopeType: PsmRecordScope
  scopeId: string
  recordType?: string
  pluginId?: string
  limit?: number
}

export interface PluginRecordUpsertParams {
  pluginId: string
  scopeType: PsmRecordScope
  scopeId: string
  recordType: string
  schemaVersion: number
  payload: unknown
  searchableText?: string
}

export interface PsmRecordsClient {
  search(params: PluginRecordSearchParams): Promise<PluginRecord[]>
  listForScope(params: PluginRecordListParams): Promise<PluginRecord[]>
  upsert(params: PluginRecordUpsertParams): Promise<void>
  refreshSessionIntelligence(params: {
    path: string
    provider?: string
    model?: string
  }): Promise<PluginRecord>
}

export interface PsmSessionsClient {
  readEntries(sessionId: string, options?: { limit?: number }): Promise<unknown[]>
}

export interface PsmSearchClient {
  pluginRecords(params: PluginRecordSearchParams): Promise<PluginRecord[]>
}

export interface PsmCapabilityClient {
  records: PsmRecordsClient
  sessions: PsmSessionsClient
  search: PsmSearchClient
}

export interface CreatePsmClientOptions {
  transport: PsmTransport
}
