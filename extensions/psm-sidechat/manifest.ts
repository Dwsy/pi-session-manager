import type { PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

import { sidechatI18n } from './i18n'
import { sidechatConfiguration } from './settings'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.sidechat',
  name: 'Session Sidechat',
  version: '0.1.0',
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3',
  },
  permissions: ['sessions:read', 'model:invoke', 'records:read', 'records:write'],
  records: [
    {
      type: 'sidechat.thread',
      scope: 'session',
      schemaVersion: 1,
      searchable: ['messages'],
    },
  ],
  i18n: sidechatI18n,
  configuration: sidechatConfiguration,
}
