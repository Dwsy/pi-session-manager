import type { PsmCapabilityClient } from '@dwsy/plugin-sdk'

import type { SessionEntry } from '@/types'

export function normalizeEntries(entries: unknown[]): SessionEntry[] {
  return entries.filter((entry): entry is SessionEntry => {
    return Boolean(entry && typeof entry === 'object' && 'id' in entry && 'type' in entry)
  })
}

export function buildToolResultByCallId(entries: SessionEntry[]) {
  const byCallId = new Map<string, SessionEntry>()

  for (const entry of entries) {
    if (entry.message?.role !== 'toolResult') continue
    const toolCallId = entry.message.toolCallId
    if (toolCallId) byCallId.set(toolCallId, entry)
  }

  return byCallId
}

export async function readSessionEntries(client: PsmCapabilityClient, sessionPath: string) {
  return normalizeEntries(await client.sessions.readEntries(sessionPath))
}
