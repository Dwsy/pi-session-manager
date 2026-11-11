import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Bookmark,
  Check,
  ExternalLink,
  NotebookPen,
  Pencil,
  Search,
  Sparkles,
  Target,
  Trash2,
  X,
} from 'lucide-react'
import type { PsmPluginI18nClient } from '@dwsy/plugin-sdk'

import {
  SessionPluginPanel,
  SessionPluginPanelBody,
  SessionPluginPanelHeader,
  SessionPluginPanelState,
  sessionPluginPanelActionButtonClass,
  sessionPluginPanelIconButtonClass,
} from '../../src/components/session-viewer/SessionPluginPanel'
import type { Bookmark as BookmarkModel, RegistryEntry } from './bookmark'

export interface I18nLike {
  language?: string
  t(key: string, fallback: string, values?: Record<string, unknown>): string
}

export interface BookmarkSessionRef {
  path: string
  name?: string
}

export interface BookmarkStoreLike {
  listForSession(sessionPath: string): Promise<BookmarkModel[]>
  listRecent(): Promise<RegistryEntry[]>
  search(query: string): Promise<BookmarkModel[]>
  updateNote(id: string, sessionPath: string, note: string): Promise<void>
  remove(bookmark: BookmarkModel): Promise<void>
  subscribe(listener: () => void): () => void
  consumePendingNoteId(): string | null
}

export interface BookmarkQuotable {
  id: string
  sessionPath: string
  entryId: string
  quote: string
  note?: string
}

const QUOTE_TRUNCATE_CHARS = 280

function t(i18n: I18nLike | PsmPluginI18nClient, key: string, fallback: string, values?: Record<string, unknown>) {
  return i18n.t(`plugins.bookmarks.${key}`, fallback, values)
}

function formatTime(iso: string, language: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(language, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function truncated(text: string, max = QUOTE_TRUNCATE_CHARS): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

interface NoteEditorProps {
  initial: string
  i18n: I18nLike
  autoFocus?: boolean
  onSave: (note: string) => void
  onCancel: () => void
}

function NoteEditor({ initial, i18n, autoFocus = true, onSave, onCancel }: NoteEditorProps) {
  const [value, setValue] = useState(initial)

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        className="w-full min-h-[64px] resize-y rounded-lg border border-border/60 bg-secondary/40 px-2.5 py-2 text-xs leading-relaxed text-foreground placeholder:text-muted-foreground/60 focus:border-info/60 focus:outline-none focus:ring-1 focus:ring-info/30"
        placeholder={t(i18n, 'notePlaceholder', 'Add a note…')}
        value={value}
        autoFocus={autoFocus}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            onCancel()
          }
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            onSave(value)
          }
        }}
      />
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          className={`${sessionPluginPanelActionButtonClass} px-2 py-1 text-[11px] text-muted-foreground`}
          onClick={onCancel}
        >
          {t(i18n, 'cancel', 'Cancel')}
        </button>
        <button
          type="button"
          className={`${sessionPluginPanelActionButtonClass} px-2 py-1 text-[11px] text-info`}
          onClick={() => onSave(value)}
        >
          {t(i18n, 'saveNote', 'Save note')}
        </button>
      </div>
    </div>
  )
}

interface BookmarkActionsProps {
  i18n: I18nLike
  onJump?: () => void
  onEditNote?: () => void
  onDelete?: () => void
  confirmingDelete: boolean
  onConfirmDelete: () => void
}

