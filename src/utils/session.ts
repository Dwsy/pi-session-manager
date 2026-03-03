import type { SessionEntry, LegacySessionStats } from '../types'

export function isTauriReady(): boolean {
  return typeof window !== 'undefined' && window.__TAURI__ !== undefined
}

export function parseSessionEntries(jsonlContent: string): SessionEntry[] {
  return parseSessionEntriesWithLineCount(jsonlContent).entries
}

export function parseSessionEntriesWithLineCount(jsonlContent: string): {
  entries: SessionEntry[]
  lineCount: number
} {
  const entries: SessionEntry[] = []
  const lines = jsonlContent.split('\n')
  const seenIds = new Map<string, number>()
  let lineCount = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    lineCount++

    try {
      const entry = JSON.parse(line)

      if (entry.id) {
        const originalId = entry.id as string
        const count = seenIds.get(originalId) || 0
        if (count > 0) {
          entry.id = `${originalId}__dup_${count}`
        }
        seenIds.set(originalId, count + 1)
      }

      entries.push(entry)
    } catch (_error) {
      // Skip malformed lines silently to avoid noisy console churn on large sessions.
    }
  }

  return { entries, lineCount }
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
export function getSessionSourceTag(sessionPath: string): string | null {
  if (!sessionPath) return null;
  // Normalize path separators
  const normalizedPath = sessionPath.replace(/\\/g, '/');
  const parts = normalizedPath.split('/').filter(Boolean);
  
  // Find the last "sessions" directory
  const sessionsIndex = parts.lastIndexOf('sessions');
  if (sessionsIndex > 0) {
    const sourceDir = parts[sessionsIndex - 1];
    // Default source is "agent"
    if (sourceDir !== 'agent') {
      return sourceDir;
    }
  }
  return null;
}
