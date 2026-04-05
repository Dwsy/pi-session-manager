import { useState } from 'react'
import { Bot, Clock, Cpu, Wrench, AlertCircle, CheckCircle2, ChevronRight, Users, Link2, Loader2 } from 'lucide-react'
import type { Content } from '../../../types'
import type { SubagentDetails, SubagentResult, TintinwebAgentDetails } from '../../../types'
import type { ToolRenderPlugin, ToolRenderProps, ResolvedToolData } from '../types'
import { defaultResolveData } from '../utils/resolveData'
import { escapeHtml } from '../../../utils/markdown'
import { highlightSearchInHTML } from '../../../utils/search'
import SubagentModal from '../../../components/tool-calls/SubagentModal'
import '../../../styles/subagent.css'

/** Maximum length for error preview text */
const SUBAGENT_ERROR_PREVIEW_LIMIT = 80

/** Maximum length for task preview text */
const SUBAGENT_TASK_PREVIEW_LIMIT = 120

/**
 * Format duration in milliseconds to human readable string
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}m${secs}s`
}

/**
 * Format token count with k/M suffix
 */
function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1000000) return `${(n / 1000).toFixed(1)}k`
  return `${(n / 1000000).toFixed(2)}M`
}

/**
 * Format turn count with optional max turns
 */
function formatTurns(n: number, maxTurns?: number): string {
  return maxTurns != null ? `⟳${n}≤${maxTurns}` : `⟳${n}`
}

/**
 * Check if subagent result is successful (exitCode === 0)
 */
function isResultOk(r: SubagentResult): boolean {
  return r.exitCode === 0
}

/**
 * Type guard: check if details is @tintinweb format (single agent)
 * @tintinweb format has 'status' and 'displayName', our format has 'mode' and 'results'
 */
function isTintinwebDetails(details?: SubagentDetails | TintinwebAgentDetails): details is TintinwebAgentDetails {
  if (!details) return false
  return 'status' in details && 'displayName' in details && !('mode' in details)
}

/**
 * Get highlighted HTML for plain text (escapes and highlights)
 */
function getHighlightedPlainTextHtml(text: string, searchQuery: string): string {
  const escapedText = escapeHtml(text)
  return searchQuery ? highlightSearchInHTML(escapedText, searchQuery) : escapedText
}

/**
 * Card component for @tintinweb format subagent results
 */
function TintinwebResultCard({
  details,
  searchQuery,
  onOpenDetails,
}: {
  details: TintinwebAgentDetails
  searchQuery: string
  onOpenDetails?: () => void
}) {
  const isError = details.status === 'error' || details.status === 'aborted' || details.status === 'stopped'
  const isCompleted = details.status === 'completed' || details.status === 'steered'
  const ok = isCompleted && !isError

  return (
    <button className="subagent-result-card" onClick={onOpenDetails}>
      <div className="subagent-result-header">
        <span className={`subagent-status-dot ${ok ? 'success' : isError ? 'error' : 'warning'}`} />
        <span
          className="subagent-agent-name"
          dangerouslySetInnerHTML={{ __html: getHighlightedPlainTextHtml(details.displayName, searchQuery) }}
        />
        {details.modelName && (
          <span
            className="subagent-model"
            dangerouslySetInnerHTML={{ __html: getHighlightedPlainTextHtml(details.modelName, searchQuery) }}
          />
        )}
        <ChevronRight size={14} className="subagent-chevron" />
      </div>

      <div className="subagent-meta-row">
        {details.turnCount != null && details.turnCount > 0 && (
          <span className="subagent-meta-item">
            <Bot size={12} />
            {formatTurns(details.turnCount, details.maxTurns)}
          </span>
        )}
        {details.toolUses > 0 && (
          <span className="subagent-meta-item">
            <Wrench size={12} />
            {details.toolUses}
          </span>
        )}
        {details.tokens && (
          <span className="subagent-meta-item">
            <Cpu size={12} />
            {details.tokens}
          </span>
        )}
        {details.durationMs > 0 && (
          <span className="subagent-meta-item">
            <Clock size={12} />
            {formatDuration(details.durationMs)}
          </span>
        )}
      </div>

      {details.error && (
        <div className="subagent-error-hint">
          <AlertCircle size={12} />
          <span dangerouslySetInnerHTML={{ __html: getHighlightedPlainTextHtml(details.error, searchQuery) }} />
        </div>
      )}

      {details.activity && (
        <div className="subagent-task-preview">
          <span dangerouslySetInnerHTML={{ __html: getHighlightedPlainTextHtml(details.activity, searchQuery) }} />
        </div>
      )}
    </button>
  )
}