function BookmarkActions({
  i18n,
  onJump,
  onEditNote,
  onDelete,
  confirmingDelete,
  onConfirmDelete,
}: BookmarkActionsProps) {
  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
      {onJump && (
        <button
          type="button"
          className={sessionPluginPanelIconButtonClass}
          title={t(i18n, 'jump', 'Jump to text')}
          aria-label={t(i18n, 'jump', 'Jump to text')}
          onClick={onJump}
        >
          <Target className="h-3.5 w-3.5" />
        </button>
      )}
      {onEditNote && (
        <button
          type="button"
          className={sessionPluginPanelIconButtonClass}
          title={t(i18n, 'editNote', 'Edit note')}
          aria-label={t(i18n, 'editNote', 'Edit note')}
          onClick={onEditNote}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      )}
      {onDelete && (
        <button
          type="button"
          className={`${sessionPluginPanelIconButtonClass} ${confirmingDelete ? 'text-warning' : ''}`}
          title={confirmingDelete ? t(i18n, 'deleteConfirm', 'Delete this bookmark?') : t(i18n, 'delete', 'Delete')}
          aria-label={t(i18n, 'delete', 'Delete')}
          onClick={confirmingDelete ? onConfirmDelete : onDelete}
        >
          {confirmingDelete ? <Check className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  )
}

interface BookmarkCardProps {
  bookmark: BookmarkModel
  i18n: I18nLike
  language: string
  editing: boolean
  confirmingDelete: boolean
  showSession?: boolean
  onEditNote: () => void
  onCancelEdit: () => void
  onSaveNote: (note: string) => void
  onDelete: () => void
  onConfirmDelete: () => void
  onJump?: () => void
  onOpenSession?: () => void
}

function BookmarkCard({
  bookmark,
  i18n,
  language,
  editing,
  confirmingDelete,
  showSession = false,
  onEditNote,
  onCancelEdit,
  onSaveNote,
  onDelete,
  onConfirmDelete,
  onJump,
  onOpenSession,
}: BookmarkCardProps) {
  return (
    <div className="group rounded-xl border border-border/50 bg-secondary/25 px-3 py-2.5 transition-colors duration-150 hover:border-info/35 hover:bg-secondary/45">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 border-l-2 border-amber-400/60 pl-2.5 text-xs italic leading-relaxed text-foreground/90">
          {truncated(bookmark.quote)}
        </p>
        <BookmarkActions
          i18n={i18n}
          onJump={onJump}
          onEditNote={onEditNote}
          onDelete={onDelete}
          confirmingDelete={confirmingDelete}
          onConfirmDelete={onConfirmDelete}
        />
      </div>

      {editing ? (
        <div className="mt-2">
          <NoteEditor
            initial={bookmark.note ?? ''}
            i18n={i18n}
            onSave={onSaveNote}
            onCancel={onCancelEdit}
          />
        </div>
      ) : bookmark.note ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <NotebookPen className="mt-0.5 h-3 w-3 shrink-0 text-info/80" aria-hidden="true" />
          <span className="min-w-0 break-words">{bookmark.note}</span>
        </p>
      ) : null}

      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/70">
        <span>{formatTime(bookmark.createdAt, language)}</span>
        {showSession && (
          <button
            type="button"
            className="flex min-w-0 items-center gap-1 truncate transition-colors hover:text-info"
            title={bookmark.sessionPath}
            onClick={onOpenSession}
          >
            <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{bookmark.sessionPath.split('/').pop() ?? bookmark.sessionPath}</span>
          </button>
        )}
      </div>
    </div>
  )
}

export interface BookmarksToolbarButtonProps {
  i18n: I18nLike
  open: boolean
  onToggle: () => void
}

export function BookmarksToolbarButton({ i18n, open, onToggle }: BookmarksToolbarButtonProps) {
  const label = t(i18n, 'toolbarTitle', 'Bookmarks')
  return (
    <button
      type="button"
      className={sessionPluginPanelIconButtonClass}
      title={label}
      aria-label={label}
      aria-pressed={open}
      onClick={onToggle}
    >
      <Bookmark className="h-3.5 w-3.5" />
    </button>
  )
}

export interface BookmarksPanelProps {
  store: BookmarkStoreLike
  i18n: I18nLike
  session: BookmarkSessionRef
  onJump: (entryId: string) => void
  onClose?: () => void
}

export function BookmarksPanel({
  store,
  i18n,
  session,
  onJump,
  onClose,
}: BookmarksPanelProps) {
  const [bookmarks, setBookmarks] = useState<BookmarkModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const sessionPathRef = useRef(session.path)
  sessionPathRef.current = session.path

  const load = useCallback(async () => {
    const path = sessionPathRef.current
    try {
      const items = await store.listForSession(path)
      if (sessionPathRef.current !== path) return
      setBookmarks(items)
      setError(null)
      const pendingId = store.consumePendingNoteId()
      if (pendingId && items.some((item) => item.id === pendingId)) setEditingId(pendingId)
    } catch (cause) {
      if (sessionPathRef.current !== path) return
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setLoading(false)
    }
  }, [store])

  useEffect(() => {
    setLoading(true)
    setEditingId(null)
    setConfirmingDeleteId(null)
    void load()
    return store.subscribe(() => void load())
  }, [store, load, session.path])

  const onDelete = useCallback(
    async (bookmark: BookmarkModel) => {
      setConfirmingDeleteId(null)
      try {
        await store.remove(bookmark)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    },
    [store],
  )

  return (
    <SessionPluginPanel label={t(i18n, 'panelTitle', 'Session Bookmarks')}>
      <SessionPluginPanelHeader
        icon={<Bookmark className="h-4 w-4" aria-hidden="true" />}
        title={t(i18n, 'panelTitle', 'Session Bookmarks')}
        subtitle={t(i18n, 'count', '{{count}} bookmarks', { count: bookmarks.length })}
        onClose={onClose}
      />
      <SessionPluginPanelBody className="flex flex-col gap-2">
        {loading ? (
          <SessionPluginPanelState>{t(i18n, 'loadFailed', 'Loading…')}</SessionPluginPanelState>
        ) : error ? (
          <SessionPluginPanelState tone="error">
            {t(i18n, 'loadFailed', 'Failed to load bookmarks: {{message}}', { message: error })}
          </SessionPluginPanelState>
        ) : bookmarks.length === 0 ? (
          <SessionPluginPanelState>
            <div className="flex flex-col items-center gap-1.5 py-6">
              <Bookmark className="h-7 w-7 text-info/50" aria-hidden="true" />
              <div className="text-xs font-medium text-foreground/80">
                {t(i18n, 'emptyTitle', 'No bookmarks yet')}
              </div>
              <div className="max-w-[220px] text-center text-[11px] leading-relaxed text-muted-foreground">
                {t(i18n, 'emptyHint', 'Select text in the transcript to bookmark it.')}
              </div>
            </div>
          </SessionPluginPanelState>
        ) : (
          bookmarks.map((bookmark) => (
            <BookmarkCard
              key={bookmark.id}
              bookmark={bookmark}
              i18n={i18n}
              language={i18n.language ?? 'en-US'}
              editing={editingId === bookmark.id}
              confirmingDelete={confirmingDeleteId === bookmark.id}
              onEditNote={() => {
                setConfirmingDeleteId(null)
                setEditingId(bookmark.id)
              }}
              onCancelEdit={() => setEditingId(null)}
              onSaveNote={async (note) => {
                setEditingId(null)
                try {
                  await store.updateNote(bookmark.id, bookmark.sessionPath, note)
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : String(cause))
                }
              }}
              onDelete={() => {
                setEditingId(null)
                setConfirmingDeleteId(bookmark.id)
              }}
              onConfirmDelete={() => void onDelete(bookmark)}
              onJump={() => onJump(bookmark.anchor.entryId)}
            />
          ))
        )}
      </SessionPluginPanelBody>
    </SessionPluginPanel>
  )
}

export interface BookmarkHighlightPopoverProps {
  store: BookmarkStoreLike
  i18n: I18nLike
  bookmarkId: string
  sessionPath: string
  onClose: () => void
}

/** Compact popover content shown when a transcript highlight is activated. */
export function BookmarkHighlightPopover({
  store,
  i18n,
  bookmarkId,
  sessionPath,
  onClose,
}: BookmarkHighlightPopoverProps) {
  const [bookmark, setBookmark] = useState<BookmarkModel | null>(null)
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)

  // Data-aware: reloads on every store change so edits made here (or in the
  // session panel) never leave a stale popover behind.
  const load = useCallback(async () => {
    const items = await store.listForSession(sessionPath)
    const found = items.find((item) => item.id === bookmarkId) ?? null
    setBookmark(found)
    if (found && !found.note) setEditing(true)
  }, [store, sessionPath, bookmarkId])

  useEffect(() => {
    void load()
    return store.subscribe(() => void load())
  }, [load, store])

  if (!bookmark) return null

  return (
    <div className="flex w-[300px] flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 border-l-2 border-amber-400/60 pl-2.5 text-xs italic leading-relaxed text-foreground/90">
          {truncated(bookmark.quote, 160)}
        </p>
        <button
          type="button"
          className={sessionPluginPanelIconButtonClass}
          aria-label={t(i18n, 'cancel', 'Cancel')}
          title={t(i18n, 'cancel', 'Cancel')}
          onClick={onClose}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {editing ? (
        <NoteEditor
          initial={bookmark.note ?? ''}
          i18n={i18n}
          onSave={async (note) => {
            setEditing(false)
            await store.updateNote(bookmark.id, bookmark.sessionPath, note)
          }}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          {bookmark.note && (
            <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
              <NotebookPen className="mt-0.5 h-3 w-3 shrink-0 text-info/80" aria-hidden="true" />
              <span className="min-w-0 break-words">{bookmark.note}</span>
            </p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground/70">
              {formatTime(bookmark.createdAt, i18n.language ?? 'en-US')}
            </span>
            <BookmarkActions
              i18n={i18n}
              onEditNote={() => setEditing(true)}
              onDelete={() => setConfirmingDelete(true)}
              confirmingDelete={confirmingDelete}
              onConfirmDelete={async () => {
                await store.remove(bookmark)
                onClose()
              }}
            />
          </div>
        </>
      )}
    </div>
  )
}

export interface BookmarksAppViewProps {
  store: BookmarkStoreLike
  i18n: I18nLike
  active: boolean
  aiTidy?: (bookmarks: BookmarkQuotable[]) => Promise<string>
  onSelectSession?: (sessionPath: string) => void
}

interface AppViewRow {
  id: string
  sessionPath: string
  entryId: string
  quote: string
  note?: string
  createdAt: string
}

/** Cross-session bookmark explorer: search, recent list, AI organization. */
export function BookmarksAppView({
  store,
  i18n,
  active,
  aiTidy,
  onSelectSession,
}: BookmarksAppViewProps) {
  const [query, setQuery] = useState('')
  const [rows, setRows] = useState<AppViewRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tidyState, setTidyState] = useState<'idle' | 'running'>('idle')
  const [tidyResult, setTidyResult] = useState<string | null>(null)

  const load = useCallback(
    async (searchQuery: string) => {
      setLoading(true)
      try {
        const trimmed = searchQuery.trim()
        const items: AppViewRow[] = trimmed
          ? (await store.search(trimmed)).map((item) => ({
              id: item.id,
              sessionPath: item.sessionPath,
              entryId: item.anchor.entryId,
              quote: item.quote,
              note: item.note,
              createdAt: item.createdAt,
            }))
          : (await store.listRecent()).map((item) => ({ ...item }))
        setRows(items)
        setError(null)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setLoading(false)
      }
    },
    [store],
  )

  useEffect(() => {
    if (!active) return
    void load(query)
    return store.subscribe(() => void load(query))
  }, [store, active, query, load])

  const onRunTidy = useCallback(async () => {
    if (!aiTidy || tidyState === 'running') return
    const corpus: BookmarkQuotable[] = rows.map((row) => ({
      id: row.id,
      sessionPath: row.sessionPath,
      entryId: row.entryId,
      quote: row.quote,
      note: row.note,
    }))
    if (corpus.length === 0) {
      setTidyResult(t(i18n, 'aiTidyEmpty', 'Bookmark some text first.'))
      return
    }
    setTidyState('running')
    setTidyResult(null)
    try {
      const result = (await aiTidy(corpus)).trim()
      setTidyResult(result || t(i18n, 'aiTidyEmptyResult', 'AI organize returned no content.'))
    } catch (cause) {
      setTidyResult(
        t(i18n, 'aiTidyFailed', 'AI organize failed: {{message}}', {
          message: cause instanceof Error ? cause.message : String(cause),
        }),
      )
    } finally {
      setTidyState('idle')
    }
  }, [aiTidy, rows, tidyState, i18n])

  const grouped = useMemo(() => {
    const groups = new Map<string, AppViewRow[]>()
    for (const row of rows) {
      const group = groups.get(row.sessionPath) ?? []
      group.push(row)
      groups.set(row.sessionPath, group)
    }
    return [...groups.entries()]
  }, [rows])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-3 border-b border-border/60 px-5 py-3.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-info/12 text-info">
          <Bookmark className="h-4.5 w-4.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-foreground">
            {t(i18n, 'appTitle', 'Bookmark Explorer')}
          </h2>
          <p className="truncate text-xs text-muted-foreground">
            {t(i18n, 'appDescription', 'Search and organize text bookmarks saved from session transcripts.')}
          </p>
        </div>
        {aiTidy && (
          <button
            type="button"
            className={`${sessionPluginPanelActionButtonClass} flex items-center gap-1.5 px-3 py-1.5 text-xs`}
            disabled={tidyState === 'running'}
            onClick={() => void onRunTidy()}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            {tidyState === 'running'
              ? t(i18n, 'aiTidyRunning', 'Organizing…')
              : t(i18n, 'aiTidy', 'AI organize')}
          </button>
        )}
      </header>

      <div className="border-b border-border/60 px-5 py-3">
        <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 py-2 focus-within:border-info/50">
          <Search className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
          <input
            className="min-w-0 flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
            placeholder={t(i18n, 'searchPlaceholder', 'Search bookmarks…')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className={sessionPluginPanelIconButtonClass}
              aria-label={t(i18n, 'cancel', 'Cancel')}
              onClick={() => setQuery('')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground/70">
          {query.trim()
            ? t(i18n, 'count', '{{count}} bookmarks', { count: rows.length })
            : t(i18n, 'recentTitle', 'Recent bookmarks')}
        </p>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {tidyResult && (
          <div className="mb-4 rounded-xl border border-info/30 bg-info/8 p-3.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-info">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {t(i18n, 'aiTidyResult', 'AI organization')}
            </div>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/85">
              {tidyResult}
            </p>
          </div>
        )}

        {loading ? (
          <SessionPluginPanelState>{t(i18n, 'recentTitle', 'Recent bookmarks')}</SessionPluginPanelState>
        ) : error ? (
          <SessionPluginPanelState tone="error">
            {t(i18n, 'loadFailed', 'Failed to load bookmarks: {{message}}', { message: error })}
          </SessionPluginPanelState>
        ) : grouped.length === 0 ? (
          <SessionPluginPanelState>
            <div className="flex flex-col items-center gap-1.5 py-10">
              <Search className="h-7 w-7 text-info/50" aria-hidden="true" />
              <div className="text-xs font-medium text-foreground/80">
                {query.trim()
                  ? t(i18n, 'searchEmpty', 'No matching bookmarks')
                  : t(i18n, 'emptyTitle', 'No bookmarks yet')}
              </div>
              {!query.trim() && (
                <div className="max-w-[260px] text-center text-[11px] leading-relaxed text-muted-foreground">
                  {t(i18n, 'emptyHint', 'Select text in the transcript to bookmark it.')}
                </div>
              )}
            </div>
          </SessionPluginPanelState>
        ) : (
          <div className="flex flex-col gap-4">
            {grouped.map(([sessionPath, groupRows]) => (
              <section key={sessionPath}>
                <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/80">
                  <span className="truncate" title={sessionPath}>
                    {sessionPath.split('/').slice(-2).join('/')}
                  </span>
                  <span className="rounded-full bg-secondary/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                    {groupRows.length}
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {groupRows.map((row) => (
                    <div key={row.id}>
                      <p className="border-l-2 border-amber-400/60 pl-2.5 text-xs italic leading-relaxed text-foreground/90">
                        {truncated(row.quote, 220)}
                      </p>
                      {row.note && (
                        <p className="mt-1 flex items-start gap-1.5 pl-2.5 text-[11px] leading-relaxed text-muted-foreground">
                          <NotebookPen className="mt-0.5 h-3 w-3 shrink-0 text-info/80" aria-hidden="true" />
                          <span className="min-w-0 break-words">{row.note}</span>
                        </p>
                      )}
                      {onSelectSession && (
                        <button
                          type="button"
                          className="mt-1 ml-2.5 flex items-center gap-1 text-[10px] text-muted-foreground/70 transition-colors hover:text-info"
                          onClick={() => onSelectSession(sessionPath)}
                        >
                          <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                          {t(i18n, 'openSession', 'Open session')}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export type { BookmarkModel, RegistryEntry }
