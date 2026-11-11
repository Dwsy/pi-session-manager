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
export const REGISTRY_MAX_ENTRIES = 200

export interface BookmarkPayload {
  anchor: {
    entryId: string
    entryRole?: string
    textQuote: PsmTextQuoteSelector
  }
  quote: string
  note?: string
  colorHue?: number
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
  options: { id?: string; note?: string; colorHue?: number; now?: string } = {},
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
    createdAt: bookmark.createdAt,
  }
}

/** Insert-or-replace an entry, newest first, capped at REGISTRY_MAX_ENTRIES. */
export function registryUpsert(entries: RegistryEntry[], entry: RegistryEntry): RegistryEntry[] {
  const without = entries.filter((item) => item.id !== entry.id)
  return [entry, ...without].slice(0, REGISTRY_MAX_ENTRIES)
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

/** Records-backed bookmark store with change notifications for open views. */
export class BookmarkStore {
  private readonly listeners = new Set<() => void>()
  private pendingNoteId: string | null = null

  constructor(
    private readonly client: RecordsClientLike,
    private readonly pluginId: string,
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private notify(): void {
    for (const listener of [...this.listeners]) listener()
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
      limit: 500,
    })
    return records
      .map(bookmarkFromRecord)
      .filter((bookmark): bookmark is Bookmark => bookmark !== null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }

  async listRecent(): Promise<RegistryEntry[]> {
    const records = await this.client.search({
      query: REGISTRY_ID,
      recordType: REGISTRY_RECORD_TYPE,
      pluginId: this.pluginId,
      limit: 5,
    })
    const registryRecord = records.find((record) => record.id === REGISTRY_ID)
    return registryFromRecord(registryRecord)
  }

  async search(query: string): Promise<Bookmark[]> {
    const records = await this.client.search({
      query,
      recordType: BOOKMARK_RECORD_TYPE,
      pluginId: this.pluginId,
      limit: 100,
    })
    return records
      .map(bookmarkFromRecord)
      .filter((bookmark): bookmark is Bookmark => bookmark !== null)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  /**
   * Save a bookmark. Identical quote in the same entry is treated as a repeat
   * selection and returns the existing bookmark untouched.
   */
  async save(bookmark: Bookmark, options: { withNote?: boolean } = {}): Promise<Bookmark> {
    const existing = (await this.listForSession(bookmark.sessionPath)).find(
      (item) =>
        item.anchor.entryId === bookmark.anchor.entryId &&
        item.anchor.textQuote.exact === bookmark.anchor.textQuote.exact,
    )
    const saved = existing ?? bookmark
    await this.client.upsert(bookmarkToRecordParams(saved, this.pluginId))
    await this.syncRegistry((entries) => registryUpsert(entries, registryEntryFromBookmark(saved)))
    if (options.withNote) this.pendingNoteId = saved.id
    this.notify()
    return saved
  }

  async updateNote(id: string, sessionPath: string, note: string): Promise<void> {
    const bookmark = (await this.listForSession(sessionPath)).find((item) => item.id === id)
    if (!bookmark) throw new Error(`bookmark not found: ${id}`)
    const updated: Bookmark = { ...bookmark, note: note.trim() || undefined, updatedAt: new Date().toISOString() }
    await this.client.upsert(bookmarkToRecordParams(updated, this.pluginId))
    await this.syncRegistry((entries) => registryUpsert(entries, registryEntryFromBookmark(updated)))
    this.notify()
  }

  async remove(bookmark: Bookmark): Promise<void> {
    await this.client.upsert({
      ...bookmarkToRecordParams(bookmark, this.pluginId),
      // The records client has no delete; tombstoning keeps removal inside
      // records:write while every read path drops the record.
      searchableText: '',
      payload: { deleted: true, deletedAt: new Date().toISOString() },
    })
    await this.syncRegistry((entries) => registryRemove(entries, bookmark.id))
    this.notify()
  }

  private async syncRegistry(
    transform: (entries: RegistryEntry[]) => RegistryEntry[],
  ): Promise<void> {
    const entries = transform(await this.listRecent())
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
