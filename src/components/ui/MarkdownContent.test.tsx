// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import MarkdownContent from './MarkdownContent'
import { enableMarkdownTableResize } from '@/utils/markdownTableResize'

const invokeMock = vi.fn()
const isTauriMock = vi.fn(() => true)

vi.mock('@/transport', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  isTauri: () => isTauriMock(),
}))

describe('MarkdownContent link handling', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    invokeMock.mockReset()
    invokeMock.mockResolvedValue(undefined)
    isTauriMock.mockReset()
    isTauriMock.mockReturnValue(true)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    vi.spyOn(window, 'alert').mockImplementation(() => {})
  })

  it('confirms then opens http links outside the webview', async () => {
    render(<MarkdownContent content="[Docs](https://example.com/docs)" />)

    fireEvent.click(screen.getByRole('link', { name: 'Docs' }))

    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('https://example.com/docs'))
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('open_url_in_system', { url: 'https://example.com/docs' })
    })
  })

  it('opens file links with the default desktop app without confirmation', async () => {
    render(<MarkdownContent content="[Note](file:///Users/me/My%20Note.md)" />)

    fireEvent.click(screen.getByRole('link', { name: 'Note' }))

    expect(window.confirm).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith('open_path_with_default_app', { path: '/Users/me/My Note.md' })
    })
  })

  it('blocks unsupported protocols', () => {
    render(<MarkdownContent content="[Bad](javascript:alert(1))" />)

    fireEvent.click(screen.getByRole('link', { name: 'Bad' }))

    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('Unsupported link protocol'))
    expect(invokeMock).not.toHaveBeenCalled()
  })

  it('renders read-files / modified-files as always-visible sections and parses markdown inside them', () => {
    const content = `
Before XML
<read-files>
- [file1](file:///path/to/file1)
- [file2](file:///path/to/file2)
</read-files>
After XML
`
    const { container } = render(<MarkdownContent content={content} />)

    const section = container.querySelector('section.xml-section-block')
    expect(section).not.toBeNull()
    expect(container.querySelector('details.xml-details-block')).toBeNull()

    const title = section?.querySelector('.xml-section-title')
    expect(title).not.toBeNull()
    expect(title?.textContent?.trim()).toContain('read-files')

    // Check parsed markdown content inside
    const link = screen.getByRole('link', { name: 'file1' })
    expect(link).not.toBeNull()
    expect(link.getAttribute('data-markdown-href')).toBe('file:///path/to/file1')
  })

  it('keeps non-file XML tags collapsible', () => {
    const content = `
<task>
- do the thing
</task>
`
    const { container } = render(<MarkdownContent content={content} />)

    const details = container.querySelector('details.xml-details-block')
    expect(details).not.toBeNull()
    expect(details?.getAttribute('open')).not.toBeNull()

    const summary = details?.querySelector('summary.xml-details-summary')
    expect(summary?.textContent?.trim()).toContain('task')
  })

  it('does not parse XML tags inside markdown code blocks', () => {
    const content = `
\`\`\`xml
<read-files>
- [file1](file:///path/to/file1)
</read-files>
\`\`\`
`
    const { container } = render(<MarkdownContent content={content} />)

    // Check that we do NOT have a details element
    const details = container.querySelector('details.xml-details-block')
    expect(details).toBeNull()

    // Check that the raw text is preserved inside code block
    const code = container.querySelector('code.shiki')
    expect(code?.textContent).toContain('<read-files>')
    expect(code?.textContent).toContain('- [file1](file:///path/to/file1)')
  })

  it('renders mermaid code blocks as inline SVG diagrams', () => {
    const content = `\`\`\`mermaid
flowchart LR
  A[Start] --> B[Done]
\`\`\``
    const { container } = render(<MarkdownContent content={content} />)

    const diagram = container.querySelector('.mermaid-block')
    expect(diagram).not.toBeNull()
    expect(diagram?.querySelector('svg.ondine.ondine-flowchart')).not.toBeNull()
    expect(diagram?.textContent).toContain('Start')
    expect(diagram?.textContent).toContain('Done')
    expect(container.querySelector('.markdown-code-block')).toBeNull()

    const sourceView = container.querySelector<HTMLElement>('.mermaid-source-view')
    expect(sourceView?.hidden).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Mermaid' }))
    expect(sourceView?.hidden).toBe(false)
    expect(sourceView?.textContent).toContain('flowchart LR')
    expect(container.querySelector<HTMLElement>('.mermaid-rendered-view')?.hidden).toBe(true)

    fireEvent.click(screen.getByRole('button', { name: 'Rendered' }))
    expect(sourceView?.hidden).toBe(true)
    expect(container.querySelector<HTMLElement>('.mermaid-rendered-view')?.hidden).toBe(false)
  })

  it('falls back to the regular code block for unsupported mermaid diagrams', () => {
    const content = `\`\`\`mermaid
zzzDiagram
  title A type no diagram engine knows
\`\`\``
    const { container } = render(<MarkdownContent content={content} />)

    expect(container.querySelector('.mermaid-block')).toBeNull()
    expect(container.querySelector('.markdown-code-block code')?.textContent).toContain('zzzDiagram')
  })

  it('renders inline and block LaTeX with KaTeX', () => {
    const content = `速度$v$保持不变。\n\n$$\n\\int_0^1 x^2 \\, dx = \\frac{1}{3}\n$$`
    const { container } = render(<MarkdownContent content={content} />)

    expect(container.querySelector('.katex')).not.toBeNull()
    expect(container.querySelector('.katex-display')).not.toBeNull()
  })

  it('renders standard LaTeX bracket and parenthesis delimiters', () => {
    const content = `最少需要摸出：\n\n\\[\n\\boxed{16\\text{ 颗}}\n\\]\n\n概率为 \\(\\frac{1}{2}\\)。`
    const { container } = render(<MarkdownContent content={content} />)

    expect(container.querySelectorAll('.katex').length).toBeGreaterThanOrEqual(2)
    expect(container.querySelector('.katex-display')).not.toBeNull()
  })
})

