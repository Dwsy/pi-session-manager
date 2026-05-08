/**
 * resume-x — Type definitions
 *
 * All interfaces shared across modules.
 * Keep this file dependency-free (no imports from other modules).
 */

// ── Session types ────────────────────────────────────────────────────

export interface ResumeSession {
  path: string;
  id: string;
  cwd: string;
  name?: string;
  parentSessionPath?: string;
  created: Date;
  modified: Date;
  messageCount: number;
  firstMessage: string;
  lastMessage: string;
  lastMessageRole: string;
  allMessagesText: string;
}

export interface ResumeSessionWithDetail extends ResumeSession {
  detail: SessionDetail | null;
}

export interface SessionDetail {
  models: string[];
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  totalCost: number;
}

export interface SessionMessage {
  role: string;
  sourceType: string;
  content: string;
  timestamp: string;
}

// ── Search types ─────────────────────────────────────────────────────

export interface SearchResult {
  sessionId: string;
  sessionPath: string;
  sessionName: string;
  matchType: "name" | "message" | "tag";
  matchSnippet: string;
  modified: string;
  messageCount: number;
}

// ── Kanban types ─────────────────────────────────────────────────────

export interface KanbanTag {
  id: string;
  name: string;
  color: string;
}

export interface SessionTagMark {
  sessionId: string;
  tagId: string;
}

// ── Scroll configuration ─────────────────────────────────────────────

export const SCROLL = {
  LINE: 1,
  FAST_LINE: 3,
  HALF_PAGE: 9,
  PAGE: 18,
} as const;

// ── Tool fold state ──────────────────────────────────────────────────

export const TOOL_PREVIEW_LINES = 3;  // lines shown when collapsed
