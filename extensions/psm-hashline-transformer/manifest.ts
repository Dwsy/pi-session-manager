import type { PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.hashline-transformer',
  name: 'Hashline Session Transformer',
  version: '1.0.0',
  defaultEnabled: false,
}
