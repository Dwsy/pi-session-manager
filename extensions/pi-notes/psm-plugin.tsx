import { createElement, useCallback, useEffect, useMemo, useState } from 'react'
import type {
  PsmAppSidebarViewRenderProps,
  PsmAppViewRenderProps,
  PsmPluginHostContext,
  PsmPluginManifest,
} from '@pi-session-manager/plugin-sdk'

import {
  AppPluginSidebarBody,
  AppPluginSidebarControls,
  AppPluginSidebarHeader,
  AppPluginSidebarShell,
  AppPluginSidebarState,
  appPluginSidebarActionButtonClass,
} from '@/components/app/AppPluginSidebarShell'

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

interface NotesPanelProps {
  client: any
  i18n: PsmPluginHostContext['i18n']
  compact?: boolean
}

const VIEW_ID = 'pi-notes.view'
const SIDEBAR_ID = 'pi-notes.sidebar'
const CATEGORIES: NoteCategory[] = ['decision', 'learning', 'pitfall', 'fix', 'art', 'system', 'other']

const CATEGORY_LABELS: Record<NoteCategory, Record<string, string>> = {
  decision: { 'en-US': 'Decision', 'zh-CN': '决策' },
  learning: { 'en-US': 'Learning', 'zh-CN': '学到' },
  pitfall: { 'en-US': 'Pitfall', 'zh-CN': '踩坑' },
  fix: { 'en-US': 'Fix', 'zh-CN': '解决' },
  art: { 'en-US': 'Art', 'zh-CN': '绘画' },
  system: { 'en-US': 'System', 'zh-CN': '系统' },
  other: { 'en-US': 'Other', 'zh-CN': '其他' },
}

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'pi-notes',
  name: 'Pi Notes',
  version: '0.1.0',
  permissions: ['sessions:read', 'fs:read'],
}

function localeOf(i18n: PsmPluginHostContext['i18n']): 'en-US' | 'zh-CN' {
  return i18n.language === 'zh-CN' ? 'zh-CN' : 'en-US'
}

function categoryLabel(category: string, locale: 'en-US' | 'zh-CN') {
  return CATEGORY_LABELS[category as NoteCategory]?.[locale] ?? category
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(asString).filter(Boolean)
  const text = asString(value)
  return text ? text.split(/[\n,，]/).map((item) => item.trim()).filter(Boolean) : []
}

function normalizeNote(value: unknown): PiNote | null {
  if (!value || typeof value !== 'object') return null
  const data = value as Record<string, unknown>
  const id = asString(data.id)
  const name = asString(data.name)
  const text = asString(data.text)
  if (!id || !name) return null
  const rawCategory = asString(data.category).toLowerCase()
  const category = CATEGORIES.includes(rawCategory as NoteCategory) ? rawCategory as NoteCategory : 'other'
  return {
    id,
    name,
    text,
    category,
    tags: asStringList(data.tags),
    decisions: asStringList(data.decisions),
    learnings: asStringList(data.learnings),
    pitfalls: asStringList(data.pitfalls),
    fixes: asStringList(data.fixes),
    ts: typeof data.ts === 'number' && Number.isFinite(data.ts) ? data.ts : 0,
  }
}

function branchEntries(branch: unknown): any[] {
  if (Array.isArray(branch)) return branch
  if (branch && typeof branch === 'object' && Array.isArray((branch as { entries?: unknown[] }).entries)) {
    return (branch as { entries: unknown[] }).entries
  }
  return []
}

async function listSessions(psm: any): Promise<Array<{ id?: string; path: string }>> {
  if (psm.sessions?.list) return psm.sessions.list({ limit: 100, sortOrder: 'newest' })
  if (psm.psm?.sessions?.list) return psm.psm.sessions.list({ limit: 100, sortOrder: 'newest' })
  const fsClient = psm.fs ?? psm.psm?.fs
  if (fsClient?.read) {
    const root = await fsClient.read('session', '')
    if (Array.isArray(root?.children)) return root.children.map((path: string) => ({ id: path, path }))
  }
  return []
}

