import type { Content, Message, SessionEntry } from '../types'
import type { RPCEvent } from '../hooks/usePiRPC'

export interface RPCMessage {
  id: string
  role: string
  content?: unknown
  tool_call_id?: string
  toolCallId?: string
  tool_name?: string
  tool_args?: Record<string, unknown>
  tool_result?: unknown
  tool_status?: string
  timestamp?: unknown
}

export interface RPCStreamingState {
  currentAssistantId: string | null
  sequence: number
}

export function createRPCStreamingState(): RPCStreamingState {
  return { currentAssistantId: null, sequence: 0 }
}

function normalizeTimestamp(timestamp: unknown, fallback?: string): string {
  if (typeof timestamp === 'string' && timestamp.trim().length > 0) {
    return timestamp
  }

  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) {
    const millis = timestamp > 1_000_000_000_000 ? timestamp : timestamp * 1000
    const date = new Date(millis)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }

  return fallback || new Date().toISOString()
}

function nextStreamingId(state: RPCStreamingState): string {
  state.sequence += 1
  return `rpc-${Date.now()}-${state.sequence}`
}

function ensureContentBucket(content: Content[], type: Content['type']): Content[] {
  if (content.length === 0 || content[content.length - 1].type !== type) {
    return [...content, { type }]
  }
  return content
}

function appendToContent(entry: SessionEntry, type: Content['type'], delta: string): SessionEntry {
  const message = entry.message
  if (!message) return entry

  let content = ensureContentBucket(message.content, type)
  const lastIndex = content.length - 1
  const last = content[lastIndex]

  if (type === 'text') {
    const text = (last.text || '') + delta
    content = [...content.slice(0, lastIndex), { ...last, text }]
  } else if (type === 'thinking') {
    const thinking = (last.thinking || '') + delta
    content = [...content.slice(0, lastIndex), { ...last, thinking }]
  }

  return {
    ...entry,
    message: {
      ...message,
      content,
    },
  }
}

function parseToolCallArguments(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      return { input: value }
    }
    return { input: value }
  }

  return undefined
}

function messageToContent(message: RPCMessage): Content[] {
  const content: Content[] = []

  if (typeof message.content === 'string') {
    content.push({ type: 'text', text: message.content })
  } else if (Array.isArray(message.content)) {
    for (const part of message.content) {
      if (!part || typeof part !== 'object') continue
      const p = part as Record<string, unknown>
      const partType = typeof p.type === 'string' ? p.type : ''

      if (partType === 'text' && typeof p.text === 'string') {
        content.push({ type: 'text', text: p.text })
        continue
      }

      if (partType === 'thinking' && typeof p.thinking === 'string') {
        content.push({ type: 'thinking', thinking: p.thinking })
        continue
      }

      if ((partType === 'toolCall' || partType === 'tool_use') && typeof p.name === 'string') {
        content.push({
          type: 'toolCall',
          id: typeof p.id === 'string' ? p.id : undefined,
          name: p.name,
          arguments: parseToolCallArguments(p.arguments ?? p.input),
        })
        continue
      }

      if (typeof p.text === 'string') {
        content.push({ type: 'text', text: p.text })
      }
    }
  } else if (typeof message.tool_result === 'string') {
    content.push({ type: 'text', text: message.tool_result })
  } else if (message.tool_result !== undefined && message.tool_result !== null) {
    content.push({ type: 'text', text: JSON.stringify(message.tool_result) })
  }

  if (message.tool_name) {
    content.push({
      type: 'toolCall',
      id: message.id,
      name: message.tool_name,
      arguments: message.tool_args,
    })
  }
  return content
}

function partialToContent(partial: unknown): Content[] | null {
  if (!partial || typeof partial !== 'object') return null
  const record = partial as Record<string, unknown>
  let content = record.content
  if (!Array.isArray(content) && record.message && typeof record.message === 'object') {
    const message = record.message as Record<string, unknown>
    if (Array.isArray(message.content)) {
      content = message.content
    }
  }

  if (Array.isArray(content)) {
    return messageToContent({ role: 'assistant', content })
  }

  if (typeof record.text === 'string') {
    return [{ type: 'text', text: record.text }]
  }

  if (typeof record.thinking === 'string') {
    return [{ type: 'thinking', thinking: record.thinking }]
  }

  return null
}

