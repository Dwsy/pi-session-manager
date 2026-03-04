import type { Dispatch, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import SettingsSelect from '../settings/SettingsSelect'
import SettingsToggleRow from '../settings/SettingsToggleRow'
import type { OpenPosition, ServerSettings } from './types'

interface OnboardingServiceSettingsProps {
  serverSettings: ServerSettings
  onServerSettingsChange: Dispatch<SetStateAction<ServerSettings>>
  terminalEnabled: boolean
  onTerminalEnabledChange: (enabled: boolean) => void
  openPosition: OpenPosition
  onOpenPositionChange: (position: OpenPosition) => void
}

interface OnboardingSelectRowProps {
  label: string
  value: string
  onChange: (value: string) => void
  options: Array<{ value: string; label: string }>
  description?: string
}

const TOGGLE_ROW_CLASS_NAME = 'py-2 px-3 bg-surface rounded-lg border border-border gap-0'
const TOGGLE_ROW_TITLE_CLASS_NAME = 'text-sm text-foreground'
const TOGGLE_ROW_SWITCH_CLASS_NAME = 'flex-shrink-0 ml-3'

export default function OnboardingServiceSettings({
  serverSettings,
  onServerSettingsChange,
  terminalEnabled,
  onTerminalEnabledChange,
  openPosition,
  onOpenPositionChange,
}: OnboardingServiceSettingsProps) {
  const { t } = useTranslation()

  const updateServerSettings = (patch: Partial<ServerSettings>) => {
    onServerSettingsChange((prev) => ({ ...prev, ...patch }))
  }

  return (
    <div className="mt-4 space-y-3 text-left max-w-xs mx-auto">
      <OnboardingSelectRow
        label={t('settings.advanced.bindAddr', '绑定地址')}
        value={serverSettings.bind_addr}
        onChange={(value) => updateServerSettings({ bind_addr: value })}
        options={[
          { value: '127.0.0.1', label: '127.0.0.1' },
          { value: '0.0.0.0', label: '0.0.0.0' },
        ]}
        description={serverSettings.bind_addr === '0.0.0.0'
          ? t('onboarding.steps.services.bindRemote', '允许局域网设备（手机/平板）连接')
          : t('onboarding.steps.services.bindLocal', '仅本机访问')}
      />

      <SettingsToggleRow
        title={t('onboarding.steps.services.websocket')}
        description={`ws://${serverSettings.bind_addr}:${serverSettings.ws_port}`}
        checked={serverSettings.ws_enabled}
        onChange={(enabled) => updateServerSettings({ ws_enabled: enabled })}
        className={TOGGLE_ROW_CLASS_NAME}
        titleClassName={TOGGLE_ROW_TITLE_CLASS_NAME}
        toggleSize="sm"
        toggleClassName={TOGGLE_ROW_SWITCH_CLASS_NAME}
      />

      <SettingsToggleRow
        title={t('onboarding.steps.services.httpApi')}
        description={`http://${serverSettings.bind_addr}:${serverSettings.http_port}/api`}
        checked={serverSettings.http_enabled}
        onChange={(enabled) => updateServerSettings({ http_enabled: enabled })}
        className={TOGGLE_ROW_CLASS_NAME}
        titleClassName={TOGGLE_ROW_TITLE_CLASS_NAME}
        toggleSize="sm"
        toggleClassName={TOGGLE_ROW_SWITCH_CLASS_NAME}
      />

      <SettingsToggleRow
        title={t('onboarding.steps.services.terminal', '内置终端')}
        description={t('onboarding.steps.services.terminalHint', '在应用内直接使用终端')}
        checked={terminalEnabled}
        onChange={onTerminalEnabledChange}
        className={TOGGLE_ROW_CLASS_NAME}
        titleClassName={TOGGLE_ROW_TITLE_CLASS_NAME}
        toggleSize="sm"
        toggleClassName={TOGGLE_ROW_SWITCH_CLASS_NAME}
      />

      <OnboardingSelectRow
        label={t('settings.session.openPosition', '任务定位打开位置')}
        value={openPosition}
        onChange={(value) => onOpenPositionChange(value === 'bottom' ? 'bottom' : 'top')}
        options={[
          { value: 'top', label: t('settings.session.openPositions.top', '顶部') },
          { value: 'bottom', label: t('settings.session.openPositions.bottom', '底部') },
        ]}
      />

      {serverSettings.bind_addr === '0.0.0.0' && (
        <p className="text-[11px] text-amber-400/80 px-1">
          {t('onboarding.steps.services.mobileHint', {
            port: serverSettings.http_port,
            defaultValue: '移动端通过浏览器访问 http://<电脑IP>:{{port}} 即可使用，自动切换 HTTP 模式',
          })}
        </p>
      )}
    </div>
  )
}

function OnboardingSelectRow({
  label,
  value,
  onChange,
  options,
  description,
}: OnboardingSelectRowProps) {
  return (
    <div className="space-y-1 py-2 px-3 bg-surface rounded-lg border border-border">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-foreground">{label}</span>
        <SettingsSelect
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-auto px-2 py-1 bg-background text-xs rounded"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SettingsSelect>
      </div>
      {description && <p className="text-[11px] text-muted-foreground">{description}</p>}
    </div>
  )
}
