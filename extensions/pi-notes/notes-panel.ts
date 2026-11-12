/**
 * notes-panel — interactive two-pane notes browser for the pi TUI.
 *
 * Every line is fitted to the viewport (CJK-aware) and colored through the
 * active theme; keyboard and mouse drive the same action paths (a click runs
 * the row's Enter action). Mouse contract follows the pi-tui interaction
 * rules: press selects + focuses, click activates, hover never moves the
 * selection, detail text keeps the terminal's native drag-to-select.
 */

import { matchesKey, truncateToWidth, visibleWidth, wrapTextWithAnsi } from '@earendil-works/pi-tui'
import type { Component, Focusable, TuiMouseEvent, TuiMouseEventResult } from '@earendil-works/pi-tui'
import { type NoteCategory, type PiNote, noteDate, searchNotes, signalCount } from './notes-core.ts'

export type NotesThemeColor =
  | 'accent' | 'border' | 'borderMuted' | 'text' | 'muted' | 'dim' | 'success' | 'warning' | 'error'

export type NotesThemeBg = 'selectedBg' | 'userMessageBg'

/** Minimal structural contract for Pi's active theme. */
export interface NotesTheme {
  fg(color: NotesThemeColor, text: string): string
  bg(color: NotesThemeBg, text: string): string
  bold(text: string): string
}

export interface NotesPanelDeps {
  /** Already-filtered notes; the panel copies and mutates its list on delete. */
  notes: PiNote[]
  /** Filter/search description shown in the title, e.g. `search "tui"`. */
  label?: string
  theme: NotesTheme
  viewport: () => { width: number; height: number }
  requestRender: () => void
  onClose: () => void
  onDelete: (note: PiNote) => void
  startWithHelp?: boolean
}

const CATEGORY_COLOR: Record<NoteCategory, NotesThemeColor> = {
  decision: 'accent',
  learning: 'success',
  pitfall: 'error',
  fix: 'warning',
  art: 'muted',
  system: 'dim',
  other: 'text',
}

const CATEGORY_BADGE_WIDTH = 10
const LIST_META_WIDTH = 10
const MIN_WIDE_WIDTH = 96
const MIN_LIST_WIDTH = 30
const MAX_LIST_WIDTH = 44
const CONFIRM_ROW = 2

const FOOTER_SHORTCUTS = '↑↓ Move · / Search · d Delete · ? Help · Esc Close'

const HELP_GROUPS: Array<[string, NotesThemeColor, string]> = [
  ['Navigation', 'accent', '↑↓ / j k  move · PgUp PgDn  page · g G  top / end · Tab  switch pane'],
  ['Search', 'success', '/  filter notes · type to narrow · Enter keep · Esc clear'],
  ['Actions', 'warning', 'Enter  open detail · d  delete note · Esc  back / close'],
  ['Mouse', 'muted', 'Wheel  scroll · Click  select + open · Detail text  native selection'],
]

interface ConfirmButton {
  y: number
  x0: number
  x1: number
  action: 'confirm' | 'cancel'
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function padPlain(text: string, width: number): string {
  return text + ' '.repeat(Math.max(0, width - visibleWidth(text)))
}

export class NotesPanel implements Component, Focusable {
  focused = false

  #deps: NotesPanelDeps
  #allNotes: PiNote[]
  #notes: PiNote[]
  #selectedIndex = 0
  #scrollOffset = 0
  #focus: 'list' | 'detail' = 'list'
  #detailScroll = 0
  #searchMode = false
  #searchInput = ''
  #help: boolean
  #pendingDelete: PiNote | null = null
  #hoveredIndex: number | undefined
  #pressedIndex: number | undefined
  #rowMap: number[] = []
  #confirmButtons: ConfirmButton[] = []
  #splitX = 0
  #bodyHeight = 8
  #detailWidth = 80

  constructor(deps: NotesPanelDeps) {
    this.#deps = deps
    this.#allNotes = [...deps.notes]
    this.#notes = this.#allNotes
    this.#help = deps.startWithHelp ?? false
  }

  invalidate(): void {}

  // ── rendering ─────────────────────────────────────────────────────────

