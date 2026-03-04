/**
 * Export settings component
 */

import { useTranslation } from 'react-i18next'
import SettingsField from '../SettingsField'
import SettingsOptionGroup from '../SettingsOptionGroup'
import SettingsToggleRow from '../SettingsToggleRow'
import type { ExportSettingsProps } from '../types'

export default function ExportSettings({ settings, onUpdate }: ExportSettingsProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <SettingsField label={t('settings.export.defaultFormat', '默认导出格式')}>
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
        title={t('settings.export.includeMetadata', '包含元数据')}
        description={t('settings.export.includeMetadataHelp', '导出时包含会话元数据')}
        checked={settings.export.includeMetadata}
        onChange={(checked) => onUpdate('export', 'includeMetadata', checked)}
      />

      <SettingsToggleRow
        title={t('settings.export.includeTimestamps', '包含时间戳')}
        description={t('settings.export.includeTimestampsHelp', '导出时包含消息时间戳')}
        checked={settings.export.includeTimestamps}
        onChange={(checked) => onUpdate('export', 'includeTimestamps', checked)}
      />
    </div>
  )
}
