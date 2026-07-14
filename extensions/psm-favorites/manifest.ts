import type { PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.favorites',
  name: 'Favorites',
  version: '0.1.0',
  defaultEnabled: false,
  runtime: { sdk: '^0.1.0', host: '>=0.6.3' },
}
