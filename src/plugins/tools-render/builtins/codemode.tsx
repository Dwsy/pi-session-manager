import { useMemo } from 'react'
import type { Content, SessionEntry } from '@/types'
import type {
  ToolRenderPlugin,
  ToolRenderProps,
  BaseToolData,
  ResolvedToolData,
} from '@/plugins/tools-render/types'
import { defaultResolveData } from '@/plugins/tools-render/utils/resolveData'
import {
  getToolExecutionClass,
  getToolRenderStatus,
  getToolStatusLabel,
} from '@/plugins/tools-render/utils/status'
import CodeBlock from '@/components/ui/CodeBlock'
import ToolHeader from '@/components/tool-calls/ToolHeader'
import ToolSectionHeader from '@/components/tool-calls/ToolSectionHeader'
import { Code2 } from 'lucide-react'

/**
 * Codemode tool renderer.
 *
 * Pi's `codemode` tool runs one JavaScript script in a sandbox; the script calls other tools
 * through `tools.<name>(...)`. Those nested calls never reach the model as tool calls, so they
 * live on the tool result instead:
 *
 * - `details.calls[]` — display-ready rows (`{ id, name, args, status, durationMs, error, cost }`).
 * - `message.nestedCalls.calls[]` — the persisted snapshot, used when `details.calls` is missing.
 * - `content[0]` — a `Script completed|failed / Wall time … / Output:` header we strip from the
 *   visible output; the remaining text blocks are the script's own output.
 */

/** Maximum height of the script and output code blocks, in pixels. */
const CODE_MAX_HEIGHT = 420
/** Maximum height of the nested call list, in pixels. */
const CALLS_MAX_HEIGHT = 320
/** Characters of a nested call's arguments kept in the collapsed header row. */
const COLLAPSED_ARGS_CHARS = 90
/** Characters of the script preview shown in the header. */
const SCRIPT_PREVIEW_CHARS = 80

/** `Script completed\nWall time 0.1 seconds\nOutput:\n` (the wall time line is optional). */
const SCRIPT_HEADER = /^Script (completed|failed)\n(?:Wall time ([\d.]+) seconds\n)?Output:\n/

export type CodemodeNestedCallStatus = 'running' | 'ok' | 'error' | 'cancelled'

export interface CodemodeNestedCall {
  id: string
  /** Tool name as the script called it, for example `bash` or `mcp__ologs__get_profile`. */
  name: string
  /** Compact JSON of the arguments. */
  args: string
  status: CodemodeNestedCallStatus
  durationMs?: number
  error?: string
  /** Cost in USD of a `models.*` call that reported usage. */
  cost?: number
}

export interface CodemodeToolData extends BaseToolData {
  /** The script source, including the optional leading `// @options:` line. */
  code: string
  /** Nested tool calls the script made, in call order. */
  calls: CodemodeNestedCall[]
  /** Temp file holding the full output when the script output was truncated. */
  fullOutputPath?: string
  /** Wall-clock time of the script, parsed from the result header. */
  wallTimeMs?: number
  /** Whether the script itself failed (distinct from a nested call failing). */
  scriptFailed: boolean
  /** Summed cost of the nested `models.*` calls that reported usage. */
  totalCost?: number
}

interface CodemodeDetails {
  calls?: Array<{
    id?: string
    name?: string
    args?: string
    status?: string
    durationMs?: number
    error?: string
    cost?: number
  }>
  fullOutputPath?: string
}

interface NestedCallSnapshot {
  calls?: Array<{
    id?: string
    name?: string
    status?: string
    arguments?: unknown
    durationMs?: number
  }>
}

function normalizeStatus(status: string | undefined): CodemodeNestedCallStatus {
  switch (status) {
    case 'ok':
    case 'error':
    case 'cancelled':
      return status
    default:
      // `unfinished` and anything unknown: the script ended while the call was in flight.
      return 'running'
  }
}

function toNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

/**
 * Nested calls of one result. `details.calls` is the display-ready record; the persisted
 * `nestedCalls` snapshot is the fallback for results that predate it or dropped it.
 */
function resolveCalls(
  details: CodemodeDetails | undefined,
  nested: NestedCallSnapshot | undefined,
): CodemodeNestedCall[] {
  const fromDetails = (details?.calls ?? []).map((call, index) => ({
    id: call.id ?? `${index}`,
    name: call.name ?? 'unknown',
    args: call.args ?? '',
    status: normalizeStatus(call.status),
    durationMs: toNumber(call.durationMs),
    error: call.error,
    cost: toNumber(call.cost),
  }))

  if (fromDetails.length > 0) {
    return fromDetails
  }

  return (nested?.calls ?? []).map((call, index) => ({
    id: call.id ?? `${index}`,
    name: call.name ?? 'unknown',
    args: call.arguments === undefined ? '' : safeStringify(call.arguments),
    status: normalizeStatus(call.status),
    durationMs: toNumber(call.durationMs),
  }))
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return ''
  }
}