export function rpcMessageToSessionEntry(message: RPCMessage, fallbackTimestamp?: string): SessionEntry {
  const content = messageToContent(message)
  const role = message.role || 'assistant'
  const msg: Message & Record<string, unknown> = {
    role,
    content,
  }

  if (role === 'tool' || role === 'toolResult' || role === 'tool_result') {
    const toolCallId = message.tool_call_id || message.toolCallId || message.id
    msg.toolCallId = toolCallId
    if (message.tool_status === 'error') {
      msg.isError = true
    }
    if (typeof message.tool_result === 'string') {
      msg.output = message.tool_result
    }
  }

  const timestamp = normalizeTimestamp(message.timestamp, fallbackTimestamp)

  return {
    type: 'message',
    id: message.id,
    timestamp,
    message: msg as Message,
  }
}

export function mergeRPCMessages(
  entries: SessionEntry[],
  messages: RPCMessage[]
): SessionEntry[] {
  if (messages.length === 0) return entries

  const nextEntries = [...entries]
  const indexById = new Map<string, number>()
  nextEntries.forEach((entry, index) => {
    indexById.set(entry.id, index)
  })

  for (const message of messages) {
    const existingIndex = indexById.get(message.id)
    const existingEntry =
      existingIndex !== undefined ? nextEntries[existingIndex] : undefined
    const fallbackTimestamp =
      existingEntry?.type === 'message' ? existingEntry.timestamp : undefined
    const entry = rpcMessageToSessionEntry(message, fallbackTimestamp)

    if (existingIndex === undefined) {
      indexById.set(entry.id, nextEntries.length)
      nextEntries.push(entry)
    } else {
      const existing = nextEntries[existingIndex]
      if (existing?.type === 'message') {
        nextEntries[existingIndex] = entry
      }
    }
  }

  return nextEntries
}

function parseEntryTimestamp(entry: SessionEntry): number | null {
  const ts = Date.parse(entry.timestamp)
  return Number.isNaN(ts) ? null : ts
}

function sortEntriesByTimestamp(entries: SessionEntry[]): SessionEntry[] {
  return entries
    .map((entry, index) => ({
      entry,
      index,
      timestamp: parseEntryTimestamp(entry),
    }))
    .sort((a, b) => {
      if (a.timestamp === null && b.timestamp === null) {
        return a.index - b.index
      }
      if (a.timestamp === null) return 1
      if (b.timestamp === null) return -1
      if (a.timestamp === b.timestamp) {
        return a.index - b.index
      }
      return a.timestamp - b.timestamp
    })
    .map((item) => item.entry)
}

export function replaceEntriesWithRPCMessages(
  entries: SessionEntry[],
  messages: RPCMessage[]
): SessionEntry[] {
  const existingMessageEntryById = new Map<string, SessionEntry>()
  for (const entry of entries) {
    if (entry.type === 'message') {
      existingMessageEntryById.set(entry.id, entry)
    }
  }

  const nonMessageEntries = entries.filter(entry => entry.type !== 'message')
  const seen = new Set<string>()
  const rpcMessageEntries: SessionEntry[] = []

  const rpcUserCandidates: Array<{ text: string; timestamp?: string }> = []

  for (const message of messages) {
    if (!message.id || seen.has(message.id)) continue
    seen.add(message.id)

    const existingEntry = existingMessageEntryById.get(message.id)
    const fallbackTimestamp =
      existingEntry?.type === 'message' ? existingEntry.timestamp : undefined

    const entry = rpcMessageToSessionEntry(message, fallbackTimestamp)
    rpcMessageEntries.push(entry)

    if (entry.message?.role === 'user') {
      const text = extractTextFromContent(entry.message.content)
      if (text) {
        rpcUserCandidates.push({ text, timestamp: entry.timestamp })
      }
    }
  }

  const preservedUserEntries: SessionEntry[] = []
  for (const entry of existingMessageEntryById.values()) {
    if (seen.has(entry.id)) continue
    if (entry.type !== 'message') continue
    if (entry.message?.role !== 'user') continue
    if (entry.id.startsWith('local-user-')) {
      const localText = extractTextFromContent(entry.message.content)
      if (localText && shouldDropOptimisticUser(localText, entry.timestamp, rpcUserCandidates)) {
        continue
      }
    }
    preservedUserEntries.push(entry)
  }

  return sortEntriesByTimestamp([
    ...nonMessageEntries,
    ...rpcMessageEntries,
    ...preservedUserEntries,
  ])
}

