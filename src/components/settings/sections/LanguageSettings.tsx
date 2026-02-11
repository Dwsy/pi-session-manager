/**
 * 语言设置组件
 */

import { useTranslation } from 'react-i18next'
import { Check } from 'lucide-react'
import type { LanguageSettingsProps } from '../types'

export default function LanguageSettings({ settings, onUpdate }: LanguageSettingsProps) {
  const { t, i18n } = useTranslation()

  const languages = [
    { code: 'zh-CN', name: '简体中文', flag: '🇨🇳' },
    { code: 'en-US', name: 'English', flag: '🇺🇸' },
  ]

  const handleLanguageChange = (langCode: string) => {
    onUpdate('language', 'locale', langCode)
    i18n.changeLanguage(langCode)
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          {t('settings.language.select', '选择语言')}
        </label>
        <div className="space-y-2">
          {languages.map((lang) => (
            <label
              key={lang.code}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                settings.language.locale === lang.code
                  ? 'border-info bg-info/10'
                  : 'border-border hover:border-border-hover'
              }`}
            >
              <input
                type="radio"
                name="language"
                value={lang.code}
                checked={settings.language.locale === lang.code}
                onChange={(e) => handleLanguageChange(e.target.value)}
                className="sr-only"
              />
              <span className="text-xl">{lang.flag}</span>
              <span className="text-sm font-medium text-foreground">{lang.name}</span>
              {settings.language.locale === lang.code && (
                <Check className="h-4 w-4 text-info ml-auto" />
              )}
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}