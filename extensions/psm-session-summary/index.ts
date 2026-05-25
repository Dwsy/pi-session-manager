import { createElement } from 'react'
import type { PsmPluginHostContext } from '@pi-session-manager/plugin-sdk'

import { manifest } from './manifest'
import { refreshSessionSummaryWithAgent } from './agentSummary'
import SessionIntelligenceToolbarPanel from './SessionIntelligenceToolbarPanel'

export { manifest }

function readStringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key]
  return typeof value === 'string' && value.trim() ? value : undefined
}

export default function sessionSummaryPlugin(ctx: PsmPluginHostContext) {
  async function refresh(args: Record<string, unknown>) {
    const path = readStringArg(args, 'path') ?? readStringArg(args, 'sessionPath')
    if (!path) {
      ctx.log.error('session summary refresh rejected: missing path', { args })
      throw new Error('path is required')
    }

    const language = readStringArg(args, 'language') ?? ctx.settings.get('language', 'auto')
    const provider = readStringArg(args, 'provider') ?? readStringArg(ctx.settings.all(), 'provider')
    const model = readStringArg(args, 'model') ?? readStringArg(ctx.settings.all(), 'model')
    ctx.log.info('session summary refresh requested', { path, provider: provider ?? 'auto', model: model ?? 'auto', language })
    return refreshSessionSummaryWithAgent(ctx.psm, {
      path,
      provider,
      model,
      language: language === 'auto' ? undefined : language,
    })
  }

  ctx.registerCommand('session-summary.refresh', refresh)
  ctx.registerTool('session_summary_refresh', {
    description: 'Generate an AI summary for a PSM session and persist it as a session.intelligence plugin record.',
    run: async (args) => {
      ctx.log.debug('session summary tool invoked', { args })
      try {
        const record = await refresh(args)
        ctx.log.info('session summary tool completed', { recordId: (record as { id?: string }).id })
        return record
      } catch (error) {
        ctx.log.error('session summary tool failed', { error: error instanceof Error ? error.message : String(error) })
        throw error
      }
    },
  })
  const panelSettings = {
    provider: ctx.settings.get('provider', ''),
    model: ctx.settings.get('model', ''),
    language: ctx.settings.get('language', 'auto'),
    autoOpenAfterRefresh: ctx.settings.get('autoOpenAfterRefresh', true),
    showMetadata: ctx.settings.get('showMetadata', true),
    showTopics: ctx.settings.get('showTopics', true),
    showNextSteps: ctx.settings.get('showNextSteps', true),
    showUnresolved: ctx.settings.get('showUnresolved', true),
  }

  ctx.ui.registerSessionToolbarItem({
    id: 'builtin.session-summary.toolbar',
    title: 'Summary',
    panelId: 'builtin.session-summary.panel',
    render: (props) => createElement(
      'button',
      {
        type: 'button',
        onClick: props.togglePanel ?? (() => {}),
        className: `inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-xs transition-colors ${
          props.panelOpen
            ? 'border-primary/35 bg-primary/12 text-foreground hover:bg-primary/16'
            : 'border-border/70 bg-secondary text-muted-foreground hover:bg-secondary-hover hover:text-foreground'
        }`,
        title: ctx.i18n.t('session.intelligence.title', 'Session intelligence'),
        'aria-label': ctx.i18n.t('session.intelligence.title', 'Session intelligence'),
        'aria-expanded': Boolean(props.panelOpen),
      },
      createElement('span', { className: 'font-medium' }, ctx.i18n.t('session.intelligence.shortLabel', 'AI')),
    ),
  })

  ctx.ui.registerSessionPanel({
    id: 'builtin.session-summary.panel',
    title: 'Summary',
    side: 'right',
    render: (props) => createElement(SessionIntelligenceToolbarPanel, {
      client: ctx.psm,
      i18n: ctx.i18n,
      session: props.session,
      open: Boolean(props.panelOpen),
      onClose: props.closePanel ?? (() => {}),
      settings: panelSettings,
    }),
  })
}