describe('MarkdownContent table resize enhancement', () => {
  it('wraps tables with drag handles for columns and height', () => {
    const content = `| Name | Value |
| --- | --- |
| a | 1 |`
    const { container } = render(<MarkdownContent content={content} />)

    const wrapper = container.querySelector('.markdown-table-resize')
    expect(wrapper).not.toBeNull()
    expect(wrapper?.querySelector('.markdown-table-scroll table')).not.toBeNull()
    expect(wrapper?.querySelectorAll('.md-table-col-handle')).toHaveLength(2)
    expect(wrapper?.querySelector('.md-table-height-handle')).not.toBeNull()
  })

  it('does not enhance tables without rows', () => {
    const { container } = render(<MarkdownContent content="plain text only" />)

    expect(container.querySelector('.markdown-table-resize')).toBeNull()
  })
})

describe('table size memoization (markdownTableResize)', () => {
  const tableHtml = '<table><tr><th>Name</th><th>Value</th></tr><tr><td>a</td><td>1</td></tr></table>'

  beforeEach(() => {
    localStorage.clear()
  })

  function makeRoot(): HTMLElement {
    const root = document.createElement('div')
    root.innerHTML = tableHtml
    document.body.appendChild(root)
    return root
  }

  it('does not touch localStorage by default', () => {
    const root = makeRoot()
    enableMarkdownTableResize(root)

    const handle = root.querySelector<HTMLElement>('.md-table-col-handle')!
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0 })
    fireEvent.pointerUp(handle, { pointerId: 1 })

    expect(Object.keys(localStorage)).toHaveLength(0)
  })

  it('persists and restores column widths for identical content', () => {
    const root = makeRoot()
    enableMarkdownTableResize(root, { memoize: true })

    const handle = root.querySelector<HTMLElement>('.md-table-col-handle')!
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0 })
    fireEvent.pointerMove(handle, { pointerId: 1, clientX: 60 })
    fireEvent.pointerUp(handle, { pointerId: 1 })

    const savedKeys = Object.keys(localStorage).filter((k) => k.startsWith('psm:md-table-resize:'))
    expect(savedKeys).toHaveLength(1)
    const saved = JSON.parse(localStorage.getItem(savedKeys[0])!)
    expect(saved.cols[0]).toBe(108) // 48 (min, jsdom) + 60 delta

    // Fresh root with identical content restores widths eagerly.
    const root2 = makeRoot()
    enableMarkdownTableResize(root2, { memoize: true })

    const table = root2.querySelector('table')!
    expect(table.style.tableLayout).toBe('fixed')
    const cols = table.querySelectorAll('col')
    expect((cols[0] as HTMLElement).style.width).toBe('108px')
  })

  it('ignores saved sizes when column count differs', () => {
    const root = makeRoot()
    enableMarkdownTableResize(root, { memoize: true })
    const handle = root.querySelector<HTMLElement>('.md-table-col-handle')!
    fireEvent.pointerDown(handle, { pointerId: 1, clientX: 0 })
    fireEvent.pointerUp(handle, { pointerId: 1 })

    const changed = document.createElement('div')
    changed.innerHTML = '<table><tr><th>A</th><th>B</th><th>C</th></tr><tr><td>1</td><td>2</td><td>3</td></tr></table>'
    document.body.appendChild(changed)
    enableMarkdownTableResize(changed, { memoize: true })

    const table = changed.querySelector('table')!
    expect(table.style.tableLayout).toBe('')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })
})
