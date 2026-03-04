import { useSessionView } from '../contexts/SessionViewContext'
import MarkdownContent from './MarkdownContent'

interface GenericToolCallProps {
  name: string
  arguments?: unknown
  output?: string
  isError?: boolean
  entryId: string
}

const OUTPUT_MAX_HEIGHT = 300
const SMALL_ARGUMENT_FIELD_THRESHOLD = 5

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeArguments(args: unknown): unknown {
  if (typeof args !== 'string') return args

  const trimmed = args.trim()
  if (!trimmed) return args

  const looksLikeJson =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))

  if (!looksLikeJson) return args

  try {
    return JSON.parse(trimmed)
  } catch {
    return args
  }
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.length > 0
  if (Array.isArray(value)) return value.length > 0
  if (isPlainObject(value)) return Object.keys(value).length > 0
  return true
}

function looksLikeMarkdownByFirstChars(value: string): boolean {
  const prefix = value.trimStart().slice(0, 10)
  return /^(#{1,6}\s|>\s|[-*+]\s|```|~~~|\d+\.\s)/.test(prefix)
}

export default function GenericToolCall({
  name,
  arguments: rawArgs,
  output,
  isError = false,
  entryId,
}: GenericToolCallProps) {
  const { isToolExpanded, toggleToolExpanded } = useSessionView()
  const expanded = isToolExpanded(entryId)

  const statusClass = isError ? 'error' : 'success'

  const args = normalizeArguments(rawArgs)
  const argsText = formatValue(args)
  const hasArgs = hasMeaningfulValue(args)
  const hasOutput = Boolean(output && output.length > 0)
  const canRenderStructuredArgs =
    isPlainObject(args) &&
    Object.keys(args).length > 0 &&
    Object.keys(args).length <= SMALL_ARGUMENT_FIELD_THRESHOLD

  return (
    <div className={`tool-execution ${statusClass}`} id={`entry-${entryId}`}>
      <div
        className={`tool-header ${(hasArgs || hasOutput) ? 'cursor-pointer select-none' : ''}`}
        onClick={(hasArgs || hasOutput) ? () => toggleToolExpanded(entryId) : undefined}
      >
        {(hasArgs || hasOutput) && (
          <span className="tool-expand-indicator">
            {expanded ? '▾' : '▸'}
          </span>
        )}
        <span className="tool-name">
          <svg className="tool-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {name}
        </span>
      </div>

      {hasArgs && expanded && (
        <div className="tool-output-wrapper">
          <div className="tool-output-header">
            <span className="tool-output-label">Arguments</span>
          </div>
          <div
            className="tool-arguments"
            style={{ maxHeight: OUTPUT_MAX_HEIGHT, overflowY: 'auto', margin: 0 }}
          >
            {canRenderStructuredArgs ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {Object.entries(args).map(([key, value]) => {
                  const shouldRenderMarkdown = typeof value === 'string' && looksLikeMarkdownByFirstChars(value)

                  return (
                    <div key={key}>
                      <div className="tool-arguments-title" style={{ marginBottom: 6, textTransform: 'none' }}>
                        {key}
                      </div>
                      {shouldRenderMarkdown ? (
                        <div style={{ fontFamily: 'var(--font-family, inherit)' }}>
                          <MarkdownContent content={value} />
                        </div>
                      ) : (
                        <pre><code>{formatValue(value)}</code></pre>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <pre><code>{argsText}</code></pre>
            )}
          </div>
        </div>
      )}

      {hasOutput && expanded && (
        <div className="tool-output-wrapper">
          <div className="tool-output-header">
            <span className="tool-output-label">Output</span>
          </div>
          <div
            className="tool-output"
            style={{ maxHeight: OUTPUT_MAX_HEIGHT, overflowY: 'auto' }}
          >
            {output!.split('\n').map((line, idx) => (
              <div key={idx}>{line}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
