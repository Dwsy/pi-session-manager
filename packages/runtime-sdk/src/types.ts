export type PsmPermission =
  | 'sessions:read'
  | 'records:read'
  | 'records:write'
  | 'search:read'
  | 'tags:read'
  | 'tags:write'
  | 'config:read'
  | 'config:write'
  | 'events:read'
  | 'model:invoke'
  | 'agent:invoke'
  | 'fs:read'
  | 'windows:open'

export interface PsmPermissionContext {
  pluginId?: string
  permissions?: PsmPermission[]
}

export interface PsmModelOption {
  provider: string
  model: string
}

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

export type PsmPluginManifestVersion = 1

export interface PsmPluginRuntimeCompatibility {
  sdk: string
  host?: string
}

export interface PsmPluginPackageBoundary {
  name?: string
  export?: string
}

export interface PsmPackageManifest {
  extensions?: string[]
}

export type PsmPluginSettingValue = string | number | boolean

export interface PsmPluginSettingOption {
  label: string
  value: PsmPluginSettingValue
}

export interface PsmPluginSettingDefinition {
  key: string
  title: string
  description?: string
  type: 'string' | 'number' | 'boolean' | 'select' | 'model-provider' | 'model-id'
  default?: PsmPluginSettingValue
  options?: PsmPluginSettingOption[]
  min?: number
  max?: number
  step?: number
  providerKey?: string
  modelKey?: string
}

export interface PsmPluginConfiguration {
  title?: string
  description?: string
  properties: PsmPluginSettingDefinition[]
}

export type PsmPluginI18nResources = Record<string, Record<string, unknown>>

export interface PsmPluginI18nClient {
  language: string
  t(key: string, fallback: string, options?: Record<string, unknown>): string
}

export interface PsmPluginLogger {
  debug(message: string, details?: Record<string, unknown>): void
  info(message: string, details?: Record<string, unknown>): void
  warn(message: string, details?: Record<string, unknown>): void
  error(message: string, details?: Record<string, unknown>): void
}

export interface PsmPluginManifest {
  manifestVersion?: PsmPluginManifestVersion
  id: string
  name: string
  version: string
  runtime?: PsmPluginRuntimeCompatibility
  package?: PsmPluginPackageBoundary
  permissions?: PsmPermission[]
  records?: PsmRecordDeclaration[]
  configuration?: PsmPluginConfiguration
  i18n?: PsmPluginI18nResources
}

export interface PsmTransport {
  invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T>
  stream?<TEvent, TResult>(
    command: string,
    payload: Record<string, unknown> | undefined,
    handlers: {
      onEvent?: (event: TEvent) => void
      onError?: (error: string) => void
    },
  ): Promise<TResult> | undefined
}

export interface PsmPluginDisposable {
  dispose(): void | Promise<void>
}

export interface PsmPluginEventEnvelope<Name extends string = string, Payload = unknown> {
  name: Name
  payload: Payload
}

export type PsmPluginEventHandler<Name extends string = string, Payload = unknown> = (
  event: PsmPluginEventEnvelope<Name, Payload>,
) => void | Promise<void>

export interface PsmPluginEventsClient {
  subscribe<Name extends string, Payload = unknown>(
    eventName: Name,
    handler: PsmPluginEventHandler<Name, Payload>,
  ): () => void
}

export interface PsmPluginToolRegistration {
  description: string
  run(args: Record<string, unknown>): Promise<unknown>
}

export type PsmPluginCommandScope = 'global' | 'project' | 'session' | 'selection'

export interface PsmPluginCommandContext {
  selectedSession?: PsmSessionReference | null
  selectedProject?: string | null
  query?: string
  closeCommandMenu?: () => void
  navigate?: {
    openAppView?: (viewId: string) => void
    openSession?: (sessionPath: string) => void
    openProject?: (projectPath: string) => void
  }
}

export type PsmPluginCommandHandler = (
  args: Record<string, unknown>,
  context?: PsmPluginCommandContext,
) => Promise<unknown> | unknown

export interface PsmPluginCommandRegistration {
  id: string
  title: string
  description?: string
  category?: string
  icon?: string
  keywords?: string[]
  shortcut?: string
  scope?: PsmPluginCommandScope
  when?: (context: PsmPluginCommandContext) => boolean
  run: PsmPluginCommandHandler
}

export interface PsmToolCallContent {
  type: 'toolCall'
  id?: string
  name?: string
  arguments?: Record<string, unknown>
}

