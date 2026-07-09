import type { PsmPluginHostContext } from '@pi-session-manager/plugin-sdk'
import { manifest } from './manifest'

type HashlineEntry = {
  lineNum: number
  content: string
}

type HashlineEdit = {
  op?: unknown
  pos?: unknown
  end?: unknown
  lines?: unknown
  oldText?: unknown
  newText?: unknown
}

type ToolCallInfo = {
  name: string
  args: Record<string, unknown>
}

const HASHLINE_PREFIX_RE = /^\s*\d+#[A-Za-z0-9]+:/
const HASHLINE_LINE_RE = /^\s*(\d+)#[A-Za-z0-9]+:(.*)$/

export { manifest }

export function activate(ctx: PsmPluginHostContext) {
  ctx.registerSessionEntryTransformer({
    id: 'builtin-hashline-transformer.entries',
    name: 'Hashline Session Entry Transformer',
    priority: 120,
    transform: normalizeHashlineSessionEntries,
  })
}

function normalizeHashlineSessionEntries(entries: unknown[]): unknown[] {
  const toolCalls = collectToolCalls(entries)
  return entries.map(entry => normalizeEntry(entry, toolCalls))
}

function hasHashlineFormat(text: unknown): text is string {
  return typeof text === 'string' && text.split('\n').some(line => HASHLINE_PREFIX_RE.test(line))
}

function cleanHashlineOutput(output: string): string {
  if (!hasHashlineFormat(output)) return output
  return output.split('\n').map(stripHashlineAnchor).join('\n')
}

function stripHashlineAnchor(line: string): string {
  const match = line.match(HASHLINE_LINE_RE)
  return match ? match[2] : line
}

