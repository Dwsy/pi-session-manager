import type { PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

import { codeReviewConfiguration } from './settings'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.code-review',
  name: 'Code Review',
  version: '0.1.0',
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3',
  },
  permissions: ['sessions:read'],
  configuration: codeReviewConfiguration,
}
