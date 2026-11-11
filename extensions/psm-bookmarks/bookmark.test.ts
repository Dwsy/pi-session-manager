import { describe, expect, it, vi } from 'vitest'

import type { PluginRecord, PluginRecordUpsertParams } from '@dwsy/plugin-sdk'

import {
  BOOKMARK_RECORD_TYPE,
  BookmarkStore,
  REGISTRY_ID,
  REGISTRY_MAX_ENTRIES,
  REGISTRY_RECORD_TYPE,
  bookmarkFromRecord,
  bookmarkFromSelection,
  bookmarkToRecordParams,
  groupByProject,
  groupBySession,
  projectPathOf,
  registryRemove,
  sortEntries,
  registryUpsert,
  type Bookmark,
  type RecordsClientLike,
  type RegistryEntry,
} from './bookmark'

const selection = {
  sessionPath: '/tmp/session.jsonl',
  sessionId: 'session-1',
  entryId: 'm1',
  entryRole: 'assistant',
  selectedText: 'beta',
  textQuote: { exact: 'beta', prefix: 'alpha ', suffix: ' gamma' },
}

function makeBookmark(overrides: Partial<Bookmark> = {}): Bookmark {
  return {
    ...bookmarkFromSelection(selection, { now: '2026-11-11T10:00:00.000Z' }),
    ...overrides,
  }
}

function makeRecord(bookmark: Bookmark): PluginRecord {
  return {
    id: bookmark.id,
    plugin_id: 'builtin.bookmarks',
    scope_type: 'session',
    scope_id: bookmark.sessionPath,
    record_type: BOOKMARK_RECORD_TYPE,
    schema_version: 1,
    payload_json: '',
    searchable_text: bookmark.quote,
    updated_at: bookmark.updatedAt,
    payload: {
      anchor: bookmark.anchor,
      quote: bookmark.quote,
      note: bookmark.note,
      colorHue: bookmark.colorHue,
      createdAt: bookmark.createdAt,
      updatedAt: bookmark.updatedAt,
    },
  }
}

describe('bookmarkFromSelection', () => {
  it('builds a bookmark with anchor, quote and timestamps', () => {
    const bookmark = bookmarkFromSelection(selection, {
      id: 'bm-1',
      now: '2026-11-11T10:00:00.000Z',
    })
    expect(bookmark).toEqual({
      id: 'bm-1',
      sessionPath: '/tmp/session.jsonl',
      anchor: {
        entryId: 'm1',
        entryRole: 'assistant',
        textQuote: { exact: 'beta', prefix: 'alpha ', suffix: ' gamma' },
      },
      quote: 'beta',
      note: undefined,
      colorHue: undefined,
      createdAt: '2026-11-11T10:00:00.000Z',
      updatedAt: '2026-11-11T10:00:00.000Z',
    })
  })

  it('rejects empty quotes and missing entry ids at the boundary', () => {
    expect(() =>
      bookmarkFromSelection({ ...selection, textQuote: { exact: '   ' } }),
    ).toThrow(/non-empty/)
    expect(() => bookmarkFromSelection({ ...selection, entryId: '' })).toThrow(/entryId/)
  })
})

describe('record mapping', () => {
  it('round-trips a bookmark through record params and payload', () => {
    const bookmark = makeBookmark({ id: 'bm-2', note: 'keep', colorHue: 42 })
    const params = bookmarkToRecordParams(bookmark, 'builtin.bookmarks')
    expect(params).toMatchObject({
      id: 'bm-2',
      pluginId: 'builtin.bookmarks',
      scopeType: 'session',
      scopeId: '/tmp/session.jsonl',
      recordType: BOOKMARK_RECORD_TYPE,
      schemaVersion: 1,
      searchableText: 'beta\nkeep',
    })
    expect(params.indexValues?.map((item) => item.indexName)).toEqual(['entryId', 'createdAt'])

    const record: PluginRecord = {
      ...makeRecord(bookmark),
      payload: params.payload,
    }
    expect(bookmarkFromRecord(record)).toEqual(bookmark)
  })

  it('drops tombstoned, foreign and legacy records', () => {
    const bookmark = makeBookmark({ id: 'bm-3' })
    const base = makeRecord(bookmark)

    expect(bookmarkFromRecord({ ...base, payload: { deleted: true } })).toBeNull()
    expect(bookmarkFromRecord({ ...base, record_type: 'other.type' })).toBeNull()
    expect(bookmarkFromRecord({ ...base, payload: { quote: 'beta' } })).toBeNull()
    expect(
      bookmarkFromRecord({
        ...base,
        payload: { anchor: { entryId: 'm1', textQuote: {} }, quote: 'beta' },
      }),
    ).toBeNull()
    expect(
      bookmarkFromRecord({
        ...base,
        payload: {
          anchor: { entryId: 'm1', textQuote: { exact: 'beta', prefix: null, suffix: undefined } },
          quote: 'beta',
          createdAt: null,
        },
      }),
    ).toMatchObject({ id: 'bm-3', anchor: { textQuote: { exact: 'beta' } }, quote: 'beta' })
  })
})

describe('registry helpers', () => {
  const entry = (id: string): RegistryEntry => ({
    id,
    sessionPath: `/tmp/${id}.jsonl`,
    entryId: 'm1',
    quote: id,
    createdAt: '2026-11-11T10:00:00.000Z',
  })

  it('keeps one entry per bookmark id, newest first', () => {
    let entries = registryUpsert([], entry('a'))
    entries = registryUpsert(entries, entry('b'))
    entries = registryUpsert(entries, { ...entry('a'), quote: 'updated' })
    expect(entries.map((item) => item.id)).toEqual(['a', 'b'])
    expect(entries[0]!.quote).toBe('updated')
  })

  it('caps the registry size', () => {
    let entries: RegistryEntry[] = []
    for (let index = 0; index < REGISTRY_MAX_ENTRIES + 10; index += 1) {
      entries = registryUpsert(entries, entry(`e${index}`))
    }
    expect(entries).toHaveLength(REGISTRY_MAX_ENTRIES)
    expect(entries[0]!.id).toBe(`e${REGISTRY_MAX_ENTRIES + 9}`)
  })

  it('removes by id', () => {
    expect(registryRemove([entry('a'), entry('b')], 'a').map((item) => item.id)).toEqual(['b'])
  })
})

