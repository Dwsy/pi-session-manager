/**
 * pi-notes -- PSM plugin entry (React UI)
 *
 * Browse/read notes from Pi session branch entries.
 * Features: category filter, search, detail view, stats.
 */

import React, { createElement, useEffect, useState, useMemo, useCallback, useRef } from 'react'
import type { PsmAppSidebarViewRenderProps, PsmPluginHostContext } from '@pi-session-manager/plugin-sdk'

// ── Types ──

interface PiNote {
  id: string
  name: string
  text: string
  category: string
  ts: number
}

const CATEGORIES = ['tech', 'meeting', 'idea', 'study', 'other'] as const

const CATEGORY_LABELS: Record<string, Record<string, string>> = {
  tech:    { 'en-US': 'Tech',    'zh-CN': '\u6280\u672f' },
  meeting: { 'en-US': 'Meeting', 'zh-CN': '\u4f1a\u8bae' },
  idea:    { 'en-US': 'Idea',    'zh-CN': '\u60f3\u6cd5' },
  study:   { 'en-US': 'Study',   'zh-CN': '\u5b66\u4e60' },
  other:   { 'en-US': 'Other',   'zh-CN': '\u5176\u4ed6' },
}

const CATEGORY_COLORS: Record<string, string> = {
  tech:    '#60a5fa',
  meeting: '#4ade80',
  idea:    '#fbbf24',
  study:   '#be8c60',
  other:   '#a1a1aa',
}

const CATEGORY_BG: Record<string, string> = {
  tech:    'rgba(96,165,250,0.1)',
  meeting: 'rgba(74,222,128,0.1)',
  idea:    'rgba(251,191,36,0.1)',
  study:   'rgba(190,140,96,0.1)',
  other:   'rgba(161,161,170,0.1)',
}

// ── Manifest ──

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
      label: { 'en-US': 'Notes', 'zh-CN': '\u7b14\u8bb0' },
      icon: 'notepad',
      defaultWidth: 400,
    },
  ],
}

// ── Data fetching ──

