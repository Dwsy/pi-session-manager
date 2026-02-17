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
  timestamp: string
  snippet: string
  score: number
}

export interface FullTextSearchResponse {
  hits: FullTextSearchHit[]
  total_hits: number
}

// Add other types as needed
export interface SearchResult {
  // placeholder
}
