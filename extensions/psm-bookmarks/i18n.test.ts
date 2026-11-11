import { describe, expect, it } from 'vitest'

import { bookmarksI18n } from './i18n'

const locales = ['en-US', 'zh-CN', 'ja-JP', 'de-DE', 'fr-FR', 'es-ES']

function keysOf(locale: string): string[] {
  const resources = bookmarksI18n[locale as keyof typeof bookmarksI18n] as {
    plugins: { bookmarks: Record<string, string> }
  }
  return Object.keys(resources.plugins.bookmarks).sort()
}

describe('bookmarks i18n', () => {
  it('covers every supported locale with identical key sets', () => {
    expect(Object.keys(bookmarksI18n).sort()).toEqual([...locales].sort())
    const reference = keysOf('en-US')
    expect(reference.length).toBeGreaterThan(20)
    for (const locale of locales) {
      expect(keysOf(locale), `locale ${locale} diverges`).toEqual(reference)
    }
  })

  it('keeps every translation non-empty', () => {
    for (const locale of locales) {
      const resources = bookmarksI18n[locale as keyof typeof bookmarksI18n] as {
        plugins: { bookmarks: Record<string, string> }
      }
      for (const [key, value] of Object.entries(resources.plugins.bookmarks)) {
        expect(value.trim(), `${locale} -> ${key}`).not.toBe('')
      }
    }
  })
})
