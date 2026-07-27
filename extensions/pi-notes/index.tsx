/**
 * pi-notes -- PSM plugin entry (React UI)
 *
 * Browse/read notes from Pi session branch entries.
 * Features: category filter, search, detail view, stats.
 */

import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import type { PsmAppSidebarViewRenderProps, PsmPluginHostContext } from '@pi-session-manager/plugin-sdk'

import {
  AppPluginSidebarBody,
  AppPluginSidebarControls,
  AppPluginSidebarHeader,
  AppPluginSidebarShell,
  AppPluginSidebarState,
  appPluginSidebarActionButtonClass,
  appPluginSidebarIconButtonClass,
} from '@/components/app/AppPluginSidebarShell'

interface PiNote {
  id: string
  name: string
  text: string
  category: string
  ts: number
}

const CATEGORIES = ['tech', 'meeting', 'idea', 'study', 'other'] as const

const CATEGORY_LABELS: Record<string, Record<string, string>> = {
  tech: { 'en-US': 'Tech', 'zh-CN': '技术' },
  meeting: { 'en-US': 'Meeting', 'zh-CN': '会议' },
  idea: { 'en-US': 'Idea', 'zh-CN': '想法' },
  study: { 'en-US': 'Study', 'zh-CN': '学习' },
  other: { 'en-US': 'Other', 'zh-CN': '其他' },
}

const CATEGORY_COLORS: Record<string, string> = {
  tech: '#60a5fa',
  meeting: '#4ade80',
  idea: '#fbbf24',
  study: '#be8c60',
  other: '#a1a1aa',
}

export const manifest = {
  manifestVersion: 1,
  id: 'pi-notes',
  name: 'pi-notes',
  version: '0.1.0',
  description: 'Browse and read notes saved via Pi /notes command or agent tools',
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3',
  },
  permissions: ['sessions:read'],
  appSidebarViews: [
    {
      id: 'pi-notes.sidebar',
      label: { 'en-US': 'Notes', 'zh-CN': '笔记' },
      icon: 'notepad',
      defaultWidth: 400,
    },
  ],
}

async function fetchNotesFromSessions(client: any): Promise<PiNote[]> {
  try {
    let sessions: Array<{ id: string; path: string }> = []
    try {
      sessions = await client.psm.sessions.list({ limit: 50, sortOrder: 'newest' })
    } catch {
      const dirs = await client.psm.fs.read('session', '')
      if (dirs?.children) {
        sessions = dirs.children.map((directory: string) => ({ id: directory, path: directory }))
      }
    }

    const allNotes: PiNote[] = []
    for (const session of sessions.slice(0, 30)) {
      try {
        const branch = await client.psm.session.readBranch(session.path)
        if (!branch?.entries) continue
        for (const entry of branch.entries) {
          if (entry?.type === 'custom' && entry?.customType === 'pi-note') {
            const note = entry.data as PiNote | undefined
            if (note?.id) allNotes.push(note)
          }
        }
      } catch {
        // Skip unreadable sessions.
      }
    }

    const seen = new Map<string, PiNote>()
    for (const note of allNotes) {
      const existing = seen.get(note.id)
      if (!existing || note.ts > existing.ts) seen.set(note.id, note)
    }
    return [...seen.values()].sort((a, b) => b.ts - a.ts)
  } catch {
    return []
  }
}