  render(width: number): string[] {
    const height = this.#deps.viewport().height
    this.#bodyHeight = Math.max(4, height - 4)
    const wide = width >= MIN_WIDE_WIDTH
    const leftWidth = wide ? clamp(Math.floor((width - 3) * 0.42), MIN_LIST_WIDTH, MAX_LIST_WIDTH) : width - 2
    const rightWidth = width - 3 - leftWidth
    this.#splitX = wide ? leftWidth + 2 : width - 2
    this.#detailWidth = wide ? rightWidth : width - 2

    const lines: string[] = []
    const rowMap: number[] = []
    this.#confirmButtons = []

    const push = (line: string, itemIndex = -1) => {
      lines.push(truncateToWidth(line, width, '…', true))
      rowMap.push(itemIndex)
    }

    push(this.#headerLine(width))
    push(this.#columnHeaderLine(leftWidth, rightWidth, wide))
    if (this.#pendingDelete) {
      push(this.#confirmLine(width))
    } else {
      push(this.#dividerLine(leftWidth, rightWidth, wide))
    }

    if (this.#help) {
      for (const line of this.#helpLines(width - 2)) push(this.#borderRow(line, width))
    } else if (!wide && this.#focus === 'detail') {
      for (const line of this.#detailLines(this.#selectedNote(), width - 2)) push(this.#borderRow(line, width))
    } else {
      const detailLines = wide ? this.#detailLines(this.#selectedNote(), rightWidth) : []
      for (let i = 0; i < this.#bodyHeight; i++) {
        const absolute = this.#scrollOffset + i
        const note = this.#notes[absolute]
        const listPart = this.#listRow(note, absolute, leftWidth)
        const detailPart = detailLines[this.#detailScroll + i] ?? ''
        if (wide) {
          push(this.#splitRow(listPart, detailPart, leftWidth, rightWidth), note ? absolute : -1)
        } else {
          push(this.#borderRow(listPart, width), note ? absolute : -1)
        }
      }
    }

    push(this.#footerLine(width))
    this.#rowMap = rowMap
    return lines
  }

  #headerLine(width: number): string {
    const { theme } = this.#deps
    const count = `${this.#notes.length} note${this.#notes.length === 1 ? '' : 's'}`
    const title = ` pi-notes · ${count}${this.#deps.label ? ` · ${this.#deps.label}` : ''} `
    const innerWidth = width - 2
    const padLength = Math.max(0, innerWidth - visibleWidth(title))
    const left = Math.floor(padLength / 2)
    return (
      theme.fg('border', '╭' + '─'.repeat(left)) +
      theme.fg('accent', theme.bold(title)) +
      theme.fg('border', '─'.repeat(padLength - left) + '╮')
    )
  }

  #columnHeaderLine(leftWidth: number, rightWidth: number, wide: boolean): string {
    const { theme } = this.#deps
    const listTitle = this.#searchMode ? `search: ${this.#searchInput}` : `NOTES (${this.#notes.length})`
    const left = theme.fg('dim', theme.bold(padPlain(listTitle, leftWidth)))
    if (!wide) return this.#borderRow(left, leftWidth + 2)

    const above = this.#detailScroll
    const below = Math.max(0, this.#detailLineCount() - this.#detailScroll - this.#bodyHeight)
    const hint = [above > 0 ? `↑${above}` : '', below > 0 ? `↓${below}` : ''].filter(Boolean).join(' ')
    const right = theme.fg('dim', theme.bold(padPlain(`DETAILS${hint ? ` ${hint}` : ''}`, rightWidth)))
    return this.#splitRow(left, right, leftWidth, rightWidth)
  }

  #dividerLine(leftWidth: number, rightWidth: number, wide: boolean): string {
    const { theme } = this.#deps
    if (!wide) return theme.fg('borderMuted', '├' + '─'.repeat(leftWidth) + '┤')
    return theme.fg('borderMuted', '├' + '─'.repeat(leftWidth) + '┼' + '─'.repeat(rightWidth) + '┤')
  }

  /** Destructive confirm banner; also records the clickable button columns. */
  #confirmLine(width: number): string {
    const { theme } = this.#deps
    const note = this.#pendingDelete
    if (!note) return this.#borderRow('', width)
    const label = ` Delete "${truncateToWidth(note.name, 24, '…')}"? `
    const confirmText = '[y] Delete'
    const cancelText = '[n] Cancel'
    const confirmX = 1 + visibleWidth(label)
    const cancelX = confirmX + visibleWidth(confirmText) + 1
    this.#confirmButtons = [
      { y: CONFIRM_ROW, x0: confirmX, x1: confirmX + visibleWidth(confirmText), action: 'confirm' },
      { y: CONFIRM_ROW, x0: cancelX, x1: cancelX + visibleWidth(cancelText), action: 'cancel' },
    ]
    const content =
      theme.fg('warning', label) +
      theme.fg('error', theme.bold(confirmText)) +
      theme.fg('text', ' ') +
      theme.fg('dim', cancelText)
    return this.#borderRow(content, width)
  }

  #footerLine(width: number): string {
    const { theme } = this.#deps
    const hint = this.#searchMode ? 'type to filter · Enter keep · Esc clear' : FOOTER_SHORTCUTS
    const padLength = Math.max(0, width - 2 - visibleWidth(hint))
    const left = Math.floor(padLength / 2)
    return (
      theme.fg('border', '╰' + '─'.repeat(left)) +
      theme.fg('dim', hint) +
      theme.fg('border', '─'.repeat(padLength - left) + '╯')
    )
  }

  #borderRow(content: string, width: number): string {
    const { theme } = this.#deps
    return theme.fg('borderMuted', '│') + truncateToWidth(content, width - 2, '…', true) + theme.fg('borderMuted', '│')
  }

  #splitRow(left: string, right: string, leftWidth: number, rightWidth: number): string {
    const { theme } = this.#deps
    return (
      theme.fg('borderMuted', '│') +
      truncateToWidth(left, leftWidth, '…', true) +
      theme.fg('borderMuted', '│') +
      truncateToWidth(right, rightWidth, '…', true) +
      theme.fg('borderMuted', '│')
    )
  }

  #listRow(note: PiNote | undefined, absolute: number, width: number): string {
    const { theme } = this.#deps
    if (!note) return ''
    const selected = absolute === this.#selectedIndex
    const hovered = absolute === this.#hoveredIndex

    // Plain layout first so the row is exactly `width` cells; the background
    // tint then covers the whole pane without skewing the box geometry.
    const cursor = selected ? '>' : ' '
    const badgePlain = padPlain(`[${note.category}]`, CATEGORY_BADGE_WIDTH)
    const nameWidth = Math.max(4, width - 2 - CATEGORY_BADGE_WIDTH - LIST_META_WIDTH - 1)
    const namePlain = truncateToWidth(note.name, nameWidth, '…', true)
    const metaPlain = padPlain(`${noteDate(note).slice(5)} ${signalCount(note)}s`, LIST_META_WIDTH)

    const styled =
      (selected ? theme.fg('accent', theme.bold(cursor)) : theme.fg('dim', cursor)) +
      ' ' +
      theme.fg(CATEGORY_COLOR[note.category], badgePlain) +
      (selected
        ? theme.fg('accent', theme.bold(namePlain))
        : hovered
          ? theme.fg('accent', namePlain)
          : theme.fg('text', namePlain)) +
      theme.fg('dim', metaPlain)

    if (selected) return theme.bg('selectedBg', styled)
    if (hovered) return theme.bg('userMessageBg', styled)
    return styled
  }

  #detailLines(note: PiNote | undefined, width: number): string[] {
    const { theme } = this.#deps
    if (!note) {
      return [theme.fg('dim', 'No note selected'), '', theme.fg('dim', 'Press / to search or Esc to close')]
    }
    const lines: string[] = []
    const pushWrapped = (text: string) => {
      for (const line of wrapTextWithAnsi(text, Math.max(8, width))) lines.push(theme.fg('text', line))
    }

    lines.push(theme.fg('accent', theme.bold(truncateToWidth(note.name, width, '…'))))
    const badge = theme.fg(CATEGORY_COLOR[note.category], `[${note.category}]`)
    lines.push(`${badge} ${theme.fg('dim', `${noteDate(note)} · #${note.id.slice(0, 6)} · ${signalCount(note)} signals`)}`)
    if (note.tags.length) {
      lines.push(theme.fg('muted', truncateToWidth(note.tags.map((tag) => `#${tag}`).join(' '), width, '…')))
    }
    lines.push('')
    pushWrapped(note.text || 'No text')

    const sections: Array<[string, string[], NotesThemeColor]> = [
      ['Decisions', note.decisions, 'accent'],
      ['Learnings', note.learnings, 'success'],
      ['Pitfalls', note.pitfalls, 'warning'],
      ['Fixes', note.fixes, 'error'],
    ]
    for (const [label, items, color] of sections) {
      if (!items.length) continue
      lines.push('')
      lines.push(theme.fg(color, theme.bold(`${label} (${items.length})`)))
      for (const item of items) pushWrapped(`- ${item}`)
    }
    return lines
  }

  #helpLines(width: number): string[] {
    const { theme } = this.#deps
    const lines: string[] = []
    for (const [group, color, keys] of HELP_GROUPS) {
      lines.push(theme.fg(color, theme.bold(group)))
      for (const line of wrapTextWithAnsi(keys, Math.max(8, width - 2))) lines.push(theme.fg('text', `  ${line}`))
      lines.push('')
    }
    return lines
  }

  #detailLineCount(): number {
    const note = this.#selectedNote()
    return note ? this.#detailLines(note, this.#detailWidth).length : 0
  }

  // ── state helpers ─────────────────────────────────────────────────────

  #selectedNote(): PiNote | undefined {
    return this.#notes[this.#selectedIndex]
  }

