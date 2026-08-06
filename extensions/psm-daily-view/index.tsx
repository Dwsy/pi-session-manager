import { createElement } from 'react'
import type {
  PsmAppViewRenderProps,
  PsmPluginHostContext,
} from '@pi-session-manager/plugin-sdk'
import DailyView from './DailyView'
import { manifest } from './manifest'

export { manifest }

export const DAILY_VIEW_ID = 'builtin.daily-view.view'

export default function activate(ctx: PsmPluginHostContext) {
  ctx.ui.registerAppView({
    id: DAILY_VIEW_ID,
    title: ctx.i18n.t('plugins.dailyView.title', 'Daily View'),
    route: '/daily',
    icon: 'calendar-days',
    mainContent: 'replace',
    render: (props: PsmAppViewRenderProps) => createElement(DailyView, {
      ctx,
      active: props.active,
    }),
  })

  ctx.registerCommand({
    id: 'daily-view.open',
    title: ctx.i18n.t('plugins.dailyView.title', 'Daily View'),
    description: 'Open the daily user-message timeline',
    category: 'Analytics',
    icon: 'calendar-days',
    keywords: ['daily', 'timeline', 'prompt', 'message', 'activity'],
    scope: 'global',
    run: (_args, commandContext) => {
      commandContext?.navigate?.openAppView?.(DAILY_VIEW_ID)
      return { ok: true }
    },
  })
}
