import type { PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.daily-view',
  name: 'Daily View',
  version: '0.1.0',
  permissions: ['sessions:read'],
}

export default manifest
