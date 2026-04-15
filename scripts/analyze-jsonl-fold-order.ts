import { readFileSync } from 'node:fs'

type Content = {
  type: string
  text?: string
  thinking?: string
  name?: string
  arguments?: Record<string, unknown>
}

type Message = {
  role: string
  content?: Content[]
  toolCallId?: string
  toolName?: string
}

type Entry = {
  type: string
  id: string
  parentId?: string | null
  timestamp: string
  message?: Message
  name?: string
}

const path = '/Users/dengwenyu/.pi/agent/sessions/--Users-dengwenyu-Dev-code-company-bestwond--/2026-04-15T01-15-43-715Z_05f18f9e-4829-4325-9ed8-e3609aeec0fb.jsonl'
const targetId = 'f46d0759'

const lines = readFileSync(path, 'utf8').trim().split('\n')
const entries: Entry[] = lines.map((line) => JSON.parse(line))
const byId = new Map(entries.map((entry) => [entry.id, entry]))

function roleSummary(entry: Entry): string {
  if (entry.type !== 'message') return entry.type
  return entry.message?.role || 'message?'
}

function contentSummary(entry: Entry): string {
  if (entry.type !== 'message') return ''
  const content = entry.message?.content || []
  return content.map((item) => {
    if (item.type === 'toolCall') return `tool:${item.name}`
    if (item.type === 'text') return `text:${(item.text || '').slice(0, 36).replace(/\n/g, ' ')}`
    if (item.type === 'thinking') return `thinking:${(item.thinking || '').slice(0, 24).replace(/\n/g, ' ')}`
    return item.type
  }).join(' | ')
}

function parentChain(entryId: string): Entry[] {
  const chain: Entry[] = []
  let current = byId.get(entryId)
  while (current) {
    chain.unshift(current)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return chain
}

const chain = parentChain(targetId)
const start = Math.max(0, chain.length - 20)
console.log('=== Parent chain tail around target ===')
for (const entry of chain.slice(start)) {
  console.log(`${entry.timestamp}  ${entry.id}  ${roleSummary(entry)}  ${contentSummary(entry)}`)
}

console.log('\n=== Immediate predecessor walk to target ===')
const targetIndex = chain.findIndex((entry) => entry.id === targetId)
for (const entry of chain.slice(Math.max(0, targetIndex - 12), targetIndex + 1)) {
  console.log(`${entry.id}  ${roleSummary(entry)}  ${contentSummary(entry)}`)
}

console.log('\n=== Tool-only assistant groups immediately before target ===')
const preceding = chain.slice(0, targetIndex)
let buffer: Entry[] = []
for (const entry of preceding) {
  if (entry.type === 'message' && entry.message?.role === 'assistant') {
    const content = entry.message.content || []
    const hasTool = content.some((item) => item.type === 'toolCall')
    const hasText = content.some((item) => item.type === 'text' && (item.text || '').trim())
    if (hasTool && !hasText) {
      buffer.push(entry)
      continue
    }
  }
  if (buffer.length) {
    console.log('GROUP END BEFORE', entry.id, roleSummary(entry), contentSummary(entry))
    for (const item of buffer) {
      console.log('  ', item.id, contentSummary(item))
    }
    buffer = []
  }
}
if (buffer.length) {
  console.log('TRAILING GROUP')
  for (const item of buffer) {
    console.log('  ', item.id, contentSummary(item))
  }
}

console.log('\n=== Entries around target in file order ===')
const fileIndex = entries.findIndex((entry) => entry.id === targetId)
for (const entry of entries.slice(Math.max(0, fileIndex - 20), fileIndex + 5)) {
  console.log(`${entry.timestamp}  ${entry.id}  parent=${entry.parentId}  ${roleSummary(entry)}  ${contentSummary(entry)}`)
}
