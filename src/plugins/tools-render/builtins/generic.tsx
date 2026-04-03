import { useMemo } from 'react'
import type { Content } from '../../../types'
import type { ToolRenderPlugin, ToolRenderProps, ResolvedToolData } from '../types'
import { defaultResolveData } from '../utils/resolveData'
import MarkdownContent from '../../../components/MarkdownContent'
import { escapeHtml } from '../../../utils/markdown'
import { highlightSearchInHTML } from '../../../utils/search'

/** Maximum height for tool output/arguments in pixels */
const OUTPUT_MAX_HEIGHT = 300

/** Threshold for rendering structured arguments vs raw JSON */
const SMALL_ARGUMENT_FIELD_THRESHOLD = 5

/**
 * Check if value is a plain object (not array, not null)
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Check if value has meaningful content (not empty/null)
 */
function hasMeaningfulValue(value: unknown): boolean {
  if (value == null) return false
  if (typeof value === 'string') return value.length > 0
  if (Array.isArray(value)) return value.length > 0
  if (isPlainObject(value)) return Object.keys(value).length > 0
  return true
}

/**
 * Check if string looks like markdown by examining first characters
 */
function looksLikeMarkdownByFirstChars(value: string): boolean {
  const prefix = value.trimStart().slice(0, 10)
  return /^(#{1,6}\s|>\s|[-*+]\s|```|~~~|\d+\.\s)/.test(prefix)
}

/**
 * Format any value as string (JSON stringify for objects)
 */
function formatToolValue(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

/**
 * Normalize tool arguments (parse JSON string if needed)
 */
function normalizeToolArguments(args: unknown): unknown {
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

/**
 * Generic tool fallback renderer
 * Used when no specific plugin matches the tool
 * Displays arguments and output in a generic format
 */
function GenericToolCall({
  resolvedData,
  searchQuery,
  context,
}: ToolRenderProps) {
  const { name, args: rawArgs, output, isError, entryId } = resolvedData
  const { isExpanded, toggleExpanded } = context

  const args = normalizeToolArguments(rawArgs)
  const argsText = formatToolValue(args)
  const hasArgs = hasMeaningfulValue(args)
  const hasOutput = Boolean(output && output.length > 0)
  const canRenderStructuredArgs =
    isPlainObject(args) &&
    Object.keys(args).length > 0 &&
    Object.keys(args).length <= SMALL_ARGUMENT_FIELD_THRESHOLD

  const highlightedOutput = useMemo(() => {
    if (!output) return ''
    const escapedOutput = escapeHtml(output)
    return searchQuery ? highlightSearchInHTML(escapedOutput, searchQuery) : escapedOutput
  }, [output, searchQuery])

  const getHighlightedArgumentHtml = (value: unknown): string => {
    const escapedValue = escapeHtml(formatToolValue(value))
    return searchQuery ? highlightSearchInHTML(escapedValue, searchQuery) : escapedValue
  }

  return (
    <div className={`tool-execution ${isError ? 'error' : 'success'}`} id={`entry-${entryId}`}>
      <div
        className={`tool-header ${(hasArgs || hasOutput) ? 'cursor-pointer select-none' : ''}`}
        onClick={(hasArgs || hasOutput) ? toggleExpanded : undefined}
      >
        {(hasArgs || hasOutput) && (
          <span className="tool-expand-indicator">
            {isExpanded ? '▾' : '▸'}
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

      {hasArgs && isExpanded && (
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
                          <MarkdownContent content={value} searchQuery={searchQuery} />
                        </div>
                      ) : (
                        <pre>
                          <code dangerouslySetInnerHTML={{ __html: getHighlightedArgumentHtml(value) }} />
                        </pre>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : (
              <pre>
                <code dangerouslySetInnerHTML={{ __html: getHighlightedArgumentHtml(argsText) }} />
              </pre>
            )}
          </div>
        </div>
      )}

      {hasOutput && isExpanded && (
        <div className="tool-output-wrapper">
          <div className="tool-output-header">
            <span className="tool-output-label">Output</span>
          </div>
          <div
            className="tool-output"
            style={{ maxHeight: OUTPUT_MAX_HEIGHT, overflowY: 'auto' }}
          >
            <pre className="whitespace-pre-wrap m-0" dangerouslySetInnerHTML={{ __html: highlightedOutput }} />
          </div>
        </div>
      )}
    </div>
  )
}

/**
 * Generate search segments for generic tool
 * Includes formatted arguments and output
 */
function getGenericSearchSegments(toolCall: Content, resolvedData: ResolvedToolData): string[] {
  const segments: string[] = []

  const normalizedArgs = normalizeToolArguments(resolvedData.args)
  if (normalizedArgs) {
    segments.push(escapeHtml(formatToolValue(normalizedArgs)))
  }

  if (resolvedData.output) {
    segments.push(escapeHtml(resolvedData.output))
  }

  return segments
}

/** Generic tool fallback plugin definition */
export const genericToolPlugin: ToolRenderPlugin = {
  id: 'builtin-generic',
  name: 'Generic Tool',
  match: () => true, // Matches all tools (lowest priority fallback)
  priority: -Infinity, // Lowest priority
  component: GenericToolCall,
  resolveData: defaultResolveData,
  getSearchSegments: getGenericSearchSegments,
  getPreview: (toolCall, data) => {
    return `${data.name}: ${JSON.stringify(data.args).slice(0, 50)}`
  },
}