function extractTextFromContent(content: Content[] | undefined): string {
  if (!content) return ''
  return content
    .filter(part => part.type === 'text' && part.text)
    .map(part => part.text || '')
    .join('')
    .trim()
}

function shouldDropOptimisticUser(
  localText: string,
  localTimestamp: string,
  candidates: Array<{ text: string; timestamp?: string }>
): boolean {
  if (candidates.length === 0) return false
  const localTime = new Date(localTimestamp).getTime()
  const normalizedLocal = normalizeText(localText)

  for (const candidate of candidates) {
    const normalizedCandidate = normalizeText(candidate.text)
    if (!normalizedCandidate || normalizedCandidate !== normalizedLocal) continue
    if (!candidate.timestamp) return true
    const remoteTime = new Date(candidate.timestamp).getTime()
    if (!Number.isNaN(localTime) && !Number.isNaN(remoteTime)) {
      const delta = Math.abs(remoteTime - localTime)
      if (delta <= 60000) {
        return true
      }
    }
  }

  return false
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function extractMessageInfo(event: RPCEvent): {
  id?: string
  role?: string
  timestamp?: string
} {
  if (!event.message || typeof event.message !== 'object') return {}
  const message = event.message as Record<string, unknown>
  const id = typeof message.id === 'string' ? message.id : undefined
  const role = typeof message.role === 'string' ? message.role : undefined
  let timestamp: string | undefined
  if (typeof message.timestamp === 'string') {
    timestamp = message.timestamp
  } else if (typeof message.timestamp === 'number' && Number.isFinite(message.timestamp)) {
    const millis =
      message.timestamp > 1_000_000_000_000 ? message.timestamp : message.timestamp * 1000
    const parsed = new Date(millis)
    if (!Number.isNaN(parsed.getTime())) {
      timestamp = parsed.toISOString()
    }
  }
  return { id, role, timestamp }
}

function rebindAssistantEntryId(
  entries: SessionEntry[],
  fromId: string,
  toId: string
): SessionEntry[] {
  if (fromId === toId) return entries
  if (entries.some(entry => entry.id === toId)) return entries

  const index = entries.findIndex(
    entry => entry.id === fromId && entry.type === 'message' && entry.message?.role === 'assistant'
  )
  if (index < 0) return entries

  const updated = [...entries]
  updated[index] = {
    ...updated[index],
    id: toId,
  }
  return updated
}

function ensureAssistantEntry(
  entries: SessionEntry[],
  entryId: string,
  timestamp: string
): { entries: SessionEntry[]; index: number } {
  const index = entries.findIndex(entry => entry.id === entryId)
  if (index >= 0) {
    return { entries, index }
  }

  const newEntry: SessionEntry = {
    type: 'message',
    id: entryId,
    timestamp,
    message: {
      role: 'assistant',
      content: [],
    },
  }

  return { entries: [...entries, newEntry], index: entries.length }
}

function extractEntryFromEventMessage(
  event: RPCEvent,
  fallbackId?: string
): { id: string; entry: SessionEntry; role: string } | null {
  if (!event.message || typeof event.message !== 'object') {
    return null
  }

  const message = event.message as Record<string, unknown>
  const role = typeof message.role === 'string' ? message.role : undefined

  const rawId = typeof message.id === 'string' ? message.id.trim() : ''
  const entryId = rawId || fallbackId
  if (!entryId) {
    return null
  }

  const timestamp = normalizeTimestamp(message.timestamp)
  const rpcMessage: RPCMessage = {
    id: entryId,
    role: role || 'assistant',
    content: message.content,
    tool_call_id: typeof message.toolCallId === 'string' ? message.toolCallId : undefined,
    toolCallId: typeof message.toolCallId === 'string' ? message.toolCallId : undefined,
    tool_name: typeof message.toolName === 'string' ? message.toolName : undefined,
    tool_args:
      typeof message.toolArgs === 'object' && message.toolArgs && !Array.isArray(message.toolArgs)
        ? (message.toolArgs as Record<string, unknown>)
        : undefined,
    tool_result: message.toolResult,
    tool_status: typeof message.toolStatus === 'string' ? message.toolStatus : undefined,
    timestamp: message.timestamp,
  }

  return {
    id: entryId,
    entry: rpcMessageToSessionEntry(rpcMessage, timestamp),
    role: rpcMessage.role,
  }
}

function upsertMessageEntry(entries: SessionEntry[], nextEntry: SessionEntry): SessionEntry[] {
  const index = entries.findIndex(
    entry => entry.id === nextEntry.id && entry.type === 'message'
  )
  if (index < 0) {
    return [...entries, nextEntry]
  }

  const updated = [...entries]
  updated[index] = {
    ...nextEntry,
    timestamp: updated[index].timestamp || nextEntry.timestamp,
  }
  return updated
}

function upsertAssistantEntry(entries: SessionEntry[], nextEntry: SessionEntry): SessionEntry[] {
  const index = entries.findIndex(
    entry => entry.id === nextEntry.id && entry.type === 'message' && entry.message?.role === 'assistant'
  )
  if (index < 0) {
    return [...entries, nextEntry]
  }

  const updated = [...entries]
  updated[index] = {
    ...nextEntry,
    timestamp: updated[index].timestamp || nextEntry.timestamp,
  }
  return updated
}

export function applyRPCEventToEntries(
  entries: SessionEntry[],
  event: RPCEvent,
  state: RPCStreamingState
): { entries: SessionEntry[]; updatedEntryId?: string } {
  const { id, role, timestamp } = extractMessageInfo(event)
  let nextEntries = entries
  const shouldIgnoreEventMessage = Boolean(event.assistant_message_event)
  const messageEntry = shouldIgnoreEventMessage
    ? null
    : extractEntryFromEventMessage(event, id || state.currentAssistantId || undefined)

  let entryId = id || state.currentAssistantId
  if (messageEntry) {
    entryId = messageEntry.id
    if (messageEntry.role === 'assistant') {
      if (state.currentAssistantId && state.currentAssistantId !== messageEntry.id) {
        nextEntries = rebindAssistantEntryId(nextEntries, state.currentAssistantId, messageEntry.id)
      }
      nextEntries = upsertAssistantEntry(nextEntries, messageEntry.entry)
      state.currentAssistantId = messageEntry.id
    } else {
      nextEntries = upsertMessageEntry(nextEntries, messageEntry.entry)
    }
  }

  const isTerminalAssistantEvent =
    event.type === 'message_end' || event.type === 'turn_end' || event.type === 'agent_end'

  if (!event.assistant_message_event) {
    if (isTerminalAssistantEvent) {
      state.currentAssistantId = null
    }
    const shouldUpdateActive =
      messageEntry?.role === 'assistant' || messageEntry?.role === 'user'
    return { entries: nextEntries, updatedEntryId: shouldUpdateActive ? messageEntry?.id : undefined }
  }

  const assistantEvent = event.assistant_message_event
  if (role && role !== 'assistant') {
    return { entries: nextEntries, updatedEntryId: messageEntry?.id }
  }

  if (id && state.currentAssistantId && id !== state.currentAssistantId) {
    nextEntries = rebindAssistantEntryId(nextEntries, state.currentAssistantId, id)
  }

  entryId = id || state.currentAssistantId
  if (!entryId) {
    entryId = nextStreamingId(state)
  }
  state.currentAssistantId = entryId

  const updateEntry = (type: Content['type'], delta: string) => {
    const existing = nextEntries.find(
      entry => entry.id === entryId && entry.type === 'message' && entry.message?.role === 'assistant'
    )
    const entryTimestamp = timestamp || existing?.timestamp || new Date().toISOString()
    const ensured = ensureAssistantEntry(nextEntries, entryId as string, entryTimestamp)
    nextEntries = ensured.entries
    const updated = appendToContent(nextEntries[ensured.index], type, delta)
    const updatedEntries = [...nextEntries]
    updatedEntries[ensured.index] = updated
    nextEntries = updatedEntries
  }

  const ensureEntry = () => {
    const existing = nextEntries.find(
      entry => entry.id === entryId && entry.type === 'message' && entry.message?.role === 'assistant'
    )
    const entryTimestamp = timestamp || existing?.timestamp || new Date().toISOString()
    const ensured = ensureAssistantEntry(nextEntries, entryId as string, entryTimestamp)
    nextEntries = ensured.entries
  }

  const applyPartialContent = (content: Content[]) => {
    const existing = nextEntries.find(
      entry => entry.id === entryId && entry.type === 'message' && entry.message?.role === 'assistant'
    )
    const entryTimestamp = timestamp || existing?.timestamp || new Date().toISOString()
    const ensured = ensureAssistantEntry(nextEntries, entryId as string, entryTimestamp)
    const entry = ensured.entries[ensured.index]
    const message = entry.message
    if (!message) return
    const updated = {
      ...entry,
      message: {
        ...message,
        content,
      },
    }
    const updatedEntries = [...ensured.entries]
    updatedEntries[ensured.index] = updated
    nextEntries = updatedEntries
  }

  const partialContent = partialToContent(assistantEvent.partial)

  switch (assistantEvent.type) {
    case 'text_start':
    case 'text_delta':
      if (!messageEntry) {
        const delta = assistantEvent.delta || assistantEvent.content || ''
        if (delta) {
          updateEntry('text', delta)
        } else if (partialContent) {
          applyPartialContent(partialContent)
        } else {
          ensureEntry()
        }
      }
      break
    case 'thinking_start':
    case 'thinking_delta':
      if (!messageEntry) {
        const delta = assistantEvent.delta || assistantEvent.thinking || assistantEvent.content || ''
        if (delta) {
          updateEntry('thinking', delta)
        } else if (partialContent) {
          applyPartialContent(partialContent)
        } else {
          ensureEntry()
        }
      }
      break
    case 'start':
      if (!messageEntry) {
        if (partialContent) {
          applyPartialContent(partialContent)
        } else {
          ensureEntry()
        }
      }
      break
    case 'toolcall_start':
      if (!messageEntry && assistantEvent.tool_call) {
        const existing = nextEntries.find(
          entry => entry.id === entryId && entry.type === 'message' && entry.message?.role === 'assistant'
        )
        const entryTimestamp = timestamp || existing?.timestamp || new Date().toISOString()
        const ensured = ensureAssistantEntry(nextEntries, entryId, entryTimestamp)
        const entry = ensured.entries[ensured.index]
        const message = entry.message
        if (message) {
          const content = [
            ...message.content,
            {
              type: 'toolCall' as const,
              id: assistantEvent.tool_call.id,
              name: assistantEvent.tool_call.name,
              arguments: assistantEvent.tool_call.arguments,
            },
          ]
          const updated = {
            ...entry,
            message: { ...message, content },
          }
          const updatedEntries = [...ensured.entries]
          updatedEntries[ensured.index] = updated
          nextEntries = updatedEntries
        }
      }
      break
    case 'toolcall_delta':
    case 'toolcall_end':
      if (!messageEntry && partialContent) {
        applyPartialContent(partialContent)
      }
      break
    case 'done':
    case 'text_end':
    case 'thinking_end':
      state.currentAssistantId = null
      break
    default:
      break
  }

  return { entries: nextEntries, updatedEntryId: entryId }
}
