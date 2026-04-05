/**
 * Pi Live Types - Unified Type Definitions
 *
 * Types for PSM frontend interacting with Pi Live session features.
 * Pi (TS) -> WS -> PSM Rust (pass-through) -> Frontend TS (business)
 */

// ── Session ──────────────────────────────────────────────

export interface PiLiveSession {
  session_id: string
  session_path?: string
  pid?: number
  cwd?: string
  is_streaming: boolean
  entry_count: number
  last_seen: string
  model?: PiLiveModelInfo
  thinking_level?: string
  context_usage?: PiLiveContextUsage
  tags?: PiLiveTag[]
}

// ── Model ────────────────────────────────────────────────

export interface PiLiveModelInfo {
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
  | 'steer'
  | 'prompt'
  | 'set_model'
  | 'set_thinking'
  | 'abort'
  | 'get_state'

// ── Command Payloads ─────────────────────────────────────

export interface PiLiveSteerCommand {
  type: 'steer'
  sessionId: string
  message: string
  deliverAs?: string
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
  type: 'set_thinking'
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

export type PiLiveCommand =
  | PiLiveSteerCommand
  | PiLivePromptCommand
  | PiLiveSetModelCommand
  | PiLiveSetThinkingCommand
  | PiLiveAbortCommand
  | PiLiveGetStateCommand

// ── Event Types ──────────────────────────────────────────

export type PiLiveEventType =
  | 'pi-live:session_registered'
  | 'pi-live:session_disconnected'
  | 'pi-live:entry_received'
  | 'pi-live:state_updated'

// Legacy event types (for backward compatibility during transition)
export type PiLiveLegacyEventType =
  | 'pi-agent:register'
  | 'pi-agent:disconnect'
  | 'pi-agent:entry'
  | 'pi-agent:session_state'

// ── Event Payloads ───────────────────────────────────────

export interface PiLiveSessionRegisteredPayload {
  session_id: string
  session_path?: string
  pid?: number
  cwd?: string
  entries?: unknown[]
}

export interface PiLiveSessionDisconnectedPayload {
  session_id: string
}

export interface PiLiveEntryReceivedPayload {
  sessionId: string
  eventType: string
  entry: unknown
}

export interface PiLiveStateUpdatedPayload {
  sessionId: string
  model?: PiLiveModelInfo
  thinkingLevel?: string
  contextUsage?: PiLiveContextUsage
  tags?: PiLiveTag[]
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
    'session_id' in obj &&
    typeof (obj as Record<string, unknown>).session_id === 'string'
  )
}

export function isPiLiveCommandType(type: string): type is PiLiveCommandType {
  return ['steer', 'prompt', 'set_model', 'set_thinking', 'abort', 'get_state'].includes(type)
}

// Extract UUID from session_id for matching
export function extractSessionUuid(sessionId: string): string | null {
  const match = sessionId.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i)
  return match ? match[0] : null
}
