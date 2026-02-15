import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { createPortal } from 'react-dom'
import { invoke } from '../transport'
import { X, Bot, Clock, Cpu, Wrench, AlertCircle, CheckCircle2, FileText, Eye, EyeOff, ChevronsUpDown } from 'lucide-react'
import type { SubagentResult, SessionEntry } from '../types'
import { parseSessionEntries } from '../utils/session'
import UserMessage from './UserMessage'
import AssistantMessage from './AssistantMessage'
import Compaction from './Compaction'
import BranchSummary from './BranchSummary'
import CustomMessage from './CustomMessage'
import { SessionViewProvider, useSessionView } from '../contexts/SessionViewContext'
import '../styles/subagent.css'

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

function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1000000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1000000).toFixed(2)}M`
}

// Simple in-memory cache for subagent JSONL content
const jsonlCache = new Map<string, SessionEntry[]>()
const MAX_CACHE = 10

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
 * Try multiple paths to load subagent session entries.
 *
 * Why file paths usually fail:
 *   pi-subagents (upstream) sets DEFAULT_ARTIFACT_CONFIG.includeJsonl = false,
 *   so JSONL artifact files are NOT written by default. The artifactPaths.jsonlPath
 *   in the result is always populated as a "would-be" path, but the file rarely
 *   exists. On top of that, cleanupOldArtifacts() runs on session_start and
 *   removes files older than 7 days, so even the few that were written get purged.
 *
 * Fallback strategy:
 *   1. Try artifactPaths.jsonlPath / sessionFile (works for the rare cases)
 *   2. Fall back to result.messages[] — the inline message array that pi-subagents
 *      always embeds in the toolResult details. This covers ~95% of real sessions.
 *   3. Return [] only when both are empty (failed runs with exitCode != 0).
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

  // 1. Try file paths (almost always missing — see comment above)
  const paths = [
    result.artifactPaths?.jsonlPath,
    result.sessionFile,
  ].filter(Boolean) as string[]

  for (const path of paths) {
    try {
      const content = await invoke<string>('read_session_file', { path })
      if (content?.trim()) {
        const entries = parseSessionEntries(content)
        if (entries.length > 0) return cacheAndReturn(entries)
      }
    } catch { /* file may not exist, try next */ }
  }

  // 2. Fall back to inline messages embedded in the result
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
  const backdropRef = useRef<HTMLDivElement>(null)
  const depthRef = useRef(0)
  const { showThinking, toggleThinking, toolsExpanded, toggleToolsExpanded } = useSessionView()

  // Track depth for z-index
  useEffect(() => {
    modalDepth++
    depthRef.current = modalDepth
    return () => { modalDepth-- }
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
  }, [result])

  const handleClose = useCallback(() => {
    setClosing(true)
    setTimeout(onClose, 150)
  }, [onClose])

  // Capture-phase keyboard handler: intercept Cmd+T / Cmd+O / Escape
  // before they reach SessionViewer's listener on the parent
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        handleClose()
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

  const renderEntry = useCallback((entry: SessionEntry) => {
    switch (entry.type) {
      case 'message':
        if (!entry.message) return null
        const role = entry.message.role

        if (role === 'user') {
          return (
            <UserMessage
              key={entry.id}
              content={entry.message.content}
              timestamp={entry.timestamp}
              id={entry.id}
            />
          )
        } else if (role === 'assistant') {
          return (
            <AssistantMessage
              key={entry.id}
              content={entry.message.content}
              timestamp={entry.timestamp}
              entryId={entry.id}
              entries={entries}
            />
          )
        }
        return null

      case 'compaction':
        return <Compaction key={entry.id} tokensBefore={entry.tokensBefore} summary={entry.summary} />

      case 'branch_summary':
        return <BranchSummary key={entry.id} summary={entry.summary} timestamp={entry.timestamp} />

      case 'custom_message':
        return <CustomMessage key={entry.id} customType={entry.customType} content={entry.content} timestamp={entry.timestamp} />

      default:
        return null
    }
  }, [entries])

  return createPortal(
    <div
      className={`subagent-modal-backdrop ${closing ? 'closing' : ''}`}
      ref={backdropRef}
      onClick={handleBackdropClick}
      style={{ zIndex: 1000 + depthRef.current }}
    >
      <div className="subagent-modal">
        {/* Header */}
        <div className="subagent-modal-header">
          <div className="subagent-modal-title">
            {ok
              ? <CheckCircle2 size={18} className="subagent-icon success" />
              : <AlertCircle size={18} className="subagent-icon error" />
            }
            <Bot size={18} />
            <span className="subagent-modal-agent">{result.agent}</span>
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
                    {ps.toolCount} tools
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

          <button className="subagent-modal-close" onClick={handleClose} title={t('components.subagent.close')}>
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="subagent-modal-toolbar">
          <div className="subagent-modal-task-text">
            <span className="subagent-modal-task-label">Task:</span>
            {result.task}
          </div>
          <div className="subagent-modal-toolbar-actions">
            <button
              className={`subagent-toolbar-btn ${showThinking ? 'active' : ''}`}
              onClick={toggleThinking}
              title={showThinking ? t('components.subagent.hideThinking') : t('components.subagent.showThinking')}
            >
              {showThinking ? <Eye size={14} /> : <EyeOff size={14} />}
              <span>{t('components.subagent.thinking')}</span>
            </button>
            <button
              className={`subagent-toolbar-btn ${toolsExpanded ? 'active' : ''}`}
              onClick={toggleToolsExpanded}
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
            <div className="subagent-modal-loading">
              <div className="subagent-spinner" />
              Loading subagent session…
            </div>
          )}

          {error && !loading && (
            <div className="subagent-modal-error">
              <AlertCircle size={16} />
              {error}
            </div>
          )}

          {!loading && !error && entries.length === 0 && (
            <div className="subagent-modal-empty">No entries found in subagent session.</div>
          )}

          {!loading && !error && entries.length > 0 && (
            <div className="subagent-modal-entries">
              {entries.map(entry => renderEntry(entry))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function SubagentModal(props: SubagentModalProps) {
  return (
    <SessionViewProvider>
      <SubagentModalContent {...props} />
    </SessionViewProvider>
  )
}