async function readSessionBranch(psm: any, sessionPath: string): Promise<unknown> {
  if (psm.session?.readBranch) return psm.session.readBranch(sessionPath)
  if (psm.psm?.session?.readBranch) return psm.psm.session.readBranch(sessionPath)
  if (psm.sessions?.readBranch) return psm.sessions.readBranch({ path: sessionPath })
  if (psm.invoke) return psm.invoke('read_session_branch', { path: sessionPath })
  return null
}

async function fetchNotes(client: any): Promise<PiNote[]> {
  const notes = new Map<string, PiNote>()
  const deleted = new Set<string>()
  const sessions = await listSessions(client)
  for (const session of sessions.slice(0, 80)) {
    try {
      const path = session.path || session.id
      if (!path) continue
      const branch = await readSessionBranch(client, path)
      for (const entry of branchEntries(branch)) {
        if (entry?.type !== 'custom') continue
        if (entry.customType === 'pi-note-deleted') {
          const id = asString(entry.data?.id)
          if (id) deleted.add(id)
          continue
        }
        if (entry.customType !== 'pi-note') continue
        const note = normalizeNote(entry.data)
        if (!note) continue
        const existing = notes.get(note.id)
        if (!existing || note.ts >= existing.ts) notes.set(note.id, note)
      }
    } catch {
      // Skip unreadable sessions. One corrupt session should not blank the plugin.
    }
  }
  return [...notes.values()].filter((note) => !deleted.has(note.id)).sort((a, b) => b.ts - a.ts)
}

