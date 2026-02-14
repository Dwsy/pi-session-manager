import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot, Clock, Cpu, Wrench, AlertCircle, CheckCircle2, ChevronRight, Users, Link2, Loader2 } from 'lucide-react'
import type { SubagentDetails, SubagentResult } from '../types'
import SubagentModal from './SubagentModal'
import { formatDate } from '../utils/format'
import '../styles/subagent.css'

interface SubagentToolCallProps {
  arguments?: Record<string, any>
  details?: SubagentDetails
  output?: string
  timestamp?: string
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

/** exitCode === 0 is the ground truth for success; "terminated" is a normal exit signal */
function isResultOk(r: SubagentResult): boolean {
  return r.exitCode === 0
}

/** Only show error text if it's a real failure, not just "terminated" */
function getDisplayError(r: SubagentResult): string | null {
  if (r.exitCode === 0) return null
  return r.error || null
}

function ResultCard({ result, onClick }: { result: SubagentResult; onClick: () => void }) {
  const { t } = useTranslation()
  const ok = isResultOk(result)
  const ps = result.progressSummary
  const displayError = getDisplayError(result)

  return (
    <button
      className="subagent-result-card"
      onClick={onClick}
      title={t('components.subagent.clickToView')}
    >
      <div className="subagent-result-header">
        <span className={`subagent-status-dot ${ok ? 'success' : 'error'}`} />
        <span className="subagent-agent-name">{result.agent}</span>
        {result.model && <span className="subagent-model">{result.model}</span>}
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
        </div>
      )}

      {displayError && (
        <div className="subagent-error-hint">
          <AlertCircle size={12} />
          <span>{displayError.length > 80 ? displayError.slice(0, 80) + '…' : displayError}</span>
        </div>
      )}

      <div className="subagent-task-preview">
        {result.task.length > 120 ? result.task.slice(0, 120) + '…' : result.task}
      </div>
    </button>
  )
}

export default function SubagentToolCall({ arguments: args, details, output, timestamp }: SubagentToolCallProps) {
  const [modalResult, setModalResult] = useState<SubagentResult | null>(null)

  // Management actions (list, get, etc.) or pending — show simple view with subagent styling
  if (!details || details.mode === 'management' || !details.results?.length) {
    const agentName = args?.agent || (args?.tasks?.[0]?.agent)
    const taskText = args?.task || (args?.tasks?.[0]?.task) || ''
    const isPending = !details && !output && agentName

    return (
      <div className={`subagent-tool-call ${isPending ? 'subagent-pending' : ''}`}>
        {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}
        <div className="subagent-header">
          <div className="subagent-title">
            {isPending
              ? <Loader2 size={16} className="subagent-icon spinning" />
              : <Bot size={16} />
            }
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
          <div className="subagent-management-output">
            {output.split('\n').map((line, i) => <div key={i}>{line}</div>)}
          </div>
        )}
      </div>
    )
  }

  const results = details.results
  const mode = details.mode
  const modeLabel = mode === 'parallel' ? 'Parallel' : mode === 'chain' ? 'Chain' : 'Single'
  const allOk = results.every(isResultOk)

  return (
    <>
      <div className="subagent-tool-call">
        {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}
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
            />
          ))}
        </div>
      </div>

      {modalResult && (
        <SubagentModal
          result={modalResult}
          onClose={() => setModalResult(null)}
        />
      )}
    </>
  )
}
