import { describe, expect, it } from 'vitest'

import { parseMarkdown, scheduleMarkdownHighlightingPrewarm } from './markdown'

describe('parseMarkdown cache', () => {
  it('returns the cached html instance on repeated parses', () => {
    const text = 'Cache probe with `inline code` and a [link](https://example.com).'
    const first = parseMarkdown(text)
    const second = parseMarkdown(text)
    // A cache hit returns the very same string; a re-parse would rebuild it.
    expect(second).toBe(first)
  })

  it('caches blocks larger than the legacy 8KB source cap', () => {
    // Regression guard: big blocks are the expensive ones. When the source cap
    // excluded them, every scroll remount re-parsed them synchronously.
    const text = `Large block:\n\n${'lorem ipsum dolor sit amet\n'.repeat(900)}`
    expect(text.length).toBeGreaterThan(8 * 1024)
    const first = parseMarkdown(text)
    expect(parseMarkdown(text)).toBe(first)
  })
})

describe('scheduleMarkdownHighlightingPrewarm', () => {
  it('is a no-op outside the browser', () => {
    expect(() => scheduleMarkdownHighlightingPrewarm()).not.toThrow()
  })
})

describe('parseMarkdown code highlighting', () => {
  it('highlights normal-size code fences', () => {
    const html = parseMarkdown('```ts\nconst answer = 42\n```')
    expect(html).toContain('<span style=')
  })

  it('skips syntax highlighting for oversized code fences', () => {
    const bigCode = Array.from({ length: 2100 }, (_, i) => `const v${i} = ${i};`).join('\n')
    expect(bigCode.length).toBeGreaterThan(20_000)
    const html = parseMarkdown(`\`\`\`ts\n${bigCode}\n\`\`\``)
    // Plain escaped text instead of thousands of token spans.
    expect(html).not.toContain('<span style=')
    expect(html).toContain('const v0 = 0;')
    expect(html).toContain('const v2099 = 2099;')
  })
})
