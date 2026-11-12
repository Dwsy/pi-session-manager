import type { SessionEntry, SystemPromptTool } from '@/types'
import { normalizePiContent } from './session'

export interface ToolUsageRow {
  name: string
  calls: number
  description: string
  parameters?: unknown
  /** False when the session called a tool that the recorded prompt never declared. */
  declared: boolean
}

/** Count `toolCall` blocks per tool name across assistant messages. */
export function countToolCalls(entries: SessionEntry[]): Map<string, number> {
  const counts = new Map<string, number>()

  for (const entry of entries) {
    if (entry.type !== 'message' || entry.message?.role !== 'assistant') continue
    for (const block of normalizePiContent(entry.message.content)) {
      if (block.type !== 'toolCall' || typeof block.name !== 'string' || !block.name) continue
      counts.set(block.name, (counts.get(block.name) ?? 0) + 1)
    }
  }

  return counts
}

/** Merge declared tool definitions with session usage, most-used first. */
export function buildToolUsageRows(
  tools: SystemPromptTool[],
  counts: Map<string, number>,
): ToolUsageRow[] {
  const rows = new Map<string, ToolUsageRow>()

  for (const tool of tools) {
    rows.set(tool.name, {
      name: tool.name,
      calls: counts.get(tool.name) ?? 0,
      description: tool.description ?? '',
      parameters: tool.parameters,
      declared: true,
    })
  }

  for (const [name, calls] of counts) {
    if (!rows.has(name)) {
      rows.set(name, { name, calls, description: '', declared: false })
    }
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (a.calls !== b.calls) return b.calls - a.calls
    if (a.declared !== b.declared) return a.declared ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}

export function filterToolUsageRows(rows: ToolUsageRow[], query: string): ToolUsageRow[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return rows
  return rows.filter(
    (row) =>
      row.name.toLowerCase().includes(needle) ||
      row.description.toLowerCase().includes(needle),
  )
}
