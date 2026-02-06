import { useMemo } from 'react'
import { bundledLanguagesInfo, codeToTokens } from 'shiki'

import type { BundledLanguage, BundledTheme } from 'shiki'

interface HighlightToken {
  content: string
  color?: string
  bgColor?: string
  htmlStyle?: Record<string, string>
  htmlAttrs?: Record<string, string>
  offset?: number
}

interface HighlightResult {
  tokens: HighlightToken[][]
  fg?: string
  bg?: string
}

interface HighlightOptions {
  code: string
  language: BundledLanguage
  themes: [string, string]
}

interface CodeHighlighterPlugin {
  name: 'shiki'
  type: 'code-highlighter'
  highlight: (options: HighlightOptions, callback?: (result: HighlightResult) => void) => HighlightResult | null
  supportsLanguage: (language: BundledLanguage) => boolean
  getSupportedLanguages: () => BundledLanguage[]
  getThemes: () => [BundledTheme, BundledTheme]
}

export interface StreamdownPlugins {
  code: CodeHighlighterPlugin
}

const languageMap = new Map<string, BundledLanguage>()
const supportedLanguages = new Set<string>()

bundledLanguagesInfo.forEach((info) => {
  const id = info.id.toLowerCase()
  languageMap.set(id, info.id as BundledLanguage)
  supportedLanguages.add(info.id)
  if (info.aliases) {
    info.aliases.forEach((alias) => {
      languageMap.set(alias.toLowerCase(), info.id as BundledLanguage)
    })
  }
})

const normalizeLanguage = (language: string): BundledLanguage | 'text' => {
  const normalized = language.trim().toLowerCase()
  if (!normalized) {
    return 'text'
  }
  return languageMap.get(normalized) ?? 'text'
}

const toPlainTokens = (code: string): HighlightResult => {
  const tokens = code.split('\n').map((line) => [
    {
      content: line,
      color: 'inherit',
      bgColor: 'transparent',
      offset: 0,
    },
  ])
  return { tokens }
}

const createCodeHighlighter = (theme: BundledTheme): CodeHighlighterPlugin => {
  const themes: [BundledTheme, BundledTheme] = [theme, theme]

  return {
    name: 'shiki',
    type: 'code-highlighter',
    highlight: (options, callback) => {
      const language = normalizeLanguage(options.language)
      void codeToTokens(options.code, { lang: language, theme: themes[0] })
        .then((result) => {
          callback?.(result as HighlightResult)
        })
        .catch(() => {
          callback?.(toPlainTokens(options.code))
        })
      return null
    },
    supportsLanguage: (language) => languageMap.has(language.trim().toLowerCase()),
    getSupportedLanguages: () => Array.from(supportedLanguages) as BundledLanguage[],
    getThemes: () => themes,
  }
}

export function useStreamdownPlugins(theme: string): StreamdownPlugins {
  return useMemo(() => ({ code: createCodeHighlighter(theme as BundledTheme) }), [theme])
}
