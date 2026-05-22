// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { parseMarkdown } from './markdown'
import { classifyMarkdownLink, normalizeFileHref } from './markdownLinks'

describe('markdown link handling', () => {
  it('classifies http and https links as external urls', () => {
    expect(classifyMarkdownLink('https://example.com').kind).toBe('external-url')
    expect(classifyMarkdownLink('http://example.com/path').kind).toBe('external-url')
    expect(classifyMarkdownLink('HTTPS://example.com').kind).toBe('external-url')
  })

  it('classifies absolute and file urls as local files', () => {
    expect(classifyMarkdownLink('/Users/me/notes.md').kind).toBe('local-file')
    expect(classifyMarkdownLink('file:///Users/me/notes.md').kind).toBe('local-file')
  })

  it('keeps page anchors in the webview', () => {
    expect(classifyMarkdownLink('#section').kind).toBe('anchor')
  })

  it('blocks unsupported or unsafe protocols', () => {
    expect(classifyMarkdownLink('javascript:alert(1)').kind).toBe('unsupported')
    expect(classifyMarkdownLink('data:text/html,hello').kind).toBe('unsupported')
    expect(classifyMarkdownLink('./relative.md').kind).toBe('unsupported')
  })

  it('decodes file urls before sending them to native open', () => {
    expect(normalizeFileHref('file:///Users/me/My%20Notes.md')).toBe('/Users/me/My Notes.md')
    expect(normalizeFileHref('file:///C:/Users/me/My%20Notes.md')).toBe('C:/Users/me/My Notes.md')
  })

  it('renders external targets as inert anchors with original targets in data attributes', () => {
    const html = parseMarkdown('[Docs](https://example.com/docs) [Note](file:///Users/me/a.md)')
    expect(html).toContain('href="#"')
    expect(html).toContain('data-markdown-href="https://example.com/docs"')
    expect(html).toContain('data-markdown-href="file:///Users/me/a.md"')
    expect(html).not.toContain('target="_blank"')
  })

  it('renders unsafe link hrefs as inert anchors', () => {
    const html = parseMarkdown('[Bad](javascript:alert(1))')
    expect(html).toContain('href="#"')
    expect(html).toContain('data-markdown-href="javascript:alert(1)"')
  })

  it('renders page anchors without external-open attributes', () => {
    const html = parseMarkdown('[Jump](#section)')
    expect(html).toContain('href="#section"')
    expect(html).not.toContain('target="_blank"')
  })
})