export interface PsmToolResultEntry {
  type: string
  id: string
  timestamp?: string
  message?: unknown
  content?: unknown
}

export interface PsmToolRenderBaseData {
  name: string
  args: Record<string, unknown>
  toolCallId: string
  entryId: string
  result?: PsmToolResultEntry
  output: string
  isError: boolean
}

export interface PsmToolResolvedData extends PsmToolRenderBaseData {
  diff?: string
  images?: Array<{ type: 'image'; mimeType: string; data: string }>
}

export interface PsmToolRenderContext {
  isExpanded: boolean
  toggleExpanded: () => void
  ensureExpanded: () => void
  theme: 'light' | 'dark'
  isMobile: boolean
  t: (key: string, options?: Record<string, unknown>) => string
  copyToClipboard: (text: string) => Promise<void>
  disableSuccessStyle: boolean
}

export interface PsmToolRenderProps<TData extends PsmToolRenderBaseData = PsmToolResolvedData> {
  toolCall: PsmToolCallContent
  resolvedData: TData
  searchQuery?: string
  context: PsmToolRenderContext
}

export type PsmToolRenderComponent<TData extends PsmToolRenderBaseData = PsmToolResolvedData> = (
  props: PsmToolRenderProps<TData>,
) => unknown

export type PsmToolMatcher = string | RegExp | ((toolCall: PsmToolCallContent) => boolean)

export interface PsmToolRendererRegistration<TData extends PsmToolRenderBaseData = PsmToolResolvedData> {
  id: string
  name: string
  match: PsmToolMatcher
  component: PsmToolRenderComponent<TData>
  description?: string
  priority?: number
  resolveData?: (
    toolCall: PsmToolCallContent,
    index: number,
    toolResultByCallId: Map<string, PsmToolResultEntry>,
  ) => TData | null
  getSearchSegments?: (toolCall: PsmToolCallContent, resolvedData: TData) => string[]
  getPreview?: (toolCall: PsmToolCallContent, resolvedData: TData) => string
  isEnabled?: () => boolean
  styles?: string | Record<string, string | number>
  onMount?: () => void
  onUnmount?: () => void
}

export interface PsmSessionReference {
  path: string
  id?: string
  name?: string
  cwd?: string | null
}

export interface PsmSessionRevealOptions {
  align?: 'auto' | 'center' | 'start' | 'end'
  highlight?: boolean
}

export interface PsmSessionToolRevealOptions extends PsmSessionRevealOptions {
  expand?: boolean
}

export interface PsmSessionViewerController {
  revealEntry(entryId: string, options?: PsmSessionRevealOptions): void
  revealToolCall(toolCallId: string, options?: PsmSessionToolRevealOptions): void
}

export interface PsmSessionUiRenderProps {
  session: PsmSessionReference
  activeEntryId?: string | null
  panelOpen?: boolean
  togglePanel?: () => void
  closePanel?: () => void
  mainViewOpen?: boolean
  toggleMainView?: () => void
  closeMainView?: () => void
  width?: number
  onWidthChange?: (width: number) => void
  viewer?: PsmSessionViewerController
}

export interface PsmSessionJsonlEntry {
  type: string
  id: string
  parentId?: string
  timestamp?: string
  message?: unknown
  provider?: string
  modelId?: string
  thinkingLevel?: string
  tokensBefore?: number
  summary?: string
  display?: boolean
  customType?: string
  content?: unknown
  name?: string
  label?: string
  targetId?: string
  [key: string]: unknown
}

export interface PsmSessionTreeViewRenderProps extends PsmSessionUiRenderProps {
  entries: PsmSessionJsonlEntry[]
  labelsByTargetId: Record<string, string>
  filter: string
  closeView: () => void
  onNavigate?: (leafId: string, targetId: string) => void
}

export interface PsmSessionTreeViewRegistration {
  id: string
  title: string
  icon?: string
  render(props: PsmSessionTreeViewRenderProps): unknown
}

export interface PsmSessionToolbarItemRegistration {
  id: string
  title: string
  panelId?: string
  mainViewId?: string
  render(props: PsmSessionUiRenderProps): unknown
}

export interface PsmSessionPanelRegistration {
  id: string
  title: string
  side?: 'right' | 'bottom'
  render(props: PsmSessionUiRenderProps): unknown
}

export interface PsmSessionMainViewRegistration {
  id: string
  title: string
  render(props: PsmSessionUiRenderProps): unknown
}