function formatDate(ts: number): string {
  if (!ts) return 'unknown'
  const date = new Date(ts)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function chip(text: string, key: string) {
  return createElement('span', {
    key,
    className: 'inline-flex items-center rounded-md border border-border/70 bg-secondary/50 px-1.5 py-0.5 text-[10px] text-muted-foreground',
  }, text)
}

function noteSignalCount(note: PiNote): number {
  return note.decisions.length + note.learnings.length + note.pitfalls.length + note.fixes.length
}

function noteMaturityLabel(note: PiNote, locale: 'en-US' | 'zh-CN'): string {
  const count = noteSignalCount(note)
  if (count >= 4) return locale === 'zh-CN' ? '结构完整' : 'Structured'
  if (count > 0) return locale === 'zh-CN' ? `${count} 条线索` : `${count} signals`
  return locale === 'zh-CN' ? '原始记录' : 'Raw note'
}

function NoteDetail({ note, locale, onBack }: { note: PiNote; locale: 'en-US' | 'zh-CN'; onBack: () => void }) {
  const sections: Array<[string, string[]]> = [
    [locale === 'zh-CN' ? '决策轨迹' : 'Decisions', note.decisions],
    [locale === 'zh-CN' ? '学到了什么' : 'Learnings', note.learnings],
    [locale === 'zh-CN' ? '踩了什么坑' : 'Pitfalls', note.pitfalls],
    [locale === 'zh-CN' ? '解决了什么' : 'Fixes', note.fixes],
  ]
  const visibleSections = sections.filter(([, values]) => values.length > 0)
  return createElement(AppPluginSidebarShell as any, { label: note.name },
    createElement(AppPluginSidebarHeader, {
      title: note.name,
      subtitle: `${formatDate(note.ts)} · ${note.text.length} chars`,
      meta: categoryLabel(note.category, locale),
      actions: createElement('button', {
        type: 'button',
        className: appPluginSidebarActionButtonClass,
        onClick: onBack,
      }, locale === 'zh-CN' ? '返回' : 'Back'),
    }),
    createElement(AppPluginSidebarBody, { className: 'space-y-3 p-3' },
      note.tags.length ? createElement('div', { className: 'flex flex-wrap gap-1' }, note.tags.map((tag) => chip(`#${tag}`, tag))) : null,
      createElement('div', { className: 'grid grid-cols-3 gap-2 text-[11px]' },
        createElement('div', { className: 'rounded-lg border border-border/70 bg-secondary/25 p-2' },
          createElement('div', { className: 'text-muted-foreground' }, locale === 'zh-CN' ? '类别' : 'Category'),
          createElement('div', { className: 'mt-0.5 truncate font-medium text-foreground' }, categoryLabel(note.category, locale)),
        ),
        createElement('div', { className: 'rounded-lg border border-border/70 bg-secondary/25 p-2' },
          createElement('div', { className: 'text-muted-foreground' }, locale === 'zh-CN' ? '线索' : 'Signals'),
          createElement('div', { className: 'mt-0.5 font-medium text-foreground' }, String(noteSignalCount(note))),
        ),
        createElement('div', { className: 'rounded-lg border border-border/70 bg-secondary/25 p-2' },
          createElement('div', { className: 'text-muted-foreground' }, locale === 'zh-CN' ? '标签' : 'Tags'),
          createElement('div', { className: 'mt-0.5 font-medium text-foreground' }, String(note.tags.length)),
        ),
      ),
      createElement('div', { className: 'whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-background p-3 text-xs leading-6 text-foreground' }, note.text),
      ...visibleSections.map(([title, values]) => createElement('section', { key: title, className: 'rounded-lg border border-border/70 bg-secondary/25 p-3' },
        createElement('h3', { className: 'mb-2 text-xs font-semibold text-foreground' }, title),
        createElement('ul', { className: 'space-y-1 text-xs leading-5 text-muted-foreground' },
          values.map((value, index) => createElement('li', { key: `${title}-${index}`, className: 'break-words' }, `• ${value}`)),
        ),
      )),
      visibleSections.length === 0 ? createElement('div', { className: 'rounded-lg border border-dashed border-border/70 p-3 text-xs leading-5 text-muted-foreground' },
        locale === 'zh-CN'
          ? '这条笔记还只是原始记录。下次让 Agent 用 notes_save 补 decisions / learnings / pitfalls / fixes，会更适合复盘。'
          : 'This note is still raw. Ask the agent to save decisions / learnings / pitfalls / fixes next time for better review.',
      ) : null,
    ),
  )
}

function NotesPanel({ client, i18n, compact }: NotesPanelProps) {
  const locale = localeOf(i18n)
  const [notes, setNotes] = useState<PiNote[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<NoteCategory | ''>('')
  const [activeTag, setActiveTag] = useState('')
  const [activeNote, setActiveNote] = useState<PiNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      setNotes(await fetchNotes(client))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : String(nextError))
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => { void load() }, [load])

  const categoryCounts = useMemo(() => {
    const counts = new Map<NoteCategory, number>()
    for (const note of notes) counts.set(note.category, (counts.get(note.category) ?? 0) + 1)
    return counts
  }, [notes])
  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const note of notes) {
      for (const tag of note.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  }, [notes])
  const totalSignals = useMemo(() => notes.reduce((sum, note) => sum + noteSignalCount(note), 0), [notes])
  const hasFilters = Boolean(query.trim() || category || activeTag)
  const visibleNotes = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return notes.filter((note) => {
      if (category && note.category !== category) return false
      if (activeTag && !note.tags.includes(activeTag)) return false
      if (!needle) return true
      return [note.name, note.text, note.category, ...note.tags, ...note.decisions, ...note.learnings, ...note.pitfalls, ...note.fixes]
        .join('\n')
        .toLowerCase()
        .includes(needle)
    })
  }, [activeTag, category, notes, query])

  if (activeNote) return createElement(NoteDetail, { note: activeNote, locale, onBack: () => setActiveNote(null) })

  return createElement(AppPluginSidebarShell as any, { label: locale === 'zh-CN' ? '绘画笔记' : 'Pi Notes' },
    createElement(AppPluginSidebarHeader, {
      icon: createElement('span', { className: 'font-mono text-sm' }, '#'),
      title: locale === 'zh-CN' ? '绘画笔记' : 'Pi Notes',
      subtitle: locale === 'zh-CN' ? '决策、经验、踩坑、修复的会话投影' : 'Decisions, learnings, pitfalls, fixes',
      meta: `${visibleNotes.length}/${notes.length}`,
    }),
    createElement(AppPluginSidebarControls, { className: 'space-y-2' },
      !compact ? createElement('div', { className: 'grid grid-cols-3 gap-1.5' },
        [
          [locale === 'zh-CN' ? '笔记' : 'Notes', notes.length],
          [locale === 'zh-CN' ? '线索' : 'Signals', totalSignals],
          [locale === 'zh-CN' ? '标签' : 'Tags', tagCounts.length],
        ].map(([label, value]) => createElement('div', { key: String(label), className: 'rounded-lg border border-border/70 bg-secondary/25 p-2' },
          createElement('div', { className: 'text-[10px] text-muted-foreground' }, label),
          createElement('div', { className: 'mt-0.5 text-sm font-semibold text-foreground tabular-nums' }, String(value)),
        )),
      ) : null,
      createElement('input', {
        type: 'search',
        value: query,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.currentTarget.value),
        placeholder: locale === 'zh-CN' ? '搜索笔记、标签、正文' : 'Search notes, tags, body',
        className: 'h-8 w-full rounded-md border border-border/70 bg-background px-2 text-xs text-foreground outline-none focus:border-ring/50 focus:ring-2 focus:ring-ring/15',
      }),
      createElement('div', { className: 'flex flex-wrap gap-1', role: 'group', 'aria-label': 'Note categories' },
        [{ id: '', label: locale === 'zh-CN' ? '全部' : 'All', count: notes.length }, ...CATEGORIES.map((item) => ({ id: item, label: categoryLabel(item, locale), count: categoryCounts.get(item) ?? 0 }))].map((item) => {
          const selected = category === item.id
          return createElement('button', {
            key: item.id || 'all',
            type: 'button',
            onClick: () => setCategory(item.id as NoteCategory | ''),
            'aria-pressed': selected,
            className: `inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[10px] ${selected ? 'border-ring/45 bg-secondary text-foreground ring-1 ring-ring/20' : 'border-border/65 text-muted-foreground hover:bg-secondary/50 hover:text-foreground'}`,
          }, item.label, item.count ? createElement('span', { className: 'tabular-nums opacity-70' }, item.count) : null)
        }),
      ),
      tagCounts.length && !compact ? createElement('div', { className: 'flex flex-wrap gap-1' },
        tagCounts.slice(0, 18).map(([tag, count]) => createElement('button', {
          key: tag,
          type: 'button',
          onClick: () => setActiveTag(activeTag === tag ? '' : tag),
          className: `rounded-md border px-1.5 py-0.5 text-[10px] ${activeTag === tag ? 'border-ring/45 bg-secondary text-foreground ring-1 ring-ring/20' : 'border-border/65 text-muted-foreground hover:bg-secondary/50'}`,
        }, `#${tag} ${count}`)),
      ) : null,
      hasFilters ? createElement('div', { className: 'flex items-center justify-between gap-2 rounded-lg border border-border/70 bg-secondary/25 px-2 py-1.5 text-[11px] text-muted-foreground' },
        createElement('span', { className: 'truncate' }, locale === 'zh-CN' ? `当前显示 ${visibleNotes.length} 条` : `Showing ${visibleNotes.length}`),
        createElement('button', {
          type: 'button',
          className: appPluginSidebarActionButtonClass,
          onClick: () => { setQuery(''); setCategory(''); setActiveTag('') },
        }, locale === 'zh-CN' ? '清除' : 'Clear'),
      ) : null,
    ),
    createElement(AppPluginSidebarBody, { className: 'p-0' },
      loading ? createElement(AppPluginSidebarState as any, { role: 'status' }, 'Loading notes…') : null,
      error ? createElement(AppPluginSidebarState as any, { tone: 'error', role: 'alert' },
        createElement('div', null, error),
        createElement('button', { type: 'button', className: `${appPluginSidebarActionButtonClass} mt-2`, onClick: () => void load() }, 'Retry'),
      ) : null,
      !loading && !error && visibleNotes.length === 0 ? createElement(AppPluginSidebarState as any, { role: 'status' },
        notes.length === 0
          ? (locale === 'zh-CN' ? '暂无笔记。让 Agent 调 notes_save，或在 Pi 里用 /notes <标题> 创建。' : 'No notes yet. Ask the agent to call notes_save, or use /notes <title> in Pi.')
          : (locale === 'zh-CN' ? '没有匹配结果。清除搜索、类别或标签过滤后再看。' : 'No matching notes. Clear search, category, or tag filters.'),
      ) : null,
      !loading && !error ? visibleNotes.map((note) => createElement('button', {
        key: note.id,
        type: 'button',
        onClick: () => setActiveNote(note),
        className: 'block w-full border-b border-border/50 px-3 py-2.5 text-left hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/35',
      },
        createElement('span', { className: 'mb-1 flex items-center justify-between gap-2' },
          createElement('span', { className: 'truncate text-xs font-medium text-foreground' }, note.name),
          createElement('span', { className: 'flex-none rounded-md border border-border/70 px-1.5 py-0.5 text-[10px] text-muted-foreground' }, categoryLabel(note.category, locale)),
        ),
        createElement('span', { className: 'block line-clamp-2 text-[11px] leading-5 text-muted-foreground' }, note.text || '—'),
        createElement('span', { className: 'mt-1 flex items-center justify-between gap-2 text-[10px] text-muted-foreground' },
          createElement('span', { className: 'truncate' }, formatDate(note.ts)),
          createElement('span', { className: 'flex-none' }, noteMaturityLabel(note, locale)),
        ),
        note.tags.length ? createElement('span', { className: 'mt-1 flex flex-wrap gap-1' }, note.tags.slice(0, 5).map((tag) => chip(`#${tag}`, `${note.id}-${tag}`))) : null,
      )) : null,
    ),
  )
}

