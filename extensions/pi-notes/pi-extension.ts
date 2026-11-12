/**
 * pi-notes — Pi runtime extension.
 *
 * Stores human/agent-readable drawing notes in the current Pi branch via
 * appendEntry('pi-note', ...). The PSM plugin reads the same branch entries.
 *
 * `/notes` opens the interactive two-pane browser (notes-panel); the
 * notes_save/notes_list/notes_search tools give the agent the same data.
 */

import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { Type } from 'typebox'
import {
  CATEGORIES,
  createNote,
  filterNotes,
  type NoteCategory,
  noteSummary,
  notesFromEntries,
  type PiNote,
  searchNotes,
} from './notes-core.ts'
import { NotesPanel } from './notes-panel.ts'

function branchEntries(ctx: ExtensionContext): unknown[] {
  return Array.from(ctx.sessionManager.getBranch() as Iterable<unknown>)
}

function readNotes(ctx: ExtensionContext): PiNote[] {
  return notesFromEntries(branchEntries(ctx))
}

async function openNotesPanel(
  pi: ExtensionAPI,
  ctx: ExtensionContext,
  notes: PiNote[],
  label: string,
  startWithHelp = false,
): Promise<void> {
  if (ctx.mode !== 'tui') {
    ctx.ui.notify(`pi-notes: ${notes.length} note(s). Interactive panel needs the TUI.`, 'info')
    return
  }

  const ui = ctx.ui // capture before custom(): the ctx may go stale while the panel is open
  await ui.custom(
    (tui, theme, _keybindings, done) => new NotesPanel({
      notes,
      label,
      theme,
      startWithHelp,
      viewport: () => ({ width: tui.terminal.columns, height: tui.terminal.rows }),
      requestRender: () => tui.requestRender(),
      onClose: () => done(undefined),
      onDelete: (note) => {
        pi.appendEntry('pi-note-deleted', { id: note.id })
        ui.notify(`Deleted: ${note.name}`, 'info')
      },
    }),
    {
      // Centered overlay: mouse events only reach custom components through
      // the overlay/alt-screen dispatcher, and a floating panel keeps the
      // transcript visible behind it.
      overlay: true,
      overlayOptions: { width: '94%', maxHeight: '92%', anchor: 'center', margin: 1 },
    },
  )
}

export default function (pi: ExtensionAPI) {
  pi.registerCommand('notes', {
    description: 'Drawing/session notes: list, search, save, delete',
    handler: async (args, ctx) => {
      const raw = args.trim()
      const notes = readNotes(ctx)

      if (!raw || raw === 'help') {
        await openNotesPanel(pi, ctx, notes, 'help', true)
        return
      }

      if (raw === 'list' || raw.startsWith('list ')) {
        const filter = raw.slice(5).trim()
        const visible = filterNotes(notes, filter)
        await openNotesPanel(pi, ctx, visible, filter ? `filter ${filter}` : '')
        return
      }

      if (raw.startsWith('search ')) {
        const query = raw.slice(7).trim()
        const hits = searchNotes(notes, query)
        await openNotesPanel(pi, ctx, hits, `search "${query}"`)
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
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
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
      const hits = searchNotes(readNotes(ctx), query).slice(0, limit)
      return {
        content: [{ type: 'text', text: hits.map(noteSummary).join('\n') || `no notes matching "${query}"` }],
        details: { count: hits.length },
      }
    },
  })
}

export type { NoteCategory, PiNote }
