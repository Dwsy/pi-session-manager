// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import {
  TEXT_QUOTE_CONTEXT_CHARS,
  extractTextQuote,
  findQuoteMatches,
  findQuoteRange,
  normalizeWhitespace,
  wrapRange,
} from './textQuote'

function mount(html: string): HTMLElement {
  const root = document.createElement('div')
  root.innerHTML = html
  document.body.append(root)
  return root
}

function rangeFor(root: Node, exact: string): Range {
  const found = findQuoteRange(root, { exact })
  if (!found) throw new Error(`fixture text not found: ${exact}`)
  return found
}

describe('normalizeWhitespace', () => {
  it('collapses whitespace runs', () => {
    expect(normalizeWhitespace('a \n\t  b')).toBe('a b')
  })
})

describe('extractTextQuote', () => {
  it('captures exact text with normalized whitespace and context', () => {
    const root = mount('<p>alpha beta gamma</p>')
    const range = rangeFor(root, 'beta')
    const quote = extractTextQuote(root, range)
    expect(quote?.exact).toBe('beta')
    expect(quote?.prefix).toBe('alpha ')
    expect(quote?.suffix).toBe(' gamma')
  })

  it('caps prefix and suffix context at 32 chars', () => {
    const long = 'x'.repeat(80)
    const root = mount(`<p>${long}target${long}</p>`)
    const quote = extractTextQuote(root, rangeFor(root, 'target'))
    expect(quote?.prefix).toBe('x'.repeat(TEXT_QUOTE_CONTEXT_CHARS))
    expect(quote?.suffix).toBe('x'.repeat(TEXT_QUOTE_CONTEXT_CHARS))
  })

  it('returns null for collapsed ranges', () => {
    const root = mount('<p>alpha</p>')
    const range = document.createRange()
    range.selectNodeContents(root)
    range.collapse(true)
    expect(extractTextQuote(root, range)).toBeNull()
  })
})

describe('findQuoteMatches', () => {
  it('disambiguates duplicate text via prefix/suffix', () => {
    const root = mount('<p>one two three two four</p>')
    const matches = findQuoteMatches(root, {
      exact: 'two',
      prefix: 'three ',
      suffix: ' four',
    })
    expect(matches).toHaveLength(2)
    expect(matches[0]!.score).toBeGreaterThan(matches[1]!.score)
    const best = findQuoteRange(root, { exact: 'two', prefix: 'three ', suffix: ' four' })
    expect(best?.toString()).toBe('two')
    const raw = root.textContent ?? ''
    expect(raw.slice(matches[0]!.start, matches[0]!.end)).toBe('two')
    expect(matches[0]!.start).toBe(raw.lastIndexOf('two'))
  })

  it('matches across inline element boundaries', () => {
    const root = mount('<p>say <b>hello</b> world</p>')
    const range = findQuoteRange(root, { exact: 'hello world' })
    expect(range?.toString()).toBe('hello world')
  })

  it('tolerates whitespace drift between quote and DOM', () => {
    const root = mount('<p>alpha\n   beta\tgamma</p>')
    const range = findQuoteRange(root, { exact: 'alpha beta gamma' })
    expect(range?.toString().replace(/\s+/g, ' ')).toBe('alpha beta gamma')
  })

  it('returns no match when the text is gone', () => {
    const root = mount('<p>alpha</p>')
    expect(findQuoteMatches(root, { exact: 'missing' })).toHaveLength(0)
    expect(findQuoteRange(root, { exact: 'missing' })).toBeNull()
  })

  it('returns empty for empty exact', () => {
    const root = mount('<p>alpha</p>')
    expect(findQuoteMatches(root, { exact: '   ' })).toHaveLength(0)
  })
})

describe('wrapRange', () => {
  it('wraps text spanning inline elements in one mark', () => {
    const root = mount('<p>say <b>hello</b> world</p>')
    const range = findQuoteRange(root, { exact: 'hello world' })!
    const mark = document.createElement('mark')
    wrapRange(range, mark)
    expect(root.querySelector('mark')?.textContent).toBe('hello world')
    expect(root.textContent).toBe('say hello world')
  })
})
