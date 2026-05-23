import { CheckCircle2, CircleStop, ListChecks, RotateCcw } from 'lucide-react'
import type {
  PsmPluginHostContext,
  PsmPluginManifest,
  PsmToolCallContent,
  PsmToolRendererRegistration,
  PsmToolRenderProps,
  PsmToolResolvedData,
} from '@pi-session-manager/plugin-sdk'

type LoopTaskInput = {
  description?: unknown
  criteria?: unknown
}

type LoopToolArgs = {
  tasks?: unknown
}

function asLoopTasks(args: Record<string, unknown>): Array<{ description: string; criteria: string[] }> {
  const rawTasks = (args as LoopToolArgs).tasks
  if (!Array.isArray(rawTasks)) return []

  return rawTasks.map((task) => {
    const input = task as LoopTaskInput
    const criteria = Array.isArray(input.criteria)
      ? input.criteria.map((item) => String(item))
      : []

    return {
      description: String(input.description ?? ''),
      criteria,
    }
  })
}

function getResultDetails(data: PsmToolResolvedData): { active?: boolean; taskCount?: number; currentTask?: number } {
  const message = data.result?.message as { details?: { active?: boolean; taskCount?: number; currentTask?: number } } | undefined
  return message?.details ?? {}
}

function LoopToolRenderer({ resolvedData, context }: PsmToolRenderProps) {
  const { name, args, output, isError, entryId } = resolvedData
  const { isExpanded, toggleExpanded, disableSuccessStyle } = context
  const tasks = name === 'submit_loop_plan' ? asLoopTasks(args) : []
  const details = getResultDetails(resolvedData)
  const isSignal = name === 'signal_loop_success'
  const ended = isSignal && details.active === false
  const hasDetails = tasks.length > 0 || Boolean(output)
  const statusClass = isError ? 'error' : disableSuccessStyle ? '' : 'success'
  const title = name === 'submit_loop_plan' ? 'Loop plan' : ended ? 'Loop ended' : 'Loop advanced'
  const summary = name === 'submit_loop_plan'
    ? `${tasks.length} task${tasks.length === 1 ? '' : 's'}`
    : output || (ended ? 'finished' : 'next task')
  const Icon = name === 'submit_loop_plan' ? ListChecks : ended ? CircleStop : CheckCircle2

  return (
    <div className={`tool-execution ${statusClass}`.trim()} id={`entry-${entryId}`}>
      <div
        className={`tool-header ${hasDetails ? 'select-none' : ''}`}
        onClick={hasDetails ? toggleExpanded : undefined}
      >
        {hasDetails && <span className="tool-expand-indicator">{isExpanded ? '▾' : '▸'}</span>}
        <span className="tool-name inline-flex items-center gap-1.5">
          <Icon className="h-4 w-4" />
          {title}
        </span>
        <span className="tool-meta">{summary}</span>
        {details.currentTask !== undefined && <span className="tool-meta">task {details.currentTask}</span>}
      </div>

      {hasDetails && (
        <div className={`tool-output-wrapper collapsible ${isExpanded ? 'expanded' : ''}`}>
          <div className={`tool-expand-content ${isExpanded ? 'expanded' : ''}`}>
            {isExpanded && (
              <div className="space-y-3 p-3 text-sm">
                {tasks.length > 0 && (
                  <div className="space-y-2">
                    {tasks.map((task, index) => (
                      <div key={`${index}-${task.description}`} className="rounded-md border border-border/60 bg-surface/35 p-2.5">
                        <div className="flex items-start gap-2 font-medium text-foreground">
                          <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-sm bg-accent/15 px-1.5 text-xs text-accent">
                            {index + 1}
                          </span>
                          <span>{task.description}</span>
                        </div>
                        {task.criteria.length > 0 && (
                          <ul className="mt-2 space-y-1 pl-7 text-xs leading-5 text-muted-foreground">
                            {task.criteria.map((criterion, criterionIndex) => (
                              <li key={`${criterionIndex}-${criterion}`} className="list-disc">{criterion}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {output && (
                  <div className="flex items-start gap-2 rounded-md border border-border/60 bg-background/35 p-2.5 text-muted-foreground">
                    <RotateCcw className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    <span className="whitespace-pre-wrap">{output}</span>
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

function getLoopSearchSegments(_toolCall: PsmToolCallContent, data: PsmToolResolvedData): string[] {
  const segments = [data.name, data.output]
  for (const task of asLoopTasks(data.args)) {
    segments.push(task.description, ...task.criteria)
  }
  return segments.filter(Boolean)
}

export const loopToolRenderer: PsmToolRendererRegistration = {
  id: 'builtin-loop-renderer',
  name: 'Loop Renderer',
  match: (toolCall) => toolCall.name === 'submit_loop_plan' || toolCall.name === 'signal_loop_success',
  priority: 120,
  component: LoopToolRenderer,
  getSearchSegments: getLoopSearchSegments,
  getPreview: (_toolCall, data) => {
    if (data.name === 'submit_loop_plan') return `Loop plan: ${asLoopTasks(data.args).length} tasks`
    return data.output || 'Loop signal'
  },
}

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.loop-renderer',
  name: 'Loop Renderer',
  version: '1.0.0',
}

export function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerToolRenderer(loopToolRenderer)
}