export interface PsmAppViewRenderProps<TData = unknown> {
  viewId: string
  active: boolean
  data?: TData
}

export interface PsmAppViewRegistration<TData = unknown> {
  id: string
  title: string
  route?: string
  icon?: string
  shortcut?: string
  render(props: PsmAppViewRenderProps<TData>): unknown
}

export type PsmAppSidebarViewRenderProps<TData = unknown> = PsmAppViewRenderProps<TData>

export interface PsmAppSidebarViewRegistration<TData = unknown> {
  id: string
  title: string
  appViewId?: string
  route?: string
  render(props: PsmAppSidebarViewRenderProps<TData>): unknown
}

export interface PsmPluginUiRegistry {
  registerAppView(view: PsmAppViewRegistration): void
  registerAppSidebarView(view: PsmAppSidebarViewRegistration): void
  registerSessionToolbarItem(item: PsmSessionToolbarItemRegistration): void
  registerSessionPanel(panel: PsmSessionPanelRegistration): void
  registerSessionTreeView(view: PsmSessionTreeViewRegistration): void
  registerSessionMainView(view: PsmSessionMainViewRegistration): void
  registerToolRenderer(renderer: PsmToolRendererRegistration): void
}

export interface PsmPluginSettingsClient {
  get<T extends PsmPluginSettingValue>(key: string, fallback: T): T
  all(): Record<string, PsmPluginSettingValue>
}

export interface PsmPluginHostContext {
  manifest: PsmPluginManifest
  psm: PsmCapabilityClient
  permissions: PsmPermissionContext
  events: PsmPluginEventsClient
  settings: PsmPluginSettingsClient
  i18n: PsmPluginI18nClient
  log: PsmPluginLogger
  ui: PsmPluginUiRegistry
  registerCommand(command: string | PsmPluginCommandRegistration, handler?: PsmPluginCommandHandler): void
  registerTool(name: string, tool: PsmPluginToolRegistration): void
}

export type PsmPluginActivateResult = void | PsmPluginDisposable
export type PsmPluginActivate = (ctx: PsmPluginHostContext) => PsmPluginActivateResult | Promise<PsmPluginActivateResult>