function makeClient(): RecordsClientLike & {
  records: Map<string, PluginRecord>
  upserts: PluginRecordUpsertParams[]
} {
  const records = new Map<string, PluginRecord>()
  const upserts: PluginRecordUpsertParams[] = []
  return {
    records,
    upserts,
    async listForScope(params) {
      return [...records.values()].filter(
        (record) =>
          record.scope_type === params.scopeType &&
          record.scope_id === params.scopeId &&
          (!params.recordType || record.record_type === params.recordType),
      )
    },
    async search(params) {
      return [...records.values()].filter(
        (record) => !params.recordType || record.record_type === params.recordType,
      )
    },
    async upsert(params) {
      upserts.push(params)
      records.set(params.id ?? 'auto', {
        id: params.id ?? 'auto',
        plugin_id: params.pluginId,
        scope_type: params.scopeType,
        scope_id: params.scopeId,
        record_type: params.recordType,
        schema_version: params.schemaVersion,
        payload_json: JSON.stringify(params.payload ?? null),
        payload: params.payload,
        searchable_text: params.searchableText ?? null,
        updated_at: '2026-11-11T10:00:01.000Z',
      })
    },
  }
}

describe('grouping helpers', () => {
  const rows = [
    {
      id: 'a',
      sessionPath: '/demo/ai/s1.jsonl',
      entryId: 'm1',
      quote: 'one',
      sessionName: 'Session One',
      projectPath: '/demo/ai',
      createdAt: '2026-11-11T10:00:00.000Z',
    },
    {
      id: 'b',
      sessionPath: '/demo/ai/s1.jsonl',
      entryId: 'm2',
      quote: 'two',
      sessionName: 'Session One',
      projectPath: '/demo/ai',
      createdAt: '2026-11-11T11:00:00.000Z',
    },
    {
      id: 'c',
      sessionPath: '/demo/infra/s2.jsonl',
      entryId: 'm1',
      quote: 'three',
      createdAt: '2026-11-11T09:00:00.000Z',
    },
  ]

  it('groups by session with newest items first', () => {
    const groups = groupBySession(rows)
    expect(groups.map((group) => group.label)).toEqual(['Session One', 's2'])
    expect(groups[0]!.items.map((item) => item.id)).toEqual(['b', 'a'])
    expect(groups[0]!.sublabel).toBe('/demo/ai/s1.jsonl')
  })

  it('groups by project and derives the project from the session path', () => {
    const groups = groupByProject(rows)
    expect(groups.map((group) => group.key).sort()).toEqual(['/demo/ai', '/demo/infra'])
    const infra = groups.find((group) => group.key === '/demo/infra')!
    expect(infra.label).toBe('infra')
    expect(infra.items.map((item) => item.id)).toEqual(['c'])
  })

  it('sorts entries in both directions', () => {
    expect(sortEntries(rows, 'newest').map((item) => item.id)).toEqual(['b', 'a', 'c'])
    expect(sortEntries(rows, 'oldest').map((item) => item.id)).toEqual(['c', 'a', 'b'])
    expect(projectPathOf({ sessionPath: '/x/y/z.jsonl' })).toBe('/x/y')
  })
})

describe('BookmarkStore', () => {
  it('saves once for a repeated selection of the same quote', async () => {
    const client = makeClient()
    const store = new BookmarkStore(client, 'builtin.bookmarks')
    const first = await store.save(makeBookmark({ id: 'bm-1' }))
    const second = await store.save(makeBookmark({ id: 'bm-2' }))

    // Both calls hit upsert (save + registry sync); the second save must reuse
    // the first bookmark id instead of creating a duplicate.
    expect(second.id).toBe(first.id)
    const bookmarkUpserts = client.upserts.filter(
      (item) => item.recordType === BOOKMARK_RECORD_TYPE,
    )
    expect(bookmarkUpserts.map((item) => item.id)).toEqual(['bm-1', 'bm-1'])
    const registryUpserts = client.upserts.filter(
      (item) => item.recordType === REGISTRY_RECORD_TYPE,
    )
    expect(registryUpserts).toHaveLength(2)
    expect(registryUpserts[1]!.id).toBe(REGISTRY_ID)
  })

  it('notifies subscribers on save', async () => {
    const client = makeClient()
    const store = new BookmarkStore(client, 'builtin.bookmarks')
    let notifications = 0
    const unsubscribe = store.subscribe(() => {
      notifications += 1
    })
    await store.save(makeBookmark({ id: 'bm-1' }))
    unsubscribe()
    await store.save(makeBookmark({ id: 'bm-2', anchor: { entryId: 'm2', textQuote: { exact: 'gamma' } }, quote: 'gamma' }))
    expect(notifications).toBe(1)
  })

  it('reads the registry by scope instead of FTS search', async () => {
    const client = makeClient()
    const store = new BookmarkStore(client, 'builtin.bookmarks')
    await store.save(makeBookmark({ id: 'bm-1' }))
    const searchSpy = vi.spyOn(client, 'search')
    const recent = await store.listRecent()
    expect(searchSpy).not.toHaveBeenCalled()
    expect(recent.map((item) => item.id)).toEqual(['bm-1'])
  })
})
