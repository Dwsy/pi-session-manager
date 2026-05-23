import type { PsmPluginHostContext, PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'npm.example.basic',
  name: 'Example Basic Plugin',
  version: '0.1.0',
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3',
  },
  package: {
    name: '@example/psm-plugin-basic',
    export: './dist/index.js',
  },
}

export function activate(ctx: PsmPluginHostContext) {
  ctx.registerCommand('example.basic.ping', async () => ({ ok: true, pluginId: ctx.manifest.id }))
}
