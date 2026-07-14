import type { PsmPluginI18nClient } from '@pi-session-manager/plugin-sdk'

interface AgentUsageViewProps {
  i18n: PsmPluginI18nClient
  active: boolean
}

export default function AgentUsageView({ i18n, active }: AgentUsageViewProps) {
  const { t } = i18n

  return (
    <div className="flex h-full min-h-0 items-center justify-center bg-background px-6">
      <div className="max-w-md rounded-lg border border-border/70 bg-surface/20 px-5 py-6 text-center">
        <div className="text-sm font-semibold text-foreground">
          {t('plugins.agentUsage.title', 'Agent Usage')}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          {active
            ? t(
              'plugins.agentUsage.mainHint',
              'Provider usage is listed in the left sidebar. Select a provider to inspect quota details.',
            )
            : t(
              'plugins.agentUsage.inactiveHint',
              'Open this view to load agent subscription usage in the left sidebar.',
            )}
        </p>
      </div>
    </div>
  )
}