function NotesAppView(props: PsmAppViewRenderProps & NotesPanelProps) {
  return createElement('div', { className: 'h-full min-h-0 border-l border-border/60 bg-background' },
    createElement(NotesPanel, { client: props.client, i18n: props.i18n }),
  )
}

export default function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerAppView({
    id: VIEW_ID,
    title: ctx.i18n.t('plugins.piNotes.title', 'Pi Notes'),
    route: '/pi-notes',
    icon: 'notebook-tabs',
    mainContent: 'keep',
    render: (props: PsmAppViewRenderProps) => createElement(NotesAppView, {
      ...(props as PsmAppViewRenderProps),
      client: ctx.psm,
      i18n: ctx.i18n,
    }),
  })

  ctx.ui.registerAppSidebarView({
    id: SIDEBAR_ID,
    title: ctx.i18n.t('plugins.piNotes.sidebarTitle', 'Pi Notes'),
    appViewId: VIEW_ID,
    route: '/pi-notes',
    render: (props: PsmAppSidebarViewRenderProps) => createElement(NotesPanel, {
      ...(props as PsmAppSidebarViewRenderProps),
      client: ctx.psm,
      i18n: ctx.i18n,
      compact: true,
    }),
  })

  ctx.registerCommand({
    id: 'pi-notes.open',
    title: ctx.i18n.t('plugins.piNotes.title', 'Pi Notes'),
    description: 'Open Pi structured notes',
    category: 'Notes',
    icon: 'notebook-tabs',
    keywords: ['notes', 'decision', 'learning', 'pitfall', 'fix', 'drawing'],
    scope: 'global',
    run: (_args: Record<string, unknown>, commandContext?: { navigate?: { openAppView?: (viewId: string) => void } }) => {
      commandContext?.navigate?.openAppView?.(VIEW_ID)
      return { ok: true }
    },
  })
}
