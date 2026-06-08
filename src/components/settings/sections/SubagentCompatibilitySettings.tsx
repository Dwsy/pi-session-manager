import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bot } from 'lucide-react'

import SettingsCard from '@/components/settings/SettingsCard'
import SettingsSelect from '@/components/settings/SettingsSelect'
import SettingsToggleRow from '@/components/settings/SettingsToggleRow'
import type { AppSettings, ForcedSubagentProvider } from '@/components/settings/types'
import { usePiSettingsFull } from './pi-config/usePiSettingsFull'
import { detectConfiguredSubagentProviders } from '@/utils/subagentCompatibility'

interface SubagentCompatibilitySettingsProps {
  settings: AppSettings
  onUpdate: <K extends keyof AppSettings>(
    section: K,
    key: keyof AppSettings[K],
    value: AppSettings[K][keyof AppSettings[K]],
  ) => void
}

const FORCED_PROVIDER_OPTIONS: Array<Exclude<ForcedSubagentProvider, 'none'>> = [
  'nicobailon/pi-subagents',
  'HazAT/pi-interactive-subagents',
  '@tintinweb/pi-subagents',
]

export default function SubagentCompatibilitySettings({
  settings,
  onUpdate,
}: SubagentCompatibilitySettingsProps) {
  const { t } = useTranslation()
  const { settings: piSettings } = usePiSettingsFull(true)

  const providerSummary = useMemo(
    () => detectConfiguredSubagentProviders(piSettings),
    [piSettings],
  )

  const detectedText = useMemo(() => {
    const enabled = providerSummary.enabledProviders
    const disabled = providerSummary.disabledProviders
    if (enabled.length === 0 && disabled.length === 0) {
      return t(
        'settings.subagents.detected.none',
        'No known subagent extension was detected from Pi settings.',
      )
    }

    const parts: string[] = []
    if (enabled.length > 0) {
      parts.push(
        t('settings.subagents.detected.enabled', {
          defaultValue: 'Enabled: {{providers}}',
          providers: enabled.join(', '),
        }),
      )
    }
    if (disabled.length > 0) {
      parts.push(
        t('settings.subagents.detected.disabled', {
          defaultValue: 'Installed but disabled: {{providers}}',
          providers: disabled.join(', '),
        }),
      )
    }
    return parts.join(' · ')
  }, [providerSummary, t])

  return (
    <SettingsCard
      title={t('settings.subagents.title', 'Subagent Compatibility')}
      description={t(
        'settings.subagents.description',
        'Choose how PSM interprets different subagent extension payloads. Smart mode infers the protocol from JSON structure.',
      )}
      icon={<Bot className="h-4 w-4" />}
      searchKey="subagents-compatibility"
      contentClassName="p-4"
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <div className="text-sm font-medium text-foreground">
            {t('settings.subagents.modeLabel', 'Compatibility mode')}
          </div>
          <SettingsSelect
            value={settings.subagents.mode}
            onChange={(event) => {
              const nextMode = event.target.value === 'forced' ? 'forced' : 'smart'
              onUpdate('subagents', 'mode', nextMode)
              if (nextMode !== 'forced') {
                onUpdate('subagents', 'forcedProvider', undefined)
              } else if (!settings.subagents.forcedProvider) {
                onUpdate('subagents', 'forcedProvider', providerSummary.recommendedProvider)
              }
            }}
          >
            <option value="smart">
              {t('settings.subagents.modeSmart', 'Smart (Recommended)')}
            </option>
            <option value="forced">
              {t('settings.subagents.modeForced', 'Forced')}
            </option>
          </SettingsSelect>
          <p className="text-xs text-muted-foreground">
            {settings.subagents.mode === 'smart'
              ? t(
                  'settings.subagents.modeSmartHelp',
                  'Automatically infer the active subagent protocol from session JSON and tool/custom message structure.',
                )
              : t(
                  'settings.subagents.modeForcedHelp',
                  'Prefer one known protocol when rendering ambiguous subagent entries, then safely fall back.',
                )}
          </p>
        </div>

        {settings.subagents.mode === 'forced' && (
          <div className="space-y-1.5">
            <div className="text-sm font-medium text-foreground">
              {t('settings.subagents.providerLabel', 'Forced provider')}
            </div>
            <SettingsSelect
              value={settings.subagents.forcedProvider || providerSummary.recommendedProvider}
              onChange={(event) => {
                onUpdate('subagents', 'forcedProvider', event.target.value as ForcedSubagentProvider)
              }}
            >
              {FORCED_PROVIDER_OPTIONS.map((provider) => (
                <option key={provider} value={provider}>
                  {provider}
                </option>
              ))}
            </SettingsSelect>
          </div>
        )}

        <SettingsToggleRow
          title={t('settings.subagents.showProviderBadge', 'Show provider badge')}
          description={t(
            'settings.subagents.showProviderBadgeHelp',
            'Display the detected subagent extension on result cards when available.',
          )}
          checked={settings.subagents.showProviderBadge}
          onChange={(checked) => onUpdate('subagents', 'showProviderBadge', checked)}
          className="items-start py-1"
        />

        <SettingsToggleRow
          title={t('settings.subagents.enableAsyncProbe', 'Enable async status probing')}
          description={t(
            'settings.subagents.enableAsyncProbeHelp',
            'Allow renderer adapters to inspect session files or async status directories for richer progress details.',
          )}
          checked={settings.subagents.enableAsyncStatusProbe}
          onChange={(checked) => onUpdate('subagents', 'enableAsyncStatusProbe', checked)}
          className="items-start py-1"
        />

        <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs text-muted-foreground">
          <div className="font-medium text-foreground">
            {t('settings.subagents.detected.title', 'Detected from ~/.pi/agent/settings.json')}
          </div>
          <p className="mt-1">{detectedText}</p>
          <p className="mt-1">
            {t('settings.subagents.detected.recommended', {
              defaultValue: 'Recommended provider: {{provider}}',
              provider: providerSummary.recommendedProvider,
            })}
          </p>
        </div>
      </div>
    </SettingsCard>
  )
}
