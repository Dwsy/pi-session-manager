import type { Content, SessionEntry } from '@/types'

export interface AssistantProcessStep {
  entryId: string
  content: Content[]
  isCurrentEntry?: boolean
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
    if (entry.type !== 'message' || entry.message?.role !== 'assistant') continue
    steps.push({
      entryId: entry.id,
      content: entry.message.content || [],
    })
  }

  const { processContent } = splitAssistantContent(currentContent)
  if (processContent.length > 0) {
    steps.push({
      entryId: currentEntryId,
      content: processContent,
      isCurrentEntry: true,
    })
  }

  return steps
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
