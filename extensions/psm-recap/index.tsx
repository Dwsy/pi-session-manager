import type { PsmPluginHostContext } from '@pi-session-manager/plugin-sdk'
import { requestDashboardRecap } from '@/components/dashboard/dashboardRecap'
import type { RecapPeriodKind } from '@/components/dashboard/recap/recapTypes'
import { manifest } from './manifest'

export { manifest }

interface RecapCommand {
  kind: RecapPeriodKind
  titleKey: string
  titleFallback: string
}

const RECAP_COMMANDS: RecapCommand[] = [
  { kind: 'week', titleKey: 'plugins.recap.week', titleFallback: 'Recap: this week' },
  { kind: 'month', titleKey: 'plugins.recap.month', titleFallback: 'Recap: this month' },
  { kind: 'quarter', titleKey: 'plugins.recap.quarter', titleFallback: 'Recap: this quarter' },
  {
    kind: 'midyear',
    titleKey: 'plugins.recap.midyear',
    titleFallback: 'Recap: first half of the year',
  },
  { kind: 'year', titleKey: 'plugins.recap.year', titleFallback: 'Recap: this year' },
]

/** Searchable in both languages, since command titles do not re-translate live. */
const KEYWORDS = ['recap', 'wrapped', 'review', 'summary', 'story', '回顾', '总结', '汇总']

export default function activate(ctx: PsmPluginHostContext) {
  for (const { kind, titleKey, titleFallback } of RECAP_COMMANDS) {
    ctx.registerCommand({
      id: `recap.open.${kind}`,
      title: ctx.i18n.t(titleKey, titleFallback),
      description: ctx.i18n.t(
        'plugins.recap.description',
        'Open the story-style look back at this period',
      ),
      category: 'Analytics',
      icon: 'calendar-days',
      keywords: [...KEYWORDS, kind],
      scope: 'global',
      run: () => {
        requestDashboardRecap(kind)
        return { ok: true }
      },
    })
  }
}
