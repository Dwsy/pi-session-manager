import type { SessionInfo } from '../types'

/**
 * Search plugin interface
 * All search plugins must implement this interface
 */
export interface SearchPlugin {
  // ========== Metadata ==========
  
  /** Unique plugin ID */
  id: string
  
  /** Plugin display name */
  name: string
  
  /** Plugin icon component */
  icon: React.ComponentType<{ className?: string }>
  
  /** Plugin description */
  description: string
  
  /** Search keywords (for plugin matching) */
  keywords: string[]
  
  /** Priority (0-100, higher appears first) */
  priority: number
  
  // ========== Core Methods ==========
  
  /**
   * Execute search
   * @param query Search query
   * @param context Search context
   * @returns Search result array
   */
  search(
    query: string,
    context: SearchContext
  ): Promise<SearchPluginResult[]>
  
  /**
   * Handle result selection
   * @param result Selected result
   * @param context Search context
   */
  onSelect(
    result: SearchPluginResult,
    context: SearchContext
  ): void
  
  // ========== Optional Methods ==========
  
  /**
   * Custom result item rendering
   * @param result Search result
   * @returns Custom React node
   */
  renderItem?(result: SearchPluginResult): React.ReactNode
  
  /**
   * Called when plugin is mounted
   */
  onMount?(): void
  
  /**
   * Called when plugin is unmounted
   */
  onUnmount?(): void
  
  /**
   * Determine whether plugin is available
   * @param context Search context
   * @returns Whether available
   */
  isEnabled?(context: SearchContext): boolean
}

/**
 * Search context
 * Global state and methods provided to plugins
 */
export interface SearchContext {
  // ========== Data ==========
  
  /** Full session list */
  sessions: SessionInfo[]
  
  /** Currently selected project */
  selectedProject: string | null
  
  /** Currently selected session */
  selectedSession: SessionInfo | null
  
  /** Whether to search current project only */
  searchCurrentProjectOnly: boolean
  
  // ========== Methods ==========
  
  /** Set selected session */
  setSelectedSession: (session: SessionInfo | null) => void
  
  /** Set selected project */
  setSelectedProject: (project: string | null) => void
  
  /** Close command palette */
  closeCommandMenu: () => void

  /** Set pending entry to scroll in viewer (optional) */
  setPendingScrollEntryId?: (entryId: string | null) => void
  
  // ========== Utilities ==========
  
  /** i18n translation function */
  t: (key: string, options?: any) => string
}

/**
 * Search result
 */
export interface SearchPluginResult {
  /** Unique result ID */
  id: string
  
  /** Owning plugin ID */
  pluginId: string
  
  /** Primary title */
  title: string
  
  /** Subtitle */
  subtitle?: string
  
  /** Description */
  description?: string
  
  /** Icon */
  icon?: React.ReactNode
  
  /** Metadata (plugin-defined) */
  metadata?: Record<string, any>
  
  /** Match score (0-1) */
  score: number
  
  /** Highlight range */
  highlights?: HighlightRange[]
}

/**
 * Highlight range
 */
export interface HighlightRange {
  start: number
  end: number
  field: 'title' | 'subtitle' | 'description'
}
