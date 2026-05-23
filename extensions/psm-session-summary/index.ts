import { createElement } from 'react'
import type { PsmPluginHostContext } from '@pi-session-manager/plugin-sdk'

import { manifest } from './manifest'
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
      throw new Error('path is required')
    }

    const language = readStringArg(args, 'language') ?? ctx.settings.get('language', 'auto')
    const provider = readStringArg(args, 'provider') ?? readStringArg(ctx.settings.all(), 'provider')
    const model = readStringArg(args, 'model') ?? readStringArg(ctx.settings.all(), 'model')
    return ctx.psm.records.refreshSessionIntelligence({
      path,
      provider,
      model,
      language: language === 'auto' ? undefined : language,
    })
  }

  ctx.registerCommand('session-summary.refresh', refresh)
  ctx.registerTool('session_summary_refresh', {
    description: 'Generate an AI summary for a PSM session and persist it as a session.intelligence plugin record.',
    run: refresh,
  })
  ctx.ui.registerSessionToolbarItem({
    id: 'builtin.session-summary.toolbar',
    title: 'Session intelligence',
    render: (props) => createElement(SessionIntelligenceToolbarPanel, {
      client: ctx.psm,
      i18n: ctx.i18n,
      session: props.session,
      settings: {
        provider: ctx.settings.get('provider', ''),
        model: ctx.settings.get('model', ''),
        language: ctx.settings.get('language', 'auto'),
        autoOpenAfterRefresh: ctx.settings.get('autoOpenAfterRefresh', true),
        showMetadata: ctx.settings.get('showMetadata', true),
        showTopics: ctx.settings.get('showTopics', true),
        showNextSteps: ctx.settings.get('showNextSteps', true),
        showUnresolved: ctx.settings.get('showUnresolved', true),
      },
    }),
  })
}
