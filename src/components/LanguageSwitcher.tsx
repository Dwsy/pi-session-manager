import { useTranslation } from 'react-i18next'
import { Languages } from 'lucide-react'

const LANGUAGES = [
  { code: 'en', name: 'English', flag: '🇺🇸' },
  { code: 'zh', name: '简体中文', flag: '🇨🇳' },
]

export default function LanguageSwitcher() {
  const { i18n } = useTranslation()

  const handleChange = (lang: string) => {
    i18n.changeLanguage(lang)
    localStorage.setItem('language', lang)
  }

  return (
    <div className="relative group">
      <button className="flex items-center gap-2 px-2 py-1.5 text-sm text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b] rounded transition-colors">
        <Languages className="h-4 w-4" />
        <span>{LANGUAGES.find(l => l.code === i18n.language)?.flag}</span>
      </button>

      <div className="absolute right-0 top-full mt-1 w-40 bg-[#1a1b26] border border-[#2c2d3b] rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
        {LANGUAGES.map((lang) => (
          <button
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            className={`w-full px-3 py-2 text-left text-sm flex items-center gap-2 hover:bg-[#2c2d3b] transition-colors ${
              i18n.language === lang.code ? 'text-[#569cd6] bg-[#2c2d3b]/50' : 'text-[#6a6f85]'
            }`}
          >
            <span>{lang.flag}</span>
            <span>{lang.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}