import type { SessionEntry, LegacySessionStats } from '../types'

export function isTauriReady(): boolean {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined
}

export function parseSessionEntries(jsonlContent: string): SessionEntry[] {
  const entries: SessionEntry[] = []
  const lines = jsonlContent.split('\n').filter(line => line.trim())
  const seenIds = new Map<string, number>()

  for (let i = 0; i < lines.length; i++) {
    try {
      const entry = JSON.parse(lines[i])
      
      // Ensure unique IDs - append suffix if duplicate
      if (entry.id) {
        const count = seenIds.get(entry.id) || 0
        if (count > 0) {
          entry.id = `${entry.id}__dup_${count}`
        }
        seenIds.set(entry.id.split('__dup_')[0], count + 1)
      }
      
      entries.push(entry)
    } catch (e) {
      console.warn('Failed to parse line:', lines[i].substring(0, 100))
    }
  }

  return entries
}

export function computeStats(entries: SessionEntry[]): LegacySessionStats {
  const stats: LegacySessionStats = {
    userMessages: 0,
    assistantMessages: 0,
    toolResults: 0,
    customMessages: 0,
    compactions: 0,
    branchSummaries: 0,
    toolCalls: 0,
    tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    models: [],
  }

  const modelSet = new Set<string>()

  for (const entry of entries) {
    if (entry.type === 'message') {
      const msg = entry.message
      if (!msg) continue

      if (msg.role === 'user') stats.userMessages++
      if (msg.role === 'assistant') {
        stats.assistantMessages++
        if (msg.model) {
          const modelName = msg.provider ? `${msg.provider}/${msg.model}` : msg.model
          modelSet.add(modelName)
        }
        if (msg.usage) {
          stats.tokens.input += msg.usage.input || 0
          stats.tokens.output += msg.usage.output || 0
          stats.tokens.cacheRead += msg.usage.cacheRead || 0
          stats.tokens.cacheWrite += msg.usage.cacheWrite || 0
          if (msg.usage.cost) {
            stats.cost.input += msg.usage.cost.input || 0
            stats.cost.output += msg.usage.cost.output || 0
            stats.cost.cacheRead += msg.usage.cost.cacheRead || 0
            stats.cost.cacheWrite += msg.usage.cost.cacheWrite || 0
          }
        }
        stats.toolCalls += msg.content.filter(c => c.type === 'toolCall').length
      }
      if (msg.role === 'toolResult') stats.toolResults++
    } else if (entry.type === 'compaction') {
      stats.compactions++
    } else if (entry.type === 'branch_summary') {
      stats.branchSummaries++
    } else if (entry.type === 'custom_message') {
      stats.customMessages++
    }
  }

  stats.models = Array.from(modelSet)
  return stats
}

export function findToolResult(
  entries: SessionEntry[],
  toolCallId: string
): SessionEntry | null {
  return entries.find(
    e => e.type === 'message' &&
    e.message?.role === 'toolResult' &&
    e.message?.content.some((c: any) => c.id === toolCallId)
  ) || null
}