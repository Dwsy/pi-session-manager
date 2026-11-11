import type { PsmPluginManifest } from '@dwsy/plugin-sdk'

import { bookmarksI18n } from './i18n'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.bookmarks',
  name: 'Bookmarks',
  version: '0.1.0',
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3',
  },
  permissions: ['sessions:read', 'records:read', 'records:write', 'agent:invoke'],
  records: [
    {
      type: 'bookmark.text-quote',
      scope: 'session',
      schemaVersion: 1,
      searchable: ['$.quote', '$.note'],
      indexes: [
        { name: 'entryId', path: '$.anchor.entryId', type: 'text' },
        { name: 'createdAt', path: '$.createdAt', type: 'datetime' },
      ],
    },
    {
      type: 'bookmark.registry',
      scope: 'global',
      schemaVersion: 1,
    },
  ],
  i18n: bookmarksI18n,
}
