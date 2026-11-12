import { describe, expect, it } from 'bun:test'
import { visibleWidth } from '@earendil-works/pi-tui'
import { notesFromEntries } from './notes-core.ts'
import { NotesPanel, type NotesTheme } from './notes-panel.ts'

// Real SGR so width math matches production (markers would count as cells);
// distinct codes per semantic color prove exactly which style each segment got.
const FG: Record<string, number> = {
  accent: 36,
  border: 90,
  borderMuted: 37,
  text: 39,
  muted: 35,
  dim: 2,
  success: 32,
  warning: 33,
  error: 31,
}
const BG: Record<string, number> = {
  selectedBg: 44,
  userMessageBg: 45,
}

const theme: NotesTheme = {
  fg: (color, text) => `\x1b[${FG[color]}m${text}\x1b[0m`,
  bg: (color, text) => `\x1b[${BG[color]}m${text}\x1b[0m`,
  bold: (text) => `\x1b[1m${text}\x1b[0m`,
}

const KNOWN_SGR = new Set([...Object.values(FG), ...Object.values(BG), 0, 1])

function stripAnsi(line: string): string {
  return line.replace(/\x1b\[[0-9;]*m/g, '')
}

function makeNotes(count = 3, longText = false) {
  const entries = Array.from({ length: count }, (_, i) => ({
    customType: 'pi-note',
    data: {
      id: `id-${i}`,
      name: i === 0 ? 'Fix login race · 登录竞态修复' : `Note ${i}`,
      text: longText && i === 0 ? Array.from({ length: 40 }, (_, l) => `detail line ${l}`).join('\n') : `body ${i}`,
      category: i === 0 ? 'fix' : 'learning',
      tags: i === 0 ? ['auth'] : [],
      ts: count - i,
    },
  }))
  return notesFromEntries(entries)
}

function makePanel(options: { width?: number; height?: number; notes?: ReturnType<typeof makeNotes>; deleted?: string[]; closed?: string[] } = {}) {
  const width = options.width ?? 120
  const height = options.height ?? 20
  const deleted = options.deleted ?? []
  const closed = options.closed ?? []
  const panel = new NotesPanel({
    notes: options.notes ?? makeNotes(),
    theme,
    viewport: () => ({ width, height }),
    requestRender: () => {},
    onClose: () => closed.push('closed'),
    onDelete: (note) => deleted.push(note.id),
  })
  return { panel, deleted, closed }
}

/** Row index whose list line carries the `>` selection cursor. */
function selectionRow(lines: string[]): number {
  const index = lines.findIndex((line) => stripAnsi(line).startsWith('│>'))
  if (index < 0) throw new Error('no selection cursor in render output')
  return index
}

/** Cell column of `needle` — mouse x is a terminal column, not a char index. */
function cellColumn(line: string, needle: string): number {
  const plain = stripAnsi(line)
  const at = plain.indexOf(needle)
  if (at < 0) throw new Error(`"${needle}" not found`)
  return visibleWidth(plain.slice(0, at))
}

describe('rendering', () => {
  it('fits every line to the viewport width and only uses theme styles', () => {
    for (const width of [120, 80, 40]) {
      const { panel } = makePanel({ width, notes: makeNotes(3, true) })
      for (const line of panel.render(width)) {
        expect(visibleWidth(line)).toBeLessThanOrEqual(width)
        for (const match of line.matchAll(/\x1b\[([0-9;]*)m/g)) {
          expect(KNOWN_SGR.has(Number(match[1]))).toBe(true)
        }
      }
    }
  })

  it('draws two panes on wide terminals and one pane when narrow', () => {
    const wide = makePanel({ width: 120 }).panel.render(120).map(stripAnsi)
    expect(wide[1]).toContain('NOTES (3)')
    expect(wide[1]).toContain('DETAILS')

    const narrow = makePanel({ width: 80 }).panel.render(80).map(stripAnsi)
    expect(narrow[1]).toContain('NOTES (3)')
    expect(narrow[1]).not.toContain('DETAILS')
  })

  it('highlights the selected row with the selection background', () => {
    const lines = makePanel().panel.render(120)
    expect(lines[selectionRow(lines)]).toContain(`\x1b[${BG.selectedBg}m`)
  })
})

describe('keyboard', () => {
  it('moves the selection and never wraps around', () => {
    const { panel } = makePanel()
    panel.render(120)
    const first = selectionRow(panel.render(120))
    panel.handleInput('j')
    expect(selectionRow(panel.render(120))).toBe(first + 1)
    panel.handleInput('k')
    panel.handleInput('k')
    expect(selectionRow(panel.render(120))).toBe(first)
  })

  it('opens and leaves the detail pane with Enter and Escape', () => {
    const { panel, closed } = makePanel()
    panel.render(80)
    panel.handleInput('\r')
    const detail = panel.render(80).map(stripAnsi).join('\n')
    expect(detail).toContain('body 0')
    panel.handleInput('\x1b')
    expect(panel.render(80).map(stripAnsi).join('\n')).not.toContain('body 0')
    expect(closed).toEqual([])
  })

  it('filters live while typing in search mode', () => {
    const { panel } = makePanel()
    panel.render(120)
    panel.handleInput('/')
    for (const key of ['N', 'o', 't', 'e']) panel.handleInput(key)
    const shown = panel.render(120).map(stripAnsi).join('\n')
    expect(shown).toContain('search: Note')
    expect(shown).toContain('pi-notes · 2 notes')
    expect(shown).not.toContain('Fix login race')
    panel.handleInput('\x1b')
    expect(panel.render(120).map(stripAnsi).join('\n')).toContain('pi-notes · 3 notes')
  })

  it('confirms deletion with y and cancels with n', () => {
    const { panel, deleted } = makePanel()
    panel.render(120)
    panel.handleInput('d')
    const banner = stripAnsi(panel.render(120)[2])
    expect(banner).toContain('[y] Delete')
    expect(banner).toContain('[n] Cancel')
    panel.handleInput('n')
    expect(deleted).toEqual([])
    panel.handleInput('d')
    panel.handleInput('y')
    expect(deleted).toEqual(['id-0'])
    expect(stripAnsi(panel.render(120)[1])).toContain('NOTES (2)')
  })
})

describe('mouse', () => {
  const mouseEvent = (type: 'press' | 'release' | 'move' | 'drag' | 'click' | 'wheel', x: number, y: number, extra: Partial<Parameters<NotesPanel['handleMouse']>[0]> = {}) => ({
    type,
    button: 'left' as const,
    x,
    y,
    screenX: x,
    screenY: y,
    width: 120,
    height: 20,
    shift: false,
    alt: false,
    ctrl: false,
    ...extra,
  })

  it('press selects, click activates — both routed to the row', () => {
    const { panel } = makePanel()
    panel.render(120)
    expect(panel.handleMouse(mouseEvent('press', 2, 4))).toEqual({ handled: true, focus: true })
    expect(selectionRow(panel.render(120))).toBe(4)
    expect(panel.handleMouse(mouseEvent('click', 2, 4))).toEqual({ handled: true })
  })

  it('hover highlights with the hover background without moving the selection', () => {
    const { panel } = makePanel()
    panel.render(120)
    const selected = selectionRow(panel.render(120))
    const move = (y: number) => panel.handleMouse(mouseEvent('move', 2, y, { button: 'none' }))
    expect(move(5)).toEqual({ handled: true, render: true })
    expect(move(5)).toEqual({ handled: true, render: false })
    const lines = panel.render(120)
    expect(selectionRow(lines)).toBe(selected)
    expect(lines[5]).toContain(`\x1b[${BG.userMessageBg}m`)
    expect(lines[5]).not.toContain(`\x1b[${BG.selectedBg}m`)
  })

  it('scrolls the detail pane by wheel over it, the list elsewhere', () => {
    const { panel } = makePanel({ notes: makeNotes(3, true) })
    expect(stripAnsi(panel.render(120)[1])).not.toContain('↑')
    panel.handleMouse(mouseEvent('wheel', 100, 3, { button: 'none', wheelDelta: 2 }))
    expect(stripAnsi(panel.render(120)[1])).toContain('↑2')
    const before = selectionRow(panel.render(120))
    panel.handleMouse(mouseEvent('wheel', 2, 3, { button: 'none', wheelDelta: 1 }))
    expect(selectionRow(panel.render(120))).toBe(before + 1)
  })

  it('clicks the confirm banner buttons', () => {
    const { panel, deleted } = makePanel()
    panel.render(120)
    panel.handleInput('d')
    const banner = stripAnsi(panel.render(120)[2])
    const click = (x: number) => {
      panel.handleMouse(mouseEvent('press', x, 2))
      return panel.handleMouse(mouseEvent('click', x, 2))
    }
    expect(click(cellColumn(banner, '[n]') + 1)).toEqual({ handled: true })
    expect(deleted).toEqual([])
    panel.handleInput('d')
    click(cellColumn(banner, '[y]') + 1)
    expect(deleted).toEqual(['id-0'])
  })

  it('leaves detail text and non-left buttons to the terminal', () => {
    const { panel } = makePanel()
    panel.render(120)
    expect(panel.handleMouse(mouseEvent('press', 100, 3))).toBeUndefined()
    expect(panel.handleMouse(mouseEvent('press', 2, 3, { button: 'right' }))).toBeUndefined()
    expect(panel.handleMouse(mouseEvent('drag', 2, 3))).toBeUndefined()
    expect(panel.handleMouse(mouseEvent('press', 2, 1))).toBeUndefined()
  })
})
