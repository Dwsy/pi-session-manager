import type { Content, SessionEntry, SubagentResult, SubagentDetails, TintinwebAgentDetails } from '@/types'

import {
  escapeHtml,
  getLanguageFromPath,
  parseMarkdown,
  renderCodeHtml,
} from './markdown'

export type ToolResultContent = {
  type?: string
  mimeType?: string
  text?: string
  output?: string
  data?: string
  isError?: boolean
  diff?: string
  details?: { diff?: string }
  content?: Array<{
    type?: string
    mimeType?: string
    data?: string
    text?: string
    output?: string
    content?: unknown[]
    [key: string]: any
  }>
}

export interface ResolvedToolCallDisplayData {
  name: string
  args: Record<string, any>
  toolCallId: string
  entryId: string
  result?: SessionEntry
  output: string
  diff?: string
  isError: boolean
  images: Array<{ type: 'image'; mimeType: string; data: string }>
}

export const SUBAGENT_ERROR_PREVIEW_LIMIT = 80
export const SUBAGENT_TASK_PREVIEW_LIMIT = 120
const SMALL_ARGUMENT_FIELD_THRESHOLD = 5

function appendUniqueString(segments: string[], value: unknown): void {
  if (typeof value !== 'string') {
    return
  }

  const normalizedValue = value.replace(/\r\n/g, '\n')
  if (!normalizedValue.trim() || segments.includes(normalizedValue)) {
    return
  }

  segments.push(normalizedValue)
}

function appendUniqueHtml(segments: string[], value: string): void {
  if (!value.trim() || segments.includes(value)) {
    return
  }

  segments.push(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function normalizeToolArguments(args: unknown): unknown {
  if (typeof args !== 'string') {
    return args
  }

  const trimmed = args.trim()
  if (!trimmed) {
    return args
  }

  const looksLikeJson =
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))

  if (!looksLikeJson) {
    return args
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    return args
  }
}

