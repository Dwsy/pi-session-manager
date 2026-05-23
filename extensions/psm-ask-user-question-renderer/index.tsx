import { CheckCircle2, CircleOff, HelpCircle, MessageSquareText } from 'lucide-react'
import type {
  PsmPluginHostContext,
  PsmPluginManifest,
  PsmToolCallContent,
  PsmToolRendererRegistration,
  PsmToolRenderProps,
  PsmToolResolvedData,
} from '@pi-session-manager/plugin-sdk'

type AskQuestionOption = {
  label?: unknown
  description?: unknown
  preview?: unknown
}

type AskQuestion = {
  header?: unknown
  question?: unknown
  multiSelect?: unknown
  options?: unknown
}

type AskAnswer = {
  questionIndex?: unknown
  question?: unknown
  kind?: unknown
  answer?: unknown
  selected?: unknown
  notes?: unknown
  preview?: unknown
}

type AskQuestionResult = {
  answers?: unknown
  cancelled?: unknown
  error?: unknown
}

function asQuestions(args: Record<string, unknown>): Array<{
  header: string
  question: string
  multiSelect: boolean
  options: Array<{ label: string; description: string; preview?: string }>
}> {
  const rawQuestions = args.questions
  if (!Array.isArray(rawQuestions)) return []

  return rawQuestions.map((raw) => {
    const input = raw as AskQuestion
    const rawOptions = Array.isArray(input.options) ? input.options : []
    return {
      header: String(input.header ?? ''),
      question: String(input.question ?? ''),
      multiSelect: input.multiSelect === true,
      options: rawOptions.map((option) => {
        const item = option as AskQuestionOption
        const preview = typeof item.preview === 'string' ? item.preview : undefined
        return {
          label: String(item.label ?? ''),
          description: String(item.description ?? ''),
          preview,
        }
      }),
    }
  })
}

function getResult(data: PsmToolResolvedData): AskQuestionResult {
  const message = data.result?.message as { details?: AskQuestionResult } | undefined
  return message?.details ?? {}
}

function asAnswers(result: AskQuestionResult): Array<{
  questionIndex: number
  question: string
  kind: string
  answer: string | null
  selected: string[]
  notes?: string
  preview?: string
}> {
  if (!Array.isArray(result.answers)) return []

  return result.answers.map((raw) => {
    const input = raw as AskAnswer
    const selected = Array.isArray(input.selected) ? input.selected.map((item) => String(item)) : []
    return {
      questionIndex: typeof input.questionIndex === 'number' ? input.questionIndex : -1,
      question: String(input.question ?? ''),
      kind: String(input.kind ?? ''),
      answer: input.answer == null ? null : String(input.answer),
      selected,
      notes: typeof input.notes === 'string' ? input.notes : undefined,
      preview: typeof input.preview === 'string' ? input.preview : undefined,
    }
  })
}

function answerLabel(answer: ReturnType<typeof asAnswers>[number] | undefined): string {
  if (!answer) return 'No answer yet'
  if (answer.kind === 'multi') return answer.selected.length > 0 ? answer.selected.join(', ') : 'No options selected'
  return answer.answer ?? 'No answer'
}

