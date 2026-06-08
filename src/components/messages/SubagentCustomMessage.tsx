import { useMemo, useState } from 'react'
import { Bot, CheckCircle2, AlertCircle, PauseCircle, ChevronRight } from 'lucide-react'

import { formatDate } from '@/utils/format'
import { getCachedSettings } from '@/utils/settingsApi'
import { resolveSubagentCustomMessage } from '@/utils/subagentCustomMessage'
import type { SubagentResult } from '@/types'
import SubagentModal from '@/components/subagent/SubagentModal'

interface SubagentCustomMessageProps {
  customType?: string
  content?: unknown
  details?: unknown
  timestamp?: string
}

export default function SubagentCustomMessage({
  customType,
  content,
  details,
  timestamp,
}: SubagentCustomMessageProps) {
  const [modalOpen, setModalOpen] = useState(false)

  const resolved = useMemo(
    () => resolveSubagentCustomMessage({
      customType,
      content,
      details,
      settings: getCachedSettings().subagents,
    }),
    [content, customType, details],
  )

  const modalResult = useMemo<SubagentResult | null>(() => {
    if (!resolved?.sessionFile) return null
    return {
      agent: resolved.title,
      task: resolved.task || resolved.summary,
      exitCode: resolved.status === 'completed' ? 0 : 1,
      error: resolved.status === 'completed' ? undefined : resolved.summary,
      progressSummary: resolved.durationMs
        ? {
            toolCount: 0,
            tokens: 0,
            durationMs: resolved.durationMs,
          }
        : undefined,
      sessionFile: resolved.sessionFile,
      messages: [],
    }
  }, [resolved])

  if (!resolved) return null

  const clickable = Boolean(modalResult)
  const Wrapper = clickable ? 'button' : 'div'

  return (
    <div className="hook-message">
      {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}
      <Wrapper
        {...(clickable
          ? {
              onClick: () => setModalOpen(true),
              className: 'subagent-result-card w-full text-left',
              type: 'button' as const,
            }
          : {
              className: 'subagent-result-card',
            })}
      >
        <div className="subagent-result-header">
          <span className={`subagent-status-dot ${resolved.status === 'completed' ? 'success' : resolved.status === 'paused' ? 'warning' : 'error'}`} />
          <span className="subagent-agent-name">{resolved.title}</span>
          {resolved.providerBadge && <span className="subagent-mode-badge">{resolved.providerBadge}</span>}
          {clickable && <ChevronRight size={14} className="subagent-chevron" />}
        </div>

        <div className="subagent-meta-row">
          <span className="subagent-meta-item">
            {resolved.status === 'completed'
              ? <CheckCircle2 size={12} />
              : resolved.status === 'paused'
                ? <PauseCircle size={12} />
                : <AlertCircle size={12} />}
            {resolved.status}
          </span>
          {resolved.durationMs != null && (
            <span className="subagent-meta-item">
              <Bot size={12} />
              {resolved.durationMs < 1000 ? `${resolved.durationMs}ms` : `${(resolved.durationMs / 1000).toFixed(1)}s`}
            </span>
          )}
        </div>

        {resolved.task && (
          <div className="subagent-task-preview">{resolved.task}</div>
        )}
        <div className="subagent-management-output whitespace-pre-wrap">{resolved.summary}</div>
      </Wrapper>

      {modalOpen && modalResult && (
        <SubagentModal result={modalResult} onClose={() => setModalOpen(false)} />
      )}
    </div>
  )
}