export function formatToolValue(value: unknown): string {
  if (typeof value === 'string') {
    return value
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function isTextualToolResultDataBlock(content: ToolResultContent): boolean {
  const contentType = typeof content.type === 'string' ? content.type.toLowerCase() : ''
  const mimeType = typeof content.mimeType === 'string' ? content.mimeType.toLowerCase() : ''

  return (
    contentType === 'text' ||
    contentType === 'markdown' ||
    contentType === 'code' ||
    mimeType.startsWith('text/')
  )
}

function collectRenderableToolOutputSegments(value: unknown, segments: string[]): void {
  if (!value) {
    return
  }

  if (typeof value === 'string') {
    appendUniqueString(segments, value)
    return
  }

  if (!Array.isArray(value) && typeof value !== 'object') {
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectRenderableToolOutputSegments(item, segments))
    return
  }

  const content = value as ToolResultContent
  appendUniqueString(segments, content.text)
  appendUniqueString(segments, content.output)

  if (typeof content.data === 'string' && isTextualToolResultDataBlock(content)) {
    appendUniqueString(segments, content.data)
  }

  if (Array.isArray(content.content)) {
    collectRenderableToolOutputSegments(content.content, segments)
  }
}

function collectToolImages(
  value: unknown,
  images: Array<{ type: 'image'; mimeType: string; data: string }>,
): void {
  if (!value || (!Array.isArray(value) && typeof value !== 'object')) {
    return
  }

  if (Array.isArray(value)) {
    value.forEach((item) => collectToolImages(item, images))
    return
  }

  const content = value as ToolResultContent
  if (
    content.type === 'image' &&
    typeof content.mimeType === 'string' &&
    typeof content.data === 'string'
  ) {
    images.push({ type: 'image', mimeType: content.mimeType, data: content.data })
  }

  if (Array.isArray(content.content)) {
    collectToolImages(content.content, images)
  }
}

function getRenderableToolOutput(result?: SessionEntry): string {
  const segments: string[] = []
  appendUniqueString(segments, result?.message?.output)
  collectRenderableToolOutputSegments(result?.message?.content, segments)
  return segments.join('\n\n')
}

function getToolImages(result?: SessionEntry): Array<{ type: 'image'; mimeType: string; data: string }> {
  const images: Array<{ type: 'image'; mimeType: string; data: string }> = []
  collectToolImages(result?.message?.content, images)
  return images
}

export function truncateToolPreviewText(text: string, maxLength: number): string {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text
}

export function getSubagentResultErrorPreview(result: SubagentResult): string | null {
  if (result.exitCode === 0 || !result.error) {
    return null
  }

  return truncateToolPreviewText(result.error, SUBAGENT_ERROR_PREVIEW_LIMIT)
}

export function getSubagentResultTaskPreview(result: SubagentResult): string {
  return truncateToolPreviewText(result.task, SUBAGENT_TASK_PREVIEW_LIMIT)
}

function getVisibleSubagentResultTextSegments(result: SubagentResult): string[] {
  const segments: string[] = []
  appendUniqueString(segments, result.agent)
  appendUniqueString(segments, result.model)
  appendUniqueString(segments, getSubagentResultErrorPreview(result))
  appendUniqueString(segments, getSubagentResultTaskPreview(result))
  return segments
}

export function looksLikeMarkdownByFirstChars(value: string): boolean {
  const prefix = value.trimStart().slice(0, 10)
  return /^(#{1,6}\s|>\s|[-*+]\s|```|~~~|\d+\.\s)/.test(prefix)
}

function getGenericArgumentRenderedHtmlSegments(args: unknown): string[] {
  const normalizedArgs = normalizeToolArguments(args)
  if (normalizedArgs == null) {
    return []
  }

  if (
    isPlainObject(normalizedArgs) &&
    Object.keys(normalizedArgs).length > 0 &&
    Object.keys(normalizedArgs).length <= SMALL_ARGUMENT_FIELD_THRESHOLD
  ) {
    return Object.entries(normalizedArgs).flatMap(([, value]) => {
      const valueText = formatToolValue(value)
      if (!valueText.trim()) {
        return []
      }

      if (typeof value === 'string' && looksLikeMarkdownByFirstChars(value)) {
        return [parseMarkdown(value)]
      }

      return [escapeHtml(valueText)]
    })
  }

  const argsText = formatToolValue(normalizedArgs)
  return argsText.trim() ? [escapeHtml(argsText)] : []
}

export function resolveToolCallDisplayData(
  toolCall: Content,
  index: number,
  toolResultByCallId: Map<string, SessionEntry>,
): ResolvedToolCallDisplayData {
  const name = toolCall.name || 'unknown'
  const args = toolCall.arguments || {}
  const toolCallId = toolCall.id || ''
  const result = toolCallId ? toolResultByCallId.get(toolCallId) : undefined
  const toolResultContent = (result?.message?.content?.[0] || null) as ToolResultContent | null
  const resultExitCode = result?.message?.exitCode
  const isError = Boolean(
    result?.message?.isError ||
    result?.message?.cancelled ||
    (typeof resultExitCode === 'number' && resultExitCode !== 0) ||
    toolResultContent?.isError
  )
  const output = getRenderableToolOutput(result)
  const detailsWithDiff = result?.message?.details as { diff?: string } | undefined
  const diff =
    toolResultContent?.details?.diff ||
    toolResultContent?.diff ||
    detailsWithDiff?.diff
  const entryId = result?.id || `tool-${toolCallId || index}`
  const images = getToolImages(result)

  return {
    name,
    args,
    toolCallId,
    entryId,
    result,
    output,
    diff,
    isError,
    images,
  }
}

export function getSearchableToolCallRenderedHtmlSegments(
  toolCall: Content,
  index: number,
  toolResultByCallId: Map<string, SessionEntry>,
): string[] {
  const { name, args, output, diff, result } = resolveToolCallDisplayData(
    toolCall,
    index,
    toolResultByCallId,
  )
  const segments: string[] = []

  switch (name) {
    case 'bash': {
      appendUniqueHtml(segments, renderCodeHtml(String(args.command || ''), 'bash'))
      appendUniqueHtml(segments, renderCodeHtml(output, 'shell'))
      return segments
    }

    case 'read': {
      const filePath = String(args.file_path || args.path || '')
      appendUniqueHtml(
        segments,
        renderCodeHtml(output, getLanguageFromPath(filePath)),
      )
      return segments
    }

    case 'write': {
      const filePath = String(args.file_path || args.path || '')
      appendUniqueHtml(
        segments,
        renderCodeHtml(String(args.content || ''), getLanguageFromPath(filePath)),
      )
      appendUniqueHtml(segments, escapeHtml(output))
      return segments
    }

    case 'edit': {
      appendUniqueHtml(segments, diff ? escapeHtml(diff) : '')
      appendUniqueHtml(segments, output ? escapeHtml(output) : '')
      return segments
    }

    case 'subagent': {
      appendUniqueHtml(segments, output ? escapeHtml(output) : '')
      // Only our format has results array
      const details = result?.message?.details as SubagentDetails | TintinwebAgentDetails | undefined
      if (details && 'results' in details && Array.isArray(details.results)) {
        details.results.forEach((subagentResult) => {
          getVisibleSubagentResultTextSegments(subagentResult).forEach((segment) => {
            appendUniqueHtml(segments, escapeHtml(segment))
          })
        })
      }
      return segments
    }

    default: {
      getGenericArgumentRenderedHtmlSegments(args).forEach((segment) => {
        appendUniqueHtml(segments, segment)
      })
      appendUniqueHtml(segments, output ? escapeHtml(output) : '')
      return segments
    }
  }
}
