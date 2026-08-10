/**
 * pi-notes — Pi runtime extension.
 *
 * Stores human/agent-readable drawing notes in the current Pi branch via
 * appendEntry('pi-note', ...). The PSM plugin reads the same branch entries.
 */

import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g

function stripAnsi(text: string): string {
  return text.replace(ANSI_PATTERN, '')
}

function visibleWidth(text: string): number {
  return Array.from(stripAnsi(text)).length
}

function truncateToWidth(text: string, width: number): string {
  if (width <= 0) return ''
  if (visibleWidth(text) <= width) return text
  const plain = Array.from(stripAnsi(text))
  return plain.slice(0, Math.max(0, width - 1)).join('') + '…'
}

type NoteCategory = 'decision' | 'learning' | 'pitfall' | 'fix' | 'art' | 'system' | 'other'

interface PiNote {
  id: string
  name: string
  text: string
  category: NoteCategory
  tags: string[]
  decisions: string[]
  learnings: string[]
  pitfalls: string[]
  fixes: string[]
  ts: number
}

const CATEGORIES: NoteCategory[] = ['decision', 'learning', 'pitfall', 'fix', 'art', 'system', 'other']

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function asStringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : []
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function normalizeCategory(value: unknown, title: string, text: string): NoteCategory {
  if (typeof value === 'string' && (CATEGORIES as string[]).includes(value)) return value as NoteCategory
  return guessCategory(title, text)
}

function guessCategory(title: string, text: string): NoteCategory {
  const lower = `${title} ${text}`.toLowerCase()
  if (/\b(decision|decide|chosen|because|方案|决定|取舍|选择)\b/.test(lower)) return 'decision'
  if (/\b(learn|learning|lesson|insight|study|研究|学到|经验|方法)\b/.test(lower)) return 'learning'
  if (/\b(pitfall|bug|broken|fail|failed|risk|坑|踩坑|失败|风险)\b/.test(lower)) return 'pitfall'
  if (/\b(fix|fixed|solve|resolved|patch|修复|解决)\b/.test(lower)) return 'fix'
  if (/\b(draw|drawing|canvas|svg|html|diagram|visual|image|绘画|画图|可视化)\b/.test(lower)) return 'art'
  if (/\b(system|architecture|storage|plugin|api|session|系统|架构|插件|存储)\b/.test(lower)) return 'system'
  return 'other'
}

