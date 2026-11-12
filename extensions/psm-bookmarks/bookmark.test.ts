import { describe, expect, it, vi } from 'vitest'

import type { PluginRecord, PluginRecordUpsertParams } from '@dwsy/plugin-sdk'

import {
  BOOKMARK_RECORD_TYPE,
  BookmarkStore,
  REGISTRY_ID,
  REGISTRY_MAX_ENTRIES,
  REGISTRY_RECORD_TYPE,
  SEARCH_LIMIT,
  bookmarkFromRecord,
  bookmarkFromSelection,
  bookmarkToRecordParams,
  groupByProject,
  groupBySession,
  projectPathOf,
  registryRemove,
  registryUpsertTracked,
  sameAnchor,
  sortEntries,
  registryUpsert,
  type Bookmark,
  type BookmarkChange,
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

  it('reports how many entries the cap evicts', () => {
    let entries: RegistryEntry[] = []
    for (let index = 0; index < REGISTRY_MAX_ENTRIES; index += 1) {
      entries = registryUpsertTracked(entries, entry(`e${index}`)).entries
    }
    const result = registryUpsertTracked(entries, entry('new'))
    expect(result.evicted).toBe(1)
    expect(result.entries[0]!.id).toBe('new')
    expect(result.entries).toHaveLength(REGISTRY_MAX_ENTRIES)
  })
})