/**
 * Card component for our format subagent results
 */
function ResultCard({
  result,
  onClick,
  searchQuery,
}: {
  result: SubagentResult
  onClick: () => void
  searchQuery: string
}) {
  const ok = isResultOk(result)
  const ps = result.progressSummary

  return (
    <button className="subagent-result-card" onClick={onClick}>
      <div className="subagent-result-header">
        <span className={`subagent-status-dot ${ok ? 'success' : 'error'}`} />
        <span
          className="subagent-agent-name"
          dangerouslySetInnerHTML={{ __html: getHighlightedPlainTextHtml(result.agent, searchQuery) }}
        />
        {result.model && (
          <span
            className="subagent-model"
            dangerouslySetInnerHTML={{ __html: getHighlightedPlainTextHtml(result.model, searchQuery) }}
          />
        )}
        <ChevronRight size={14} className="subagent-chevron" />
      </div>

      {ps && (
        <div className="subagent-meta-row">
          {ps.durationMs > 0 && (
            <span className="subagent-meta-item">
              <Clock size={12} />
              {formatDuration(ps.durationMs)}
            </span>
          )}
          {ps.tokens > 0 && (
            <span className="subagent-meta-item">
              <Cpu size={12} />
              {formatTokens(ps.tokens)}
            </span>
          )}
          {ps.toolCount > 0 && (
            <span className="subagent-meta-item">
              <Wrench size={12} />
              {ps.toolCount} tools
            </span>
          )}
          {result.usage?.turns && (
            <span className="subagent-meta-item">
              <Bot size={12} />
              {formatTurns(result.usage.turns)}
            </span>
          )}
        </div>
      )}

      {result.error && (
        <div className="subagent-error-hint">
          <AlertCircle size={12} />
          <span>{result.error.slice(0, SUBAGENT_ERROR_PREVIEW_LIMIT)}</span>
        </div>
      )}

      <div className="subagent-task-preview">
        {result.task.slice(0, SUBAGENT_TASK_PREVIEW_LIMIT)}
      </div>
    </button>
  )
}

/**
 * Subagent tool renderer
 * Supports both our format and @tintinweb/pi-subagents format
 */
