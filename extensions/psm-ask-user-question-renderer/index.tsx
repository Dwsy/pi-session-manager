import { Check, CheckCircle2, CircleOff, HelpCircle, MessageSquareText } from 'lucide-react'
import ToolHeader from '@/components/tool-calls/ToolHeader'
import ToolSectionHeader from '@/components/tool-calls/ToolSectionHeader'
import { getToolExecutionClass, getToolRenderStatus, getToolStatusLabel } from '@/plugins/tools-render/utils/status'
import type {
  PsmPluginHostContext,
  PsmPluginManifest,
  PsmToolCallContent,
  PsmToolRendererRegistration,
  PsmToolRenderProps,
  PsmToolResolvedData,
} from '@pi-session-manager/plugin-sdk'

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
        if (typeof option === 'string') {
          return {
            label: option,
            description: '',
          }
        }
        if (option && typeof option === 'object') {
          const item = option as Record<string, unknown>
          const label = String(item.label ?? item.text ?? item.option ?? '')
          const description = String(item.description ?? item.desc ?? '')
          const preview = typeof item.preview === 'string' ? item.preview : undefined
          return {
            label,
            description,
            preview,
          }
        }
        return {
          label: String(option ?? ''),
          description: '',
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
  const { args, output, entryId } = resolvedData
  const { isExpanded, toggleExpanded, disableSuccessStyle, t, copyToClipboard } = context
  const questions = asQuestions(args)
  const result = getResult(resolvedData)
  const answers = asAnswers(result)
  const cancelled = result.cancelled === true
  const error = typeof result.error === 'string' ? result.error : undefined
  const statusData = { ...resolvedData, isError: resolvedData.isError || Boolean(error) }
  const status = getToolRenderStatus(statusData)
  const title = cancelled ? 'Questionnaire declined' : 'User questions'
  const summary = questions.length === 1 ? '1 question' : `${questions.length} questions`
  const Icon = cancelled
    ? CircleOff
    : error
      ? HelpCircle
      : status === 'pending'
        ? MessageSquareText
        : CheckCircle2

  return (
    <div className={`tool-execution ${getToolExecutionClass(statusData, disableSuccessStyle)}`.trim()} id={`entry-${entryId}`}>
      <ToolHeader
        expandable={questions.length > 0 || Boolean(output)}
        expanded={isExpanded}
        onToggle={toggleExpanded}
        ariaLabel={`${title}: ${getToolStatusLabel(status, t)}`}
      >
        <span className="tool-expand-indicator">{isExpanded ? '▾' : '▸'}</span>
        <span className="tool-name inline-flex items-center gap-1.5">
          <Icon className="h-4 w-4" />
          {title}
        </span>
        <span className="tool-detail">{summary}</span>
        {error && <span className="tool-detail text-destructive">{error}</span>}
        <span className={`tool-status tool-status-${status}`}>{getToolStatusLabel(status, t)}</span>
      </ToolHeader>

      <div className={`tool-output-wrapper collapsible ${isExpanded ? 'expanded' : ''}`}>
        <div className={`tool-expand-content ${isExpanded ? 'expanded' : ''}`}>
          {isExpanded && (
            <div className="space-y-4 p-3.5 text-sm">
              {questions.map((question, index) => {
                const answer = answers.find((item) => item.questionIndex === index)

                const isSelected = (opt: { label: string; description: string }) => {
                  if (!answer) return false

                  const matches = (ansText: string) => {
                    const cleanAns = ansText.trim().toLowerCase()
                    if (!cleanAns) return false

                    const cleanLabel = opt.label.trim().toLowerCase()
                    const cleanDesc = opt.description.trim().toLowerCase()
                    const fullText = `${cleanLabel} ${cleanDesc}`.trim().toLowerCase()

                    // 1. Exact match with label or full option text
                    if (cleanLabel === cleanAns) return true
                    if (fullText === cleanAns) return true

                    // 2. Substring match (e.g. answer is a prefix of label/fullText or vice versa)
                    if (cleanLabel.startsWith(cleanAns) || cleanAns.startsWith(cleanLabel)) return true
                    if (fullText.startsWith(cleanAns) || cleanAns.startsWith(fullText)) return true

                    // 3. Containment check
                    if (cleanLabel.includes(cleanAns) || cleanAns.includes(cleanLabel)) return true

                    return false
                  }

                  if (answer.kind === 'multi') {
                    return answer.selected.some((sel) => matches(sel))
                  }
                  if (answer.answer) {
                    return matches(answer.answer)
                  }
                  return false
                }

                const renderOptionText = (text: string) => {
                  const recommendedPattern = /\(Recommended\)/i
                  const isRecommended = recommendedPattern.test(text)
                  const cleanText = text.replace(recommendedPattern, '').trim()

                  return (
                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                      <span>{cleanText}</span>
                      {isRecommended && (
                        <span className="inline-flex items-center rounded-full bg-success/15 px-2 py-0.5 text-[9px] font-bold text-success border border-success/30 uppercase tracking-wider select-none">
                          Recommended
                        </span>
                      )}
                    </span>
                  )
                }

                return (
                  <div key={`${index}-${question.question}`} className="rounded-lg border border-border/50 bg-surface/20 p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {question.header && (
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider border border-[rgba(var(--accent-rgb),0.25)] select-none"
                          style={{
                            color: 'var(--accent)',
                            backgroundColor: 'rgba(var(--accent-rgb), 0.12)'
                          }}
                        >
                          {question.header}
                        </span>
                      )}
                      {question.multiSelect && (
                        <span className="rounded-sm bg-border/20 px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                          multi-select
                        </span>
                      )}
                    </div>
                    <div className="font-semibold text-foreground leading-snug">{question.question}</div>

                    {/* Options list */}
                    {question.options.length > 0 && (
                      <div className="grid gap-2">
                        {question.options.map((option) => {
                          const selected = isSelected(option)
                          return (
                            <div
                              key={option.label}
                              className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs transition-all duration-200 ${
                                selected
                                  ? 'border-success/80 bg-success/10 text-foreground font-semibold shadow-sm shadow-success/5'
                                  : 'border-border/30 bg-surface/20 text-muted-foreground hover:border-border/60 hover:bg-surface/35 hover:text-foreground'
                              }`}
                            >
                              {question.multiSelect ? (
                                <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-all duration-200 ${
                                  selected
                                    ? 'border-success bg-success text-white'
                                    : 'border-muted-foreground/35 bg-background/25'
                                }`}>
                                  {selected && <Check className="h-2.5 w-2.5 stroke-[3.5]" />}
                                </div>
                              ) : (
                                <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all duration-200 ${
                                  selected
                                    ? 'border-success bg-success text-white'
                                    : 'border-muted-foreground/35 bg-background/25'
                                }`}>
                                  {selected && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                                </div>
                              )}

                              <div className="min-w-0 flex-1 leading-relaxed">
                                <span className={`font-semibold ${selected ? 'text-success' : 'text-foreground'}`}>
                                  {renderOptionText(option.label)}
                                </span>
                                {option.description && (
                                  <span className={`block mt-1 text-[11px] leading-normal ${selected ? 'text-success/85' : 'text-muted-foreground'}`}>
                                    {option.description}
                                  </span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Answer details */}
                    <div className="border-l-2 border-success bg-success/5 rounded-r-md p-3 text-xs">
                      <div className="flex items-center gap-1.5 text-success/80 font-semibold uppercase tracking-wider text-[10px]">
                        <MessageSquareText className="h-3.5 w-3.5 text-success" />
                        Answer Details
                      </div>
                      <div className="mt-1.5 break-words text-success font-semibold">
                        {answerLabel(answer)}
                      </div>
                      {answer?.notes && (
                        <div className="mt-2 text-muted-foreground leading-normal border-t border-border/10 pt-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider block text-muted-foreground/75 mb-0.5">Notes</span>
                          {answer.notes}
                        </div>
                      )}
                      {answer?.preview && (
                        <div className="mt-2 border-t border-border/10 pt-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider block text-muted-foreground/75 mb-1">Code Preview</span>
                          <pre className="tool-output-plain rounded border border-border/20 bg-background/50 p-2 text-[11px] text-foreground/90">
                            {answer.preview}
                          </pre>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              {output && (
                <div className="tool-output">
                  <ToolSectionHeader
                    label={t('components.toolCall.output', 'Output')}
                    text={output}
                    copyText={copyToClipboard}
                  />
                  <pre className="tool-output-plain">{output}</pre>
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
