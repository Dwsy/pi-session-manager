import type { PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.session-graph',
  name: 'Branch Map',
  version: '0.2.0',
  permissions: ['sessions:read'],
}