export interface PsmPluginModule {
  manifest: PsmPluginManifest
  activate?: PsmPluginActivate
  deactivate?: () => void | Promise<void>
  default?: PsmPluginActivate
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

export interface PluginRecordIndexValue {
  recordId: string
  pluginId: string
  recordType: string
  indexName: string
  valueText?: string | null
  valueNumber?: number | null
  valueDatetime?: string | null
}

export interface PluginRecordUpsertParams {
  id?: string
  pluginId: string
  scopeType: PsmRecordScope
  scopeId: string
  recordType: string
  schemaVersion: number
  payload: unknown
  searchableText?: string
  indexValues?: PluginRecordIndexValue[]
}

export interface PsmRecordsClient {
  search(params: PluginRecordSearchParams): Promise<PluginRecord[]>
  listForScope(params: PluginRecordListParams): Promise<PluginRecord[]>
  upsert(params: PluginRecordUpsertParams): Promise<void>
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

export interface PsmTagsClient {
  listTags(): Promise<PsmTag[]>
  createTag(params: PsmCreateTagParams): Promise<PsmTag>
  assignTag(sessionId: string, tagId: string): Promise<void>
  removeTag(sessionId: string, tagId: string): Promise<void>
  listSessionTags(sessionId?: string): Promise<PsmSessionTag[]>
}

export interface PsmSideChatCitation {
  entryId?: string
  entry_id?: string
  role?: string
  score?: number
  snippet: string
  source?: string
  timestamp?: string
  createdAt?: string
  created_at?: string
}

export interface PsmSideChatResponse {
  answer: string
  citations: PsmSideChatCitation[]
  query?: string
  language?: string
  model?: string
  provider?: string
}

export interface PsmSideChatAskParams {
  sessionPath: string
  question: string
  language?: string
  provider?: string
  model?: string
  thinkingLevel?: string
  limit?: number
}

export interface PsmAiTextResponse {
  text: string
  provider?: string
  model?: string
}

export type PsmAgentThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
export type PsmAgentStorageScope = 'memory' | 'plugin'
export type PsmAgentStreamingBehavior = 'steer' | 'followUp'

export interface PsmAgentToolRef {
  name: string
  permission: PsmPermission
}

export interface PsmAgentCreateSessionParams {
  purpose: string
  cwd?: string
  systemPrompt?: string
  model?: 'host-default' | { provider?: string; id?: string }
  thinkingLevel?: PsmAgentThinkingLevel
  tools: PsmAgentToolRef[]
  storage?: {
    scope: PsmAgentStorageScope
    key?: string
  }
}

export interface PsmAgentSessionHandle {
  sessionId: string
  storageScope: PsmAgentStorageScope
  storageKey?: string
  model?: {
    provider?: string
    id?: string
  }
}

export interface PsmAgentRunParams {
  sessionId: string
  prompt: string
  streamingBehavior?: PsmAgentStreamingBehavior
}

export interface PsmAgentRunResult {
  sessionId: string
  text: string
  toolResults?: unknown[]
}

export interface PsmAgentRunStreamHandlers {
  onDelta?: (delta: string) => void
  onDone?: (result: PsmAgentRunResult) => void
  onError?: (error: string) => void
}

export interface PsmAgentClient {
  createSession(params: PsmAgentCreateSessionParams): Promise<PsmAgentSessionHandle>
  run(params: PsmAgentRunParams): Promise<PsmAgentRunResult>
  runStream(params: PsmAgentRunParams, handlers?: PsmAgentRunStreamHandlers): Promise<PsmAgentRunResult>
  abort(sessionId: string): Promise<void>
  dispose(sessionId: string): Promise<void>
}

export interface PsmSideChatStreamHandlers {
  onDelta?: (delta: string) => void
  onDone?: (response: PsmSideChatResponse) => void
  onError?: (error: string) => void
}

export interface PsmModelsClient {
  listOptions(): Promise<PsmModelOption[]>
}

export interface PsmJsonConfigReadOptions<TDefault = unknown> {
  defaultValue?: TDefault
}

export interface PsmJsonConfigClient {
  read<T = unknown>(key: string, options?: PsmJsonConfigReadOptions<T>): Promise<T>
  write<T = unknown>(key: string, value: T): Promise<void>
}

export interface PsmFsRootInfo {
  id: string
  path: string
  read: boolean
}

export interface PsmFsEntry {
  rootId: string
  path: string
  name: string
  kind: 'file' | 'directory'
  size?: number
  modifiedAt?: string
}

export interface PsmFsReadOptions {
  encoding?: 'utf-8' | 'base64'
  maxBytes?: number
}

export interface PsmFsReadResult {
  rootId: string
  path: string
  content: string
  encoding: 'utf-8' | 'base64'
  bytes: number
  mimeType?: string
}

export interface PsmFsClient {
  roots(): Promise<PsmFsRootInfo[]>
  list(rootId: string, path?: string): Promise<PsmFsEntry[]>
  read(rootId: string, path: string, options?: PsmFsReadOptions): Promise<PsmFsReadResult>
  stat(rootId: string, path: string): Promise<PsmFsEntry | null>
}

export interface PsmWidgetRecord {
  id: string
  title: string
  timestamp: string
  file: string
  width: number
  height: number
  isSVG: boolean
  cwd?: string
  interactionData?: unknown
  archivedAt?: string
}

export interface PsmWidgetHtml {
  record: PsmWidgetRecord
  html: string
  bytes: number
}

export interface PsmWidgetsClient {
  list(options?: { includeArchived?: boolean; cwd?: string; limit?: number }): Promise<PsmWidgetRecord[]>
  get(file: string): Promise<PsmWidgetRecord | null>
  readHtml(file: string, options?: { maxBytes?: number }): Promise<PsmWidgetHtml | null>
}

export interface PsmWindowOpenParams {
  title: string
  html?: string
  url?: string
  width?: number
  height?: number
  floating?: boolean
}

export interface PsmWindowHandle {
  id: string
  close(): Promise<void>
}

export interface PsmWindowsClient {
  open(params: PsmWindowOpenParams): Promise<PsmWindowHandle>
}

export interface PsmCapabilityClient {
  records: PsmRecordsClient
  sessions: PsmSessionsClient
  search: PsmSearchClient
  agent: PsmAgentClient
  models: PsmModelsClient
  tags: PsmTagsClient
  config: PsmJsonConfigClient
  fs: PsmFsClient
  widgets: PsmWidgetsClient
  windows: PsmWindowsClient
}

export interface CreatePsmClientOptions {
  transport: PsmTransport
  permissions?: PsmPermissionContext
  agent?: PsmAgentClient
}
