import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownUp,
  Bookmark,
  ExternalLink,
  Folder,
  LayoutList,
  MessagesSquare,
  NotebookPen,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'

import {
  SessionPluginPanelState,
  sessionPluginPanelActionButtonClass,
  sessionPluginPanelIconButtonClass,
} from '../../src/components/session-viewer/SessionPluginPanel'
import {
  groupByProject,
  groupBySession,
  projectPathOf,
  sortEntries,
  type Bookmark as BookmarkModel,
  type BookmarkGroup,
  type RegistryEntry,
} from './bookmark'
import { explorerState, type BookmarkGrouping } from './explorerState'
import {
  InlineNotice,
  NoteEditor,
  formatTime,
  t,
  truncated,
  type BookmarkQuotable,
  type BookmarkStoreLike,
  type I18nLike,
} from './ui'

function rowFromBookmark(bookmark: BookmarkModel): RegistryEntry {
  return {
    id: bookmark.id,
    sessionPath: bookmark.sessionPath,
    entryId: bookmark.anchor.entryId,
    quote: bookmark.quote,
    note: bookmark.note,
    sessionName: bookmark.sessionName,
    projectPath: bookmark.projectPath,
    createdAt: bookmark.createdAt,
  }
}

function sessionLabelOf(entry: RegistryEntry): string {
  return entry.sessionName || entry.sessionPath.split('/').pop() || entry.sessionPath
}

interface ExplorerRowProps {
  row: RegistryEntry
  i18n: I18nLike
  showSession: boolean
  /** Returns false when the host could not open the session; row then shows a notice. */
  onSelectSession?: (sessionPath: string) => boolean | void
  onEditNote: (row: RegistryEntry, note: string) => Promise<void>
  onDelete: (row: RegistryEntry) => void
}

