/**
 * Appearance settings component
 */

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import SettingsField from '@/components/settings/SettingsField'
import SettingsInput from '@/components/settings/SettingsInput'
import SettingsOptionGroup from '@/components/settings/SettingsOptionGroup'
import SettingsSelect from '@/components/settings/SettingsSelect'
import { listUserPiThemes } from '@/utils/piTheme'
import type { AppearanceSettingsProps } from '@/components/settings/types'

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
      <SettingsField label={t('settings.appearance.theme', 'Theme')} searchKey="appearance-theme">
        <SettingsOptionGroup
          options={['dark', 'light', 'system', 'custom'] as const}
          value={settings.appearance.theme}
          onChange={handleThemeSelect}
          renderLabel={(theme) =>
            t(
              `settings.appearance.themes.${theme}`,
              theme === 'dark' ? 'Dark' : theme === 'light' ? 'Light' : theme === 'system' ? 'System' : 'Custom'
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
          searchKey="appearance-customTheme"
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

      <SettingsField label={t('settings.appearance.fontSize', 'Font size')} searchKey="appearance-fontSize">
        <SettingsOptionGroup
          options={['small', 'medium', 'large'] as const}
          value={settings.appearance.fontSize}
          onChange={(size) => onUpdate('appearance', 'fontSize', size)}
          renderLabel={(size) =>
            t(`settings.appearance.fontSizes.${size}`, size === 'small' ? 'Small' : size === 'medium' ? 'Medium' : 'Large')
          }
          containerClassName="flex flex-wrap gap-2"
          optionClassName="flex-1 min-w-[80px] py-2"
        />
      </SettingsField>

      <SettingsField label={t('settings.appearance.fontFamily', 'Font Family')} searchKey="appearance-fontFamily">
        <SettingsInput
          type="text"
          value={settings.appearance.fontFamily}
          onChange={(e) => onUpdate('appearance', 'fontFamily', e.target.value)}
          placeholder='-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        />
      </SettingsField>

      <SettingsField label={t('settings.appearance.fontFamilyMono', 'Monospace Font Family')} searchKey="appearance-fontFamilyMono">
        <SettingsInput
          type="text"
          value={settings.appearance.fontFamilyMono}
          onChange={(e) => onUpdate('appearance', 'fontFamilyMono', e.target.value)}
          placeholder='ui-monospace, "Cascadia Code", monospace'
        />
      </SettingsField>

      <SettingsField label={t('settings.appearance.codeBlockTheme', 'Code block theme')} searchKey="appearance-codeBlockTheme">
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

      <SettingsField label={t('settings.appearance.messageSpacing', 'Message spacing')} searchKey="appearance-messageSpacing">
        <SettingsOptionGroup
          options={['compact', 'comfortable', 'spacious'] as const}
          value={settings.appearance.messageSpacing}
          onChange={(spacing) => onUpdate('appearance', 'messageSpacing', spacing)}
          renderLabel={(spacing) => t(`settings.appearance.spacing.${spacing}`)}
          containerClassName="flex flex-wrap gap-2"
          optionClassName="flex-1 min-w-[80px] py-2"
        />
      </SettingsField>

      <SettingsField
        label={t('settings.appearance.disableToolSuccessStyle', 'Disable tool success style')}
        description={t(
          'settings.appearance.disableToolSuccessStyleDesc',
          'Disable green background and border on successful tool execution for cleaner tool cards'
        )}
        searchKey="appearance-disableToolSuccessStyle"
      >
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={settings.appearance.disableToolSuccessStyle}
            onChange={(e) => onUpdate('appearance', 'disableToolSuccessStyle', e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary focus:ring-2"
          />
          <span className="text-sm text-muted-foreground">
            {t('settings.appearance.enabled', 'Enabled')}
          </span>
        </label>
      </SettingsField>

      {/* Sidebar Blur — temporarily hidden, effect quality not satisfactory */}
      {false && (
        <SettingsField
          label={t('settings.appearance.sidebarVibrancy', 'Sidebar Blur')}
          description={t(
            'settings.appearance.sidebarVibrancyDesc',
            'macOS only. Native translucent blur on sidebar.'
          )}
          searchKey="appearance-sidebarVibrancy"
        >
          <label className="relative inline-flex items-center">
            <input
              type="checkbox"
              checked={settings.appearance.sidebarVibrancy === 'on'}
              onChange={(e) => onUpdate('appearance', 'sidebarVibrancy', e.target.checked ? 'on' : 'off')}
              className="w-4 h-4 rounded border-gray-300 text-primary focus:ring-primary focus:ring-2"
            />
            <span className="text-sm text-muted-foreground ml-2">
              {t('settings.appearance.enabled', 'Enabled')}
            </span>
          </label>
        </SettingsField>
      )}
    </div>
  )
}
