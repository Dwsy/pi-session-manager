export interface SessionInfo {
  path: string
  name?: string
  modified_time: string
  message_count: number
  preview: string
  has_tools: boolean
}

export interface FullTextSearchHit {
  session_id: string
  session_path: string
  session_name?: string
  entry_id: string
  role: 'user' | 'assistant'
  source_type: 'user' | 'assistant' | 'thinking' | 'label'
  content: string
  timestamp: string
  score: number
  match_reason?: 'content' | 'label' | 'session_id_exact' | 'session_id_prefix'
}

export interface FullTextSearchResponse {
  hits: FullTextSearchHit[]
  total_hits: number
  has_more: boolean
}

// Add other types as needed
export interface SearchResult {
  // placeholder
}
