import type { PsmPluginHostContext, PsmPluginManifest } from '../../src/plugins/runtime-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.session-summary',
  name: 'AI Session Summary',
  version: '0.1.0',
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3',
  },
  permissions: ['sessions:read', 'records:read', 'records:write', 'model:invoke'],
  records: [
    {
      type: 'session.intelligence',
      scope: 'session',
      schemaVersion: 1,
      searchable: ['summary', 'topics', 'status', 'unresolved_tasks'],
      indexes: [
        { name: 'status', path: '$.status', type: 'text' },
        { name: 'generatedAt', path: '$.generated_at', type: 'datetime' },
      ],
    },
  ],
}

function readStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

export default function sessionSummaryPlugin(ctx: PsmPluginHostContext) {
  async function refresh(args: Record<string, unknown>) {
    const path = readStringArg(args, 'path') ?? readStringArg(args, 'sessionPath')
    if (!path) {
      throw new Error('path is required')
    }

    return ctx.psm.records.refreshSessionIntelligence({
      path,
      provider: readStringArg(args, 'provider'),
      model: readStringArg(args, 'model'),
    })
  }

  ctx.registerCommand('session-summary.refresh', refresh)
  ctx.registerTool('session_summary_refresh', {
    description: 'Generate an AI summary for a PSM session and persist it as a session.intelligence plugin record.',
    run: refresh,
  })
}