describe('sameAnchor', () => {
  const base = makeBookmark({ id: 'bm-1' })
  const elsewhere = makeBookmark({
    id: 'bm-2',
    anchor: {
      entryId: 'm1',
      textQuote: { exact: 'beta', prefix: 'BEFORE ', suffix: ' AFTER' },
    },
  })

  it('treats a fully identical quote as the same spot', () => {
    expect(sameAnchor(base, makeBookmark({ id: 'bm-9' }))).toBe(true)
  })

  it('distinguishes the same words at a different position via context', () => {
    expect(sameAnchor(base, elsewhere)).toBe(false)
  })

  it('distinguishes a different entry', () => {
    expect(
      sameAnchor(base, makeBookmark({ id: 'bm-3', anchor: { ...base.anchor, entryId: 'm2' } })),
    ).toBe(false)
  })

  it('normalizes absent context to an empty string', () => {
    const noContext = makeBookmark({
      id: 'bm-4',
      anchor: { entryId: 'm1', textQuote: { exact: 'beta' } },
    })
    expect(sameAnchor(noContext, noContext)).toBe(true)
    expect(sameAnchor(noContext, base)).toBe(false)
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

describe('BookmarkStore core-path regressions', () => {
  const at = (id: string, prefix: string, suffix: string) =>
    makeBookmark({
      id,
      anchor: {
        entryId: 'm1',
        textQuote: { exact: 'beta', prefix, suffix },
      },
    })

  it('keeps two bookmarks for the same words at different positions', async () => {
    const client = makeClient()
    const store = new BookmarkStore(client, 'builtin.bookmarks')
    const first = await store.save(at('bm-1', 'alpha ', ' gamma'))
    const second = await store.save(at('bm-2', 'BEFORE ', ' AFTER'))

    expect(second.id).toBe('bm-2')
    expect(first.id).not.toBe(second.id)
    const recent = await store.listRecent()
    expect(recent.map((item) => item.id).sort()).toEqual(['bm-1', 'bm-2'])
    // Both must be independently anchored for highlight restore.
    expect((await store.listForSession(selection.sessionPath))).toHaveLength(2)
  })

  it('is still idempotent for the exact same selection (double-click guard)', async () => {
    const client = makeClient()
    const store = new BookmarkStore(client, 'builtin.bookmarks')
    const first = await store.save(at('bm-1', 'alpha ', ' gamma'))
    const second = await store.save(at('bm-2', 'alpha ', ' gamma'))
    expect(second.id).toBe(first.id)
    expect(await store.listRecent()).toHaveLength(1)
  })

  it('serializes overlapping saves so no bookmark is lost', async () => {
    const client = makeClient()
    // Add latency to listForScope so overlapping read-modify-write cycles
    // would interleave (and lose data) without the queue.
    const original = client.listForScope.bind(client)
    client.listForScope = async (params) => {
      await new Promise((resolve) => setTimeout(resolve, 5))
      return original(params)
    }
    const store = new BookmarkStore(client, 'builtin.bookmarks')
    const bookmarks = Array.from({ length: 6 }, (_, index) =>
      at(`bm-${index}`, `pre-${index} `, ` suf-${index}`),
    )
    const saved = await Promise.all(bookmarks.map((item) => store.save(item)))
    expect(new Set(saved.map((item) => item.id)).size).toBe(6)
    expect(await store.listRecent()).toHaveLength(6)
  })

  it('does not lose a save interleaved with a removal', async () => {
    const client = makeClient()
    const store = new BookmarkStore(client, 'builtin.bookmarks')
    const first = await store.save(at('bm-1', 'alpha ', ' gamma'))
    const secondBookmark = at('bm-2', 'BEFORE ', ' AFTER')
    await Promise.all([
      store.save(secondBookmark),
      store.remove(first),
    ])
    const recent = await store.listRecent()
    expect(recent.map((item) => item.id)).toEqual(['bm-2'])
  })

  it('a failed mutation does not poison the queue', async () => {
    const client = makeClient()
    const store = new BookmarkStore(client, 'builtin.bookmarks')
    await expect(store.updateNote('missing', selection.sessionPath, 'x')).rejects.toThrow(/not found/)
    const saved = await store.save(at('bm-1', 'alpha ', ' gamma'))
    expect(saved.id).toBe('bm-1')
    expect(await store.listRecent()).toHaveLength(1)
  })

  it('emits a typed change signal per mutation', async () => {
    const client = makeClient()
    const store = new BookmarkStore(client, 'builtin.bookmarks')
    const changes: BookmarkChange[] = []
    store.subscribe((change) => {
      if (change) changes.push(change)
    })
    const saved = await store.save(at('bm-1', 'alpha ', ' gamma'))
    await store.updateNote(saved.id, saved.sessionPath, 'a note')
    await store.remove(saved)
    expect(changes).toEqual([
      { type: 'save', id: 'bm-1', sessionPath: selection.sessionPath },
      { type: 'note', id: 'bm-1', sessionPath: selection.sessionPath },
      { type: 'remove', id: 'bm-1', sessionPath: selection.sessionPath },
    ])
  })

  it('still supports zero-argument listeners', async () => {
    const client = makeClient()
    const store = new BookmarkStore(client, 'builtin.bookmarks')
    let calls = 0
    store.subscribe(() => {
      calls += 1
    })
    await store.save(at('bm-1', 'alpha ', ' gamma'))
    expect(calls).toBe(1)
  })

  it('reports registry evictions and warns instead of hiding them', async () => {
    const warnings: string[] = []
    const client = makeClient()
    const store = new BookmarkStore(client, 'builtin.bookmarks', {
      onWarning: (message) => warnings.push(message),
    })
    // Seed the registry record directly at the cap, then save one more.
    const capped = Array.from({ length: REGISTRY_MAX_ENTRIES }, (_, index) => ({
      id: `old-${index}`,
      sessionPath: '/tmp/old.jsonl',
      entryId: 'm1',
      quote: 'old',
      createdAt: '2026-11-10T10:00:00.000Z',
    }))
    await client.upsert({
      id: REGISTRY_ID,
      pluginId: 'builtin.bookmarks',
      scopeType: 'global',
      scopeId: 'global',
      recordType: REGISTRY_RECORD_TYPE,
      schemaVersion: 1,
      payload: { entries: capped },
    })
    await store.save(at('bm-new', 'alpha ', ' gamma'))
    expect(warnings.some((message) => /full|dropped/i.test(message))).toBe(true)
    expect(store.getDiagnostics().registryEvicted).toBe(1)
    expect(store.getDiagnostics().registryAtCap).toBe(true)
  })

  it('raises the search ceiling and flags when results are cut', async () => {
    const warnings: string[] = []
    const client = makeClient()
    const store = new BookmarkStore(client, 'builtin.bookmarks', {
      onWarning: (message) => warnings.push(message),
    })
    for (let index = 0; index < SEARCH_LIMIT; index += 1) {
      client.records.set(`r-${index}`, {
        ...makeRecord(at(`bm-${index}`, `pre-${index} `, ` suf-${index}`)),
        id: `r-${index}`,
      })
    }
    const results = await store.search('beta')
    expect(results).toHaveLength(SEARCH_LIMIT)
    expect(store.getDiagnostics().searchAtCap).toBe(true)
    expect(warnings.some((message) => /limit/.test(message))).toBe(true)
  })
})
