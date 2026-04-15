import type { Content, SessionEntry } from '@/types'

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

export interface SplitAssistantContentResult {
  processContent: Content[]
  visibleContent: Content[]
}

export function splitAssistantContent(content: Content[]): SplitAssistantContentResult {
  const firstTextIndex = content.findIndex((item) => item.type === 'text')
  if (firstTextIndex === -1) {
    return {
      processContent: content,
      visibleContent: [],
    }
  }

  return {
    processContent: content.slice(0, firstTextIndex),
    visibleContent: content.slice(firstTextIndex),
  }
}

export function buildAssistantProcessSteps(
  currentEntryId: string,
  currentContent: Content[],
  foldEntries?: SessionEntry[],
): AssistantProcessStep[] {
  const steps: AssistantProcessStep[] = []

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

  const { processContent } = splitAssistantContent(currentContent)
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

export function shouldCollapseAssistantProcess(steps: AssistantProcessStep[]): boolean {
  const assistantSteps = steps.filter((step) => step.kind === 'assistant')
  const hasLoop = steps.some((step) => step.kind === 'loop')
  const toolCount = assistantSteps.reduce(
    (sum, step) => sum + step.content.filter((item) => item.type === 'toolCall').length,
    0,
  )
  const thinkingCount = assistantSteps.reduce(
    (sum, step) => sum + step.content.filter((item) => item.type === 'thinking').length,
    0,
  )
  const nonEmptyAssistantSteps = assistantSteps.filter((step) => step.content.length > 0).length

  if (hasLoop) return true
  if (toolCount > 0) return true
  if (nonEmptyAssistantSteps > 1 && thinkingCount > 0) return true
  return false
}

export function hasVisibleAssistantText(content: Content[]): boolean {
  return splitAssistantContent(content).visibleContent.some(
    (item) => item.type === 'text' && Boolean(item.text?.trim()),
  )
}

export function isAssistantProcessOnlyEntry(entry: SessionEntry): boolean {
  if (entry.type !== 'message' || entry.message?.role !== 'assistant') return false
  return !hasVisibleAssistantText(entry.message.content || [])
}

export function isLoopProcessEntry(entry: SessionEntry): boolean {
  return entry.type === 'custom_message' && entry.customType === 'loop'
}
