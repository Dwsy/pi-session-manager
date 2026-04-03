import { toolRenderRegistry } from '../registry'
import { defaultResolveData } from './resolveData'
import type { Content, SessionEntry } from '../../../types'

/**
 * Get searchable HTML segments for a tool call
 * Plugin-aware version - uses plugin's getSearchSegments if available
 * Falls back to default implementation
 * @param toolCall - Tool call content
 * @param index - Index in tool calls array
 * @param toolResultByCallId - Map of results by tool call ID
 * @returns Array of searchable HTML strings
 */
export function getSearchableToolCallRenderedHtmlSegments(
  toolCall: Content,
  index: number,
  toolResultByCallId: Map<string, SessionEntry>
): string[] {
  const plugin = toolRenderRegistry.findPlugin(toolCall)

  // Use plugin's search segment generator if available
  if (plugin.getSearchSegments) {
    const resolvedData = plugin.resolveData?.(
      toolCall,
      index,
      toolResultByCallId
    ) ?? defaultResolveData(toolCall, index, toolResultByCallId)

    return plugin.getSearchSegments(toolCall, resolvedData)
  }

  // Fallback to default implementation
  return getDefaultSearchSegments(toolCall, index, toolResultByCallId)
}

/**
 * Default search segment generator
 * Compatible with existing logic
 */
function getDefaultSearchSegments(
  toolCall: Content,
  index: number,
  toolResultByCallId: Map<string, SessionEntry>
): string[] {
  const data = defaultResolveData(toolCall, index, toolResultByCallId)
  const segments: string[] = []

  // Arguments
  const argsText = JSON.stringify(data.args)
  if (argsText) {
    segments.push(escapeHtml(argsText))
  }

  // Output
  if (data.output) {
    segments.push(escapeHtml(data.output))
  }

  // Diff
  if (data.diff) {
    segments.push(escapeHtml(data.diff))
  }

  return segments
}

/**
 * Escape HTML special characters
 * Prevents XSS when rendering search results
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
