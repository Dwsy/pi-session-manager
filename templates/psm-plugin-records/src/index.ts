import type { PsmPluginHostContext, PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'npm.example.records',
  name: 'Example Records Plugin',
  version: '0.1.0',
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3',
  },
  package: {
    name: '@example/psm-plugin-records',
    export: './dist/index.js',
  },
  permissions: ['records:read', 'records:write'],
  records: [
    {
      type: 'example.note',
      scope: 'session',
      schemaVersion: 1,
      searchable: ['title', 'body'],
      indexes: [{ name: 'title', path: '$.title', type: 'text' }],
    },
  ],
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

export function activate(ctx: PsmPluginHostContext) {
  ctx.registerCommand('example.records.saveNote', async (args) => {
    const sessionPath = asString(args.sessionPath)
    const title = asString(args.title)
    const body = asString(args.body)
    if (!sessionPath || !title || !body) throw new Error('sessionPath, title, and body are required')

    await ctx.psm.records.upsert({
      pluginId: ctx.manifest.id,
      scopeType: 'session',
      scopeId: sessionPath,
      recordType: 'example.note',
      schemaVersion: 1,
      payload: { title, body },
      searchableText: `${title}\n${body}`,
    })
  })
}
