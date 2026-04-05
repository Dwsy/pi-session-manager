import type { Content, SessionEntry } from '../../../types'
import type { ResolvedToolData } from '../types'

/**
 * Default data resolver for tool calls
 * Extracts common fields from tool call and result
 * @param toolCall - Raw tool call content
 * @param index - Index in the tool calls array
 * @param toolResultByCallId - Map of results by tool call ID
 * @returns Resolved tool data for rendering
 */
export function defaultResolveData(
  toolCall: Content,
  index: number,
  toolResultByCallId: Map<string, SessionEntry>
): ResolvedToolData {
  const name = toolCall.name || 'unknown'
  const args = toolCall.arguments || {}
  const toolCallId = toolCall.id || ''
  const result = toolCallId ? toolResultByCallId.get(toolCallId) : undefined
  const toolResultContent = (result?.message?.content?.[0] || null) as any | null

  const isError = result?.message?.isError ||
    toolResultContent?.isError ||
    false

  const output = getRenderableToolOutput(result)

  const detailsWithDiff = result?.message?.details as { diff?: string } | undefined
  const diff = toolResultContent?.details?.diff ||
    toolResultContent?.diff ||
    detailsWithDiff?.diff

  const entryId = toolCallId ? `tool-result-${toolCallId}` : (result?.id || `tool-${index}`)
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

/**
 * Extract renderable text output from session result
 * Recursively collects text from content array
 */
function getRenderableToolOutput(result?: SessionEntry): string {
  const segments: string[] = []

  if (result?.message?.output) {
    segments.push(result.message.output)
  }

  collectRenderableContent(result?.message?.content, segments)

  return segments.join('\n\n')
}

/**
 * Recursively collect renderable text content
 * Handles nested content structures
 */
function collectRenderableContent(value: unknown, segments: string[]): void {
  if (!value) return

  if (typeof value === 'string') {
    if (value.trim()) segments.push(value)
    return
  }

  if (Array.isArray(value)) {
    value.forEach(item => collectRenderableContent(item, segments))
    return
  }

  const content = value as any
  if (content.text) segments.push(content.text)
  if (content.output) segments.push(content.output)

  if (Array.isArray(content.content)) {
    collectRenderableContent(content.content, segments)
  }
}

/**
 * Extract image data from session result
 * Returns array of image objects with mimeType and base64 data
 */
function getToolImages(result?: SessionEntry): Array<{ type: 'image'; mimeType: string; data: string }> {
  const images: Array<{ type: 'image'; mimeType: string; data: string }> = []
  collectImages(result?.message?.content, images)
  return images
}

/**
 * Recursively collect image content
 * Filters for type === 'image' with valid mimeType and data
 */
function collectImages(
  value: unknown,
  images: Array<{ type: 'image'; mimeType: string; data: string }>
): void {
  if (!value || (!Array.isArray(value) && typeof value !== 'object')) return

  if (Array.isArray(value)) {
    value.forEach(item => collectImages(item, images))
    return
  }

  const content = value as any
  if (
    content.type === 'image' &&
    typeof content.mimeType === 'string' &&
    typeof content.data === 'string'
  ) {
    images.push({ type: 'image', mimeType: content.mimeType, data: content.data })
  }

  if (Array.isArray(content.content)) {
    collectImages(content.content, images)
  }
}