function AskUserQuestionRenderer({ resolvedData, context }: PsmToolRenderProps) {
  const { args, output, isError, entryId } = resolvedData
  const { isExpanded, toggleExpanded, disableSuccessStyle } = context
  const questions = asQuestions(args)
  const result = getResult(resolvedData)
  const answers = asAnswers(result)
  const cancelled = result.cancelled === true
  const error = typeof result.error === 'string' ? result.error : undefined
  const statusClass = isError || error ? 'error' : disableSuccessStyle ? '' : 'success'
  const title = cancelled ? 'Questionnaire declined' : 'User questions'
  const summary = questions.length === 1 ? '1 question' : `${questions.length} questions`
  const Icon = cancelled ? CircleOff : error ? HelpCircle : CheckCircle2

  return (
    <div className={`tool-execution ${statusClass}`.trim()} id={`entry-${entryId}`}>
      <div className="tool-header select-none" onClick={toggleExpanded}>
        <span className="tool-expand-indicator">{isExpanded ? '▾' : '▸'}</span>
        <span className="tool-name inline-flex items-center gap-1.5">
          <Icon className="h-4 w-4" />
          {title}
        </span>
        <span className="tool-meta">{summary}</span>
        {error && <span className="tool-meta text-destructive">{error}</span>}
      </div>

      <div className={`tool-output-wrapper collapsible ${isExpanded ? 'expanded' : ''}`}>
        <div className={`tool-expand-content ${isExpanded ? 'expanded' : ''}`}>
          {isExpanded && (
            <div className="space-y-3 p-3 text-sm">
              {questions.map((question, index) => {
                const answer = answers.find((item) => item.questionIndex === index)
                return (
                  <div key={`${index}-${question.question}`} className="rounded-md border border-border/60 bg-surface/35 p-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      {question.header && (
                        <span className="rounded-sm bg-accent/15 px-1.5 py-0.5 text-xs font-medium text-accent">
                          {question.header}
                        </span>
                      )}
                      {question.multiSelect && <span className="tool-meta">multi-select</span>}
                    </div>
                    <div className="mt-2 font-medium text-foreground">{question.question}</div>
                    <div className="mt-2 flex items-start gap-2 rounded-md border border-border/50 bg-background/35 p-2 text-muted-foreground">
                      <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                      <div className="min-w-0">
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">Answer</div>
                        <div className="mt-1 break-words text-foreground">{answerLabel(answer)}</div>
                        {answer?.notes && <div className="mt-1 text-xs text-muted-foreground">Note: {answer.notes}</div>}
                        {answer?.preview && <pre className="mt-2 whitespace-pre-wrap rounded bg-background/50 p-2 text-xs">{answer.preview}</pre>}
                      </div>
                    </div>
                    {question.options.length > 0 && (
                      <div className="mt-2 grid gap-1.5">
                        {question.options.map((option) => {
                          const selected = answer?.answer === option.label || answer?.selected.includes(option.label)
                          return (
                            <div
                              key={option.label}
                              className={`rounded border px-2 py-1.5 text-xs ${selected ? 'border-accent/60 bg-accent/10 text-foreground' : 'border-border/40 text-muted-foreground'}`}
                            >
                              <span className="font-medium">{option.label}</span>
                              {option.description && <span className="ml-2">{option.description}</span>}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              {output && (
                <div className="rounded-md border border-border/60 bg-background/35 p-2.5 text-xs text-muted-foreground">
                  <div className="mb-1 font-medium text-foreground">Tool output</div>
                  <div className="whitespace-pre-wrap">{output}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function getAskUserQuestionSearchSegments(_toolCall: PsmToolCallContent, data: PsmToolResolvedData): string[] {
  const segments = [data.name, data.output]
  for (const question of asQuestions(data.args)) {
    segments.push(question.header, question.question)
    for (const option of question.options) {
      segments.push(option.label, option.description, option.preview ?? '')
    }
  }
  for (const answer of asAnswers(getResult(data))) {
    segments.push(answer.question, answer.answer ?? '', ...answer.selected, answer.notes ?? '', answer.preview ?? '')
  }
  return segments.filter(Boolean)
}

export const askUserQuestionRenderer: PsmToolRendererRegistration = {
  id: 'builtin-ask-user-question-renderer',
  name: 'Ask User Question Renderer',
  match: 'ask_user_question',
  priority: 130,
  component: AskUserQuestionRenderer,
  getSearchSegments: getAskUserQuestionSearchSegments,
  getPreview: (_toolCall, data) => {
    const count = asQuestions(data.args).length
    return count === 1 ? 'Ask user: 1 question' : `Ask user: ${count} questions`
  },
}

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.ask-user-question-renderer',
  name: 'Ask User Question Renderer',
  version: '1.0.0',
}

export function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerToolRenderer(askUserQuestionRenderer)
}
