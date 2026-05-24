import type { PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.session-graph',
  name: 'Session Graph',
  version: '0.1.0',
  permissions: ['sessions:read'],
}