  #maxDetailScroll(): number {
    return Math.max(0, this.#detailLineCount() - this.#bodyHeight)
  }

  #move(delta: number): void {
    if (!this.#notes.length) return
    this.#selectedIndex = clamp(this.#selectedIndex + delta, 0, this.#notes.length - 1)
    this.#detailScroll = 0
    if (this.#selectedIndex < this.#scrollOffset) this.#scrollOffset = this.#selectedIndex
    if (this.#selectedIndex >= this.#scrollOffset + this.#bodyHeight) {
      this.#scrollOffset = this.#selectedIndex - this.#bodyHeight + 1
    }
    this.#deps.requestRender()
  }

  #scrollDetail(delta: number): void {
    this.#detailScroll = clamp(this.#detailScroll + delta, 0, this.#maxDetailScroll())
    this.#deps.requestRender()
  }

  /** Enter action: toggle detail focus; a click on a row runs the same path. */
  #enter(): void {
    if (!this.#selectedNote()) return
    this.#focus = this.#focus === 'detail' ? 'list' : 'detail'
    this.#detailScroll = 0
    this.#deps.requestRender()
  }

  #backToList(): void {
    this.#focus = 'list'
    this.#detailScroll = 0
    this.#deps.requestRender()
  }

  #close(): void {
    this.#deps.onClose()
  }

  #applySearch(): void {
    this.#notes = searchNotes(this.#allNotes, this.#searchInput)
    this.#selectedIndex = 0
    this.#scrollOffset = 0
    this.#detailScroll = 0
    this.#deps.requestRender()
  }

  #confirmDelete(): void {
    const note = this.#pendingDelete
    if (!note) return
    this.#pendingDelete = null
    this.#allNotes = this.#allNotes.filter((item) => item.id !== note.id)
    this.#notes = this.#notes.filter((item) => item.id !== note.id)
    this.#selectedIndex = clamp(this.#selectedIndex, 0, Math.max(0, this.#notes.length - 1))
    this.#focus = 'list'
    this.#deps.onDelete(note)
    this.#deps.requestRender()
  }

  #cancelDelete(): void {
    this.#pendingDelete = null
    this.#deps.requestRender()
  }

  #runButton(action: 'confirm' | 'cancel'): void {
    if (action === 'confirm') this.#confirmDelete()
    else this.#cancelDelete()
  }

  // ── keyboard ──────────────────────────────────────────────────────────

  handleInput(data: string): void {
    if (this.#pendingDelete) {
      if (data === 'y' || data === 'Y') this.#confirmDelete()
      else if (data === 'n' || data === 'N' || matchesKey(data, 'escape')) this.#cancelDelete()
      return
    }
    if (this.#help) {
      this.#help = false
      this.#deps.requestRender()
      return
    }
    if (this.#searchMode) {
      this.#handleSearchKey(data)
      return
    }

    const detail = this.#focus === 'detail'
    const page = Math.max(1, this.#bodyHeight - 1)

    if (matchesKey(data, 'up') || data === 'k') {
      detail ? this.#scrollDetail(-1) : this.#move(-1)
      return
    }
    if (matchesKey(data, 'down') || data === 'j') {
      detail ? this.#scrollDetail(1) : this.#move(1)
      return
    }
    if (matchesKey(data, 'pageUp')) {
      detail ? this.#scrollDetail(-page) : this.#move(-page)
      return
    }
    if (matchesKey(data, 'pageDown')) {
      detail ? this.#scrollDetail(page) : this.#move(page)
      return
    }
    if (data === 'g' || matchesKey(data, 'home')) {
      detail ? this.#scrollDetail(-Number.MAX_SAFE_INTEGER) : this.#move(-Number.MAX_SAFE_INTEGER)
      return
    }
    if (data === 'G' || matchesKey(data, 'end')) {
      detail ? this.#scrollDetail(Number.MAX_SAFE_INTEGER) : this.#move(Number.MAX_SAFE_INTEGER)
      return
    }
    if (data === '\t') {
      this.#focus = detail ? 'list' : 'detail'
      this.#deps.requestRender()
      return
    }
    if (data === '\r' || data === '\n' || matchesKey(data, 'right')) {
      this.#enter()
      return
    }
    if (matchesKey(data, 'left') || matchesKey(data, 'escape')) {
      detail ? this.#backToList() : this.#close()
      return
    }
    if (data === '/') {
      this.#searchMode = true
      this.#searchInput = ''
      this.#deps.requestRender()
      return
    }
    if (data === 'd') {
      if (this.#selectedNote()) {
        this.#pendingDelete = this.#selectedNote() ?? null
        this.#deps.requestRender()
      }
      return
    }
    if (data === '?') {
      this.#help = true
      this.#deps.requestRender()
      return
    }
    if (data === 'q') {
      this.#close()
    }
  }

  #handleSearchKey(data: string): void {
    if (matchesKey(data, 'escape')) {
      this.#searchMode = false
      this.#searchInput = ''
      this.#applySearch()
      return
    }
    if (data === '\r' || data === '\n') {
      this.#searchMode = false
      this.#deps.requestRender()
      return
    }
    if (matchesKey(data, 'backspace')) {
      this.#searchInput = this.#searchInput.slice(0, -1)
    } else if (data === '\x1b' || data.length > 1) {
      // Ignore escape sequences and control keys while typing.
      return
    } else {
      this.#searchInput += data
    }
    this.#applySearch()
  }

  // ── mouse ─────────────────────────────────────────────────────────────

  handleMouse(event: TuiMouseEvent): TuiMouseEventResult | undefined {
    const wide = this.#deps.viewport().width >= MIN_WIDE_WIDTH
    const inDetail = wide ? event.x >= this.#splitX : this.#focus === 'detail'

    if (event.type === 'wheel' && event.wheelDelta) {
      inDetail ? this.#scrollDetail(event.wheelDelta) : this.#move(event.wheelDelta)
      return { handled: true }
    }

    // Plain pointer motion only; hover never changes the selection.
    if (event.type === 'move' && event.button === 'none') {
      const row = inDetail ? undefined : this.#rowMap[event.y]
      const next = row === undefined || row < 0 ? undefined : row
      if (next === this.#hoveredIndex) return { handled: true, render: false }
      this.#hoveredIndex = next
      return { handled: true, render: true }
    }

    if (event.type === 'release') {
      this.#pressedIndex = undefined
      return undefined
    }

    if (event.button !== 'left' || (event.type !== 'press' && event.type !== 'click')) return undefined

    // Delete confirmation buttons live in the banner row.
    const button = this.#confirmButtons.find((item) => item.y === event.y && event.x >= item.x0 && event.x < item.x1)
    if (button) {
      if (event.type === 'press') return { handled: true, focus: true }
      this.#runButton(button.action)
      return { handled: true }
    }

    // Detail text keeps the terminal's native drag-to-select.
    if (inDetail) return undefined

    const index = this.#rowMap[event.y]
    if (index === undefined || index < 0) return undefined

    if (event.type === 'press') {
      this.#pressedIndex = index
      this.#selectedIndex = index
      this.#detailScroll = 0
      this.#deps.requestRender()
      return { handled: true, focus: true }
    }

    const target = this.#pressedIndex ?? index
    this.#pressedIndex = undefined
    this.#selectedIndex = target
    this.#enter()
    return { handled: true }
  }
}