/** Strip the `Script completed … Output:` header and join the remaining text blocks. */
function resolveScriptOutput(
  content: Array<{ type?: string; text?: string }> | undefined,
): { output: string; wallTimeMs?: number; scriptFailed: boolean } {
  const blocks = (content ?? []).filter(
    (block): block is { type?: string; text?: string } => Boolean(block),
  )
  const first = blocks[0]
  const header = first?.type === 'text' ? SCRIPT_HEADER.exec(first.text ?? '') : null
  const rest = header ? blocks.slice(1) : blocks

  const output = rest
    .filter((block) => block.type === 'text' || block.type === undefined)
    .map((block) => (block.text ?? '').replace(/\r/g, ''))
    .join('\n')

  return {
    output,
    wallTimeMs: header?.[2] ? Number(header[2]) * 1000 : undefined,
    scriptFailed: header?.[1] === 'failed',
  }
}

/** First line of real code, used as the collapsed header preview. */
export function buildScriptPreview(code: string): string {
  const lines = code.replace(/\r/g, '').split('\n')
  const firstCodeLine =
    lines.find((line) => line.trim() && !line.trim().startsWith('//')) ??
    lines.find((line) => line.trim())

  if (!firstCodeLine) return ''

  const preview = firstCodeLine.trim()
  return preview.length > SCRIPT_PREVIEW_CHARS
    ? `${preview.slice(0, SCRIPT_PREVIEW_CHARS - 1)}…`
    : preview
}

