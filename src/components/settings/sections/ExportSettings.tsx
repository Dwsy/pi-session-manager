/**
 * Export settings component
 */

import { useTranslation } from 'react-i18next'
import SettingsField from '@/components/settings/SettingsField'
import SettingsOptionGroup from '@/components/settings/SettingsOptionGroup'
import SettingsToggleRow from '@/components/settings/SettingsToggleRow'
import type { ExportSettingsProps } from '@/components/settings/types'

export default function ExportSettings({ settings, onUpdate }: ExportSettingsProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <SettingsField label={t('settings.export.defaultFormat', 'Default export format')} searchKey="export-defaultFormat">
        <SettingsOptionGroup
          options={['html', 'md', 'json'] as const}
          value={settings.export.defaultFormat}
          onChange={(format) => onUpdate('export', 'defaultFormat', format)}
          renderLabel={(format) => format.toUpperCase()}
          containerClassName="grid grid-cols-3 gap-2"
          optionClassName="py-2"
        />
      </SettingsField>

      <SettingsToggleRow
        title={t('settings.export.includeMetadata', 'Include metadata')}
        description={t('settings.export.includeMetadataHelp', 'Include session metadata when exporting')}
        checked={settings.export.includeMetadata}
        onChange={(checked) => onUpdate('export', 'includeMetadata', checked)}
        searchKey="export-includeMetadata"
      />

      <SettingsToggleRow
        title={t('settings.export.includeTimestamps', 'Include timestamps')}
        description={t('settings.export.includeTimestampsHelp', 'Include message timestamps when exporting')}
        checked={settings.export.includeTimestamps}
        onChange={(checked) => onUpdate('export', 'includeTimestamps', checked)}
        searchKey="export-includeTimestamps"
      />
    </div>
  )
}
