import type { PsmPluginHostContext, PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'npm.example.sidechat',
  name: 'Example Sidechat Plugin',
  version: '0.1.0',
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3',
  },
  package: {
    name: '@example/psm-plugin-sidechat',
    export: './dist/index.js',
  },
  permissions: ['sessions:read', 'model:invoke'],
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

export function activate(ctx: PsmPluginHostContext) {
  ctx.registerCommand('example.sidechat.ask', async (args) => {
    const sessionPath = asString(args.sessionPath)
    const question = asString(args.question)
    if (!sessionPath || !question) throw new Error('sessionPath and question are required')
    return ctx.psm.sidechat.ask({ sessionPath, question })
  })
}
