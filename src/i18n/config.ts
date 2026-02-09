import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { enUS } from './locales/en-US/index'
import { zhCN } from './locales/zh-CN/index'

const resources = {
  'en-US': { translation: enUS },
  'zh-CN': { translation: zhCN },
}

/**
 * 检测系统语言，优先使用用户已保存的偏好
 * 中文系统自动切换为中文，其余默认英文
 */
export function detectSystemLocale(): string {
  const saved = localStorage.getItem('app-language')
  if (saved) return saved
  const lang = navigator.language || 'en-US'
  return lang.startsWith('zh') ? 'zh-CN' : 'en-US'
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

export default i18n