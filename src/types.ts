export interface SessionInfo {
  path: string
  id: string
  cwd: string
  name?: string
  created: string
  modified: string
  message_count: number
  first_message: string
  all_messages_text: string
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