function parseHashlineEntries(text: string): HashlineEntry[] {
  const entries: HashlineEntry[] = []

  for (const line of text.split('\n')) {
    const match = line.match(HASHLINE_LINE_RE)
    if (!match) continue

    entries.push({
      lineNum: Number.parseInt(match[1], 10),
      content: match[2],
    })
  }

  return entries
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function lineNumFromAnchor(value: unknown): number | null {
  if (typeof value !== 'string') return null

  const match = value.match(/^(\d+)#/)
  if (!match) return null

  return Number.parseInt(match[1], 10)
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(item => String(item))
}

function editArray(value: unknown): HashlineEdit[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is HashlineEdit => isRecord(item))
}

function markMatchingSequence(
  entries: HashlineEntry[],
  changedLines: Set<number>,
  expectedLines: string[],
  startLine: number,
): boolean {
  if (expectedLines.length === 0) return false

  const startIndex = entries.findIndex(entry => entry.lineNum >= startLine)
  if (startIndex < 0) return false

  for (let index = startIndex; index <= entries.length - expectedLines.length; index += 1) {
    const candidate = entries.slice(index, index + expectedLines.length)
    const matches = candidate.every((entry, offset) => entry.content === expectedLines[offset])
    if (!matches) continue

    for (const entry of candidate) {
      changedLines.add(entry.lineNum)
    }
    return true
  }

  return false
}

function markReplacementRange(
  entries: HashlineEntry[],
  changedLines: Set<number>,
  startLine: number,
  endLine: number | null,
  replacementLines: string[],
): void {
  if (markMatchingSequence(entries, changedLines, replacementLines, startLine)) return

  const fallbackEnd = endLine ?? startLine + Math.max(replacementLines.length - 1, 0)
  for (const entry of entries) {
    if (entry.lineNum >= startLine && entry.lineNum <= fallbackEnd) {
      changedLines.add(entry.lineNum)
    }
  }
}

function markInsertedLines(
  entries: HashlineEntry[],
  changedLines: Set<number>,
  anchorLine: number,
  insertedLines: string[],
): void {
  if (markMatchingSequence(entries, changedLines, insertedLines, anchorLine)) return

  for (const line of insertedLines) {
    const entry = entries.find(item => item.lineNum >= anchorLine && item.content === line)
    if (entry) changedLines.add(entry.lineNum)
  }
}

function buildChangedLineSet(entries: HashlineEntry[], args: Record<string, unknown>): Set<number> {
  const changedLines = new Set<number>()

  for (const edit of editArray(args.edits)) {
    const op = String(edit.op ?? '')
    const posLine = lineNumFromAnchor(edit.pos)
    const lines = stringArray(edit.lines)

    if (op === 'replace' && posLine !== null) {
      markReplacementRange(entries, changedLines, posLine, lineNumFromAnchor(edit.end), lines)
      continue
    }

    if (op === 'append' && posLine !== null) {
      markInsertedLines(entries, changedLines, posLine + 1, lines)
      continue
    }

    if (op === 'prepend' && posLine !== null) {
      markInsertedLines(entries, changedLines, posLine, lines)
    }
  }

  return changedLines
}

function replaceTextDiffLines(args: Record<string, unknown>): string[] {
  const diffLines: string[] = []

  for (const edit of editArray(args.edits)) {
    if (edit.op !== 'replace_text') continue

    for (const line of String(edit.oldText ?? '').split('\n')) {
      diffLines.push(`- 0 ${line}`)
    }
    for (const line of String(edit.newText ?? '').split('\n')) {
      diffLines.push(`+ 0 ${line}`)
    }
  }

  return diffLines
}

function cleanHashlineDiff(diffText: string, args: Record<string, unknown>): string {
  if (!hasHashlineFormat(diffText)) return diffText

  const entries = parseHashlineEntries(diffText)
  if (entries.length === 0) return diffText

  const changedLines = buildChangedLineSet(entries, args)
  const diffLines = entries.map(entry => {
    const marker = changedLines.has(entry.lineNum) ? '+' : ' '
    return `${marker} ${entry.lineNum} ${entry.content}`
  })

  diffLines.push(...replaceTextDiffLines(args))
  return diffLines.join('\n')
}

function collectToolCalls(entries: unknown[]): Map<string, ToolCallInfo> {
  const toolCalls = new Map<string, ToolCallInfo>()

  for (const entry of entries) {
    const message = asRecord(asRecord(entry).message)
    const content = message.content
    if (!Array.isArray(content)) continue

    for (const item of content) {
      const block = asRecord(item)
      if (block.type !== 'toolCall') continue

      const id = typeof block.id === 'string'
        ? block.id
        : typeof block.toolCallId === 'string'
          ? block.toolCallId
          : ''
      if (!id) continue

      toolCalls.set(id, {
        name: typeof block.name === 'string' ? block.name : 'unknown',
        args: asRecord(block.arguments),
      })
    }
  }

  return toolCalls
}

function normalizeEntry(entry: unknown, toolCalls: Map<string, ToolCallInfo>): unknown {
  if (!isRecord(entry)) return entry

  const message = asRecord(entry.message)
  if (message.role !== 'toolResult') return entry

  const toolCallId = getToolResultCallId(message)
  const toolCall = toolCallId ? toolCalls.get(toolCallId) : undefined
  if (!toolCall || !['read', 'edit'].includes(toolCall.name.toLowerCase())) return entry

  const normalizedMessage = normalizeToolResultMessage(message, toolCall)
  if (normalizedMessage === message) return entry

  return {
    ...entry,
    message: normalizedMessage,
  }
}

function getToolResultCallId(message: Record<string, unknown>): string {
  if (typeof message.toolCallId === 'string') return message.toolCallId

  const content = message.content
  if (!Array.isArray(content)) return ''

  for (const item of content) {
    const block = asRecord(item)
    if (typeof block.id === 'string') return block.id
    if (typeof block.toolCallId === 'string') return block.toolCallId
  }

  return ''
}

function normalizeToolResultMessage(message: Record<string, unknown>, toolCall: ToolCallInfo): Record<string, unknown> {
  const output = typeof message.output === 'string' ? message.output : ''
  const content = Array.isArray(message.content)
    ? message.content.map(item => normalizeToolResultBlock(item, toolCall))
    : message.content

  const normalized: Record<string, unknown> = {
    ...message,
    content,
  }

  if (output) normalized.output = cleanHashlineOutput(output)

  const details = normalizeDetails(message.details, toolCall, output)
  if (details) normalized.details = details

  return normalized
}

function normalizeToolResultBlock(block: unknown, toolCall: ToolCallInfo): unknown {
  if (!isRecord(block)) return block

  const normalized: Record<string, unknown> = { ...block }
  const fallbackText = String(normalized.text ?? normalized.output ?? '')

  for (const key of ['text', 'output']) {
    const value = normalized[key]
    if (typeof value === 'string') normalized[key] = cleanHashlineOutput(value)
  }

  const details = normalizeDetails(normalized.details, toolCall, fallbackText)
  if (details) normalized.details = details

  return normalized
}

function normalizeDetails(details: unknown, toolCall: ToolCallInfo, fallbackText: string): Record<string, unknown> | null {
  if (toolCall.name.toLowerCase() !== 'edit') return isRecord(details) ? details : null

  if (!isRecord(details)) {
    return hasHashlineFormat(fallbackText)
      ? { diff: cleanHashlineDiff(fallbackText, toolCall.args) }
      : null
  }

  const normalized = { ...details }
  const diff = typeof normalized.diff === 'string' ? normalized.diff : ''

  if (diff) {
    normalized.diff = cleanHashlineDiff(diff, toolCall.args)
  } else if (hasHashlineFormat(fallbackText)) {
    normalized.diff = cleanHashlineDiff(fallbackText, toolCall.args)
  }

  return normalized
}
