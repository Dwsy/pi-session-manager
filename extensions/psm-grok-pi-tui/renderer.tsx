import { Bot, Braces, ListChecks, ListTree, TerminalSquare } from 'lucide-react'
import type {
  PsmToolCallContent,
  PsmToolRendererRegistration,
  PsmToolRenderProps,
  PsmToolResolvedData,
} from '@pi-session-manager/plugin-sdk'

import CodeBlock from '@/components/ui/CodeBlock'
import ToolHeader from '@/components/tool-calls/ToolHeader'
import ToolSectionHeader from '@/components/tool-calls/ToolSectionHeader'
import { getToolExecutionClass, getToolRenderStatus, getToolStatusLabel } from '@/plugins/tools-render/utils/status'

import {
  GROK_PI_TOOL_NAMES,
  resolveGrokPiToolPresentation,
  resultDetails,
  type GrokPiToolKind,
} from './protocol'

const ICONS: Record<GrokPiToolKind, typeof TerminalSquare> = {
  bash: TerminalSquare,
  eval: Braces,
  task: ListTree,
  todo: ListChecks,
  subagent: Bot,
}

function json(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function visibleArgs(data: PsmToolResolvedData): Record<string, unknown> {
  const args = { ...data.args }
  delete args.command
  delete args.code
  return args
}

function GrokPiToolRenderer({ resolvedData, searchQuery, context }: PsmToolRenderProps) {
  const presentation = resolveGrokPiToolPresentation(resolvedData)
  const Icon = ICONS[presentation.kind]
  const status = getToolRenderStatus(resolvedData)
  const args = visibleArgs(resolvedData)
  const argsText = Object.keys(args).length > 0 ? json(args) : ''
  const details = resultDetails(resolvedData)
  const detailsText = details ? json(details) : ''
  const hasDetails = Boolean(presentation.code || argsText || detailsText || resolvedData.output)

  return (
    <div
      className={`tool-execution ${getToolExecutionClass(resolvedData, context.disableSuccessStyle)}`.trim()}
      id={`entry-${resolvedData.entryId}`}
    >
      <ToolHeader
        expandable={hasDetails}
        expanded={context.isExpanded}
        onToggle={context.toggleExpanded}
        ariaLabel={`${presentation.title}: ${getToolStatusLabel(status, context.t)}`}
      >
        {hasDetails && <span className="tool-expand-indicator">{context.isExpanded ? '▾' : '▸'}</span>}
        <span className="tool-name inline-flex items-center gap-1.5">
          <Icon className="h-4 w-4" />
          {presentation.title}
        </span>
        <span className="tool-path" title={presentation.primaryText}>{presentation.primaryText}</span>
        {presentation.version && <span className="tool-detail">{presentation.version}</span>}
        {presentation.background && <span className="tool-detail">background</span>}
        <span className={`tool-status tool-status-${status}`}>{getToolStatusLabel(status, context.t)}</span>
      </ToolHeader>

      {hasDetails && (
        <div className={`tool-output-wrapper collapsible ${context.isExpanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${context.isExpanded ? 'expanded' : ''}`}>
            {context.isExpanded && (
              <div className="space-y-3 p-3 text-sm">
                {presentation.code && (
                  <div className="tool-output">
                    <ToolSectionHeader
                      label={presentation.kind === 'bash' ? 'Command' : 'Cell'}
                      text={presentation.code}
                      copyText={context.copyToClipboard}
                    />
                    <CodeBlock
                      code={presentation.code}
                      language={presentation.codeLanguage || 'text'}
                      showLineNumbers={presentation.kind === 'eval'}
                      scrollable
                      maxHeight={450}
                      searchQuery={searchQuery}
                    />
                  </div>
                )}
                {argsText && (
                  <div className="tool-output">
                    <ToolSectionHeader label="Arguments" text={argsText} copyText={context.copyToClipboard} />
                    <pre className="tool-output-plain">{argsText}</pre>
                  </div>
                )}
                {detailsText && (
                  <div className="tool-output">
                    <ToolSectionHeader label="State" text={detailsText} copyText={context.copyToClipboard} />
                    <pre className="tool-output-plain">{detailsText}</pre>
                  </div>
                )}
                {resolvedData.output && (
                  <div className="tool-output">
                    <ToolSectionHeader label="Output" text={resolvedData.output} copyText={context.copyToClipboard} />
                    <CodeBlock
                      code={resolvedData.output}
                      language="text"
                      showLineNumbers={false}
                      scrollable
                      maxHeight={450}
                      searchQuery={searchQuery}
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

export const grokPiToolRenderer: PsmToolRendererRegistration = {
  id: 'builtin-grok-pi-tui',
  name: 'Grok Pi TUI',
  description: 'Render Grok Pi Bash, Eval v1/v2, Todo v1/v2, Subagents v1/v2, and task tools.',
  match: (toolCall) => GROK_PI_TOOL_NAMES.has(toolCall.name || ''),
  priority: 180,
  component: GrokPiToolRenderer,
  getSearchSegments: (_toolCall: PsmToolCallContent, data: PsmToolResolvedData) => [
    data.name,
    json(data.args),
    json(resultDetails(data) ?? {}),
    data.output,
  ].filter(Boolean),
  getPreview: (_toolCall, data) => {
    const presentation = resolveGrokPiToolPresentation(data)
    return `${presentation.title}: ${presentation.primaryText}`
  },
}
