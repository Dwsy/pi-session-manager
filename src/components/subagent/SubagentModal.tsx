import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { invoke } from '@/transport'
import { X, Bot, Clock, Cpu, Wrench, AlertCircle, CheckCircle2, FileText, Eye, EyeOff, ChevronsUpDown } from 'lucide-react'
import type { SubagentResult, SessionEntry } from '@/types'
import { parseSessionEntries } from '@/utils/session'
import { formatTokens } from '@/utils/format'
import UserMessage from '@/components/messages/UserMessage'
import AssistantMessage from '@/components/messages/AssistantMessage'
import Compaction from '@/components/messages/Compaction'
import BranchSummary from '@/components/BranchSummary'
import CustomMessage from '@/components/messages/CustomMessage'
import { SessionViewProvider, useSessionView } from '@/contexts/SessionViewContext'

interface SubagentModalProps {
  result: SubagentResult
  onClose: () => void
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}m${secs}s`
}


// Simple in-memory cache for subagent JSONL content
const jsonlCache = new Map<string, SessionEntry[]>()
const MAX_CACHE = 10
const CLOSE_ANIMATION_MS = 180
const INITIAL_ENTRY_BATCH = 24
const ENTRY_BATCH_SIZE = 20
const ENTRY_BATCH_INTERVAL_MS = 36

function cacheKey(result: SubagentResult): string {
  return result.artifactPaths?.jsonlPath || result.sessionFile || `${result.agent}-${result.task.slice(0, 50)}`
}

/** Convert inline messages array to SessionEntry[] */
function messagesAsEntries(messages: any[]): SessionEntry[] {
  return messages.map((msg, i) => ({
    type: 'message' as const,
    id: `inline-${i}`,
    parentId: i > 0 ? `inline-${i - 1}` : undefined,
    timestamp: msg.timestamp,
    message: msg,
  }))
}

/**
 * Load subagent session entries.
 *
 * Supports two formats:
 * 1. @tintinweb/pi-subagents: JSONL file in /tmp/ + output text
 * 2. Our format: sessionFile pointing to ~/.pi/agent/sessions/
 *
 * Strategy:
 *   1. Try sessionFile (our format)
 *   2. Try artifactPaths.jsonlPath (@tintinweb format - /tmp/)
 *   3. Fall back to result.messages[] (inline messages)
 *   4. Return [] if all fail
 */
async function loadSubagentEntries(result: SubagentResult): Promise<SessionEntry[]> {
  const key = cacheKey(result)
  if (jsonlCache.has(key)) return jsonlCache.get(key)!

  const cacheAndReturn = (entries: SessionEntry[]) => {
    if (jsonlCache.size >= MAX_CACHE) {
      const first = jsonlCache.keys().next().value
      if (first) jsonlCache.delete(first)
    }
    jsonlCache.set(key, entries)
    return entries
  }

  // 1. Try sessionFile (our format - points to ~/.pi/agent/sessions/)
  if (result.sessionFile) {
    try {
      const content = await invoke<string>('read_session_file', { path: result.sessionFile })
      if (content?.trim()) {
        const entries = parseSessionEntries(content)
        if (entries.length > 0) return cacheAndReturn(entries)
      }
    } catch {
      // sessionFile read failed, fall back to artifactPaths
    }
  }

  // 2. Try artifactPaths.jsonlPath (@tintinweb format - /tmp/)
  // Note: These files are often cleaned up after 7 days, so this usually fails
  if (result.artifactPaths?.jsonlPath) {
    try {
      const content = await invoke<string>('read_session_file', { path: result.artifactPaths.jsonlPath })
      if (content?.trim()) {
        const entries = parseSessionEntries(content)
        if (entries.length > 0) return cacheAndReturn(entries)
      }
    } catch {
      // JSONL file was likely cleaned up - fall back to inline messages
    }
  }

  // 3. Fall back to inline messages embedded in the result
  if (result.messages?.length) {
    return cacheAndReturn(messagesAsEntries(result.messages))
  }

  return []
}

// Track nesting depth for z-index stacking
let modalDepth = 0

function SubagentModalContent({ result, onClose }: SubagentModalProps) {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<SessionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [closing, setClosing] = useState(false)
  const [visibleCount, setVisibleCount] = useState(0)
  const [progressiveRendering, setProgressiveRendering] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const depthRef = useRef(0)
  const closeTimerRef = useRef<number | null>(null)
  const progressiveTimerRef = useRef<number | null>(null)
  const { showThinking, toggleThinking, toolsExpanded, toggleToolsExpanded } = useSessionView()

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }, [])

  const clearProgressiveTimer = useCallback(() => {
    if (progressiveTimerRef.current !== null) {
      window.clearTimeout(progressiveTimerRef.current)
      progressiveTimerRef.current = null
    }
  }, [])

  // Track depth for z-index
  useEffect(() => {
    modalDepth++
    depthRef.current = modalDepth
    return () => { modalDepth-- }
  }, [])

  useEffect(() => {
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const frame = requestAnimationFrame(() => dialogRef.current?.focus())
    return () => {
      cancelAnimationFrame(frame)
      previouslyFocusedRef.current?.focus()
      previouslyFocusedRef.current = null
    }
  }, [])

  // Lock body scroll
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // Load data
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setEntries([])
    setVisibleCount(0)
    setProgressiveRendering(false)
    clearProgressiveTimer()

    loadSubagentEntries(result).then(parsed => {
      if (cancelled) return
      if (parsed.length === 0) {
        setError(
          result.exitCode !== 0
            ? t('components.subagent.failedNoOutput', 'Subagent failed with no output.')
            : t('components.subagent.artifactsUnavailable', 'Subagent artifacts not available — files may have been cleaned up.')
        )
      }
      setEntries(parsed)
      setLoading(false)
    }).catch(err => {
      if (!cancelled) {
        setError(String(err))
        setLoading(false)
      }
    })

    return () => { cancelled = true }
  }, [clearProgressiveTimer, result, t])

  const handleClose = useCallback(() => {
    if (closing) return
    setClosing(true)
    clearCloseTimer()
    closeTimerRef.current = window.setTimeout(onClose, CLOSE_ANIMATION_MS)
  }, [clearCloseTimer, closing, onClose])

  useEffect(() => {
    return () => {
      clearCloseTimer()
      clearProgressiveTimer()
    }
  }, [clearCloseTimer, clearProgressiveTimer])

  // Capture-phase keyboard handler: intercept Cmd+T / Cmd+O / Escape
  // before they reach SessionViewer's listener on the parent
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        handleClose()
        return
      }
      if (e.key === 'Tab') {
        trapFocusWithinSubagentDialog(e, dialogRef.current)
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 't') {
        e.preventDefault()
        e.stopImmediatePropagation()
        toggleThinking()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'o') {
        e.preventDefault()
        e.stopImmediatePropagation()
        toggleToolsExpanded()
        return
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [handleClose, toggleThinking, toggleToolsExpanded])

  // Close on backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === backdropRef.current) handleClose()
  }, [handleClose])

  const ok = result.exitCode === 0
  const ps = result.progressSummary

  useEffect(() => {
    if (loading || error || entries.length === 0) {
      setVisibleCount(0)
      setProgressiveRendering(false)
      clearProgressiveTimer()
      return
    }

    const initialCount = Math.min(entries.length, INITIAL_ENTRY_BATCH)
    setVisibleCount(initialCount)
    setProgressiveRendering(initialCount < entries.length)
  }, [clearProgressiveTimer, entries, error, loading])

  useEffect(() => {
    if (!progressiveRendering) return
    if (visibleCount >= entries.length) {
      setProgressiveRendering(false)
      return
    }

    progressiveTimerRef.current = window.setTimeout(() => {
      setVisibleCount((prev) => Math.min(prev + ENTRY_BATCH_SIZE, entries.length))
    }, ENTRY_BATCH_INTERVAL_MS)

    return clearProgressiveTimer
  }, [clearProgressiveTimer, entries.length, progressiveRendering, visibleCount])

  const visibleEntries = useMemo(
    () => entries.slice(0, visibleCount),
    [entries, visibleCount],
  )

  const toolResultByCallId = useMemo(() => {
    const map = new Map<string, SessionEntry>()
    for (const entry of entries) {
      if (
        entry.type === 'message' &&
        entry.message?.role === 'toolResult' &&
        entry.message.toolCallId
      ) {
        map.set(entry.message.toolCallId, entry)
      }
    }
    return map
  }, [entries])

  const renderEntry = useCallback((entry: SessionEntry) => {
    switch (entry.type) {
      case 'message':
        if (!entry.message) return null
        const role = entry.message.role

        if (role === 'user') {
          return (
            <UserMessage
              content={entry.message.content}
              timestamp={entry.timestamp}
              id={entry.id}
            />
          )
        } else if (role === 'assistant') {
          return (
            <AssistantMessage
              content={entry.message.content}
              timestamp={entry.timestamp}
              entryId={entry.id}
              toolResultByCallId={toolResultByCallId}
            />
          )
        }
        return null

      case 'compaction':
        return <Compaction tokensBefore={entry.tokensBefore} summary={entry.summary} />

      case 'branch_summary':
        return <BranchSummary summary={entry.summary} timestamp={entry.timestamp} />

      case 'custom_message':
        return <CustomMessage customType={entry.customType} content={entry.content} timestamp={entry.timestamp} />

      default:
        return null
    }
  }, [toolResultByCallId])

  const renderedEntries = useMemo(
    () => visibleEntries.flatMap((entry) => {
      const node = renderEntry(entry)
      return node ? [{ id: entry.id, node }] : []
    }),
    [renderEntry, visibleEntries],
  )

  const handleRenderAllNow = useCallback(() => {
    clearProgressiveTimer()
    setVisibleCount(entries.length)
    setProgressiveRendering(false)
  }, [clearProgressiveTimer, entries.length])

  const progressRatio = entries.length > 0
    ? Math.min(visibleCount / entries.length, 1)
    : 0

  return createPortal(
    <div
      className={`subagent-modal-backdrop ${closing ? 'closing' : ''}`}
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{ zIndex: 1000 + depthRef.current }}
    >
      <div
        ref={dialogRef}
        className="subagent-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="subagent-modal-title"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="subagent-modal-header">
          <div className="subagent-modal-title">
            {ok
              ? <CheckCircle2 size={18} className="subagent-icon success" />
              : <AlertCircle size={18} className="subagent-icon error" />
            }
            <Bot size={18} />
            <span id="subagent-modal-title" className="subagent-modal-agent">{result.agent}</span>
            {result.model && <span className="subagent-modal-model">{result.model}</span>}
          </div>

          <div className="subagent-modal-meta">
            {ps && (
              <>
                {ps.durationMs > 0 && (
                  <span className="subagent-meta-item">
                    <Clock size={13} />
                    {formatDuration(ps.durationMs)}
                  </span>
                )}
                {ps.tokens > 0 && (
                  <span className="subagent-meta-item">
                    <Cpu size={13} />
                    {formatTokens(ps.tokens)}
                  </span>
                )}
                {ps.toolCount > 0 && (
                  <span className="subagent-meta-item">
                    <Wrench size={13} />
                    {t('components.subagent.toolsCount', {
                      count: ps.toolCount,
                      defaultValue: '{{count}} tools',
                    })}
                  </span>
                )}
                {result.usage?.turns && (
                  <span className="subagent-meta-item">
                    <Bot size={13} />
                    {t('components.subagent.turnsCount', {
                      count: result.usage.turns,
                      defaultValue: '{{count}} turns',
                    })}
                  </span>
                )}
              </>
            )}
            {result.artifactPaths?.jsonlPath && (
              <span className="subagent-meta-item" title={result.artifactPaths.jsonlPath}>
                <FileText size={13} />
                JSONL
              </span>
            )}
          </div>

          <button
            type="button"
            className="subagent-modal-close"
            onClick={handleClose}
            aria-label={t('components.subagent.close')}
            title={t('components.subagent.close')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="subagent-modal-toolbar">
          <div className="subagent-modal-task-text">
            <span className="subagent-modal-task-label">{t('components.subagent.taskLabel', 'Task')}:</span>
            {result.task}
          </div>
          <div className="subagent-modal-toolbar-actions">
            <button
              type="button"
              className={`subagent-toolbar-btn ${showThinking ? 'active' : ''}`}
              onClick={toggleThinking}
              aria-pressed={showThinking}
              title={showThinking ? t('components.subagent.hideThinking') : t('components.subagent.showThinking')}
            >
              {showThinking ? <Eye size={14} /> : <EyeOff size={14} />}
              <span>{t('components.subagent.thinking')}</span>
            </button>
            <button
              type="button"
              className={`subagent-toolbar-btn ${toolsExpanded ? 'active' : ''}`}
              onClick={toggleToolsExpanded}
              aria-pressed={toolsExpanded}
              title={toolsExpanded ? t('components.subagent.collapseTools') : t('components.subagent.expandTools')}
            >
              <ChevronsUpDown size={14} />
              <span>{t('components.subagent.tools')}</span>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="subagent-modal-content">
          {loading && (
            <div className="subagent-modal-loading-block" role="status" aria-live="polite">
              <div className="subagent-modal-loading">
                <div className="subagent-spinner" />
                {t('components.subagent.loadingSession', 'Loading subagent session…')}
              </div>
              <div className="subagent-modal-skeleton" aria-hidden="true">
                <div className="subagent-skeleton-line wide" />
                <div className="subagent-skeleton-line medium" />
                <div className="subagent-skeleton-line short" />
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="subagent-modal-error" role="alert">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="subagent-modal-empty" role="status">
              {t('components.subagent.noEntries', 'No entries found in subagent session.')}
            </div>
          )}

          {!loading && !error && entries.length > 0 && (
            <>
              <div className="subagent-modal-entries">
                {renderedEntries.map(({ id, node }) => (
                  <div key={id} className="subagent-entry-item">
                    {node}
                  </div>
                ))}
              </div>

              {visibleCount < entries.length && (
                <div className="subagent-modal-render-progress">
                  <div className="subagent-render-progress-text">
                    {t('components.subagent.renderingProgress', {
                      shown: visibleCount,
                      total: entries.length,
                      defaultValue: 'Rendering {{shown}} / {{total}}',
                    })}
                  </div>
                  <div
                    className="subagent-render-progress-bar"
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={entries.length}
                    aria-valuenow={visibleCount}
                  >
                    <span style={{ width: `${progressRatio * 100}%` }} />
                  </div>
                  <button
                    type="button"
                    className="subagent-render-progress-btn"
                    onClick={handleRenderAllNow}
                  >
                    {t('components.subagent.loadAllNow', 'Load all now')}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

function trapFocusWithinSubagentDialog(
  event: KeyboardEvent,
  dialog: HTMLElement | null,
): void {
  if (!dialog) return
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])',
    ),
  )
  if (focusable.length === 0) {
    event.preventDefault()
    dialog.focus()
    return
  }
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  const active = document.activeElement
  if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && active === last) {
    event.preventDefault()
    first.focus()
  }
}

export default function SubagentModal(props: SubagentModalProps) {
  return (
    <SessionViewProvider>
      <SubagentModalContent {...props} />
    </SessionViewProvider>
  )
}