function formatDate(ts: number): string {
  const date = new Date(ts)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function formatChars(text: string): string {
  return `${text.length} chars`
}

function NotesPanels({ client, i18n }: PsmAppSidebarViewRenderProps) {
  const locale: 'en-US' | 'zh-CN' = i18n?.locale === 'zh-CN' ? 'zh-CN' : 'en-US'
  const [notes, setNotes] = useState<PiNote[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [viewingNote, setViewingNote] = useState<PiNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadNotes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setNotes(await fetchNotesFromSessions(client))
    } catch (nextError) {
      setError(String(nextError))
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => {
    void loadNotes()
  }, [loadNotes])

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const note of notes) counts[note.category] = (counts[note.category] || 0) + 1
    return counts
  }, [notes])

  const filteredNotes = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase()
    return notes.filter((note) => {
      if (activeCategory && note.category !== activeCategory) return false
      if (!needle) return true
      return note.name.toLowerCase().includes(needle) || note.text.toLowerCase().includes(needle)
    })
  }, [activeCategory, notes, searchQuery])

  if (viewingNote) {
    const categoryLabel = CATEGORY_LABELS[viewingNote.category]?.[locale] || viewingNote.category
    return (
      <AppPluginSidebarShell label={viewingNote.name}>
        <AppPluginSidebarHeader
          title={viewingNote.name}
          subtitle={`${formatDate(viewingNote.ts)} · ${formatChars(viewingNote.text)}`}
          meta={<span style={{ color: CATEGORY_COLORS[viewingNote.category] }}>{categoryLabel}</span>}
          actions={
            <button
              type="button"
              className={appPluginSidebarIconButtonClass}
              onClick={() => setViewingNote(null)}
              aria-label="Back to notes"
              title="Back to notes"
            >
              ←
            </button>
          }
        />
        <AppPluginSidebarBody className="p-3">
          <div className="whitespace-pre-wrap break-words text-xs leading-6 text-foreground">
            {viewingNote.text}
          </div>
        </AppPluginSidebarBody>
      </AppPluginSidebarShell>
    )
  }

  const categories = [
    { id: '', label: locale === 'zh-CN' ? '全部' : 'All', count: notes.length },
    ...CATEGORIES.filter((category) => categoryCounts[category]).map((category) => ({
      id: category,
      label: CATEGORY_LABELS[category]?.[locale] || category,
      count: categoryCounts[category] || 0,
    })),
  ]

  return (
    <AppPluginSidebarShell label={locale === 'zh-CN' ? '笔记' : 'Notes'}>
      <AppPluginSidebarHeader
        icon={<span className="font-mono text-sm">#</span>}
        title={locale === 'zh-CN' ? '笔记' : 'Notes'}
        subtitle={locale === 'zh-CN' ? '来自 Pi 会话的已保存笔记' : 'Saved notes from Pi sessions'}
        meta={`${notes.length}`}
      />

      <AppPluginSidebarControls className="space-y-2">
        <input
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
          placeholder={locale === 'zh-CN' ? '搜索笔记' : 'Search notes'}
          className="h-8 w-full rounded-md border border-border/70 bg-background px-2 text-xs text-foreground outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/15"
        />
        <div className="flex gap-1 overflow-x-auto pb-0.5" role="group" aria-label="Note categories">
          {categories.map((category) => {
            const selected = activeCategory === (category.id || null)
            return (
              <button
                key={category.id || 'all'}
                type="button"
                onClick={() => setActiveCategory(category.id || null)}
                aria-pressed={selected}
                className={`inline-flex h-7 flex-none items-center gap-1.5 rounded-md border px-2 text-[10px] ${
                  selected
                    ? 'border-ring/45 bg-secondary/70 text-foreground'
                    : 'border-border/65 text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                }`}
              >
                <span>{category.label}</span>
                <span className="font-mono opacity-70">{category.count}</span>
              </button>
            )
          })}
        </div>
      </AppPluginSidebarControls>

      <AppPluginSidebarBody>
        {loading ? <AppPluginSidebarState role="status">Loading notes…</AppPluginSidebarState> : null}
        {error ? (
          <AppPluginSidebarState tone="error" role="alert">
            <div>{error}</div>
            <button type="button" className={`${appPluginSidebarActionButtonClass} mt-2`} onClick={() => void loadNotes()}>
              Retry
            </button>
          </AppPluginSidebarState>
        ) : null}
        {!loading && !error && filteredNotes.length === 0 ? (
          <AppPluginSidebarState role="status">
            {locale === 'zh-CN' ? '暂无笔记。可在 Pi 中使用 /notes 创建。' : 'No notes yet. Use /notes in Pi to create one.'}
          </AppPluginSidebarState>
        ) : null}
        {!loading && !error ? filteredNotes.map((note) => {
          const categoryLabel = CATEGORY_LABELS[note.category]?.[locale] || note.category
          return (
            <button
              key={note.id}
              type="button"
              onClick={() => setViewingNote(note)}
              className="block w-full border-b border-border/50 border-l-2 px-3 py-2.5 text-left hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35"
              style={{ borderLeftColor: CATEGORY_COLORS[note.category] || CATEGORY_COLORS.other }}
            >
              <span className="block truncate text-xs font-medium text-foreground">{note.name}</span>
              <span className="mt-1 line-clamp-2 block text-[11px] leading-5 text-muted-foreground">{note.text}</span>
              <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                <span style={{ color: CATEGORY_COLORS[note.category] }}>{categoryLabel}</span>
                <span>{formatDate(note.ts)}</span>
                <span>{formatChars(note.text)}</span>
              </span>
            </button>
          )
        }) : null}
      </AppPluginSidebarBody>
    </AppPluginSidebarShell>
  )
}

export default function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerAppSidebarView({
    id: 'pi-notes.sidebar',
    title: ctx.i18n.t('plugins.piNotes.title', 'Notes'),
    appViewId: 'pi-notes.view',
    route: '/notes',
    render: (props) => createElement(NotesPanels, props),
  })
}
