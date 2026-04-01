import type { Content } from '../types'

export interface SplitAssistantTextBlocks {
  thinking: string[]
  text: string[]
}

export interface AssistantDisplayedBlocks {
  thinkingBlocks: string[]
  textBlocks: string[]
}

export function looksLikeThinkingText(text: string): boolean {
  const normalized = text.trim().toLowerCase()
  if (!normalized) return false

  if (
    normalized.startsWith('thinking ...') ||
    normalized.startsWith('thinking…') ||
    normalized.startsWith('thinking:') ||
    normalized.startsWith('reasoning:') ||
    normalized.startsWith('Thinking:') ||
    normalized.startsWith('Thinking:') ||
    normalized.startsWith('Reasoning:') ||
    normalized.startsWith('Reasoning:')
  ) {
    return true
  }

  return normalized.includes('<think>') || normalized.includes('</think>')
}

export function splitAssistantTextBlocks(text: string): SplitAssistantTextBlocks {
  const result: SplitAssistantTextBlocks = { thinking: [], text: [] }
  const raw = text || ''
  if (!raw.trim()) return result

  const hasOpenTag = raw.includes('<think>')
  const hasCloseTag = raw.includes('</think>')

  if (!hasOpenTag && !hasCloseTag) {
    if (looksLikeThinkingText(raw)) {
      result.thinking.push(raw.trim())
    } else {
      result.text.push(raw)
    }
    return result
  }

  if (!hasOpenTag && hasCloseTag) {
    const closeTagIndex = raw.indexOf('</think>')
    const thinkingPart = raw.slice(0, closeTagIndex).trim()
    const textPart = raw.slice(closeTagIndex + '</think>'.length).trim()

    if (thinkingPart) result.thinking.push(thinkingPart)
    if (textPart) result.text.push(textPart)
    return result
  }

  const thinkPattern = /<think>([\s\S]*?)(?:<\/think>|$)/gi
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = thinkPattern.exec(raw)) !== null) {
    const before = raw.slice(lastIndex, match.index).trim()
    if (before) {
      result.text.push(before)
    }

    const thinkingPart = (match[1] || '').trim()
    if (thinkingPart) {
      result.thinking.push(thinkingPart)
    }

    lastIndex = thinkPattern.lastIndex
  }

  const tail = raw.slice(lastIndex).trim()
  if (tail) {
    result.text.push(tail)
  }

  if (result.thinking.length === 0 && result.text.length === 0) {
    if (looksLikeThinkingText(raw)) {
      result.thinking.push(raw.trim())
    } else {
      result.text.push(raw)
    }
  }

  return result
}

export function getAssistantDisplayedBlocks(
  content: Content[],
): AssistantDisplayedBlocks {
  const textBlocks = content.filter((item) => item.type === 'text' && item.text)
  const extractedBlocks = textBlocks.map((item) =>
    splitAssistantTextBlocks(item.text || ''),
  )
  const thinkingBlocks = content
    .filter((item) => item.type === 'thinking' && item.thinking)
    .map((item) => item.thinking as string)

  return {
    thinkingBlocks: [
      ...thinkingBlocks,
      ...extractedBlocks.flatMap((block) => block.thinking),
    ],
    textBlocks: extractedBlocks.flatMap((block) => block.text),
  }
}
