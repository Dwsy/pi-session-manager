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
  permissions: ['sessions:read', 'model:invoke', 'agent:invoke'],
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function buildPrompt(question: string, entries: unknown[]) {
  return [
    `Question: ${question}`,
    '',
    'Recent session entries:',
    JSON.stringify(entries.slice(-20), null, 2).slice(0, 12000),
  ].join('\n')
}

export function activate(ctx: PsmPluginHostContext) {
  ctx.registerCommand('example.sidechat.ask', async (args) => {
    const sessionPath = asString(args.sessionPath)
    const question = asString(args.question)
    if (!sessionPath || !question) throw new Error('sessionPath and question are required')

    const entries = await ctx.psm.sessions.readEntries(sessionPath, { limit: 20 })
    const session = await ctx.psm.agent.createSession({
      purpose: 'sidechat',
      systemPrompt: 'Answer questions about one PSM session. Use only the supplied session entries.',
      model: 'host-default',
      tools: [],
      storage: { scope: 'memory' },
    })

    try {
      const result = await ctx.psm.agent.run({
        sessionId: session.sessionId,
        prompt: buildPrompt(question, entries),
      })
      return {
        answer: result.text,
        provider: session.model?.provider,
        model: session.model?.id,
      }
    } finally {
      await ctx.psm.agent.dispose(session.sessionId).catch(() => undefined)
    }
  })
}
