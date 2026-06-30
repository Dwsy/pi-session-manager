/**
 * pi-notes — Pi extension 入口
 *
 * 注册:
 *   1. /notes 命令 (创建/列出/搜索笔记)
 *   2. notes_* 工具 (让 agent 自行读写)
 *
 * 存储: 使用 pi.appendEntry 写入当前分支, 读取用 getBranch()
 */

import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent'
import { Type } from '@sinclair/typebox'

interface PiNote {
  id: string
  name: string
  text: string
  category: string
  ts: number
}

interface PendingNote {
  name: string
  ts: number
}

const CATEGORIES = ['tech', 'meeting', 'idea', 'study', 'other'] as const

function guessCategory(name: string, text: string): string {
  const lower = `${name} ${text}`.toLowerCase()
  if (/\b(rust|typescript|react|api|code|bug|debug|refactor|lint|compil|deploy|ci|cd|test|docker|git|npm|pnpm|build|config|clippy|cargo|tauri|tantivy|sqlite)\b/.test(lower)) return 'tech'
  if (/\b(meeting|sprint|standup|plan|review|retro|sync|discuss|agenda|decide|action|q3|q4|roadmap|milestone)\b/.test(lower)) return 'meeting'
  if (/\b(idea|think|maybe|could|what if|proposal|suggest|vision|dream)\b/.test(lower)) return 'idea'
  if (/\b(study|learn|read|book|course|tutorial|paper|research|guide|note|summary)\b/.test(lower)) return 'study'
  return 'other'
}

