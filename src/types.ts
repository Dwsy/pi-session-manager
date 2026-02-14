export interface SessionInfo {
  path: string
  id: string
  cwd: string
  name?: string
  isDraft?: boolean
  created: string
  modified: string
  message_count: number
  first_message: string
  all_messages_text?: string
  last_message: string
  last_message_role: string
  isFavorite?: boolean
}

export interface SessionsDiff {
  updated: SessionInfo[]
  removed: string[]
}

export interface FavoriteItem {
  type: 'session' | 'project'
  id: string
  name: string
  path: string
  addedAt: string
}

export interface SessionStatsInput {
  path: string
  cwd: string
  modified: string
  message_count: number
}

export interface ToolResult {
  content: Content[]
  isError?: boolean
  details?: {
    diff?: string
  }
}

export interface TokenUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost?: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  }
}

export interface SessionStats {
  total_sessions: number
  total_messages: number
  user_messages: number
  assistant_messages: number
  total_tokens: number
  sessions_by_project: Record<string, number>
  sessions_by_model: Record<string, number>
  messages_by_date: Record<string, number>
  messages_by_hour: Record<string, number>
  messages_by_day_of_week: Record<string, number>
  average_messages_per_session: number
  heatmap_data: HeatmapPoint[]
  time_distribution: TimeDistributionPoint[]
  token_details: TokenDetails
}

export interface TokenDetails {
  total_input: number
  total_output: number
  total_cache_read: number
  total_cache_write: number
  total_cost: number
  tokens_by_model: Record<string, ModelTokenStats>
}

export interface ModelTokenStats {
  input: number
  output: number
  cache_read: number
  cache_write: number
  cost: number
}

// Legacy SessionStats for backward compatibility
export interface LegacySessionStats {
  userMessages: number
  assistantMessages: number
  toolResults: number
  customMessages: number
  compactions: number
  branchSummaries: number
  toolCalls: number
  tokens: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  }
  cost: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
  }
  models: string[]
}

export interface SessionEntry {
  type: string
  id: string
  parentId?: string
  timestamp: string
  message?: Message
  provider?: string
  modelId?: string
  tokensBefore?: number
  summary?: string
  display?: boolean
  customType?: string
  content?: any
}

export interface Message {
  role: string
  content: Content[]
  model?: string
  provider?: string
  usage?: TokenUsage
  stopReason?: string
  errorMessage?: string
  cancelled?: boolean
  exitCode?: number
  command?: string
  output?: string
  toolCallId?: string
  toolName?: string
  isError?: boolean
  details?: SubagentDetails
}

// --- Subagent types ---

export interface SubagentDetails {
  mode: 'single' | 'parallel' | 'chain' | 'management'
  results: SubagentResult[]
  artifacts?: { dir: string; files: SubagentArtifactPaths[] }
}

export interface SubagentResult {
  agent: string
  task: string
  exitCode: number
  model?: string
  error?: string
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number; turns: number }
  progressSummary?: { toolCount: number; tokens: number; durationMs: number }
  artifactPaths?: SubagentArtifactPaths
  sessionFile?: string
  messages?: any[]
  progress?: any
}

export interface SubagentArtifactPaths {
  inputPath: string
  outputPath: string
  jsonlPath: string
  metadataPath: string
}

export interface Content {
  type: 'text' | 'thinking' | 'image' | 'toolCall'
  text?: string
  thinking?: string
  mimeType?: string
  data?: string
  name?: string
  id?: string
  arguments?: Record<string, any>
}

export interface SearchResult {
  session_id: string
  session_path: string
  session_name?: string
  first_message: string
  matches: Match[]
  score: number
}

export interface Match {
  entry_id: string
  role: string
  snippet: string
  timestamp: string
}

export interface HeatmapPoint {
  date: string
  level: number // 0-5, 0 = no data, 5 = most active
}

export interface TimeDistributionPoint {
  hour: number
  message_count: number
}

export interface DailyActivity {
  date: string
  message_count: number
  session_count: number
}

// Pi Settings types
export interface SkillInfo {
  name: string
  path: string
  description: string
  enabled: boolean
}

export interface PromptInfo {
  name: string
  path: string
  description: string
  enabled: boolean
}

export interface PiSettings {
  skills: string[]
  prompts: string[]
  extensions: string[]
}

// --- Pi Config TUI types (aligned with pi source) ---

export interface ResourceMetadata {
  source: string
  scope: 'user' | 'project'
  origin: 'package' | 'top-level'
}

export type ResourceType = 'skills' | 'extensions' | 'prompts' | 'themes'

export interface ResourceInfo {
  name: string
  path: string
  description: string
  enabled: boolean
  resourceType: ResourceType
  metadata: ResourceMetadata
}

export interface PiSettingsFull {
  // Model
  defaultProvider?: string
  defaultModel?: string
  defaultThinkingLevel?: string
  enabledModels?: string[]
  // Behavior
  steeringMode?: string
  followUpMode?: string
  hideThinkingBlock?: boolean
  quietStartup?: boolean
  collapseChangelog?: boolean
  enableSkillCommands?: boolean
  doubleEscapeAction?: string
  shellPath?: string
  shellCommandPrefix?: string
  // Nested
  compaction?: { enabled?: boolean; reserveTokens?: number; keepRecentTokens?: number }
  retry?: { enabled?: boolean; maxRetries?: number; baseDelayMs?: number; maxDelayMs?: number }
  terminal?: { showImages?: boolean; clearOnShrink?: boolean }
  images?: { autoResize?: boolean; blockImages?: boolean }
  markdown?: { codeBlockIndent?: string }
  branchSummary?: { reserveTokens?: number }
  // Appearance
  theme?: string
  showHardwareCursor?: boolean
  editorPaddingX?: number
  autocompleteMaxVisible?: number
  // Resources
  packages: unknown[]
  extensions: string[]
  skills: string[]
  prompts: string[]
  themes: string[]
}

export interface ModelOption {
  provider: string
  model: string
}

export interface ConfigVersionMeta {
  id: number
  filePath: string
  createdAt: string
  sizeBytes: number
}

export interface ConfigVersion extends ConfigVersionMeta {
  content: string
}

export interface Tag {
  id: string
  name: string
  color: string
  icon?: string
  sortOrder: number
  isBuiltin: boolean
  createdAt: string
  autoRules?: string
  parentId?: string | null
}

export interface SessionTag {
  sessionId: string
  tagId: string
  position: number
  assignedAt: string
}

export interface AutoRule {
  pattern: string
  enabled: boolean
  description?: string
}
