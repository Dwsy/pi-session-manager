import type {
  PsmRecordScope,
  PsmSessionSelection,
  PsmTextQuoteSelector,
  PluginRecord,
  PluginRecordIndexValue,
  PluginRecordListParams,
  PluginRecordSearchParams,
  PluginRecordUpsertParams,
} from '@dwsy/plugin-sdk'

/**
 * Bookmark data layer: text-quote anchored bookmarks stored as plugin records
 * (one record per bookmark, scoped to its session) plus a small global registry
 * record powering the cross-session recent list.
 */

export const BOOKMARK_RECORD_TYPE = 'bookmark.text-quote'
export const REGISTRY_RECORD_TYPE = 'bookmark.registry'
export const BOOKMARK_SCHEMA_VERSION = 1
export const REGISTRY_ID = 'builtin.bookmarks.registry'
export const REGISTRY_MAX_ENTRIES = 2000
/** Record read ceilings. Hitting one is reported through diagnostics, never hidden. */
export const SESSION_LIST_LIMIT = 1000
export const SEARCH_LIMIT = 500

/** Describes a completed mutation so views can refresh only what changed. */
export interface BookmarkChange {
  type: 'save' | 'note' | 'remove'
  id: string
  sessionPath: string
}

/** Truncation state exposed to the UI and the host log. */
export interface BookmarkDiagnostics {
  /** Registry is at its cap; older entries have stopped appearing in the explorer. */
  registryAtCap: boolean
  /** Entries evicted from the registry by the most recent mutation. */
  registryEvicted: number
  sessionListAtCap: boolean
  searchAtCap: boolean
}

export interface BookmarkStoreOptions {
  /** Host logging hook; receives a message whenever a limit drops data. */
  onWarning?: (message: string) => void
}

export interface BookmarkPayload {
  anchor: {
    entryId: string
    entryRole?: string
    textQuote: PsmTextQuoteSelector
  }
  quote: string
  note?: string
  colorHue?: number
  sessionName?: string
  projectPath?: string
  createdAt: string
  updatedAt: string
}

export interface Bookmark extends BookmarkPayload {
  id: string
  sessionPath: string
}

export interface RegistryEntry {
  id: string
  sessionPath: string
  entryId: string
  quote: string
  note?: string
  sessionName?: string
  projectPath?: string
  createdAt: string
}

export interface RecordsClientLike {
  listForScope(params: PluginRecordListParams): Promise<PluginRecord[]>
  search(params: PluginRecordSearchParams): Promise<PluginRecord[]>
  upsert(params: PluginRecordUpsertParams): Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/**
 * Project a bookmark belongs to: the recorded project path when known,
 * otherwise the session file's directory.
 */
export function projectPathOf(entry: Pick<RegistryEntry, 'projectPath' | 'sessionPath'>): string {
  if (entry.projectPath) return entry.projectPath
  const cut = entry.sessionPath.lastIndexOf('/')
  return cut > 0 ? entry.sessionPath.slice(0, cut) : entry.sessionPath
}

export interface BookmarkGroup {
  key: string
  label: string
  sublabel?: string
  items: RegistryEntry[]
}

function sessionLabel(entry: RegistryEntry): string {
  if (entry.sessionName) return entry.sessionName
  const base = entry.sessionPath.split('/').pop() ?? entry.sessionPath
  return base.replace(/\.jsonl$/, '')
}

/** Group bookmarks by session file, newest sessions first. */
export function groupBySession(entries: RegistryEntry[]): BookmarkGroup[] {
  const groups = new Map<string, RegistryEntry[]>()
  for (const entry of entries) {
    const group = groups.get(entry.sessionPath) ?? []
    group.push(entry)
    groups.set(entry.sessionPath, group)
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    label: sessionLabel(items[0]!),
    sublabel: key,
    items: sortEntries(items, 'newest'),
  }))
}

/** Group bookmarks by project, then by session inside each project group. */
export function groupByProject(entries: RegistryEntry[]): BookmarkGroup[] {
  const groups = new Map<string, RegistryEntry[]>()
  for (const entry of entries) {
    const key = projectPathOf(entry)
    const group = groups.get(key) ?? []
    group.push(entry)
    groups.set(key, group)
  }
  return [...groups.entries()].map(([key, items]) => ({
    key,
    label: key.split('/').filter(Boolean).pop() ?? key,
    sublabel: key,
    items: sortEntries(items, 'newest'),
  }))
}

export type BookmarkSortOrder = 'newest' | 'oldest'