export default function (pi: ExtensionAPI) {

  // ── helper: 读分支智能体所有笔记 ──
  function readNotes(ctx: ExtensionContext): PiNote[] {
    const notes: PiNote[] = []
    const branch = ctx.sessionManager.getBranch()
    for (const entry of branch) {
      if (entry.type === 'custom' && entry.customType === 'pi-note') {
        const data = entry.data as PiNote | undefined
        if (data?.id) notes.push(data)
      }
    }
    // 去重 (同名最新覆盖旧)
    const seen = new Map<string, PiNote>()
    for (const n of notes) {
      const existing = seen.get(n.id)
      if (!existing || n.ts > existing.ts) {
        seen.set(n.id, n)
      }
    }
    return [...seen.values()].sort((a, b) => b.ts - a.ts)
  }

  function hasPendingNote(ctx: ExtensionContext): PendingNote | null {
    const branch = ctx.sessionManager.getBranch()
    for (const entry of branch) {
      if (entry.type === 'custom' && entry.customType === 'pi-note-pending') {
        return entry.data as PendingNote
      }
    }
    return null
  }

  function clearPending(ctx: ExtensionContext) {
    // appendEntry with null/empty to mark consumed
    // (branch entries are immutable, we use a marker approach)
    const branch = ctx.sessionManager.getBranch()
    for (const entry of branch) {
      if (entry.type === 'custom' && entry.customType === 'pi-note-pending') {
        pi.appendEntry('pi-note-pending', null)
        return
      }
    }
  }

  // ── /notes 命令 ──
  pi.registerCommand('notes', {
    description: '笔记管理: /notes <name> 然后粘贴内容, /notes list [category], /notes search <keyword>',

    handler: async (args, ctx) => {
      if (!ctx.hasUI) {
        ctx.ui.notify('Need interactive mode', 'error')
        return
      }

      const raw = args.join(' ').trim()
      const notes = readNotes(ctx)

      // /notes list [category]
      if (raw === 'list' || raw.startsWith('list ')) {
        const cat = raw.slice(5).trim().toLowerCase()
        const filtered = cat ? notes.filter(n => n.category === cat) : notes

        if (filtered.length === 0) {
          ctx.ui.notify(cat ? `No notes in "${cat}"` : 'No notes yet', 'info')
          return
        }

        const lines = [`pi-notes${cat ? ` (${cat})` : ''} — ${filtered.length} notes\n`]
        for (const n of filtered) {
          const date = new Date(n.ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
          lines.push(`  #${n.id.slice(0, 6)} [${n.category}] ${n.name}  ${date}`)
          lines.push(`    ${n.text.slice(0, 80)}${n.text.length > 80 ? '…' : ''}`)
        }
        ctx.ui.setWidget('pi-notes-list', lines, { placement: 'belowEditor' })
        return
      }

      // /notes search <query>
      if (raw.startsWith('search ')) {
        const q = raw.slice(7).trim().toLowerCase()
        const hits = notes.filter(n => n.name.toLowerCase().includes(q) || n.text.toLowerCase().includes(q))

        if (hits.length === 0) {
          ctx.ui.notify(`No notes matching "${q}"`, 'info')
          return
        }

        ctx.ui.setWidget('pi-notes-search', [
          `Search: "${q}" — ${hits.length} notes\n`,
          ...hits.map(n => `  #${n.id.slice(0, 6)} [${n.category}] ${n.name}: ${n.text.slice(0, 60)}`),
        ], { placement: 'belowEditor' })
        return
      }

      // /notes delete <id-prefix>
      if (raw.startsWith('delete ')) {
        const prefix = raw.slice(7).trim()
        const match = notes.find(n => n.id.startsWith(prefix))
        if (!match) {
          ctx.ui.notify(`Note "${prefix}" not found`, 'error')
          return
        }
        pi.appendEntry('pi-note-deleted', { id: match.id })
        ctx.ui.notify(`Deleted: ${match.name}`, 'info')
        return
      }

      // /notes <name> — set pending, wait for paste
      pi.appendEntry('pi-note-pending', { name: raw, ts: Date.now() } as PendingNote)

      ctx.ui.setWidget('pi-notes-prompt', [
        ``,
        `Note: "${raw}"`,
        `─`.repeat(24),
        `Paste note text, then press Enter.`,
        `To cancel: /notes cancel`,
        ``,
      ], { placement: 'belowEditor' })
      ctx.ui.notify(`Paste content for "${raw}"`, 'info')
    },

    getArgumentCompletions: async (_partial: string, ctx: any) => {
      const notes = readNotes(ctx)
      const names = [...new Set(notes.map(n => n.name))].slice(0, 10)
      const cats = CATEGORIES.map(c => `list ${c}`)
      return [...cats, ...names]
    },
  })

  // ── intercept user input for note content ──
  pi.on('beforeUserInput', async (input: string, ctx: ExtensionContext) => {
    const pending = hasPendingNote(ctx)
    if (!pending) return

    // Cancel
    if (input.trim().toLowerCase() === '/notes cancel') {
      pi.appendEntry('pi-note-pending', null)
      ctx.ui.setWidget('pi-notes-prompt', undefined)
      ctx.ui.notify('Cancelled', 'info')
      return true
    }

    if (!input.trim()) {
      ctx.ui.notify('Empty content, try again or /notes cancel', 'error')
      return true
    }

    const note: PiNote = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: pending.name,
      text: input,
      category: guessCategory(pending.name, input),
      ts: Date.now(),
    }

    pi.appendEntry('pi-note', note)
    pi.appendEntry('pi-note-pending', null)
    ctx.ui.setWidget('pi-notes-prompt', undefined)
    ctx.ui.notify(`Saved [${note.category}] "${note.name}" (${note.text.length} chars)`, 'success')

    return true // prevent normal processing
  })

  // ── agent tool: notes_save ──
  pi.registerTool({
    name: 'notes_save',
    label: 'Save Note',
    description: 'Save a note. Params: name (title), text (content). Auto-categorizes.',

    parameters: Type.Object({
      name: Type.String({ description: 'Note title' }),
      text: Type.String({ description: 'Note content' }),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { name, text } = params as { name: string; text: string }
      const note: PiNote = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        name,
        text,
        category: guessCategory(name, text),
        ts: Date.now(),
      }
      pi.appendEntry('pi-note', note)

      return {
        content: [{ type: 'text', text: `saved [${note.category}] "${name}" (${text.length} chars)` }],
        details: { note },
      }
    },
  })

  // ── agent tool: notes_list ──
  pi.registerTool({
    name: 'notes_list',
    label: 'List Notes',
    description: 'List saved notes. Optional category filter.',

    parameters: Type.Object({
      category: Type.Optional(Type.String({ description: 'Filter: tech/meeting/idea/study/other' })),
      limit: Type.Optional(Type.Number({ description: 'Max results (default 20)' })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { category, limit = 20 } = params as { category?: string; limit?: number }
      const notes = readNotes(ctx)
      let filtered = category ? notes.filter(n => n.category === category) : notes
      filtered = filtered.slice(0, limit)

      const text = filtered.map(n =>
        `#${n.id.slice(0, 6)} [${n.category}] ${n.name} (${new Date(n.ts).toISOString().slice(0, 10)}): ${n.text.slice(0, 60)}`
      ).join('\n')

      return {
        content: [{ type: 'text', text: text || 'no notes found' }],
        details: { count: filtered.length },
      }
    },
  })

  // ── agent tool: notes_search ──
  pi.registerTool({
    name: 'notes_search',
    label: 'Search Notes',
    description: 'Search notes by keyword in name or text.',

    parameters: Type.Object({
      query: Type.String({ description: 'Search keyword' }),
      limit: Type.Optional(Type.Number({ description: 'Max results (default 10)' })),
    }),

    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const { query, limit = 10 } = params as { query: string; limit?: number }
      const q = query.toLowerCase()
      const notes = readNotes(ctx)
      const hits = notes.filter(n => n.name.toLowerCase().includes(q) || n.text.toLowerCase().includes(q))

      const text = hits.slice(0, limit).map(n =>
        `#${n.id.slice(0, 6)} [${n.category}] ${n.name} (${new Date(n.ts).toISOString().slice(0, 10)}): ${n.text.slice(0, 80)}`
      ).join('\n')

      return {
        content: [{ type: 'text', text: text || `no notes matching "${query}"` }],
        details: { count: hits.length },
      }
    },
  })
}