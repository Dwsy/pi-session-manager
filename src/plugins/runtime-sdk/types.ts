export type PsmPermission =
  | 'sessions:read'
  | 'records:read'
  | 'records:write'
  | 'search:read'
  | 'kanban:read'
  | 'kanban:write'
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

export interface PsmSessionListParams {
  offset?: number
  limit?: number
  searchQuery?: string
  projectFilter?: string
  filterTagIds?: string[]
  sourceFilterSlugs?: string[]
  sortBy?: string
}

export interface PsmPaginatedSessionsResult {
  sessions: unknown[]
  total: number
  offset: number
  limit: number
  has_more?: boolean
}

export interface PsmSessionChunk {
  content: string
  next_offset: number
  file_size: number
  has_more: boolean
}

export interface PsmSessionReadChunkOptions {
  offset?: number
  maxBytes?: number
}

export interface PsmSessionOpenOptions {
  target?: 'browser' | 'terminal'
  cwd?: string
  terminal?: string
  piPath?: string
  resumeCommand?: string
}

export interface PsmSessionsClient {
  scan(): Promise<unknown[]>
  list(params?: PsmSessionListParams): Promise<PsmPaginatedSessionsResult>
  readEntries(sessionPath: string, options?: { limit?: number }): Promise<unknown[]>
  readFileChunk(sessionPath: string, options?: PsmSessionReadChunkOptions): Promise<PsmSessionChunk>
  getLabels(sessionPath: string): Promise<Record<string, string>>
  open(sessionPath: string, options?: PsmSessionOpenOptions): Promise<void>
}

export interface PsmFullTextSearchParams {
  query: string
  roleFilter?: string
  globPattern?: string
  projectPath?: string
  page?: number
  pageSize?: number
  matchMode?: string
  sortOrder?: string
  sourceFilter?: string
  from?: string
  to?: string
}

export interface PsmFullTextSearchResponse {
  hits: unknown[]
  total_hits: number
  has_more: boolean
}

export interface PsmSearchClient {
  fulltext(params: PsmFullTextSearchParams): Promise<PsmFullTextSearchResponse>
  pluginRecords(params: PluginRecordSearchParams): Promise<PluginRecord[]>
}

export interface PsmTag {
  id: string
  name: string
  color: string
  icon?: string | null
  sortOrder?: number
  sort_order?: number
  isBuiltin?: boolean
  is_builtin?: boolean
  createdAt?: string
  created_at?: string
  parentId?: string | null
  parent_id?: string | null
}

export interface PsmSessionTag {
  sessionId?: string
  session_id?: string
  tagId?: string
  tag_id?: string
  position: number
  assignedAt?: string
  assigned_at?: string
}

export interface PsmCreateTagParams {
  name: string
  color: string
  icon?: string
  parentId?: string
}

export interface PsmKanbanClient {
  listTags(): Promise<PsmTag[]>
  createTag(params: PsmCreateTagParams): Promise<PsmTag>
  assignTag(sessionId: string, tagId: string): Promise<void>
  removeTag(sessionId: string, tagId: string): Promise<void>
  listSessionTags(sessionId?: string): Promise<PsmSessionTag[]>
}

export interface PsmCapabilityClient {
  records: PsmRecordsClient
  sessions: PsmSessionsClient
  search: PsmSearchClient
  kanban: PsmKanbanClient
}

export interface CreatePsmClientOptions {
  transport: PsmTransport
}
