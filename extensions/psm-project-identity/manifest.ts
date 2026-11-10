import type { PsmPluginManifest } from '@dwsy/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.project-identity',
  name: 'Project Identity',
  version: '0.1.0',
  permissions: ['openbot:read'],
}

export default manifest
