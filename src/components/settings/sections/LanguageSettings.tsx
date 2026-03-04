/**
 * Language settings component
 */

import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import SettingsField from '../SettingsField'
import SettingsRadioCardGroup from '../SettingsRadioCardGroup'
import type { LanguageSettingsProps } from '../types'

export default function LanguageSettings({ settings, onUpdate }: LanguageSettingsProps) {
  const { t, i18n } = useTranslation()

  const languages = [
    { code: 'zh-CN', name: '简体中文', flag: '🇨🇳' },
    { code: 'en-US', name: 'English', flag: '🇺🇸' },
    { code: 'ja-JP', name: '日本語', flag: '🇯🇵' },
    { code: 'fr-FR', name: 'Français', flag: '🇫🇷' },
    { code: 'de-DE', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'es-ES', name: 'Español', flag: '🇪🇸' },
  ]

  const handleLanguageChange = (langCode: string) => {
    onUpdate('language', 'locale', langCode)
    i18n.changeLanguage(langCode)
  }
  const languageOptionsMap = new Map(languages.map((lang) => [lang.code, lang] as const))

  return (
    <div className="space-y-6">
      <SettingsField label={t('settings.language.select', '选择语言')}>
        <SettingsRadioCardGroup
          options={languages.map((lang) => lang.code)}
          value={settings.language.locale}
          onChange={handleLanguageChange}
          name="language"
          getLabel={(langCode) => languageOptionsMap.get(langCode)?.name ?? langCode}
          getPrefix={(langCode) => (
            <span className="text-xl">{languageOptionsMap.get(langCode)?.flag ?? '🌐'}</span>
          )}
          getSuffix={(_langCode, active) =>
            active ? <Check className="h-4 w-4 text-info ml-auto" /> : null
          }
        />
      </SettingsField>
    </div>
  )
}