export function formatDuration(ms: number | undefined): string {
  if (ms === undefined) return ''
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

/** Cents for larger amounts, two significant digits for the fractions of a cent model calls cost. */
export function formatCost(cost: number): string {
  return `$${cost >= 0.01 ? cost.toFixed(2) : cost.toPrecision(2)}`
}

/** Plain-text rendering of the nested calls, used for copy and search. */
export function formatCallsText(calls: CodemodeNestedCall[]): string {
  return calls
    .map((call) => {
      const parts = [`${call.status} ${call.name}`]
      if (call.args) parts.push(call.args)
      const duration = formatDuration(call.durationMs)
      if (duration) parts.push(duration)
      if (call.cost) parts.push(formatCost(call.cost))
      if (call.error) parts.push(`\n    ${call.error}`)
      return parts.join(' ')
    })
    .join('\n')
}

const STATUS_ICON: Record<CodemodeNestedCallStatus, string> = {
  running: '…',
  ok: '✓',
  error: '✗',
  cancelled: '⊘',
}

/** Cheap language hint so JSON output renders highlighted instead of plain text. */
function detectOutputLanguage(output: string): string | undefined {
  const trimmed = output.trim()
  if (!/^[[{]/.test(trimmed) || !/[\]}]$/.test(trimmed)) return undefined
  try {
    JSON.parse(trimmed)
    return 'json'
  } catch {
    return undefined
  }
}

/**
 * Resolve a codemode call into render data.
 * Falls back to the generic resolver for the shared fields, then adds the script, the nested
 * calls and the header-stripped output.
 */
export function resolveCodemodeData(
  toolCall: Content,
  index: number,
  toolResultByCallId: Map<string, SessionEntry>,
): CodemodeToolData {
  const base = defaultResolveData(toolCall, index, toolResultByCallId)
  const args = (toolCall.arguments ?? {}) as { code?: unknown }
  const code = typeof args.code === 'string' ? args.code : ''

  const result = base.result
  const details = result?.message?.details as CodemodeDetails | undefined
  const nested = (result?.message as { nestedCalls?: NestedCallSnapshot } | undefined)?.nestedCalls
  const script = resolveScriptOutput(
    result?.message?.content as Array<{ type?: string; text?: string }> | undefined,
  )

  const calls = resolveCalls(details, nested)
  const priced = calls.filter((call) => call.cost)
  const totalCost = priced.length > 0 ? priced.reduce((sum, call) => sum + (call.cost ?? 0), 0) : undefined

  return {
    ...base,
    // A script that reports its own failure is an error even when the message flag is missing.
    isError: base.isError || script.scriptFailed,
    output: script.output,
    code,
    calls,
    fullOutputPath: details?.fullOutputPath,
    wallTimeMs: script.wallTimeMs,
    scriptFailed: script.scriptFailed,
    totalCost,
  }
}

/** The registry hands every renderer the shared shape; `resolveCodemodeData` fills the extras. */
function asCodemodeData(data: ResolvedToolData): CodemodeToolData {
  return data as CodemodeToolData
}

function CodemodeExecution({ resolvedData, searchQuery, context }: ToolRenderProps) {
  const data = asCodemodeData(resolvedData)
  const { code, calls, output, entryId } = data
  const { isExpanded, toggleExpanded, copyToClipboard, disableSuccessStyle, t } = context
  const status = getToolRenderStatus(data)

  const scriptPreview = useMemo(() => buildScriptPreview(code), [code])
  const wallTime = formatDuration(data.wallTimeMs)
  const expandable = Boolean(code || output || calls.length > 0)

  const callCountLabel = `${calls.length} ${t('components.toolCall.calls', 'calls')}`

  return (
    <div
      className={`tool-execution ${getToolExecutionClass(data, disableSuccessStyle)}`.trim()}
      id={`entry-${entryId}`}
    >
      <ToolHeader
        className="tool-header-codemode"
        expandable={expandable}
        expanded={isExpanded}
        onToggle={toggleExpanded}
        ariaLabel={`codemode: ${getToolStatusLabel(status, t)}`}
      >
        {expandable && (
          <span className="tool-expand-indicator">{isExpanded ? '▾' : '▸'}</span>
        )}
        <span className="tool-name">
          <Code2 className="tool-icon codemode-icon" aria-hidden="true" />
          codemode
        </span>
        {scriptPreview && (
          <span className="codemode-script-preview" title={code}>
            {scriptPreview}
          </span>
        )}
        {calls.length > 0 && (
          <span className="tool-detail codemode-call-count">{callCountLabel}</span>
        )}
        {wallTime && <span className="tool-detail codemode-wall-time">{wallTime}</span>}
        <span className={`tool-status tool-status-${status}`}>{getToolStatusLabel(status, t)}</span>
      </ToolHeader>

      {isExpanded && (
        <>
          {code && (
            <div className="tool-command-detail">
              <ToolSectionHeader
                label={t('components.toolCall.script', 'Script')}
                text={code}
                copyText={copyToClipboard}
              />
              <CodeBlock
                code={code}
                language="javascript"
                showLineNumbers={true}
                scrollable
                maxHeight={CODE_MAX_HEIGHT}
                searchQuery={searchQuery}
              />
            </div>
          )}

          {calls.length > 0 && (
            <div className="tool-output-wrapper collapsible expanded">
              <div className="tool-expand-content expanded">
                <ToolSectionHeader
                  label={t('components.toolCall.nestedCalls', 'Nested calls')}
                  text={formatCallsText(calls)}
                  copyText={copyToClipboard}
                />
                <div
                  className="codemode-calls"
                  style={{ maxHeight: CALLS_MAX_HEIGHT, overflowY: 'auto' }}
                >
                  {calls.map((call) => (
                    <div key={call.id} className={`codemode-call codemode-call-${call.status}`}>
                      <span className="codemode-call-status" aria-hidden="true">
                        {STATUS_ICON[call.status]}
                      </span>
                      <span className="codemode-call-name">{call.name}</span>
                      {call.args && (
                        <span className="codemode-call-args" title={call.args}>
                          {call.args.length > COLLAPSED_ARGS_CHARS
                            ? `${call.args.slice(0, COLLAPSED_ARGS_CHARS - 1)}…`
                            : call.args}
                        </span>
                      )}
                      {formatDuration(call.durationMs) && (
                        <span className="codemode-call-duration">
                          {formatDuration(call.durationMs)}
                        </span>
                      )}
                      {call.cost ? (
                        <span className="codemode-call-cost">{formatCost(call.cost)}</span>
                      ) : null}
                      {call.error ? (
                        <pre className="codemode-call-error">{call.error}</pre>
                      ) : null}
                    </div>
                  ))}
                </div>
                {data.totalCost !== undefined && (
                  <div className="codemode-calls-total">
                    {t('components.toolCall.modelCalls', 'Model calls')}: {formatCost(data.totalCost)}
                  </div>
                )}
              </div>
            </div>
          )}

          {output && (
            <div className="tool-output-wrapper collapsible expanded">
              <div className="tool-expand-content expanded">
                <ToolSectionHeader
                  label={t('components.toolCall.output', 'Output')}
                  text={output}
                  copyText={copyToClipboard}
                />
                <CodeBlock
                  code={output}
                  language={detectOutputLanguage(output)}
                  showLineNumbers={true}
                  scrollable
                  maxHeight={CODE_MAX_HEIGHT}
                  searchQuery={searchQuery}
                />
              </div>
            </div>
          )}

          {data.fullOutputPath && (
            <div className="codemode-full-output">
              {t('components.toolCall.fullOutput', 'Full output')}: {data.fullOutputPath}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function getCodemodeSearchSegments(_toolCall: Content, resolvedData: ResolvedToolData): string[] {
  const data = asCodemodeData(resolvedData)
  const segments: string[] = []
  if (data.code) segments.push(data.code)
  if (data.calls.length > 0) segments.push(formatCallsText(data.calls))
  if (data.output) segments.push(data.output)
  return segments
}

/** Codemode tool render plugin definition */
export const codemodeToolPlugin: ToolRenderPlugin = {
  id: 'builtin-codemode',
  name: 'Codemode',
  description: 'Runs a JavaScript script that orchestrates nested tool calls',
  match: 'codemode',
  priority: 100,
  component: CodemodeExecution,
  resolveData: resolveCodemodeData,
  getSearchSegments: getCodemodeSearchSegments,
  getPreview: (_toolCall, resolvedData) => {
    const data = asCodemodeData(resolvedData)
    const calls = data.calls.length
    const preview = buildScriptPreview(data.code)
    const summary = calls > 0 ? `${calls} calls` : 'script'
    return preview ? `codemode · ${summary} · ${preview}` : `codemode · ${summary}`
  },
}