async function fetchNotesFromSessions(client: any): Promise<PiNote[]> {
  try {
    let sessions: Array<{ id: string; path: string }> = []
    try {
      sessions = await client.psm.sessions.list({ limit: 50, sortOrder: 'newest' })
    } catch {
      const dirs = await client.psm.fs.read('session', '')
      if (dirs?.children) {
        sessions = dirs.children.map((d: string) => ({ id: d, path: d }))
      }
    }

    const allNotes: PiNote[] = []

    for (const s of sessions.slice(0, 30)) {
      try {
        const branch = await client.psm.session.readBranch(s.path)
        if (!branch?.entries) continue

        for (const entry of branch.entries) {
          if (entry?.type === 'custom' && entry?.customType === 'pi-note') {
            const note = entry.data as PiNote | undefined
            if (note?.id) allNotes.push(note)
          }
        }
      } catch {
        // skip unreadable sessions
      }
    }

    const seen = new Map<string, PiNote>()
    for (const n of allNotes) {
      const existing = seen.get(n.id)
      if (!existing || n.ts > existing.ts) seen.set(n.id, n)
    }

    return [...seen.values()].sort((a, b) => b.ts - a.ts)
  } catch {
    return []
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function formatChars(text: string): string {
  return `${text.length} chars`
}

// ── Inline styles ──

const S = {
  page: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100%',
    overflow: 'hidden',
  },
  header: {
    padding: '12px 16px 8px',
    borderBottom: '0.5px solid var(--color-border-tertiary)',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '10px',
  },
  titleIcon: { fontSize: '15px', color: 'var(--color-text-tertiary)' },
  titleText: { fontWeight: 600, fontSize: '15px', color: 'var(--color-text-primary)' },
  titleCount: { fontSize: '12px', color: 'var(--color-text-tertiary)', marginLeft: 'auto' },
  searchInput: {
    width: '100%' as const,
    padding: '7px 10px',
    borderRadius: '6px',
    border: '0.5px solid var(--color-border-tertiary)',
    background: 'var(--color-background-secondary)',
    color: 'var(--color-text-primary)',
    fontSize: '13px',
    outline: 'none',
    boxSizing: 'border-box' as const,
  },
  statsBar: {
    display: 'flex',
    gap: '4px',
    padding: '8px 12px',
    borderBottom: '0.5px solid var(--color-border-tertiary)',
  },
  statCard: (active: boolean, cat: string) => ({
    flex: '1' as const,
    padding: '6px 4px',
    borderRadius: '8px',
    textAlign: 'center' as const,
    cursor: 'pointer' as const,
    backgroundColor: 'var(--color-background-secondary)',
    border: active ? `1.5px solid ${CATEGORY_COLORS[cat] || 'var(--color-border-tertiary)'}` : '1.5px solid transparent',
    transition: 'border-color 0.1s',
  }),
  statCount: (cat: string) => ({
    fontSize: '17px',
    fontWeight: 600,
    lineHeight: 1.2,
    color: cat === '' ? 'var(--color-text-primary)' : (CATEGORY_COLORS[cat] || 'var(--color-text-primary)'),
  }),
  statLabel: { fontSize: '10px', color: 'var(--color-text-tertiary)', marginTop: '1px' },
  noteList: { flex: '1' as const, overflowY: 'auto' as const, padding: '8px 12px' },
  noteCard: (cat: string) => ({
    padding: '10px 12px',
    borderRadius: '8px',
    border: '0.5px solid var(--color-border-tertiary)',
    marginBottom: '8px',
    cursor: 'pointer' as const,
    borderLeft: `3px solid ${CATEGORY_COLORS[cat] || '#a1a1aa'}`,
    transition: 'background 0.15s',
  }),
  noteName: {
    fontWeight: 500,
    fontSize: '13px',
    color: 'var(--color-text-primary)',
    marginBottom: '3px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  noteText: {
    fontSize: '12px',
    color: 'var(--color-text-tertiary)',
    lineHeight: 1.4,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  },
  noteMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '5px',
    fontSize: '11px',
    color: 'var(--color-text-tertiary)',
  },
  noteCatTag: (cat: string) => ({
    fontSize: '10px',
    padding: '1px 6px',
    borderRadius: '4px',
    backgroundColor: CATEGORY_BG[cat] || 'var(--color-background-secondary)',
    color: CATEGORY_COLORS[cat] || 'var(--color-text-secondary)',
  }),
  detailOverlay: {
    position: 'absolute' as const,
    inset: 0,
    backgroundColor: 'var(--color-background-primary)',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  detailHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '12px 16px',
    borderBottom: '0.5px solid var(--color-border-tertiary)',
  },
  backBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer' as const,
    fontSize: '16px',
    padding: '2px 6px',
    color: 'var(--color-text-secondary)',
  },
  detailTitle: {
    flex: 1,
    fontWeight: 500,
    fontSize: '14px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  detailBody: { flex: 1, overflowY: 'auto' as const, padding: '16px' },
  detailMeta: {
    fontSize: '12px',
    color: 'var(--color-text-tertiary)',
    marginBottom: '12px',
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
  },
  detailText: {
    fontSize: '13px',
    color: 'var(--color-text-primary)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    color: 'var(--color-text-tertiary)',
    fontSize: '13px',
    textAlign: 'center' as const,
    lineHeight: 1.6,
  },
  emptyIcon: { fontSize: '28px', marginBottom: '8px', opacity: 0.3 },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px',
    color: 'var(--color-text-tertiary)',
    fontSize: '13px',
  },
  errorBox: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    color: 'var(--color-text-error)',
    fontSize: '13px',
  },
  retryBtn: {
    marginTop: '12px',
    padding: '6px 16px',
    borderRadius: '6px',
    border: '0.5px solid var(--color-border-tertiary)',
    backgroundColor: 'var(--color-background-secondary)',
    cursor: 'pointer' as const,
    fontSize: '12px',
    color: 'var(--color-text-primary)',
  },
}

// ── React component ──

