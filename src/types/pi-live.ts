/**
 * Pi Live Types - Unified Type Definitions
 *
 * Types for PSM frontend interacting with Pi Live session features.
 * Pi (TS) -> WS -> PSM Rust (pass-through) -> Frontend TS (business)
 */

// ── Session ──────────────────────────────────────────────

export interface PiLiveSession {
  sessionId: string
  sessionPath?: string
  pid?: number
  cwd?: string
  isStreaming: boolean
  entryCount: number
  lastSeen: string
  model?: PiLiveModelInfo
  availableModels?: PiLiveAvailableModel[]
  thinkingLevel?: string
  contextUsage?: PiLiveContextUsage
  pendingMessageCount?: number
  steeringQueue?: string[]
  followUpQueue?: string[]
  tags?: PiLiveTag[]
}

// ── Model ────────────────────────────────────────────────

export interface PiLiveModelInfo {
  provider: string
  id: string
  name?: string
}

export interface PiLiveAvailableModel {
  provider: string
  id: string
  name?: string
}

// ── Context Usage ────────────────────────────────────────

export interface PiLiveContextUsage {
  used: number
  limit: number
  unit?: string
}

// ── Tags ─────────────────────────────────────────────────

export interface PiLiveTag {
  id: string
  name: string
  color: string
}

// ── Command Types ────────────────────────────────────────

export type PiLiveCommandType =
  | 'prompt'
  | 'steer'
  | 'follow_up'
  | 'set_model'
  | 'set_thinking_level'
  | 'abort'
  | 'get_state'
  | 'get_commands'

// ── Command Payloads ─────────────────────────────────────

export interface PiLiveSteerCommand {
  type: 'steer'
  sessionId: string
  message: string
  images?: unknown[]
}

export interface PiLiveFollowUpCommand {
  type: 'follow_up'
  sessionId: string
  message: string
  images?: unknown[]
}

export interface PiLivePromptCommand {
  type: 'prompt'
  sessionId: string
  message: string
  images?: unknown[]
  streamingBehavior?: string
}

export interface PiLiveSetModelCommand {
  type: 'set_model'
  sessionId: string
  provider: string
  modelId: string
}

export interface PiLiveSetThinkingCommand {
  type: 'set_thinking_level'
  sessionId: string
  level: string
}

export interface PiLiveAbortCommand {
  type: 'abort'
  sessionId: string
}

export interface PiLiveGetStateCommand {
  type: 'get_state'
  sessionId: string
}

export interface PiLiveGetCommandsCommand {
  type: 'get_commands'
  sessionId: string
}

export type PiLiveCommand =
  | PiLivePromptCommand
  | PiLiveSteerCommand
  | PiLiveFollowUpCommand
  | PiLiveSetModelCommand
  | PiLiveSetThinkingCommand
  | PiLiveAbortCommand
  | PiLiveGetStateCommand
  | PiLiveGetCommandsCommand

// ── Event Types ──────────────────────────────────────────

export type PiLiveEventType =
  | 'pi-live:session_registered'
  | 'pi-live:session_disconnected'
  | 'pi-live:state_updated'
  | 'message_start'
  | 'message_update'
  | 'message_end'
  | 'tool_execution_start'
  | 'tool_execution_update'
  | 'tool_execution_end'
  | 'agent_start'
  | 'agent_end'
  | 'turn_start'
  | 'turn_end'
  | 'model_select'
  | 'auto_compaction_start'
  | 'auto_compaction_end'
  | 'queue_update'

// ── Event Payloads ───────────────────────────────────────

export interface PiLiveSessionRegisteredPayload {
  sessionId: string
  sessionPath?: string
  pid?: number
  cwd?: string
  entries?: unknown[]
}

export interface PiLiveSessionDisconnectedPayload {
  sessionId: string
}

export interface PiLiveChatEventPayload {
  sessionId: string
  sessionPath?: string
  type: string
  [key: string]: unknown
}

export interface PiLiveStateUpdatedPayload {
  sessionId: string
  model?: PiLiveModelInfo
  availableModels?: PiLiveAvailableModel[]
  thinkingLevel?: string
  contextUsage?: PiLiveContextUsage
  isStreaming?: boolean
  pendingMessageCount?: number
  sessionPath?: string
  tags?: PiLiveTag[]
}

export interface PiLiveQueueUpdatePayload {
  sessionId: string
  sessionPath?: string
  steering: string[]
  followUp: string[]
}

export interface PiLiveSlashCommand {
  name: string
  description?: string
  source: 'extension' | 'prompt' | 'skill'
  sourceInfo: {
    path: string
    source: string
    scope: 'user' | 'project' | 'temporary'
    origin: 'package' | 'top-level'
    baseDir?: string
  }
}

// ── Connection State ─────────────────────────────────────

export type PiLiveConnectionState = 'connected' | 'reconnecting' | 'disconnected'

// ── Settings ─────────────────────────────────────────────

export interface PiLiveSettings {
  enabled: boolean
  showInSidebar: boolean
  autoReconnect: boolean
  maxEntries: number
  showModelInfo: boolean
  showThinkingLevel: boolean
}

export const defaultPiLiveSettings: PiLiveSettings = {
  enabled: false,
  showInSidebar: true,
  autoReconnect: true,
  maxEntries: 200,
  showModelInfo: true,
  showThinkingLevel: true,
}

// ── Utility Types ────────────────────────────────────────

export function isPiLiveSession(obj: unknown): obj is PiLiveSession {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'sessionId' in obj &&
    typeof (obj as Record<string, unknown>).sessionId === 'string'
  )
}

export function isPiLiveCommandType(type: string): type is PiLiveCommandType {
  return ['prompt', 'steer', 'follow_up', 'set_model', 'set_thinking_level', 'abort', 'get_state', 'get_commands'].includes(type)
}

// Extract UUID from session_id for matching
export function extractSessionUuid(sessionId: string): string | null {
  const match = sessionId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return match ? match[0] : null
}
