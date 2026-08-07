import type { PsmSessionJsonlEntry } from '@pi-session-manager/plugin-sdk'

const MAX_CONTEXT_ENTRIES = 80
const MAX_CONTEXT_CHARS = 36000
const MIN_ENTRY_TEXT_CHARS = 180
const PRIMARY_CONTEXT_TARGET = 60
const EVIDENCE_CONTEXT_TARGET = 16

type ContextSignal = 'primary' | 'evidence' | 'context'

interface EntryDescriptor {
  label: string
  text: string
  signal: ContextSignal
}

interface ContextCandidate {
  index: number
  entry: PsmSessionJsonlEntry
  descriptor: EntryDescriptor
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''

  return content
    .map((part) => {
      const object = asObject(part)
      if (!object) return ''
      if (typeof object.text === 'string') return object.text.trim()
      if (object.type === 'toolCall' && typeof object.name === 'string') {
        return `[tool call: ${object.name}]`
      }
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

function metadataText(entry: PsmSessionJsonlEntry): string {
  const parts: string[] = []
  if (typeof entry.provider === 'string' && entry.provider.trim()) {
    parts.push(`provider=${entry.provider.trim()}`)
  }
  if (typeof entry.modelId === 'string' && entry.modelId.trim()) {
    parts.push(`model=${entry.modelId.trim()}`)
  }
  if (typeof entry.thinkingLevel === 'string' && entry.thinkingLevel.trim()) {
    parts.push(`thinking=${entry.thinkingLevel.trim()}`)
  }
  return parts.join(' ')
}

function isStructuralEntry(entry: PsmSessionJsonlEntry): boolean {
  const type = entry.type.toLowerCase()
  return type === 'label'
    || type.includes('branch')
    || type.includes('compaction')
    || type.includes('model')
}

function entryDescriptor(entry: PsmSessionJsonlEntry): EntryDescriptor | null {
  const message = asObject(entry.message)
  const role = message && typeof message.role === 'string' ? message.role : ''
  const messageText = message ? textFromContent(message.content) : ''
  const metadata = metadataText(entry)

  if (role === 'user' || role === 'assistant') {
    if (messageText) {
      return {
        label: `${entry.type}/${role}`,
        text: metadata ? `${messageText}\n[session metadata: ${metadata}]` : messageText,
        signal: 'primary',
      }
    }
  }

  if (role === 'toolResult') {
    const toolCallId = message && typeof message.toolCallId === 'string'
      ? message.toolCallId.trim()
      : ''
    const fallback = toolCallId ? `[tool result: ${toolCallId}]` : '[tool result]'
    return {
      label: `${entry.type}/${role}`,
      text: messageText || fallback,
      signal: 'evidence',
    }
  }

  if (entry.type === 'label') {
    const label = typeof entry.label === 'string' ? entry.label.trim() : ''
    const target = typeof entry.targetId === 'string' ? ` target=${entry.targetId}` : ''
    if (label) return { label: 'label', text: `${label}${target}`, signal: 'primary' }
  }

  const summary = typeof entry.summary === 'string' ? entry.summary.trim() : ''
  if (summary) {
    return {
      label: entry.type,
      text: metadata ? `${summary}\n[session metadata: ${metadata}]` : summary,
      signal: isStructuralEntry(entry) ? 'primary' : 'context',
    }
  }

  const contentText = textFromContent(entry.content)
  if (contentText) {
    return {
      label: entry.type,
      text: metadata ? `${contentText}\n[session metadata: ${metadata}]` : contentText,
      signal: isStructuralEntry(entry) ? 'primary' : 'context',
    }
  }

  if (metadata) return { label: entry.type, text: metadata, signal: 'primary' }

  return null
}

function sampleEvenly<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items
  if (limit <= 1) return items.slice(0, 1)

  const selected: T[] = []
  const used = new Set<number>()
  for (let position = 0; position < limit; position += 1) {
    const index = Math.round((position * (items.length - 1)) / (limit - 1))
    if (used.has(index)) continue
    used.add(index)
    selected.push(items[index]!)
  }
  return selected
}

function selectPrioritized(candidates: ContextCandidate[], limit: number): ContextCandidate[] {
  if (candidates.length <= limit) return candidates

  const primary = candidates.filter((candidate) => candidate.descriptor.signal === 'primary')
  const evidence = candidates.filter((candidate) => candidate.descriptor.signal === 'evidence')
  const selected = [
    ...sampleEvenly(primary, Math.min(PRIMARY_CONTEXT_TARGET, primary.length)),
    ...sampleEvenly(evidence, Math.min(EVIDENCE_CONTEXT_TARGET, evidence.length)),
  ]
  const selectedIndexes = new Set(selected.map((candidate) => candidate.index))
  const remaining = candidates.filter((candidate) => !selectedIndexes.has(candidate.index))
  selected.push(...sampleEvenly(remaining, Math.max(0, limit - selected.length)))

  return selected
    .slice(0, limit)
    .sort((a, b) => a.index - b.index)
}

export function buildDecisionGraphContext(entries: PsmSessionJsonlEntry[]): string {
  const candidates = entries
    .map((entry, index) => ({ index, entry, descriptor: entryDescriptor(entry) }))
    .filter((item): item is ContextCandidate => Boolean(item.descriptor))

  const selected = selectPrioritized(candidates, MAX_CONTEXT_ENTRIES)
  if (selected.length === 0) return 'No analyzable session entries.'

  const perEntryBudget = Math.max(
    MIN_ENTRY_TEXT_CHARS,
    Math.floor(MAX_CONTEXT_CHARS / selected.length) - 80,
  )

  return selected
    .map(({ entry, descriptor }) => {
      const text = descriptor.text.length > perEntryBudget
        ? `${descriptor.text.slice(0, perEntryBudget)}…[truncated]`
        : descriptor.text
      const parent = typeof entry.parentId === 'string' ? ` parent=${entry.parentId}` : ''
      return `ENTRY ${entry.id}${parent} [${descriptor.label}; signal=${descriptor.signal}]\n${text}`
    })
    .join('\n\n')
    .slice(0, MAX_CONTEXT_CHARS)
}
