import { describe, expect, it } from 'vitest'

import { createPluginCapabilityClient } from '../client'
import type { PsmTransport } from '../types'

function makeClient() {
  const invocations: Array<{ command: string; payload: Record<string, unknown> | undefined }> = []
  const transport: PsmTransport = {
    async invoke<T>(command: string, payload?: Record<string, unknown>): Promise<T> {
      invocations.push({ command, payload })
      return undefined as T
    },
  }
  const client = createPluginCapabilityClient({ transport })
  return { client, invocations }
}

describe('records.upsert wire format', () => {
  it('serializes index values with the snake_case fields the backend deserializes', async () => {
    const { client, invocations } = makeClient()
    await client.records.upsert({
      id: 'bm-1',
      pluginId: 'builtin.bookmarks',
      scopeType: 'session',
      scopeId: '/tmp/session.jsonl',
      recordType: 'bookmark.text-quote',
      schemaVersion: 1,
      payload: { quote: 'beta' },
      searchableText: 'beta',
      indexValues: [
        {
          recordId: 'bm-1',
          pluginId: 'builtin.bookmarks',
          recordType: 'bookmark.text-quote',
          indexName: 'entryId',
          valueText: 'm1',
        },
        {
          // recordId falls back to the derived composite id.
          recordId: '',
          pluginId: 'builtin.bookmarks',
          recordType: 'bookmark.text-quote',
          indexName: 'createdAt',
          valueDatetime: '2026-11-11T10:00:00.000Z',
        },
      ],
    })

    const call = invocations.find((item) => item.command === 'upsert_plugin_record')
    expect(call).toBeDefined()
    const payload = call!.payload!
    expect(payload.record).toMatchObject({
      id: 'bm-1',
      plugin_id: 'builtin.bookmarks',
      scope_type: 'session',
      scope_id: '/tmp/session.jsonl',
      record_type: 'bookmark.text-quote',
      schema_version: 1,
      searchable_text: 'beta',
    })
    expect(payload.indexValues).toEqual([
      {
        record_id: 'bm-1',
        plugin_id: 'builtin.bookmarks',
        record_type: 'bookmark.text-quote',
        index_name: 'entryId',
        value_text: 'm1',
        value_number: null,
        value_datetime: null,
      },
      {
        record_id: 'bm-1',
        plugin_id: 'builtin.bookmarks',
        record_type: 'bookmark.text-quote',
        index_name: 'createdAt',
        value_text: null,
        value_number: null,
        value_datetime: '2026-11-11T10:00:00.000Z',
      },
    ])
  })

  it('omits index values entirely when none are declared', async () => {
    const { client, invocations } = makeClient()
    await client.records.upsert({
      pluginId: 'builtin.bookmarks',
      scopeType: 'global',
      scopeId: 'global',
      recordType: 'bookmark.registry',
      schemaVersion: 1,
      payload: { entries: [] },
    })
    const call = invocations.find((item) => item.command === 'upsert_plugin_record')
    expect(call?.payload?.indexValues).toBeUndefined()
  })
})
