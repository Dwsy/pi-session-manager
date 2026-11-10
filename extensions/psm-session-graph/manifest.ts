import type { PsmPluginManifest } from '@dwsy/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.session-graph',
  name: 'Branch Map',
  version: '0.2.0',
  defaultEnabled: false,
  permissions: [
    'sessions:read',
    'records:read',
    'records:write',
    'agent:invoke',
    'model:invoke',
  ],
  records: [
    {
      type: 'session.decision_graph',
      scope: 'session',
      schemaVersion: 1,
    },
  ],
}
