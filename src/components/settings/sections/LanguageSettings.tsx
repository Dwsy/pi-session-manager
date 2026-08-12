/**
 * Language settings component
 */

import { startTransition } from 'react'
import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import SettingsField from '@/components/settings/SettingsField'
import SettingsRadioCardGroup from '@/components/settings/SettingsRadioCardGroup'
import type { LanguageSettingsProps } from '@/components/settings/types'

export default function LanguageSettings({ settings, onUpdate }: LanguageSettingsProps) {
  const { t, i18n } = useTranslation()

  const languages = [
    { code: 'zh-CN', name: '简体中文' },
    { code: 'en-US', name: 'English' },
    { code: 'ja-JP', name: '日本語' },
    { code: 'fr-FR', name: 'Français' },
    { code: 'de-DE', name: 'Deutsch' },
    { code: 'es-ES', name: 'Español' },
  ]

  const handleLanguageChange = (langCode: string) => {
    onUpdate('language', 'locale', langCode)
    startTransition(() => {
      void i18n.changeLanguage(langCode)
    })
  }
  const languageOptionsMap = new Map(languages.map((lang) => [lang.code, lang] as const))

  return (
    <div className="space-y-6">
      <SettingsField label={t('settings.language.select', 'Select language')} searchKey="language-locale">
        <SettingsRadioCardGroup
          options={languages.map((lang) => lang.code)}
          value={settings.language.locale}
          onChange={handleLanguageChange}
          name="language"
          getLabel={(langCode) => languageOptionsMap.get(langCode)?.name ?? langCode}
          getSuffix={(_langCode, active) =>
            active ? <Check className="h-4 w-4 text-info ml-auto" /> : null
          }
        />
      </SettingsField>
    </div>
  )
}
