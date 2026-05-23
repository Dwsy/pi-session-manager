import type { PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

import { sessionSummaryI18n } from './i18n'
import { sessionSummaryConfiguration } from './settings'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.session-summary',
  name: 'AI Session Summary',
  version: '0.1.0',
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3',
  },
  permissions: ['sessions:read', 'records:read', 'records:write', 'model:invoke'],
  records: [
    {
      type: 'session.intelligence',
      scope: 'session',
      schemaVersion: 1,
      searchable: ['summary', 'topics', 'status', 'unresolved_tasks'],
      indexes: [
        { name: 'status', path: '$.status', type: 'text' },
        { name: 'generatedAt', path: '$.generated_at', type: 'datetime' },
      ],
    },
  ],
  i18n: sessionSummaryI18n,
  configuration: sessionSummaryConfiguration,
}
