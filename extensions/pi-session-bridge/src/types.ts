/**
 * Shared types — aligned with PSM backend response shapes.
 */

// ── API envelope ──────────────────────────────────────

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// ── Session ───────────────────────────────────────────

export interface SessionInfo {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  created: string;
  modified: string;
  message_count: number;
  first_message: string;
  last_message: string;
  last_message_role: string;
  parent_session_path?: string;
}

export interface SessionEntry {
  type: string;
  id?: string;
  timestamp?: string;
  message?: {
    role?: string;
    content?: ContentBlock[];
  };
}

export interface ContentBlock {
  type?: string;
  text?: string;
  thinking?: string;
  name?: string;
  arguments?: string | Record<string, unknown>;
}

// ── Search ────────────────────────────────────────────

export interface SearchHit {
  session_id: string;
  session_path: string;
  session_name?: string;
  entry_id: string;
  role: string;
  source_type: string;
  content: string;
  timestamp: string;
  score: number;
  match_reason?: string;
}

export interface FullTextSearchResponse {
  hits: SearchHit[];
  total_hits: number;
  has_more: boolean;
}

// ── Kanban status + labels ────────────────────────────

/** Host Tag schema used as the persistence compatibility layer for Kanban Status. */
export interface StatusItem {
  id: string;
  name: string;
  color: string;
  icon?: string;
  sort_order: number;
  is_builtin: boolean;
  created_at: string;
  parent_id?: string | null;
}

/** Host SessionTag schema interpreted as a single Kanban Status assignment. */
export interface SessionStatusItem {
  session_id: string;
  status_id: string;
  position: number;
  assigned_at: string;
}

export interface LabelItem {
  id: string;
  name: string;
  color: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface SessionLabelItem {
  session_id: string;
  label_id: string;
}

// ── Bridge connection ─────────────────────────────────

export type BridgeState = "connected" | "reconnecting" | "disconnected";

export interface ConnectionCallbacks {
  onState: (state: BridgeState, attempt: number) => void;
  onMessage: (msg: unknown) => void;
}

export interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── WS protocol ───────────────────────────────────────

export interface WsRpcRequest {
  id: string;
  command: string;
  payload: unknown;
}

export interface WsRpcResponse {
  id: string;
  command: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface WsRegisterPayload {
  type: "register";
  payload: {
    sessionId: string;
    sessionPath: string;
    pid: number;
    cwd: string;
    entries: unknown[];
  };
}