function SubagentToolCall({
  resolvedData,
  searchQuery,
}: ToolRenderProps) {
  const [modalResult, setModalResult] = useState<SubagentResult | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  const { args, result, output, entryId } = resolvedData
  const details = result?.message?.details as SubagentDetails | TintinwebAgentDetails | undefined

  // @tintinweb format: single agent with status
  if (isTintinwebDetails(details)) {
    const resultForModal: SubagentResult = {
      agent: details.subagentType,
      task: details.description,
      exitCode: details.status === 'completed' || details.status === 'steered' ? 0 : 1,
      model: details.modelName,
      error: details.error,
      usage: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        cost: 0,
        turns: details.turnCount || 0,
      },
      progressSummary: {
        toolCount: details.toolUses,
        tokens: parseInt(details.tokens.replace(/[^0-9.]/g, '')) || 0,
        durationMs: details.durationMs,
      },
      messages: output ? [{ role: 'assistant', content: [{ type: 'text', text: output }] }] : [],
    }

    return (
      <>
        <div className="subagent-tool-call" id={entryId ? `entry-${entryId}` : undefined}>
          <div className="subagent-header">
            <div className="subagent-title">
              {details.status === 'completed' || details.status === 'steered'
                ? <CheckCircle2 size={16} className="subagent-icon success" />
                : details.status === 'error' || details.status === 'aborted'
                  ? <AlertCircle size={16} className="subagent-icon error" />
                  : details.status === 'running' || details.status === 'queued'
                    ? <Loader2 size={16} className="subagent-icon spinning" />
                    : <Bot size={16} />
              }
              <span className="subagent-label">{details.displayName}</span>
              <span className="subagent-mode-badge">{details.subagentType}</span>
            </div>
          </div>

          <div className="subagent-results-grid">
            <TintinwebResultCard
              details={details}
              searchQuery={searchQuery || ''}
              onOpenDetails={() => {
                setModalResult(resultForModal)
                setModalOpen(true)
              }}
            />
          </div>
        </div>

        {modalOpen && modalResult && (
          <SubagentModal result={modalResult} onClose={() => setModalOpen(false)} />
        )}
      </>
    )
  }

  // Management mode or pending state (no results yet)
  if (!details || details.mode === 'management' || !details.results?.length) {
    const agentName = args?.agent || args?.tasks?.[0]?.agent
    const taskText = args?.task || args?.tasks?.[0]?.task || ''
    const isPending = !details && !output && agentName

    return (
      <div
        className={`subagent-tool-call ${isPending ? 'subagent-pending' : ''}`}
        id={entryId ? `entry-${entryId}` : undefined}
      >
        <div className="subagent-header">
          <div className="subagent-title">
            {isPending ? <Loader2 size={16} className="subagent-icon spinning" /> : <Bot size={16} />}
            <span className="subagent-label">Subagent</span>
            {args?.action && <span className="subagent-mode-badge">{args.action}</span>}
            {agentName && !args?.action && <span className="subagent-mode-badge">{agentName}</span>}
          </div>
        </div>
        {isPending && taskText && (
          <div className="subagent-task-preview" style={{ padding: '0 0 4px' }}>
            {taskText.length > 200 ? taskText.slice(0, 200) + '…' : taskText}
          </div>
        )}
        {output && (
          <div className="subagent-management-output whitespace-pre-wrap">{output}</div>
        )}
      </div>
    )
  }

  // Our format: multiple agents with mode (single/parallel/chain)
  const results = details.results
  const mode = details.mode
  const modeLabel = mode === 'parallel' ? 'Parallel' : mode === 'chain' ? 'Chain' : 'Single'
  const allOk = results.every(isResultOk)

  return (
    <>
      <div className="subagent-tool-call" id={entryId ? `entry-${entryId}` : undefined}>
        <div className="subagent-header">
          <div className="subagent-title">
            {allOk
              ? <CheckCircle2 size={16} className="subagent-icon success" />
              : <AlertCircle size={16} className="subagent-icon error" />
            }
            <span className="subagent-label">Subagent</span>
            <span className="subagent-mode-badge">
              {mode === 'parallel' && <Users size={12} />}
              {mode === 'chain' && <Link2 size={12} />}
              {modeLabel}
              {results.length > 1 && ` × ${results.length}`}
            </span>
          </div>
        </div>

        <div className="subagent-results-grid">
          {results.map((result, i) => (
            <ResultCard
              key={`${result.agent}-${i}`}
              result={result}
              onClick={() => setModalResult(result)}
              searchQuery={searchQuery || ''}
            />
          ))}
        </div>
      </div>

      {modalResult && modalOpen && (
        <SubagentModal result={modalResult} onClose={() => setModalOpen(false)} />
      )}
    </>
  )
}

/**
 * Generate search segments for subagent tool
 * Includes output and result metadata
 */
function getSubagentSearchSegments(_toolCall: Content, resolvedData: ResolvedToolData): string[] {
  const segments: string[] = []

  if (resolvedData.output) {
    segments.push(escapeHtml(resolvedData.output))
  }

  const details = resolvedData.result?.message?.details as { results?: Array<{ agent: string; task: string }> } | undefined
  if (details?.results) {
    details.results.forEach(r => {
      segments.push(escapeHtml(r.agent))
      segments.push(escapeHtml(r.task))
    })
  }

  return segments
}

/** Subagent tool render plugin definition */
export const subagentToolPlugin: ToolRenderPlugin = {
  id: 'builtin-subagent',
  name: 'Subagent',
  match: /^(Agent|subagent)$/,  // Matches 'Agent' or 'subagent'
  priority: 100,
  component: SubagentToolCall,
  resolveData: defaultResolveData,
  getSearchSegments: getSubagentSearchSegments,
  getPreview: (_toolCall, data) => {
    const agent = data.args?.agent || 'Subagent'
    return `${agent}: ${data.args?.task?.slice(0, 50) || ''}`
  },
}
