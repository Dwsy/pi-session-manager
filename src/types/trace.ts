export interface TraceTokens {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  total: number;
}

export interface TraceCost {
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
  total: number;
}

export interface TraceToolCall {
  id: string;
  name: string;
  arguments_preview: string;
  arguments_raw: string | null;
  status: string;
  result_preview: string | null;
}

export type TraceEventType =
  | 'user_prompt'
  | 'assistant_response'
  | 'tool_call'
  | 'tool_result'
  | 'model_change'
  | 'thinking_level_change'
  | 'compaction'
  | 'custom_message'
  | 'system_event';

export interface TraceEvent {
  id: string;
  parent_id: string | null;
  timestamp: string;
  offset_ms: number;
  duration_ms: number;
  event_type: TraceEventType;
  role: string | null;
  model: string | null;
  provider: string | null;
  thinking: string | null;
  tool_calls: TraceToolCall[];
  tokens: TraceTokens | null;
  cost: TraceCost | null;
  content_preview: string | null;
  is_error: boolean;
  error_message: string | null;
  files_read: string[];
  files_written: string[];
  files_edited: string[];
}

export interface BashCommandStat {
  command_prefix: string;
  count: number;
}

export interface SessionTraceAnalytics {
  session_id: string;
  session_path: string;
  cwd: string;
  name: string | null;
  created: string;
  modified: string;
  duration_secs: number;
  active_secs: number;
  total_events: number;
  total_messages: number;
  total_user_messages: number;
  total_assistant_messages: number;
  total_tool_calls: number;
  total_tool_results: number;
  total_errors: number;
  total_tokens: TraceTokens;
  total_cost: TraceCost;
  primary_model: string;
  models_used: string[];
  compaction_count: number;
  tool_call_counts: Record<string, number>;
  files_read: string[];
  files_written: string[];
  files_edited: string[];
  files_read_count: number;
  files_written_count: number;
  files_edited_count: number;
  bash_commands: BashCommandStat[];
  events: TraceEvent[];
  tokens_by_model: Record<string, TraceTokens>;
  cost_by_model: Record<string, TraceCost>;
}