function NotesPanels(props: PsmAppSidebarViewRenderProps) {
  const { client, i18n } = props
  const locale: 'en-US' | 'zh-CN' = i18n?.locale === 'zh-CN' ? 'zh-CN' : 'en-US'

  const [notes, setNotes] = useState<PiNote[]>([])
  const [searchQ, setSearchQ] = useState('')
  const [activeCat, setActiveCat] = useState<string | null>(null)
  const [viewingNote, setViewingNote] = useState<PiNote | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const loadNotes = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await fetchNotesFromSessions(client)
      setNotes(result)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [client])

  useEffect(() => { loadNotes() }, [loadNotes])

  const filtered = useMemo(() => {
    let r = notes
    if (activeCat) r = r.filter(n => n.category === activeCat)
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase()
      r = r.filter(n => n.name.toLowerCase().includes(q) || n.text.toLowerCase().includes(q))
    }
    return r
  }, [notes, activeCat, searchQ])

  const catCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const n of notes) counts[n.category] = (counts[n.category] || 0) + 1
    return counts
  }, [notes])

  // detail view
  if (viewingNote) {
    const catLabel = CATEGORY_LABELS[viewingNote.category]?.[locale] || viewingNote.category
    return (
      <div style={S.detailOverlay}>
        <div style={S.detailHeader}>
          <button style={S.backBtn} onClick={() => setViewingNote(null)}>&larr;</button>
          <div style={S.detailTitle}>{viewingNote.name}</div>
          <span style={S.noteCatTag(viewingNote.category)}>{catLabel}</span>
        </div>
        <div style={S.detailBody}>
          <div style={S.detailMeta}>
            <span>{formatDate(viewingNote.ts)}</span>
            <span>{formatChars(viewingNote.text)}</span>
          </div>
          <div style={S.detailText}>{viewingNote.text}</div>
        </div>
      </div>
    )
  }

  // list view
  const stats = [
    { cat: '', label: 'all' },
    ...CATEGORIES.filter(c => catCounts[c]).map(c => ({
      cat: c, label: CATEGORY_LABELS[c]?.[locale] || c
    }))
  ]

  return (
    <div style={S.page}>
      <div style={S.header}>
        <div style={S.titleRow}>
          <span style={S.titleIcon}>#</span>
          <span style={S.titleText}>Notes</span>
          <span style={S.titleCount}>{notes.length} total</span>
        </div>
        <input
          ref={searchRef}
          style={S.searchInput}
          placeholder="Search notes..."
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
        />
      </div>

      <div style={S.statsBar}>
        {stats.map(({ cat, label }) => (
          <div
            key={cat}
            style={S.statCard(activeCat === cat, cat || 'other')}
            onClick={() => setActiveCat(activeCat === cat ? null : cat)}
          >
            <div style={S.statCount(cat)}>{cat ? (catCounts[cat] || 0) : notes.length}</div>
            <div style={S.statLabel}>{label}</div>
          </div>
        ))}
      </div>

      <div style={S.noteList}>
        {loading && <div style={S.loading}>Loading...</div>}
        {error && (
          <div style={S.errorBox}>
            <div>Error: {error}</div>
            <button style={S.retryBtn} onClick={loadNotes}>Retry</button>
          </div>
        )}
        {!loading && !error && filtered.length === 0 && (
          <div style={S.empty}>
            <div style={S.emptyIcon}>#</div>
            <div>No notes yet. Use /notes in Pi to create one.</div>
          </div>
        )}
        {!loading && !error && filtered.map(note => {
          const catLabel = CATEGORY_LABELS[note.category]?.[locale] || note.category
          return (
            <div
              key={note.id}
              style={S.noteCard(note.category)}
              onClick={() => setViewingNote(note)}
            >
              <div style={S.noteName}>{note.name}</div>
              <div style={S.noteText}>{note.text}</div>
              <div style={S.noteMeta}>
                <span style={S.noteCatTag(note.category)}>{catLabel}</span>
                <span>{formatDate(note.ts)}</span>
                <span>{formatChars(note.text)}</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Activate (default export) ──

export default function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerAppSidebarView({
    id: 'pi-notes.sidebar',
    title: ctx.i18n.t('plugins.piNotes.title', 'Notes'),
    appViewId: 'pi-notes.view',
    route: '/notes',
    render: (props) => createElement(NotesPanels, props),
  })
}