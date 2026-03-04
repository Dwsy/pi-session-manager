/**
 * Search settings component
 */

import { useTranslation } from 'react-i18next'
import SettingsField from '../SettingsField'
import SettingsOptionGroup from '../SettingsOptionGroup'
import SettingsToggleRow from '../SettingsToggleRow'
import type { SearchSettingsProps } from '../types'

export default function SearchSettings({ settings, onUpdate }: SearchSettingsProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <SettingsField label={t('settings.search.defaultSearchMode', '默认搜索模式')}>
        <SettingsOptionGroup
          options={['content', 'name'] as const}
          value={settings.search.defaultSearchMode}
          onChange={(mode) => onUpdate('search', 'defaultSearchMode', mode)}
          renderLabel={(mode) => t(`settings.search.modes.${mode}`, mode === 'content' ? '内容' : '名称')}
          containerClassName="flex gap-2"
          optionClassName="flex-1 py-2"
        />
      </SettingsField>

      <SettingsToggleRow
        title={t('settings.search.caseSensitive', '区分大小写')}
        checked={settings.search.caseSensitive}
        onChange={(checked) => onUpdate('search', 'caseSensitive', checked)}
      />

      <SettingsToggleRow
        title={t('settings.search.includeToolCalls', '包含工具调用')}
        description={t('settings.search.includeToolCallsHelp', '在搜索结果中包含工具调用内容')}
        checked={settings.search.includeToolCalls}
        onChange={(checked) => onUpdate('search', 'includeToolCalls', checked)}
      />

      <SettingsToggleRow
        title={t('settings.search.highlightMatches', '高亮匹配')}
        description={t('settings.search.highlightMatchesHelp', '在搜索结果中高亮显示匹配文本')}
        checked={settings.search.highlightMatches}
        onChange={(checked) => onUpdate('search', 'highlightMatches', checked)}
      />
    </div>
  )
}
