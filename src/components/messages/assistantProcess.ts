import type { Content, SessionEntry } from '@/types'

/**
 * Tool Call Display Mode
 *
 * There are two levels of "folding":
 *
 * 1. Entry-level folding (useFoldGroups):
 *    - Merges consecutive "tool-only" assistant entries into groups
 *    - Controlled by collapseToolCalls setting
 *    - When disabled: each entry renders independently
 *
 * 2. Rendering mode within each assistant message:
 *    - COLLAPSED: Show summary, click to expand (ToolCallList)
 *    - EXPANDED: Show all tool calls directly
 *    - Controlled by collapseToolCalls setting
 */

export type AssistantProcessStep =
  | {
      kind: 'assistant'
      entryId: string
      content: Content[]
      isCurrentEntry?: boolean
    }
  | {
      kind: 'loop'
      entryId: string
      text: string
      customType: string
    }

/** Tool call count result for a set of process steps */
export interface ToolCallCount {
  total: number
  byStep: Map<string, number>
}

/**
 * Count tool calls across all process steps
 */
export function countToolCalls(steps: AssistantProcessStep[]): ToolCallCount {
  const byStep = new Map<string, number>()
  let total = 0

  for (const step of steps) {
    if (step.kind !== 'assistant') continue
    const count = step.content.filter((item) => item.type === 'toolCall').length
    if (count > 0) {
      byStep.set(step.entryId, count)
      total += count
    }
  }

  return { total, byStep }
}

/**
 * Determine if content is "process-only" (no visible text)
 * Used to decide if an entry should be folded into the next
 */
export function isProcessOnlyContent(content: Content[]): boolean {
  const hasText = content.some(
    (item) => item.type === 'text' && Boolean(item.text?.trim()),
  )
  return !hasText
}

/**
 * Split content into process content (before first text) and visible content
 */
export function splitContentByText(content: Content[]): {
  processContent: Content[]
  visibleContent: Content[]
} {
  const firstTextIndex = content.findIndex((item) => item.type === 'text')
  if (firstTextIndex === -1) {
    return { processContent: content, visibleContent: [] }
  }
  return {
    processContent: content.slice(0, firstTextIndex),
    visibleContent: content.slice(firstTextIndex),
  }
}

/**
 * Build process steps from foldEntries and current entry content.
 *
 * foldEntries: previous assistant entries that were merged (only tools, no text)
 * currentEntryId: the "leader" entry that has text
 * currentContent: content of the leader entry
 */
export function buildAssistantProcessSteps(
  currentEntryId: string,
  currentContent: Content[],
  foldEntries?: SessionEntry[],
): AssistantProcessStep[] {
  const steps: AssistantProcessStep[] = []

  // Add fold entries as separate steps
  for (const entry of foldEntries || []) {
    if (entry.type === 'custom_message' && entry.customType === 'loop') {
      steps.push({
        kind: 'loop',
        entryId: entry.id,
        customType: entry.customType,
        text: typeof entry.content === 'string' ? entry.content : JSON.stringify(entry.content),
      })
      continue
    }

    if (entry.type !== 'message' || entry.message?.role !== 'assistant') continue
    steps.push({
      kind: 'assistant',
      entryId: entry.id,
      content: entry.message.content || [],
    })
  }

  // Add current entry's process content
  const { processContent } = splitContentByText(currentContent)
  if (processContent.length > 0) {
    steps.push({
      kind: 'assistant',
      entryId: currentEntryId,
      content: processContent,
      isCurrentEntry: true,
    })
  }

  return steps
}

/**
 * Decide if process should be collapsed into a summary view.
 *
 * Rules:
 * - Single tool call (no matter where): show directly, don't collapse
 * - Multiple tool calls OR multiple steps: collapse by default
 * - Loop messages always shown as part of the process
 *
 * @param steps - Process steps from buildAssistantProcessSteps
 * @param collapseEnabled - Whether the user wants collapsing behavior
 */
export function shouldCollapseProcess(
  steps: AssistantProcessStep[],
  collapseEnabled: boolean,
): boolean {
  if (!collapseEnabled) return false

  const { total: toolCount } = countToolCalls(steps)
  const assistantSteps = steps.filter((s) => s.kind === 'assistant')
  const loopSteps = steps.filter((s) => s.kind === 'loop')
  const nonEmptySteps = assistantSteps.filter((s) => s.content.length > 0)

  // Single tool call: show directly
  if (toolCount === 1 && nonEmptySteps.length === 1) {
    return false
  }

  // Multiple tools, multiple steps, or loops with tools: collapse
  if (toolCount > 1) return true
  if (nonEmptySteps.length > 1) return true
  if (loopSteps.length > 0 && (toolCount > 0 || nonEmptySteps.length > 1)) return true

  return false
}

/**
 * Check if an assistant entry has visible text (for fold grouping decision)
 */
export function hasVisibleText(content: Content[]): boolean {
  return content.some(
    (item) => item.type === 'text' && Boolean(item.text?.trim()),
  )
}

/**
 * Check if an entry is "process only" (for fold grouping)
 */
export function isProcessOnlyEntry(entry: SessionEntry): boolean {
  if (entry.type !== 'message' || entry.message?.role !== 'assistant') return false
  return !hasVisibleText(entry.message.content || [])
}

/**
 * Check if an entry is a loop message
 */
export function isLoopEntry(entry: SessionEntry): boolean {
  return entry.type === 'custom_message' && entry.customType === 'loop'
}
