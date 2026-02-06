import { useEffect, useMemo, useState } from 'react'
import type { ToolExecution } from '../hooks/usePiRPC'
import { formatDate } from '../utils/format'

interface ToolExecutionCardProps {
  tool: ToolExecution & { timestamp?: string; startedAt?: number; finishedAt?: number }
  timestamp?: string
}

export default function ToolExecutionCard({ tool, timestamp }: ToolExecutionCardProps) {
  const [expanded, setExpanded] = useState(() => tool.status === 'running' || tool.status === 'error')
  const hasArgs = useMemo(() => Object.keys(tool.args || {}).length > 0, [tool.args])
  const hasOutput = useMemo(() => Boolean(tool.partialOutput || tool.result), [tool.partialOutput, tool.result])

  useEffect(() => {
    if (tool.status === 'running' || tool.status === 'error') {
      setExpanded(true)
    }
  }, [tool.status])

  const statusText = useMemo(() => {
    if (tool.status === 'running') return '运行中'
    if (tool.status === 'success') return '已完成'
    return '失败'
  }, [tool.status])

  const durationText = useMemo(() => {
    if (!tool.startedAt) return null
    const endedAt = tool.finishedAt ?? Date.now()
    const duration = Math.max(endedAt - tool.startedAt, 0)
    if (duration < 1000) return `${duration}ms`
    if (duration < 10_000) return `${(duration / 1000).toFixed(1)}s`
    return `${Math.round(duration / 1000)}s`
  }, [tool.startedAt, tool.finishedAt])

  const canToggle = hasArgs || hasOutput || tool.status === 'running'

  return (
    <div className={`tool-execution ${tool.status === 'running' ? 'pending' : tool.status}`}>
      {timestamp && <div className="message-timestamp">{formatDate(timestamp)}</div>}
      <div className="tool-execution-header">
        <div className="tool-title">
          <span className="tool-name">{tool.name}</span>
          <div className="tool-meta">
            {durationText && <span className="tool-duration">{durationText}</span>}
            <span className={`tool-status ${tool.status}`}>{statusText}</span>
          </div>
        </div>
        {canToggle && (
          <button
            type="button"
            className="tool-toggle"
            onClick={() => setExpanded(prev => !prev)}
          >
            {expanded ? '收起' : '展开'}
          </button>
        )}
      </div>
      {expanded && (
        <div className="tool-execution-body">
          {hasArgs && (
            <div className="tool-args">
              <div className="tool-section-title">参数</div>
              <pre>{JSON.stringify(tool.args, null, 2)}</pre>
            </div>
          )}
          {tool.partialOutput && (
            <div className="tool-output">
              <div className="tool-section-title">实时输出</div>
              <pre>{tool.partialOutput}</pre>
            </div>
          )}
          {tool.result && (
            <div className="tool-output">
              <div className="tool-section-title">结果</div>
              <pre>{tool.result}</pre>
            </div>
          )}
          {!hasOutput && tool.status === 'running' && (
            <div className="tool-output tool-output-empty">等待工具输出...</div>
          )}
        </div>
      )}
    </div>
  )
}
