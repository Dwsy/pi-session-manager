import { FilePenLine, FileText, PlusSquare, Terminal, Wrench } from 'lucide-react'
import type {
  PsmPluginHostContext,
  PsmToolCallContent,
  PsmToolRendererRegistration,
  PsmToolRenderProps,
  PsmToolResolvedData,
  PsmToolResultEntry,
} from '@pi-session-manager/plugin-sdk'
import { escapeHtml } from '@/utils/markdown'
import { highlightSearchInHTML } from '@/utils/search'
import { manifest } from './manifest'

type CrossAgentKind = 'shell' | 'read' | 'write' | 'edit' | 'generic'

const SHELL_TOOLS = new Set(['Bash', 'bash', 'shell', 'exec'])
const READ_TOOLS = new Set(['Read', 'read_file'])
const WRITE_TOOLS = new Set(['Write', 'write_file'])
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'edit_file', 'apply_patch'])
const CROSS_AGENT_TOOLS = new Set([
  ...SHELL_TOOLS,
  ...READ_TOOLS,
  ...WRITE_TOOLS,
  ...EDIT_TOOLS,
])

function normalizeArgs(args: unknown): Record<string, unknown> {
  if (typeof args === 'string') {
    const trimmed = args.trim()
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>
        }
      } catch {
        return { value: args }
      }
    }
    return { value: args }
  }
  if (args && typeof args === 'object' && !Array.isArray(args)) {
    return args as Record<string, unknown>
  }
  return {}
}

function getStringArg(args: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = args[key]
    if (typeof value === 'string' && value.trim()) return value
  }
  return ''
}

function getKind(name: string): CrossAgentKind {
  if (SHELL_TOOLS.has(name)) return 'shell'
  if (READ_TOOLS.has(name)) return 'read'
  if (WRITE_TOOLS.has(name)) return 'write'
  if (EDIT_TOOLS.has(name)) return 'edit'
  return 'generic'
}

function getTitle(kind: CrossAgentKind, name: string): string {
  if (kind === 'shell') return 'Shell'
  if (kind === 'read') return 'Read'
  if (kind === 'write') return 'Write'
  if (kind === 'edit') return name === 'apply_patch' ? 'Patch' : 'Edit'
  return name || 'Tool'
}

function getPrimaryText(kind: CrossAgentKind, args: Record<string, unknown>, name: string): string {
  if (kind === 'shell') return getStringArg(args, 'command', 'cmd', 'script') || name
  if (kind === 'read') return getStringArg(args, 'file_path', 'path', 'absolute_path') || name
  if (kind === 'write') return getStringArg(args, 'file_path', 'path', 'absolute_path') || name
  if (kind === 'edit') return getStringArg(args, 'file_path', 'path', 'absolute_path') || name
  return name
}

function formatArgs(args: Record<string, unknown>): string {
  try {
    return JSON.stringify(args, null, 2)
  } catch {
    return String(args)
  }
}

function highlighted(value: string, searchQuery?: string) {
  const escaped = escapeHtml(value)
  return searchQuery ? highlightSearchInHTML(escaped, searchQuery) : escaped
}

function CrossAgentToolRenderer({ resolvedData, searchQuery, context }: PsmToolRenderProps) {
  const { name, output, isError, entryId } = resolvedData
  const args = normalizeArgs(resolvedData.args)
  const kind = getKind(name)
  const title = getTitle(kind, name)
  const primaryText = getPrimaryText(kind, args, name)
  const argsText = formatArgs(args)
  const hasArgs = Object.keys(args).length > 0
  const hasDetails = hasArgs || Boolean(output)
  const statusClass = isError ? 'error' : context.disableSuccessStyle ? '' : 'success'
  const Icon =
    kind === 'shell'
      ? Terminal
      : kind === 'read'
        ? FileText
        : kind === 'write'
          ? PlusSquare
          : kind === 'edit'
            ? FilePenLine
            : Wrench

  return (
    <div className={`tool-execution ${statusClass}`.trim()} id={`entry-${entryId}`}>
      <div
        className={`tool-header ${hasDetails ? 'select-none' : ''}`}
        onClick={hasDetails ? context.toggleExpanded : undefined}
      >
        {hasDetails && <span className="tool-expand-indicator">{context.isExpanded ? '▾' : '▸'}</span>}
        <span className="tool-name inline-flex items-center gap-1.5">
          <Icon className="h-4 w-4" />
          {title}
        </span>
        <span className="tool-path" title={primaryText}>
          {primaryText}
        </span>
      </div>

      {hasDetails && (
        <div className={`tool-output-wrapper collapsible ${context.isExpanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${context.isExpanded ? 'expanded' : ''}`}>
            {context.isExpanded && (
              <div className="space-y-3 p-3 text-sm">
                {hasArgs && (
                  <div className="tool-output">
                    <div className="tool-output-header">
                      <span className="tool-output-label">Arguments</span>
                    </div>
                    <pre className="m-0 whitespace-pre-wrap">
                      <code dangerouslySetInnerHTML={{ __html: highlighted(argsText, searchQuery) }} />
                    </pre>
                  </div>
                )}
                {output && (
                  <div className="tool-output">
                    <div className="tool-output-header">
                      <span className="tool-output-label">Output</span>
                    </div>
                    <pre
                      className="m-0 whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: highlighted(output, searchQuery) }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function resolveCrossAgentData(
  toolCall: PsmToolCallContent,
  index: number,
  toolResultByCallId: Map<string, PsmToolResultEntry>,
): PsmToolResolvedData {
  const toolCallId = toolCall.id || ''
  const result = toolCallId ? (toolResultByCallId.get(toolCallId) as PsmToolResolvedData['result'] | undefined) : undefined
  const message = result?.message as { content?: unknown[]; output?: string; isError?: boolean } | undefined
  const firstContent = Array.isArray(message?.content) ? (message?.content[0] as { text?: string; output?: string; isError?: boolean } | undefined) : undefined
  const output = message?.output || firstContent?.text || firstContent?.output || ''

  return {
    name: toolCall.name || 'unknown',
    args: normalizeArgs(toolCall.arguments),
    toolCallId,
    entryId: toolCallId ? `tool-result-${toolCallId}` : `cross-agent-tool-${index}`,
    result,
    output,
    isError: Boolean(message?.isError || firstContent?.isError),
  }
}

export const crossAgentToolRenderer: PsmToolRendererRegistration = {
  id: 'builtin-cross-agent-tool-renderer',
  name: 'Cross-Agent Tool Renderer',
  match: (toolCall) => CROSS_AGENT_TOOLS.has(toolCall.name || ''),
  priority: 115,
  component: CrossAgentToolRenderer,
  resolveData: resolveCrossAgentData,
  getSearchSegments: (_toolCall, data) => [data.name, formatArgs(normalizeArgs(data.args)), data.output].filter(Boolean),
  getPreview: (_toolCall, data) => `${getTitle(getKind(data.name), data.name)}: ${getPrimaryText(getKind(data.name), normalizeArgs(data.args), data.name)}`,
}

export { manifest }

export function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerToolRenderer(crossAgentToolRenderer)
}
