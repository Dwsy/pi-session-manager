import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SESSION_PATH = '/Users/dengwenyu/.pi/agent/sessions/--Users-dengwenyu-Dev-code-company-bestwond--/2026-04-15T01-15-43-715Z_05f18f9e-4829-4325-9ed8-e3609aeec0fb.jsonl'
const HTML_PATH = join(import.meta.dir, 'poc-agent-process-viewer.html')
const PORT = 9988

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

type ProcessEvent = {
  type: 'thinking' | 'toolCall' | 'toolResult'
  entryId: string
  text?: string
  name?: string
  preview?: string
  toolName?: string
  isError?: boolean
}

type Turn = {
  index: number
  userEntryId: string
  userText: string
  process: {
    summary: string
    events: ProcessEvent[]
  }
  answerEntryId?: string
  answerText: string
}

function parseJsonl(path: string): Entry[] {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
}

function buildChain(entries: Entry[]): Entry[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]))
  let leaf = entries[entries.length - 1]
  const chain: Entry[] = []
  while (leaf) {
    chain.unshift(leaf)
    leaf = leaf.parentId ? byId.get(leaf.parentId) as Entry : undefined as unknown as Entry
  }
  return chain
}

function textFromContent(content: Content[] = []): string {
  return content
    .filter((item) => item.type === 'text' && item.text?.trim())
    .map((item) => item.text?.trim())
    .join('\n\n')
}

function splitAssistantContent(content: Content[] = []) {
  const firstTextIndex = content.findIndex((item) => item.type === 'text' && item.text?.trim())
  if (firstTextIndex === -1) {
    return { processContent: content, visibleContent: [] as Content[] }
  }
  return {
    processContent: content.slice(0, firstTextIndex),
    visibleContent: content.slice(firstTextIndex),
  }
}

function processSummary(events: ProcessEvent[]): string {
  const counts = new Map<string, number>()
  for (const event of events) {
    if (event.type !== 'toolCall') continue
    const name = event.name || 'unknown'
    counts.set(name, (counts.get(name) || 0) + 1)
  }
  const summary = Array.from(counts.entries()).map(([name, count]) => `${name}(${count})`).join(' ')
  return summary || 'agent process'
}

function buildTurns(chain: Entry[]): Turn[] {
  const turns: Turn[] = []
  let currentTurn: Turn | null = null
  let pendingToolCallNameById = new Map<string, string>()

  for (const entry of chain) {
    if (entry.type !== 'message' || !entry.message) continue

    if (entry.message.role === 'user') {
      currentTurn = {
        index: turns.length,
        userEntryId: entry.id,
        userText: textFromContent(entry.message.content),
        process: { summary: '', events: [] },
        answerText: '',
      }
      pendingToolCallNameById = new Map()
      turns.push(currentTurn)
      continue
    }

    if (!currentTurn) continue

    if (entry.message.role === 'assistant') {
      const content = entry.message.content || []
      const { processContent, visibleContent } = splitAssistantContent(content)

      for (const item of processContent) {
        if (item.type === 'thinking') {
          currentTurn.process.events.push({
            type: 'thinking',
            entryId: entry.id,
            text: item.thinking || '',
          })
        }
        if (item.type === 'toolCall') {
          const preview = item.arguments ? JSON.stringify(item.arguments, null, 2) : ''
          currentTurn.process.events.push({
            type: 'toolCall',
            entryId: entry.id,
            name: item.name,
            preview: `${item.name || 'tool'}\n${preview}`,
          })
          const toolCallId = (item as any).id
          if (toolCallId) pendingToolCallNameById.set(toolCallId, item.name || 'unknown')
        }
      }

      const answerText = textFromContent(visibleContent)
      if (answerText) {
        currentTurn.answerEntryId = entry.id
        currentTurn.answerText = answerText
      }
      continue
    }

    if (entry.message.role === 'toolResult') {
      currentTurn.process.events.push({
        type: 'toolResult',
        entryId: entry.id,
        toolName: pendingToolCallNameById.get(entry.message.toolCallId || '') || entry.message.toolName || 'unknown',
        text: textFromContent(entry.message.content),
        isError: Boolean((entry.message as any).isError),
      })
    }
  }

  for (const turn of turns) {
    turn.process.summary = processSummary(turn.process.events)
  }

  return turns.filter((turn) => turn.userText || turn.process.events.length || turn.answerText)
}

const entries = parseJsonl(SESSION_PATH)
const chain = buildChain(entries)
const turns = buildTurns(chain)
const focusTurnIndex = turns.findIndex((turn) => turn.answerText.includes('系统用户 (SysUser) 和 普通用户 (SysMember)'))
const html = readFileSync(HTML_PATH, 'utf8')

Bun.serve({
  port: PORT,
  routes: {
    '/': new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } }),
    '/api/session': Response.json({
      path: SESSION_PATH,
      chainLength: chain.length,
      focusTurnIndex,
      turns,
    }),
  },
  fetch() {
    return new Response('not found', { status: 404 })
  },
})

console.log(`Agent process POC server: http://127.0.0.1:${PORT}`)