export function sortEntries(entries: RegistryEntry[], order: BookmarkSortOrder): RegistryEntry[] {
  const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  return order === 'newest' ? sorted.reverse() : sorted
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

export function newBookmarkId(): string {
  const cryptoApi = globalThis.crypto
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return `bm-${cryptoApi.randomUUID()}`
  return `bm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Build a bookmark from a live transcript selection. */
export function bookmarkFromSelection(
  selection: PsmSessionSelection,
  options: {
    id?: string
    note?: string
    colorHue?: number
    sessionName?: string
    projectPath?: string
    now?: string
  } = {},
): Bookmark {
  const quote = selection.textQuote.exact.trim()
  if (!quote) throw new Error('bookmark selection requires non-empty text')
  if (!selection.entryId) throw new Error('bookmark selection requires entryId')
  const timestamp = options.now ?? new Date().toISOString()
  return {
    id: options.id ?? newBookmarkId(),
    sessionPath: selection.sessionPath,
    anchor: {
      entryId: selection.entryId,
      entryRole: selection.entryRole,
      textQuote: { ...selection.textQuote },
    },
    quote,
    note: options.note,
    colorHue: options.colorHue,
    sessionName: options.sessionName,
    projectPath: options.projectPath,
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function bookmarkSearchText(bookmark: BookmarkPayload): string {
  return [bookmark.quote, bookmark.note].filter(Boolean).join('\n')
}

export function bookmarkToRecordParams(
  bookmark: Bookmark,
  pluginId: string,
): PluginRecordUpsertParams {
  const indexValues: PluginRecordIndexValue[] = [
    {
      recordId: bookmark.id,
      pluginId,
      recordType: BOOKMARK_RECORD_TYPE,
      indexName: 'entryId',
      valueText: bookmark.anchor.entryId,
    },
    {
      recordId: bookmark.id,
      pluginId,
      recordType: BOOKMARK_RECORD_TYPE,
      indexName: 'createdAt',
      valueDatetime: bookmark.createdAt,
    },
  ]
  return {
    id: bookmark.id,
    pluginId,
    scopeType: 'session',
    scopeId: bookmark.sessionPath,
    recordType: BOOKMARK_RECORD_TYPE,
    schemaVersion: BOOKMARK_SCHEMA_VERSION,
    payload: {
      anchor: bookmark.anchor,
      quote: bookmark.quote,
      note: bookmark.note,
      colorHue: bookmark.colorHue,
      sessionName: bookmark.sessionName,
      projectPath: bookmark.projectPath,
      createdAt: bookmark.createdAt,
      updatedAt: bookmark.updatedAt,
    },
    searchableText: bookmarkSearchText(bookmark),
    indexValues,
  }
}

/** Parse a stored record into a bookmark; null for foreign or legacy shapes. */
export function bookmarkFromRecord(record: PluginRecord): Bookmark | null {
  if (record.record_type !== BOOKMARK_RECORD_TYPE) return null
  const payload = record.payload
  if (!isRecord(payload)) return null
  // Tombstoned records stay in the store but leave every read path.
  if (payload.deleted === true) return null
  const anchor = payload.anchor
  if (!isRecord(anchor)) return null
  const textQuote = anchor.textQuote
  if (!isRecord(textQuote) || typeof textQuote.exact !== 'string') return null
  if (typeof anchor.entryId !== 'string' || !anchor.entryId) return null
  if (typeof payload.quote !== 'string') return null
  return {
    id: record.id,
    sessionPath: record.scope_id,
    anchor: {
      entryId: anchor.entryId,
      entryRole: optionalText(anchor.entryRole),
      textQuote: {
        exact: textQuote.exact,
        prefix: optionalText(textQuote.prefix),
        suffix: optionalText(textQuote.suffix),
      },
    },
    quote: payload.quote,
    note: optionalText(payload.note),
    colorHue: typeof payload.colorHue === 'number' ? payload.colorHue : undefined,
    sessionName: optionalText(payload.sessionName),
    projectPath: optionalText(payload.projectPath),
    createdAt: optionalText(payload.createdAt) ?? record.updated_at,
    updatedAt: optionalText(payload.updatedAt) ?? record.updated_at,
  }
}

export function registryEntryFromBookmark(bookmark: Bookmark): RegistryEntry {
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

export interface RegistryWriteResult {
  entries: RegistryEntry[]
  /** Number of older entries dropped because the registry hit its cap. */
  evicted: number
}

/** Insert-or-replace an entry, newest first, reporting cap evictions. */
export function registryUpsertTracked(
  entries: RegistryEntry[],
  entry: RegistryEntry,
): RegistryWriteResult {
  const without = entries.filter((item) => item.id !== entry.id)
  const merged = [entry, ...without]
  const capped = merged.slice(0, REGISTRY_MAX_ENTRIES)
  return { entries: capped, evicted: Math.max(0, merged.length - REGISTRY_MAX_ENTRIES) }
}

/** Insert-or-replace an entry, newest first, capped at REGISTRY_MAX_ENTRIES. */
export function registryUpsert(entries: RegistryEntry[], entry: RegistryEntry): RegistryEntry[] {
  return registryUpsertTracked(entries, entry).entries
}

/**
 * Two selections refer to the same spot only when the *whole* text quote
 * matches. `exact` alone is not enough: the same sentence can appear several
 * times in one message, and host anchoring relies on prefix/suffix to tell
 * them apart. Comparing only `exact` silently swallowed those bookmarks.
 */
export function sameAnchor(a: Pick<Bookmark, 'anchor'>, b: Pick<Bookmark, 'anchor'>): boolean {
  const qa = a.anchor.textQuote
  const qb = b.anchor.textQuote
  return (
    a.anchor.entryId === b.anchor.entryId &&
    qa.exact === qb.exact &&
    (qa.prefix ?? '') === (qb.prefix ?? '') &&
    (qa.suffix ?? '') === (qb.suffix ?? '')
  )
}

export function registryRemove(entries: RegistryEntry[], id: string): RegistryEntry[] {
  return entries.filter((item) => item.id !== id)
}

function registryFromRecord(record: PluginRecord | undefined): RegistryEntry[] {
  if (!record) return []
  const payload = record.payload
  if (!isRecord(payload) || !Array.isArray(payload.entries)) return []
  return payload.entries.filter(
    (item): item is RegistryEntry =>
      isRecord(item) &&
      typeof item.id === 'string' &&
      typeof item.sessionPath === 'string' &&
      typeof item.entryId === 'string' &&
      typeof item.quote === 'string',
  )
}

type BookmarkListener = (change?: BookmarkChange) => void

/**
 * Records-backed bookmark store with change notifications for open views.
 *
 * All read-modify-write mutations go through `this.queue` so rapid, overlapping
 * saves/notes/deletes cannot overwrite each other's registry snapshot.
 */
export class BookmarkStore {
  private readonly listeners = new Set<BookmarkListener>()
  private pendingNoteId: string | null = null
  private queue: Promise<unknown> = Promise.resolve()
  private diagnostics: BookmarkDiagnostics = {
    registryAtCap: false,
    registryEvicted: 0,
    sessionListAtCap: false,
    searchAtCap: false,
  }

  constructor(
    private readonly client: RecordsClientLike,
    private readonly pluginId: string,
    private readonly options: BookmarkStoreOptions = {},
  ) {}

  /** Subscribe to completed mutations. The change argument is optional for compatibility. */
  subscribe(listener: BookmarkListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(change: BookmarkChange): void {
    for (const listener of [...this.listeners]) listener(change)
  }

  /** Read current truncation state (for the explorer's visible notice). */
  getDiagnostics(): BookmarkDiagnostics {
    return { ...this.diagnostics }
  }

  private warn(message: string): void {
    this.options.onWarning?.(message)
  }

  /**
   * Serialize a mutation. Each task's read-modify-write completes before the
   * next one starts; failures never poison the queue for later tasks.
   */
  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task)
    this.queue = run.catch(() => undefined)
    return run
  }

  /** Bookmark whose note editor should auto-focus once rendered. */
  consumePendingNoteId(): string | null {
    const pending = this.pendingNoteId
    this.pendingNoteId = null
    return pending
  }

  async listForSession(sessionPath: string): Promise<Bookmark[]> {
    const records = await this.client.listForScope({
      scopeType: 'session',
      scopeId: sessionPath,
      recordType: BOOKMARK_RECORD_TYPE,
      pluginId: this.pluginId,
      limit: SESSION_LIST_LIMIT,
    })
    const atCap = records.length >= SESSION_LIST_LIMIT
    if (atCap && !this.diagnostics.sessionListAtCap) {
      this.warn(
        `Bookmark list for ${sessionPath} reached the ${SESSION_LIST_LIMIT}-record limit; older bookmarks may not be shown.`,
      )
    }
    this.diagnostics.sessionListAtCap = atCap
    return records
      .map(bookmarkFromRecord)
      .filter((bookmark): bookmark is Bookmark => bookmark !== null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async listRecent(): Promise<RegistryEntry[]> {
    // The registry record carries no searchable text, so it is read by scope
    // (records.search is FTS-backed and never matches empty rows).
    const records = await this.client.listForScope({
      scopeType: 'global',
      scopeId: 'global',
      recordType: REGISTRY_RECORD_TYPE,
      pluginId: this.pluginId,
      limit: 5,
    })
    const registryRecord = records.find((record) => record.id === REGISTRY_ID)
    const entries = registryFromRecord(registryRecord)
    this.diagnostics.registryAtCap = entries.length >= REGISTRY_MAX_ENTRIES
    return entries
  }

  async search(query: string): Promise<Bookmark[]> {
    const records = await this.client.search({
      query,
      recordType: BOOKMARK_RECORD_TYPE,
      pluginId: this.pluginId,
      limit: SEARCH_LIMIT,
    })
    const atCap = records.length >= SEARCH_LIMIT
    if (atCap && !this.diagnostics.searchAtCap) {
      this.warn(`Bookmark search reached the ${SEARCH_LIMIT}-result limit; refine the query to see more.`)
    }
    this.diagnostics.searchAtCap = atCap
    return records
      .map(bookmarkFromRecord)
      .filter((bookmark): bookmark is Bookmark => bookmark !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /**
   * Save a bookmark. Only a fully identical selection (same entry and whole
   * text quote, including context) is a repeat; the same words at a different
   * position are a distinct bookmark with its own highlight.
   */
  save(bookmark: Bookmark, options: { withNote?: boolean } = {}): Promise<Bookmark> {
    return this.enqueue(async () => {
      const existing = (await this.listForSession(bookmark.sessionPath)).find((item) =>
        sameAnchor(item, bookmark),
      )
      const saved = existing ?? bookmark
      await this.client.upsert(bookmarkToRecordParams(saved, this.pluginId))
      await this.syncRegistry((entries) => registryUpsertTracked(entries, registryEntryFromBookmark(saved)))
      if (options.withNote) this.pendingNoteId = saved.id
      this.notify({ type: 'save', id: saved.id, sessionPath: saved.sessionPath })
      return saved
    })
  }

  updateNote(id: string, sessionPath: string, note: string): Promise<void> {
    return this.enqueue(async () => {
      const bookmark = (await this.listForSession(sessionPath)).find((item) => item.id === id)
      if (!bookmark) throw new Error(`bookmark not found: ${id}`)
      const updated: Bookmark = { ...bookmark, note: note.trim() || undefined, updatedAt: new Date().toISOString() }
      await this.client.upsert(bookmarkToRecordParams(updated, this.pluginId))
      await this.syncRegistry((entries) => registryUpsertTracked(entries, registryEntryFromBookmark(updated)))
      this.notify({ type: 'note', id: updated.id, sessionPath: updated.sessionPath })
    })
  }

  remove(bookmark: Bookmark): Promise<void> {
    return this.enqueue(async () => {
      await this.client.upsert({
        ...bookmarkToRecordParams(bookmark, this.pluginId),
        // The records client has no delete; tombstoning keeps removal inside
        // records:write while every read path drops the record.
        searchableText: '',
        payload: { deleted: true, deletedAt: new Date().toISOString() },
      })
      await this.syncRegistry((entries) => ({ entries: registryRemove(entries, bookmark.id), evicted: 0 }))
      this.notify({ type: 'remove', id: bookmark.id, sessionPath: bookmark.sessionPath })
    })
  }

  private async syncRegistry(
    transform: (entries: RegistryEntry[]) => RegistryWriteResult,
  ): Promise<void> {
    const { entries, evicted } = transform(await this.listRecent())
    this.diagnostics.registryAtCap = entries.length >= REGISTRY_MAX_ENTRIES
    this.diagnostics.registryEvicted += evicted
    if (evicted > 0) {
      this.warn(
        `Bookmark explorer index is full (${REGISTRY_MAX_ENTRIES}); ${evicted} older bookmark(s) dropped from the list. Their records are still stored.`,
      )
    }
    await this.client.upsert({
      id: REGISTRY_ID,
      pluginId: this.pluginId,
      scopeType: 'global' as PsmRecordScope,
      scopeId: 'global',
      recordType: REGISTRY_RECORD_TYPE,
      schemaVersion: BOOKMARK_SCHEMA_VERSION,
      payload: { entries },
    })
  }
}