function tagsFromText(title: string, text: string, tags: unknown): string[] {
  const explicit = asStringList(tags).map((tag) => tag.replace(/^#/, ''))
  const inline = `${title} ${text}`.match(/#[\p{L}\p{N}_-]+/gu)?.map((tag) => tag.slice(1)) ?? []
  return unique([...explicit, ...inline]).slice(0, 16)
}

function extractLabeledLines(text: string, labels: string[]): string[] {
  const lowerLabels = labels.map((label) => label.toLowerCase())
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      const index = line.indexOf(':')
      if (index <= 0) return false
      return lowerLabels.includes(line.slice(0, index).trim().toLowerCase())
    })
    .map((line) => line.slice(line.indexOf(':') + 1).trim())
    .filter(Boolean)
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createNote(input: {
  name: string
  text: string
  category?: unknown
  tags?: unknown
  decisions?: unknown
  learnings?: unknown
  pitfalls?: unknown
  fixes?: unknown
}): PiNote {
  const name = input.name.trim()
  const text = input.text.trim()
  const category = normalizeCategory(input.category, name, text)
  return {
    id: makeId(),
    name,
    text,
    category,
    tags: tagsFromText(name, text, input.tags),
    decisions: unique([...asStringList(input.decisions), ...extractLabeledLines(text, ['decision', '决策'])]),
    learnings: unique([...asStringList(input.learnings), ...extractLabeledLines(text, ['learning', 'lesson', '学到'])]),
    pitfalls: unique([...asStringList(input.pitfalls), ...extractLabeledLines(text, ['pitfall', 'risk', '坑'])]),
    fixes: unique([...asStringList(input.fixes), ...extractLabeledLines(text, ['fix', 'solution', '修复', '解决'])]),
    ts: Date.now(),
  }
}

function normalizeNote(raw: any): PiNote | null {
  if (!raw || typeof raw !== 'object') return null
  const name = asString(raw.name || raw.title).trim()
  const text = asString(raw.text || raw.content).trim()
  if (!name || !text) return null
  return {
    id: asString(raw.id) || makeId(),
    name,
    text,
    category: normalizeCategory(raw.category, name, text),
    tags: tagsFromText(name, text, raw.tags),
    decisions: asStringList(raw.decisions),
    learnings: asStringList(raw.learnings),
    pitfalls: asStringList(raw.pitfalls),
    fixes: asStringList(raw.fixes),
    ts: Number(raw.ts || raw.timestamp || Date.now()),
  }
}

function branchEntries(ctx: ExtensionContext): any[] {
  return Array.from(ctx.sessionManager.getBranch() as Iterable<any>)
}

function readNotes(ctx: ExtensionContext): PiNote[] {
  const deleted = new Set<string>()
  const notes = new Map<string, PiNote>()

  for (const entry of branchEntries(ctx)) {
    if (entry?.customType === 'pi-note-deleted') {
      const id = asString(entry.data?.id)
      if (id) deleted.add(id)
      continue
    }

    if (entry?.customType !== 'pi-note') continue
    const note = normalizeNote(entry.data)
    if (note && !deleted.has(note.id)) notes.set(note.id, note)
  }

  return [...notes.values()].filter((note) => !deleted.has(note.id)).sort((a, b) => b.ts - a.ts)
}

function noteDate(note: PiNote): string {
  return new Date(note.ts).toISOString().slice(0, 10)
}

function signalCount(note: PiNote): number {
  return note.decisions.length + note.learnings.length + note.pitfalls.length + note.fixes.length
}

function noteSummary(note: PiNote): string {
  const tags = note.tags.length ? ` #${note.tags.join(' #')}` : ''
  const signals = signalCount(note)
  return `#${note.id.slice(0, 6)} [${note.category}] ${note.name} ${noteDate(note)}${signals ? ` · ${signals} signals` : ''}${tags}\n  ${note.text.slice(0, 100)}${note.text.length > 100 ? '…' : ''}`
}

function padAnsi(text: string, width: number): string {
  const clipped = truncateToWidth(text, Math.max(0, width))
  return clipped + ' '.repeat(Math.max(0, width - visibleWidth(clipped)))
}

function boxHeader(title: string, width: number, theme: ExtensionContext['ui']['theme']): string {
  const innerWidth = width - 2
  const safeTitle = truncateToWidth(title, innerWidth)
  const padLength = Math.max(0, innerWidth - visibleWidth(safeTitle))
  const left = Math.floor(padLength / 2)
  const right = padLength - left
  return theme.fg('border', '╭' + '─'.repeat(left)) + theme.fg('accent', safeTitle) + theme.fg('border', '─'.repeat(right) + '╮')
}

function boxRow(content: string, width: number, theme: ExtensionContext['ui']['theme']): string {
  return theme.fg('border', '│') + padAnsi(content, width - 2) + theme.fg('border', '│')
}

function boxDivider(leftWidth: number, rightWidth: number, theme: ExtensionContext['ui']['theme']): string {
  return theme.fg('border', '├' + '─'.repeat(leftWidth) + '┼' + '─'.repeat(rightWidth) + '┤')
}

function boxFooter(leftWidth: number, rightWidth: number, theme: ExtensionContext['ui']['theme']): string {
  return theme.fg('border', '╰' + '─'.repeat(leftWidth) + '┴' + '─'.repeat(rightWidth) + '╯')
}

function splitRow(left: string, right: string, leftWidth: number, rightWidth: number, dialogWidth: number, theme: ExtensionContext['ui']['theme']): string {
  return boxRow(padAnsi(left, leftWidth) + theme.fg('border', '│') + padAnsi(right, rightWidth), dialogWidth, theme)
}

function wrapPlain(text: string, width: number): string[] {
  const safeWidth = Math.max(8, width)
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length === 0) return ['']

  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (!current) current = word
    else if (visibleWidth(`${current} ${word}`) <= safeWidth) current += ` ${word}`
    else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

function noteListLine(note: PiNote, selected: boolean, width: number, theme: ExtensionContext['ui']['theme']): string {
  const prefix = selected ? theme.fg('accent', '▸ ') : theme.fg('dim', '  ')
  const id = theme.fg('dim', `#${note.id.slice(0, 6)} `)
  const category = theme.fg('warning', `[${note.category}] `)
  const name = selected ? theme.fg('accent', note.name) : theme.fg('text', note.name)
  const meta = theme.fg('dim', ` · ${noteDate(note)} · ${signalCount(note)}s`)
  return truncateToWidth(prefix + id + category + name + meta, width)
}

function noteDetailLines(note: PiNote, width: number, theme: ExtensionContext['ui']['theme']): string[] {
  const tags = note.tags.length ? note.tags.map((tag) => `#${tag}`).join(' ') : 'none'
  const lines: string[] = []
  lines.push(theme.fg('accent', theme.bold(note.name)))
  lines.push(`${theme.fg('accent', 'Category')}${theme.fg('dim', ': ')}${theme.fg('warning', note.category)}`)
  lines.push(`${theme.fg('accent', 'Date')}${theme.fg('dim', ': ')}${theme.fg('text', noteDate(note))}`)
  lines.push(`${theme.fg('accent', 'Tags')}${theme.fg('dim', ': ')}${theme.fg('text', tags)}`)
  lines.push('')
  lines.push(theme.fg('accent', theme.bold('Text')))
  lines.push(...wrapPlain(note.text || 'No text', width).map((line) => theme.fg('text', line)))

  const sections: Array<[string, string[]]> = [
    ['Decisions', note.decisions],
    ['Learnings', note.learnings],
    ['Pitfalls', note.pitfalls],
    ['Fixes', note.fixes],
  ]

  for (const [label, items] of sections) {
    if (!items.length) continue
    lines.push('')
    lines.push(theme.fg('accent', theme.bold(label)))
    for (const item of items) lines.push(...wrapPlain(`• ${item}`, width).map((line) => theme.fg('text', line)))
  }

  return lines
}

function plainPad(text: string, width: number): string {
  const clipped = truncateToWidth(stripAnsi(text), width)
  return clipped + ' '.repeat(Math.max(0, width - visibleWidth(clipped)))
}

function plainSplitRow(left: string, right: string, leftWidth: number, rightWidth: number): string {
  return `${plainPad(left, leftWidth)} | ${plainPad(right, rightWidth)}`
}

function plainWrap(text: string, width: number): string[] {
  const safeWidth = Math.max(8, width)
  const words = stripAnsi(text).replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)
  if (words.length === 0) return ['']

  const lines: string[] = []
  let current = ''
  for (const word of words) {
    if (!current) current = word
    else if (visibleWidth(`${current} ${word}`) <= safeWidth) current += ` ${word}`
    else {
      lines.push(current)
      current = word
    }
  }
  if (current) lines.push(current)
  return lines
}

function plainNoteListLine(note: PiNote, selected: boolean): string {
  const prefix = selected ? '> ' : '  '
  return `${prefix}#${note.id.slice(0, 6)} [${note.category}] ${note.name} - ${noteDate(note)} - ${signalCount(note)}s`
}

function plainNoteDetailLines(note: PiNote, width: number): string[] {
  const tags = note.tags.length ? note.tags.map((tag) => `#${tag}`).join(' ') : 'none'
  const lines: string[] = []
  lines.push(note.name)
  lines.push(`Category: ${note.category}`)
  lines.push(`Date: ${noteDate(note)}`)
  lines.push(`Tags: ${tags}`)
  lines.push('')
  lines.push('Text')
  lines.push(...plainWrap(note.text || 'No text', width))

  const sections: Array<[string, string[]]> = [
    ['Decisions', note.decisions],
    ['Learnings', note.learnings],
    ['Pitfalls', note.pitfalls],
    ['Fixes', note.fixes],
  ]

  for (const [label, items] of sections) {
    if (!items.length) continue
    lines.push('')
    lines.push(label)
    for (const item of items) lines.push(...plainWrap(`- ${item}`, width))
  }

  return lines
}

function showNotesPanel(ctx: ExtensionContext, title: string, notes: PiNote[], emptyText: string): void {
  const leftWidth = 44
  const rightWidth = 72
  const rows = Math.max(8, Math.min(20, notes.length || 8))
  const selectedNote = notes[0]
  const detailLines = selectedNote ? plainNoteDetailLines(selectedNote, rightWidth) : [emptyText]
  const separator = `${'-'.repeat(leftWidth)}-+-${'-'.repeat(rightWidth)}`
  const lines: string[] = []

  lines.push(title)
  lines.push(separator)
  lines.push(plainSplitRow(`NOTES ${notes.length}`, 'DETAILS', leftWidth, rightWidth))
  lines.push(separator)

  for (let i = 0; i < rows; i++) {
    const note = notes[i]
    const left = note ? plainNoteListLine(note, i === 0) : ''
    const right = detailLines[i] ?? ''
    lines.push(plainSplitRow(left, right, leftWidth, rightWidth))
  }

  const footer = notes.length > rows ? `showing 1-${rows} / ${notes.length}` : `${notes.length} notes`
  lines.push(separator)
  lines.push(`${footer} - non-blocking widget - use /notes search or /notes list <filter>`)

  ctx.ui.setWidget('pi-notes-panel', lines, { placement: 'belowEditor' })
}
function showHelp(ctx: ExtensionContext): void {
  const commandNotes = [
    { id: 'help', name: '/notes help', text: 'Show this two-pane notes help overlay.', category: 'system' as NoteCategory, tags: ['command'], decisions: [], learnings: [], pitfalls: [], fixes: [], ts: Date.now() },
    { id: 'list', name: '/notes list [category|#tag]', text: 'Browse saved notes. Optional filters include a category such as decision/fix/art, or a tag such as #diagram.', category: 'system' as NoteCategory, tags: ['command'], decisions: [], learnings: [], pitfalls: [], fixes: [], ts: Date.now() },
    { id: 'search', name: '/notes search <keyword>', text: 'Search note title, body, category, and tags.', category: 'system' as NoteCategory, tags: ['command'], decisions: [], learnings: [], pitfalls: [], fixes: [], ts: Date.now() },
    { id: 'save', name: '/notes save <title> :: <content>', text: 'Save a note into the current branch.', category: 'system' as NoteCategory, tags: ['command'], decisions: [], learnings: [], pitfalls: [], fixes: [], ts: Date.now() },
    { id: 'delete', name: '/notes delete <id-prefix>', text: 'Delete a note by id prefix.', category: 'system' as NoteCategory, tags: ['command'], decisions: [], learnings: [], pitfalls: [], fixes: [], ts: Date.now() },
  ]
  showNotesPanel(ctx, 'pi-notes · help', commandNotes, 'No commands')
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand('notes', {
    description: 'Drawing/session notes: help, list, search, save, delete',
    handler: async (args, ctx) => {
      const raw = asString(args).trim()
      const notes = readNotes(ctx)

      if (!raw || raw === 'help') {
        showHelp(ctx)
        return
      }

      if (raw === 'list' || raw.startsWith('list ')) {
        const filter = raw.slice(5).trim().toLowerCase()
        const visible = filter.startsWith('#')
          ? notes.filter((note) => note.tags.includes(filter.slice(1)))
          : filter
            ? notes.filter((note) => note.category === filter)
            : notes
        showNotesPanel(ctx, `pi-notes · ${visible.length} notes${filter ? ` · ${filter}` : ''}`, visible, 'No notes match this filter')
        return
      }

      if (raw.startsWith('search ')) {
        const query = raw.slice(7).trim().toLowerCase()
        const hits = notes.filter((note) => [note.name, note.text, note.category, ...note.tags].join(' ').toLowerCase().includes(query))
        showNotesPanel(ctx, `pi-notes · search "${query}" · ${hits.length} notes`, hits, 'No notes match this search')
        return
      }

      if (raw.startsWith('delete ')) {
        const prefix = raw.slice(7).trim()
        const note = notes.find((item) => item.id.startsWith(prefix))
        if (!note) {
          ctx.ui.notify(`Note "${prefix}" not found`, 'error')
          return
        }
        pi.appendEntry('pi-note-deleted', { id: note.id })
        ctx.ui.notify(`Deleted: ${note.name}`, 'info')
        return
      }

      if (raw.startsWith('save ')) {
        const body = raw.slice(5)
        const separator = body.indexOf('::')
        if (separator < 1) {
          ctx.ui.notify('Use: /notes save <title> :: <content>', 'warning')
          return
        }
        const note = createNote({ name: body.slice(0, separator), text: body.slice(separator + 2) })
        pi.appendEntry('pi-note', note)
        ctx.ui.notify(`Saved [${note.category}] "${note.name}"`, 'info')
        return
      }

      ctx.ui.notify('Unknown /notes command. Use /notes help.', 'warning')
    },
    getArgumentCompletions: (prefix: string) => {
      const options = ['help', 'list', 'search ', 'save ', 'delete ', ...CATEGORIES.map((category) => `list ${category}`)]
      return options.filter((value) => value.startsWith(prefix)).map((value) => ({ value, label: value }))
    },
  })

  pi.registerTool({
    name: 'notes_save',
    label: 'Save Note',
    description: 'Save a drawing/session note with optional tags and structured fields.',
    parameters: Type.Object({
      name: Type.String({ description: 'Note title' }),
      text: Type.String({ description: 'Human-readable note body' }),
      category: Type.Optional(Type.String({ description: 'decision/learning/pitfall/fix/art/system/other' })),
      tags: Type.Optional(Type.Array(Type.String({ description: 'Tag' }))),
      decisions: Type.Optional(Type.Array(Type.String({ description: 'Decision point' }))),
      learnings: Type.Optional(Type.Array(Type.String({ description: 'Lesson learned' }))),
      pitfalls: Type.Optional(Type.Array(Type.String({ description: 'Pitfall or risk' }))),
      fixes: Type.Optional(Type.Array(Type.String({ description: 'Fix or mitigation' }))),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const input = params as { name: string; text: string; category?: string; tags?: string[]; decisions?: string[]; learnings?: string[]; pitfalls?: string[]; fixes?: string[] }
      const note = createNote(input)
      pi.appendEntry('pi-note', note)
      return {
        content: [{ type: 'text', text: `saved [${note.category}] "${note.name}" (${note.text.length} chars)` }],
        details: { note },
      }
    },
  })

  pi.registerTool({
    name: 'notes_list',
    label: 'List Notes',
    description: 'List saved drawing/session notes. Optional category or tag filter.',
    parameters: Type.Object({
      category: Type.Optional(Type.String({ description: 'Filter category' })),
      tag: Type.Optional(Type.String({ description: 'Filter tag without #' })),
      limit: Type.Optional(Type.Number({ description: 'Max results, default 20' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { category, tag, limit = 20 } = params as { category?: string; tag?: string; limit?: number }
      const notes = readNotes(ctx)
        .filter((note) => !category || note.category === category)
        .filter((note) => !tag || note.tags.includes(tag))
        .slice(0, limit)
      return {
        content: [{ type: 'text', text: notes.map(noteSummary).join('\n') || 'no notes found' }],
        details: { count: notes.length },
      }
    },
  })

  pi.registerTool({
    name: 'notes_search',
    label: 'Search Notes',
    description: 'Search notes by keyword in title, body, category, tags, and structured fields.',
    parameters: Type.Object({
      query: Type.String({ description: 'Search keyword' }),
      limit: Type.Optional(Type.Number({ description: 'Max results, default 10' })),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { query, limit = 10 } = params as { query: string; limit?: number }
      const needle = query.toLowerCase()
      const hits = readNotes(ctx).filter((note) => [
        note.name,
        note.text,
        note.category,
        ...note.tags,
        ...note.decisions,
        ...note.learnings,
        ...note.pitfalls,
        ...note.fixes,
      ].join(' ').toLowerCase().includes(needle)).slice(0, limit)
      return {
        content: [{ type: 'text', text: hits.map(noteSummary).join('\n') || `no notes matching "${query}"` }],
        details: { count: hits.length },
      }
    },
  })
}
