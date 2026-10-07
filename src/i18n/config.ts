import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { invoke, isTauri } from '@/transport'
import { enUS } from './locales/en-US/index'
import { zhCN } from './locales/zh-CN/index'
import { jaJP } from './locales/ja-JP/index'
import { frFR } from './locales/fr-FR/index'
import { deDE } from './locales/de-DE/index'
import { esES } from './locales/es-ES/index'

const resources = {
  'en-US': { translation: enUS },
  'zh-CN': { translation: zhCN },
  'ja-JP': { translation: jaJP },
  'fr-FR': { translation: frFR },
  'de-DE': { translation: deDE },
  'es-ES': { translation: esES },
}

/**
 * Detect system language, preferring user-saved preference
 * Chinese systems automatically switch to Chinese; otherwise default to English
 */
export function detectSystemLocale(): string {
  const saved = typeof localStorage === 'undefined' ? null : localStorage.getItem('app-language')
  if (saved) return saved
  const lang = typeof navigator === 'undefined' ? 'en-US' : navigator.language || 'en-US'
  if (lang.startsWith('zh')) return 'zh-CN'
  if (lang.startsWith('ja')) return 'ja-JP'
  if (lang.startsWith('fr')) return 'fr-FR'
  if (lang.startsWith('de')) return 'de-DE'
  if (lang.startsWith('es')) return 'es-ES'
  return 'en-US'
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en-US',
    lng: detectSystemLocale(),
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: 'app-language',
    },
  })

// Keep the native tray menu language in sync (desktop app only).
function syncTrayLanguage(lang: string) {
  if (!isTauri()) return
  invoke('set_tray_language', { lang }).catch(() => {
    // No tray in CLI/remote backends; safe to ignore.
  })
}

i18n.on('languageChanged', (lang) => syncTrayLanguage(lang))
syncTrayLanguage(i18n.language)

export default i18n