function ExplorerRow({ row, i18n, showSession, onSelectSession, onEditNote, onDelete }: ExplorerRowProps) {
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [editing, setEditing] = useState(false)
  const [jumpFailed, setJumpFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // A confirmation state must never linger with no way out.
  useEffect(() => {
    if (!confirmingDelete) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setConfirmingDelete(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [confirmingDelete])

  return (
    <div className="group rounded-xl border border-border/50 bg-secondary/25 px-3 py-2.5 transition-colors duration-150 hover:border-info/35 hover:bg-secondary/45">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 border-l-2 border-amber-400/60 pl-2.5 text-xs italic leading-relaxed text-foreground/90">
          {truncated(row.quote, 240)}
        </p>
        {confirmingDelete ? (
          <div className="flex shrink-0 items-center gap-1">
            <span className="whitespace-nowrap text-[10px] text-warning">
              {t(i18n, 'deleteConfirm', 'Delete this bookmark?')}
            </span>
            <button
              type="button"
              className={`${sessionPluginPanelActionButtonClass} px-1.5 py-0.5 text-[10px] text-destructive`}
              aria-label={t(i18n, 'delete', 'Delete')}
              onClick={() => {
                setConfirmingDelete(false)
                onDelete(row)
              }}
            >
              {t(i18n, 'delete', 'Delete')}
            </button>
            <button
              type="button"
              className={`${sessionPluginPanelActionButtonClass} px-1.5 py-0.5 text-[10px] text-muted-foreground`}
              aria-label={t(i18n, 'cancel', 'Cancel')}
              onClick={() => setConfirmingDelete(false)}
            >
              {t(i18n, 'cancel', 'Cancel')}
            </button>
          </div>
        ) : (
          <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground/60 transition-colors group-hover:text-muted-foreground focus-within:text-muted-foreground">
            <button
              type="button"
              className={sessionPluginPanelIconButtonClass}
              title={t(i18n, 'editNote', 'Edit note')}
              aria-label={t(i18n, 'editNote', 'Edit note')}
              onClick={() => setEditing((value) => !value)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              className={sessionPluginPanelIconButtonClass}
              title={t(i18n, 'delete', 'Delete')}
              aria-label={t(i18n, 'delete', 'Delete')}
              onClick={() => setConfirmingDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {(error || jumpFailed) && (
        <div className="mt-2">
          <InlineNotice
            i18n={i18n}
            message={error ?? t(i18n, 'openSessionFailed', 'This session is no longer available in the current list.')}
            onDismiss={() => {
              setError(null)
              setJumpFailed(false)
            }}
          />
        </div>
      )}

      {editing ? (
        <div className="mt-2">
          <NoteEditor
            initial={row.note ?? ''}
            i18n={i18n}
            onSave={async (note) => {
              setEditing(false)
              try {
                await onEditNote(row, note)
              } catch (cause) {
                setError(cause instanceof Error ? cause.message : String(cause))
              }
            }}
            onCancel={() => setEditing(false)}
          />
        </div>
      ) : row.note ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <NotebookPen className="mt-0.5 h-3 w-3 shrink-0 text-info/80" aria-hidden="true" />
          <span className="min-w-0 break-words">{row.note}</span>
        </p>
      ) : null}

      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground/70">
        <span>{formatTime(row.createdAt, i18n.language ?? 'en-US')}</span>
        {showSession && onSelectSession && (
          <button
            type="button"
            className="flex min-w-0 items-center gap-1 truncate transition-colors hover:text-info"
            title={`${t(i18n, 'openSession', 'Open session')}: ${row.sessionPath}`}
            aria-label={`${t(i18n, 'openSession', 'Open session')}: ${row.sessionPath}`}
            onClick={() => {
              setJumpFailed(onSelectSession(row.sessionPath) === false)
            }}
          >
            <ExternalLink className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{sessionLabelOf(row)}</span>
          </button>
        )}
      </div>
    </div>
  )
}

interface ExplorerGroupSectionProps extends Omit<ExplorerRowProps, 'row' | 'showSession'> {
  group: BookmarkGroup
  showSession: boolean
}

const SEARCH_DEBOUNCE_MS = 250

function ExplorerGroupSection({
  group,
  i18n,
  showSession,
  onSelectSession,
  onEditNote,
  onDelete,
}: ExplorerGroupSectionProps) {
  return (
    <section key={group.key}>
      <div className="mb-1.5 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-medium text-foreground/80" title={group.sublabel ?? group.label}>
            {group.label}
          </div>
          {group.sublabel && group.sublabel !== group.label && (
            <div className="truncate text-[10px] font-normal normal-case tracking-normal text-muted-foreground/60" title={group.sublabel}>
              {group.sublabel}
            </div>
          )}
        </div>
        <span className="mt-0.5 shrink-0 rounded-full bg-secondary/60 px-1.5 py-0.5 text-[9px] text-muted-foreground">
          {group.items.length}
        </span>
      </div>
      <div className="flex flex-col gap-2">
        {group.items.map((row) => (
          <ExplorerRow
            key={row.id}
            row={row}
            i18n={i18n}
            showSession={showSession}
            onSelectSession={onSelectSession}
            onEditNote={onEditNote}
            onDelete={onDelete}
          />
        ))}
      </div>
    </section>
  )
}

export interface BookmarksAppSidebarProps {
  store: BookmarkStoreLike
  i18n: I18nLike
}

/** Left sidebar for the bookmark explorer: bookmark counts per project. */
export function BookmarksAppSidebar({ store, i18n }: BookmarksAppSidebarProps) {
  const [entries, setEntries] = useState<RegistryEntry[]>([])
  const [, forceRender] = useState(0)

  const load = useCallback(async () => {
    setEntries(await store.listRecent())
  }, [store])

  useEffect(() => {
    void load()
    return store.subscribe(() => void load())
  }, [load, store])

  useEffect(() => explorerState.subscribe(() => forceRender((n) => n + 1)), [])

  const groups = useMemo(() => groupByProject(entries), [entries])
  const activeProject = explorerState.get().projectFilter

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <Bookmark className="h-3.5 w-3.5 text-info" aria-hidden="true" />
        <span className="text-xs font-semibold text-foreground">{t(i18n, 'sidebarTitle', 'Bookmarks')}</span>
        <span className="ml-auto rounded-full bg-secondary/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
          {entries.length}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        <button
          type="button"
          className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
            activeProject === null ? 'bg-info/12 text-info' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
          }`}
          onClick={() => explorerState.set({ projectFilter: null })}
        >
          <LayoutList className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">{t(i18n, 'allBookmarks', 'All bookmarks')}</span>
          <span className="text-[10px] text-muted-foreground/70">{entries.length}</span>
        </button>
        {groups.map((group) => (
          <button
            key={group.key}
            type="button"
            className={`mt-0.5 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors ${
              activeProject === group.key ? 'bg-info/12 text-info' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
            }`}
            title={group.sublabel}
            onClick={() => explorerState.set({ projectFilter: group.key })}
          >
            <Folder className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{group.label}</span>
            <span className="text-[10px] text-muted-foreground/70">{group.items.length}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export interface BookmarksAppViewProps {
  store: BookmarkStoreLike
  i18n: I18nLike
  active: boolean
  aiTidy?: (bookmarks: BookmarkQuotable[]) => Promise<string>
  /** Returns false when the target session could not be opened. */
  onSelectSession?: (sessionPath: string) => boolean | void
}

/** Cross-session bookmark explorer: full list, grouping, search, AI organization. */
export function BookmarksAppView({
  store,
  i18n,
  active,
  aiTidy,
  onSelectSession,
}: BookmarksAppViewProps) {
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [rows, setRows] = useState<RegistryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tidyState, setTidyState] = useState<'idle' | 'running'>('idle')
  const [tidyResult, setTidyResult] = useState<string | null>(null)
  const [truncatedNotice, setTruncatedNotice] = useState<string | null>(null)
  const [, forceRender] = useState(0)
  const queryRef = useRef(debouncedQuery)
  queryRef.current = debouncedQuery

  const viewState = explorerState.get()

  useEffect(() => explorerState.subscribe(() => forceRender((n) => n + 1)), [])

  // Typing must not fire an FTS query per keystroke, nor clear current results.
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const load = useCallback(
    async (searchQuery: string, options: { silent?: boolean } = {}) => {
      // A mutation-triggered refresh keeps the list visible instead of
      // blanking it with a loading flash on every note edit.
      if (!options.silent) setLoading(true)
      try {
        const trimmed = searchQuery.trim()
        const items: RegistryEntry[] = trimmed
          ? (await store.search(trimmed)).map(rowFromBookmark)
          : await store.listRecent()
        setRows(items)
        setError(null)
        const diagnostics = store.getDiagnostics?.()
        setTruncatedNotice(
          diagnostics?.registryAtCap
            ? t(i18n, 'registryLimit', 'Showing the most recent bookmarks only — the explorer index is full.')
            : diagnostics?.searchAtCap
              ? t(i18n, 'searchLimit', 'Search results are capped — refine the query to see more.')
              : null,
        )
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        setLoading(false)
      }
    },
    [store, i18n],
  )

  useEffect(() => {
    if (!active) return
    void load(debouncedQuery)
    return store.subscribe(() => void load(queryRef.current, { silent: true }))
  }, [store, active, debouncedQuery, load])

  const visibleRows = useMemo(() => {
    const filtered = viewState.projectFilter
      ? rows.filter((row) => projectPathOf(row) === viewState.projectFilter)
      : rows
    return sortEntries(filtered, viewState.sortOrder)
  }, [rows, viewState.projectFilter, viewState.sortOrder])

  const groups = useMemo(() => {
    if (viewState.grouping === 'session') return groupBySession(visibleRows)
    if (viewState.grouping === 'project') return groupByProject(visibleRows)
    return null
  }, [visibleRows, viewState.grouping])

  const onDelete = useCallback(
    async (row: RegistryEntry) => {
      try {
        const full = (await store.listForSession(row.sessionPath)).find((item) => item.id === row.id)
        if (full) await store.remove(full)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    },
    [store],
  )

  const onEditNote = useCallback(
    async (row: RegistryEntry, note: string) => {
      try {
        const full = (await store.listForSession(row.sessionPath)).find((item) => item.id === row.id)
        if (full) await store.updateNote(full.id, full.sessionPath, note)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause))
      }
    },
    [store],
  )

  const onRunTidy = useCallback(async () => {
    if (!aiTidy || tidyState === 'running') return
    const corpus: BookmarkQuotable[] = visibleRows.map((row) => ({
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
  }, [aiTidy, visibleRows, tidyState, i18n])

  const groupingTabs: Array<{ id: BookmarkGrouping; label: string; icon: typeof LayoutList }> = [
    { id: 'session', label: t(i18n, 'groupSession', 'By session'), icon: MessagesSquare },
    { id: 'project', label: t(i18n, 'groupProject', 'By project'), icon: Folder },
    { id: 'all', label: t(i18n, 'groupAll', 'All'), icon: LayoutList },
  ]

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

      <div className="flex flex-wrap items-center gap-2 border-b border-border/60 px-5 py-2.5">
        <div className="flex items-center rounded-lg border border-border/50 bg-secondary/25 p-0.5">
          {groupingTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] transition-colors ${
                viewState.grouping === tab.id
                  ? 'bg-info/15 text-info'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              aria-pressed={viewState.grouping === tab.id}
              onClick={() => explorerState.set({ grouping: tab.id })}
            >
              <tab.icon className="h-3 w-3" aria-hidden="true" />
              {tab.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-border/50 bg-secondary/25 px-2.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground focus-ring"
          aria-label={viewState.sortOrder === 'newest' ? t(i18n, 'sortNewest', 'Newest first') : t(i18n, 'sortOldest', 'Oldest first')}
          title={viewState.sortOrder === 'newest' ? t(i18n, 'sortNewest', 'Newest first') : t(i18n, 'sortOldest', 'Oldest first')}
          onClick={() =>
            explorerState.set({ sortOrder: viewState.sortOrder === 'newest' ? 'oldest' : 'newest' })
          }
        >
          <ArrowDownUp className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span>{viewState.sortOrder === 'newest'
            ? t(i18n, 'sortNewest', 'Newest first')
            : t(i18n, 'sortOldest', 'Oldest first')}</span>
        </button>

        {viewState.projectFilter && (
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full border border-info/40 bg-info/10 px-2.5 py-1 text-[11px] text-info transition-colors hover:bg-info/20"
            title={t(i18n, 'clearFilter', 'Clear project filter')}
            onClick={() => explorerState.set({ projectFilter: null })}
          >
            <Folder className="h-3 w-3" aria-hidden="true" />
            <span className="max-w-[160px] truncate">
              {viewState.projectFilter.split('/').filter(Boolean).pop()}
            </span>
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        )}

        <div className="ml-auto flex min-w-[220px] flex-1 items-center gap-2 rounded-xl border border-border/60 bg-secondary/30 px-3 py-1.5 focus-within:border-info/50">
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
      </div>

      <div className="flex items-center justify-between px-5 py-1.5 text-[10px] text-muted-foreground/70">
        <span>
          {query.trim()
            ? t(i18n, 'searchHint', 'Search across every session')
            : t(i18n, 'recentTitle', 'Recent bookmarks')}
        </span>
        <span>{t(i18n, 'count', '{{count}} bookmarks', { count: visibleRows.length })}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6 pt-2">
        {tidyResult && (
          <div className="mb-4 rounded-xl border border-info/30 bg-info/8 p-3.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-info">
              <Sparkles className="h-3 w-3" aria-hidden="true" />
              {t(i18n, 'aiTidyResult', 'AI organization')}
            </div>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground/85">{tidyResult}</p>
          </div>
        )}

        {/* Truncation and errors are strips; they never replace the list. */}
        {truncatedNotice && (
          <div className="mb-3">
            <InlineNotice
              i18n={i18n}
              message={truncatedNotice}
              onDismiss={() => setTruncatedNotice(null)}
            />
          </div>
        )}
        {error && (
          <div className="mb-3">
            <InlineNotice
              i18n={i18n}
              message={t(i18n, 'loadFailed', 'Failed: {{message}}', { message: error })}
              onDismiss={() => setError(null)}
            />
          </div>
        )}

        {loading && rows.length === 0 ? (
          <SessionPluginPanelState>{t(i18n, 'loading', 'Loading…')}</SessionPluginPanelState>
        ) : visibleRows.length === 0 && !error ? (
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
        ) : groups ? (
          <div className="flex flex-col gap-5">
            {groups.map((group) => (
              <ExplorerGroupSection
                key={group.key}
                group={group}
                i18n={i18n}
                showSession={viewState.grouping !== 'session'}
                onSelectSession={onSelectSession}
                onEditNote={onEditNote}
                onDelete={onDelete}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {visibleRows.map((row) => (
              <ExplorerRow
                key={row.id}
                row={row}
                i18n={i18n}
                showSession
                onSelectSession={onSelectSession}
                onEditNote={onEditNote}
                onDelete={onDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
