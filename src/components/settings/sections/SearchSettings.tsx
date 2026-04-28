/**
 * Search settings component
 */

import { useTranslation } from 'react-i18next'
import SettingsField from '@/components/settings/SettingsField'
import SettingsOptionGroup from '@/components/settings/SettingsOptionGroup'
import SettingsToggleRow from '@/components/settings/SettingsToggleRow'
import type { SearchSettingsProps } from '@/components/settings/types'

export default function SearchSettings({ settings, onUpdate }: SearchSettingsProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-6">
      <SettingsField label={t('settings.search.defaultSearchMode', 'Default search mode')} searchKey="search-defaultMode">
        <SettingsOptionGroup
          options={['content', 'name'] as const}
          value={settings.search.defaultSearchMode}
          onChange={(mode) => onUpdate('search', 'defaultSearchMode', mode)}
          renderLabel={(mode) => t(`settings.search.modes.${mode}`, mode === 'content' ? 'Content' : 'Name')}
          containerClassName="flex gap-2"
          optionClassName="flex-1 py-2"
        />
      </SettingsField>

      <SettingsToggleRow
        title={t('settings.search.caseSensitive', 'Case sensitive')}
        checked={settings.search.caseSensitive}
        onChange={(checked) => onUpdate('search', 'caseSensitive', checked)}
        searchKey="search-caseSensitive"
      />

      <SettingsToggleRow
        title={t('settings.search.includeToolCalls', 'Include tool calls')}
        description={t('settings.search.includeToolCallsHelp', 'Include tool call content in search results')}
        checked={settings.search.includeToolCalls}
        onChange={(checked) => onUpdate('search', 'includeToolCalls', checked)}
        searchKey="search-includeToolCalls"
      />

      <SettingsToggleRow
        title={t('settings.search.includeThinkingInSearch', 'Search thinking text')}
        description={t('settings.search.includeThinkingInSearchHelp', 'Include model thinking text in message search index, when off only index user input and model replies')}
        checked={settings.search.includeThinkingInSearch}
        onChange={(checked) => onUpdate('search', 'includeThinkingInSearch', checked)}
        searchKey="search-includeThinking"
      />

      <SettingsToggleRow
        title={t('settings.search.highlightMatches', 'Highlight matches')}
        description={t('settings.search.highlightMatchesHelp', 'Highlight matching text in search results')}
        checked={settings.search.highlightMatches}
        onChange={(checked) => onUpdate('search', 'highlightMatches', checked)}
        searchKey="search-highlightMatches"
      />
    </div>
  )
}
