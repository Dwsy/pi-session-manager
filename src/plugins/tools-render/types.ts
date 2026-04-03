import type { Content, SessionEntry } from '../../types'
import type { CSSProperties } from 'react'

// ========== Core Data Structures ==========

/**
 * Base tool data interface
 * Core fields required by all tool renderers
 */
export interface BaseToolData {
  /** Tool name */
  name: string
  /** Tool arguments */
  args: Record<string, any>
  /** Tool call ID */
  toolCallId: string
  /** Unique entry ID for rendering */
  entryId: string
  /** Execution result */
  result?: SessionEntry
  /** Renderable output text */
  output: string
  /** Whether execution failed */
  isError: boolean
}

/**
 * Extended tool data with optional fields
 * Specific tools can extend this interface
 */
export interface ResolvedToolData extends BaseToolData {
  /** Diff content (for edit tool) */
  diff?: string
  /** Image outputs (for read tool) */
  images?: Array<{ type: 'image'; mimeType: string; data: string }>
}

/**
 * Edit tool specific data
 */
export interface EditToolData extends BaseToolData {
  diff?: string
}

/**
 * Read tool specific data
 */
export interface ReadToolData extends BaseToolData {
  images: Array<{ type: 'image'; mimeType: string; data: string }>
}

/**
 * Context provided to tool renderers
 * Contains UI state and utility functions
 */
export interface ToolRenderContext {
  /** Whether the tool output is expanded */
  isExpanded: boolean
  /** Toggle expand/collapse state */
  toggleExpanded: () => void
  /** Ensure expanded (used for search navigation) */
  ensureExpanded: () => void
  /** Current theme */
  theme: 'light' | 'dark'
  /** Whether on mobile device */
  isMobile: boolean
  /** i18n translation function */
  t: (key: string, options?: any) => string
  /** Copy text to clipboard */
  copyToClipboard: (text: string) => Promise<void>
}

/**
 * Props passed to tool render components
 */
export interface ToolRenderProps<TData extends BaseToolData = ResolvedToolData> {
  /** Raw tool call data */
  toolCall: Content
  /** Resolved/processed data */
  resolvedData: TData
  /** Search query for highlighting */
  searchQuery?: string
  /** Rendering context */
  context: ToolRenderContext
}

// ========== Plugin Interface ==========

/**
 * Tool render plugin interface
 * Define how a specific tool type should be rendered
 */
export interface ToolRenderPlugin<TData extends BaseToolData = ResolvedToolData> {
  // ===== Metadata =====
  /** Unique plugin ID */
  id: string
  /** Display name */
  name: string
  /** Icon component */
  icon?: React.ComponentType<{ className?: string }>
  /** Description */
  description?: string

  // ===== Matching Logic =====
  /**
   * Match tool name
   * - string: exact match
   * - RegExp: regex match
   * - function: custom match function
   */
  match: ToolMatcher

  // ===== Core Rendering =====
  /** Main render component */
  component: React.ComponentType<ToolRenderProps<TData>>

  // ===== Optional Extensions =====
  /**
   * Data preprocessing
   * Return null to indicate this plugin cannot handle the tool
   */
  resolveData?: (
    toolCall: Content,
    index: number,
    toolResultByCallId: Map<string, SessionEntry>
  ) => TData | null

  /**
   * Generate searchable text/HTML segments
   * Used for in-message search functionality
   */
  getSearchSegments?: (
    toolCall: Content,
    resolvedData: TData
  ) => string[]

  /**
   * Generate preview text (for session list, etc.)
   */
  getPreview?: (toolCall: Content, resolvedData: TData) => string

  /**
   * Priority (default 50, higher = first)
   */
  priority?: number

  /**
   * Whether this plugin is enabled
   */
  isEnabled?: () => boolean

  // ===== Styling =====
  /** Inject CSS styles */
  styles?: string | CSSProperties

  // ===== Lifecycle =====
  /** Called when plugin is mounted */
  onMount?: () => void
  /** Called when plugin is unmounted */
  onUnmount?: () => void
}

// ========== Utility Types ==========

/** Tool name matcher type */
export type ToolMatcher = string | RegExp | ((toolCall: Content) => boolean)

/**
 * Match a tool call against a plugin's matcher
 * @param plugin - Tool render plugin
 * @param toolCall - Tool call content
 * @returns Whether the plugin matches
 */
export function matchTool(plugin: ToolRenderPlugin, toolCall: Content): boolean {
  const { match } = plugin
  const name = toolCall.name || ''

  if (typeof match === 'string') {
    return match === name
  }
  if (match instanceof RegExp) {
    return match.test(name)
  }
  return match(toolCall)
}
