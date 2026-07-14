import { createElement } from 'react'
import type {
  PsmAppSidebarViewRenderProps,
  PsmAppViewRenderProps,
  PsmPluginHostContext,
} from '@pi-session-manager/plugin-sdk'

import AgentUsageSidebar from './AgentUsageSidebar'
import AgentUsageView from './AgentUsageView'
import { manifest } from './manifest'

export { manifest }

const VIEW_ID = 'builtin.agent-usage.view'
const SIDEBAR_ID = 'builtin.agent-usage.sidebar'

export default function activate(ctx: PsmPluginHostContext) {
  const includeUnavailable = Boolean(ctx.settings.get('includeUnavailable', true))

  ctx.ui.registerAppView({
    id: VIEW_ID,
    title: ctx.i18n.t('plugins.agentUsage.title', 'Agent Usage'),
    route: '/agent-usage',
    icon: 'chart-column',
    mainContent: 'keep',
    render: (props: PsmAppViewRenderProps) => createElement(AgentUsageView, {
      i18n: ctx.i18n,
      active: Boolean(props.active),
    }),
  })

  ctx.ui.registerAppSidebarView({
    id: SIDEBAR_ID,
    title: ctx.i18n.t('plugins.agentUsage.sidebarTitle', 'Agent Usage List'),
    appViewId: VIEW_ID,
    route: '/agent-usage',
    render: (props: PsmAppSidebarViewRenderProps) => createElement(AgentUsageSidebar, {
      client: ctx.psm.agentUsage,
      config: ctx.psm.config,
      i18n: ctx.i18n,
      includeUnavailable,
      active: Boolean(props.active),
    }),
  })

  ctx.registerCommand({
    id: 'agent-usage.open',
    title: ctx.i18n.t('plugins.agentUsage.title', 'Agent Usage'),
    description: 'Open agent subscription usage status',
    category: 'Analytics',
    icon: 'chart-column',
    keywords: ['usage', 'quota', 'subscription', 'claude', 'codex', 'cursor', 'agent'],
    scope: 'global',
    run: (_args, commandContext) => {
      commandContext?.navigate?.openAppView?.(VIEW_ID)
      return { ok: true }
    },
  })
}
