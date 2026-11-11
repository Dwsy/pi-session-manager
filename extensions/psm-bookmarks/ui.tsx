import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Bookmark,
  Check,
  NotebookPen,
  Pencil,
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

export function t(i18n: I18nLike | PsmPluginI18nClient, key: string, fallback: string, values?: Record<string, unknown>) {
  return i18n.t(`plugins.bookmarks.${key}`, fallback, values)
}

export function formatTime(iso: string, language: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString(language, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function truncated(text: string, max = QUOTE_TRUNCATE_CHARS): string {
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text
}

interface NoteEditorProps {
  initial: string
  i18n: I18nLike
  autoFocus?: boolean
  onSave: (note: string) => void
  onCancel: () => void
}

export function NoteEditor({ initial, i18n, autoFocus = true, onSave, onCancel }: NoteEditorProps) {
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
  onEditNote: () => void
  onCancelEdit: () => void
  onSaveNote: (note: string) => void
  onDelete: () => void
  onConfirmDelete: () => void
  onJump?: () => void
}

function BookmarkCard({
  bookmark,
  i18n,
  language,
  editing,
  confirmingDelete,
  onEditNote,
  onCancelEdit,
  onSaveNote,
  onDelete,
  onConfirmDelete,
  onJump,
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

      <div className="mt-1.5 text-[10px] text-muted-foreground/70">
        {formatTime(bookmark.updatedAt, language)}
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
          <SessionPluginPanelState>{t(i18n, 'loading', 'Loading…')}</SessionPluginPanelState>
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
              {formatTime(bookmark.updatedAt, i18n.language ?? 'en-US')}
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

export type { BookmarkModel, RegistryEntry }
