/**
 * 外观设置组件
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SettingsField from '../SettingsField'
import SettingsInput from '../SettingsInput'
import SettingsOptionGroup from '../SettingsOptionGroup'
import SettingsSelect from '../SettingsSelect'
import { listUserPiThemes } from '../../../utils/piTheme'
import type { AppearanceSettingsProps } from '../types'

export default function AppearanceSettings({ settings, onUpdate }: AppearanceSettingsProps) {
  const { t } = useTranslation()
  const [piThemes, setPiThemes] = useState<string[]>([])

  const handleThemeSelect = (theme: 'dark' | 'light' | 'system' | 'custom') => {
    onUpdate('appearance', 'theme', theme)

    if (theme === 'custom' && settings.appearance.customTheme === 'app-default' && piThemes.length > 0) {
      onUpdate('appearance', 'customTheme', piThemes[0])
    }
  }

  useEffect(() => {
    let active = true

    listUserPiThemes().then((themes) => {
      if (active) {
        setPiThemes(themes)
      }
    })

    return () => {
      active = false
    }
  }, [])

  return (
    <div className="space-y-6">
      <SettingsField label={t('settings.appearance.theme', '主题')}>
        <SettingsOptionGroup
          options={['dark', 'light', 'system', 'custom'] as const}
          value={settings.appearance.theme}
          onChange={handleThemeSelect}
          renderLabel={(theme) =>
            t(
              `settings.appearance.themes.${theme}`,
              theme === 'dark' ? '深色' : theme === 'light' ? '浅色' : theme === 'system' ? '跟随系统' : '自定义'
            )
          }
          containerClassName="grid grid-cols-1 sm:grid-cols-4 gap-3"
          optionClassName="p-3 min-h-[44px]"
        />
      </SettingsField>

      {settings.appearance.theme === 'custom' && (
        <SettingsField
          label={t('settings.appearance.customTheme', 'Custom Theme Preset')}
          description={t('settings.appearance.customThemeHelp', 'Uses theme files from ~/.pi/agent/themes')}
        >
          <SettingsSelect
            value={settings.appearance.customTheme}
            onChange={(e) => onUpdate('appearance', 'customTheme', e.target.value)}
          >
            <option value="app-default">{t('settings.appearance.appDefaultTheme', 'App default')}</option>
            {piThemes.length === 0 && (
              <option value="" disabled>{t('settings.appearance.noCustomThemes', 'No custom themes found')}</option>
            )}
            {piThemes.map((themeName) => (
              <option key={themeName} value={themeName}>
                {themeName}
              </option>
            ))}
          </SettingsSelect>
        </SettingsField>
      )}

      <SettingsField label={t('settings.appearance.fontSize', '字体大小')}>
        <SettingsOptionGroup
          options={['small', 'medium', 'large'] as const}
          value={settings.appearance.fontSize}
          onChange={(size) => onUpdate('appearance', 'fontSize', size)}
          renderLabel={(size) =>
            t(`settings.appearance.fontSizes.${size}`, size === 'small' ? '小' : size === 'medium' ? '中' : '大')
          }
          containerClassName="flex flex-wrap gap-2"
          optionClassName="flex-1 min-w-[80px] py-2"
        />
      </SettingsField>

      <SettingsField label={t('settings.appearance.fontFamily', 'Font Family')}>
        <SettingsInput
          type="text"
          value={settings.appearance.fontFamily}
          onChange={(e) => onUpdate('appearance', 'fontFamily', e.target.value)}
          placeholder='-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        />
      </SettingsField>

      <SettingsField label={t('settings.appearance.fontFamilyMono', 'Monospace Font Family')}>
        <SettingsInput
          type="text"
          value={settings.appearance.fontFamilyMono}
          onChange={(e) => onUpdate('appearance', 'fontFamilyMono', e.target.value)}
          placeholder='ui-monospace, "Cascadia Code", monospace'
        />
      </SettingsField>

      <SettingsField label={t('settings.appearance.codeBlockTheme', '代码块主题')}>
        <SettingsSelect
          value={settings.appearance.codeBlockTheme}
          onChange={(e) => onUpdate('appearance', 'codeBlockTheme', e.target.value)}
        >
          <option value="github">GitHub</option>
          <option value="monokai">Monokai</option>
          <option value="dracula">Dracula</option>
          <option value="one-dark">One Dark</option>
        </SettingsSelect>
      </SettingsField>

      <SettingsField label={t('settings.appearance.messageSpacing', '消息间距')}>
        <SettingsOptionGroup
          options={['compact', 'comfortable', 'spacious'] as const}
          value={settings.appearance.messageSpacing}
          onChange={(spacing) => onUpdate('appearance', 'messageSpacing', spacing)}
          renderLabel={(spacing) => t(`settings.appearance.spacing.${spacing}`)}
          containerClassName="flex flex-wrap gap-2"
          optionClassName="flex-1 min-w-[80px] py-2"
        />
      </SettingsField>
    </div>
  )
}
