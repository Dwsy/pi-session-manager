import { createElement } from 'react'
import type { PsmPluginHostContext } from '@pi-session-manager/plugin-sdk'

import { manifest } from './manifest'
import SessionSideChatPanel from './SessionSideChatPanel'
import SessionSideChatToolbarButton from './SessionSideChatToolbarButton'

export { manifest }

function optionalString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export default function activate(ctx: PsmPluginHostContext) {
  const defaultProvider = ctx.settings.get('provider', '')
  const defaultModel = ctx.settings.get('model', '')
  const defaultThinkingLevel = ctx.settings.get('thinkingLevel', 'medium')
  const defaultSnippetLimit = ctx.settings.get('snippetLimit', 8)
  const panelWidth = ctx.settings.get('panelWidth', 380)
  const optionsExpanded = ctx.settings.get('optionsExpanded', false)
  const showQuickPrompts = ctx.settings.get('showQuickPrompts', true)

  const ask = async (args: Record<string, unknown>) => {
    const sessionPath = optionalString(args.sessionPath ?? args.path)
    const question = optionalString(args.question)
    if (!sessionPath) throw new Error('sessionPath is required')
    if (!question) throw new Error('question is required')

    return ctx.psm.sidechat.ask({
      sessionPath,
      question,
      language: optionalString(args.language),
      provider: optionalString(args.provider) ?? optionalString(defaultProvider),
      model: optionalString(args.model) ?? optionalString(defaultModel),
      thinkingLevel: optionalString(args.thinkingLevel) ?? optionalString(defaultThinkingLevel),
      limit: optionalNumber(args.limit) ?? defaultSnippetLimit,
    })
  }

  ctx.registerCommand('sidechat.ask', ask)
  ctx.registerTool('sidechat_ask', {
    description: 'Ask a question about a PSM session with citations from the session content.',
    run: ask,
  })
  ctx.ui.registerSessionToolbarItem({
    id: 'builtin.sidechat.toolbar',
    title: 'Chat',
    panelId: 'builtin.sidechat.panel',
    render: (props) => createElement(SessionSideChatToolbarButton, {
      i18n: ctx.i18n,
      open: Boolean(props.panelOpen),
      onToggle: props.togglePanel ?? (() => {}),
    }),
  })
  ctx.ui.registerSessionPanel({
    id: 'builtin.sidechat.panel',
    title: 'Chat',
    side: 'right',
    render: (props) => createElement(SessionSideChatPanel, {
      client: ctx.psm,
      i18n: ctx.i18n,
      session: props.session,
      open: Boolean(props.panelOpen),
      settings: {
        provider: defaultProvider,
        model: defaultModel,
        thinkingLevel: defaultThinkingLevel,
        snippetLimit: defaultSnippetLimit,
        panelWidth,
        optionsExpanded,
        showQuickPrompts,
      },
      width: props.width ?? panelWidth,
      onWidthChange: props.onWidthChange,
      onClose: props.closePanel ?? (() => {}),
    }),
  })
}
