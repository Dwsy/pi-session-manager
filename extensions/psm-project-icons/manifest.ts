import type { PsmPluginManifest } from '@dwsy/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.project-icons',
  name: 'Project Icons',
  version: '0.1.0',
  defaultEnabled: false,
  permissions: ['projects:read'],
}

export default manifest
