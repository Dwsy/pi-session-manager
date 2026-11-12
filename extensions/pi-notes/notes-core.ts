/**
 * notes-core — pure note model shared by the TUI panel, /notes commands and
 * agent tools. No host or UI imports so it stays unit-testable.
 */

export type NoteCategory = 'decision' | 'learning' | 'pitfall' | 'fix' | 'art' | 'system' | 'other'

export interface PiNote {
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

export const CATEGORIES: NoteCategory[] = ['decision', 'learning', 'pitfall', 'fix', 'art', 'system', 'other']

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

export function createNote(input: {
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

export function normalizeNote(raw: any): PiNote | null {
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

/**
 * Fold branch entries into the current note set: later `pi-note` entries
 * overwrite earlier ones with the same id, `pi-note-deleted` tombstones win.
 * Result is sorted newest-first.
 */
export function notesFromEntries(entries: Iterable<unknown>): PiNote[] {
  const deleted = new Set<string>()
  const notes = new Map<string, PiNote>()

  for (const raw of entries) {
    const entry = raw as { customType?: unknown; data?: unknown } | null
    if (!entry || typeof entry !== 'object') continue

    if (entry.customType === 'pi-note-deleted') {
      const id = asString((entry.data as any)?.id)
      if (id) deleted.add(id)
      continue
    }

    if (entry.customType !== 'pi-note') continue
    const note = normalizeNote(entry.data)
    if (note) notes.set(note.id, note)
  }

  return [...notes.values()].filter((note) => !deleted.has(note.id)).sort((a, b) => b.ts - a.ts)
}

export function noteDate(note: PiNote): string {
  return new Date(note.ts).toISOString().slice(0, 10)
}

export function signalCount(note: PiNote): number {
  return note.decisions.length + note.learnings.length + note.pitfalls.length + note.fixes.length
}

export function noteSummary(note: PiNote): string {
  const tags = note.tags.length ? ` #${note.tags.join(' #')}` : ''
  const signals = signalCount(note)
  return `#${note.id.slice(0, 6)} [${note.category}] ${note.name} ${noteDate(note)}${signals ? ` · ${signals} signals` : ''}${tags}\n  ${note.text.slice(0, 100)}${note.text.length > 100 ? '…' : ''}`
}

/** Filter by `#tag` or by category name; anything else returns all notes. */
export function filterNotes(notes: PiNote[], filter: string): PiNote[] {
  const needle = filter.trim().toLowerCase()
  if (needle.startsWith('#')) return notes.filter((note) => note.tags.includes(needle.slice(1)))
  if (needle) return notes.filter((note) => note.category === needle)
  return notes
}

/** Keyword search across title, body, category, tags and structured fields. */
export function searchNotes(notes: PiNote[], query: string): PiNote[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return notes
  return notes.filter((note) => [
    note.name,
    note.text,
    note.category,
    ...note.tags,
    ...note.decisions,
    ...note.learnings,
    ...note.pitfalls,
    ...note.fixes,
  ].join(' ').toLowerCase().includes(needle))
}
