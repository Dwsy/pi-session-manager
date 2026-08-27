// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import MarkdownContent from './MarkdownContent'

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

  it('renders mermaid code blocks as themed Unicode diagrams', () => {
    const content = `\`\`\`mermaid
flowchart LR
  A[Start] --> B[Done]
\`\`\``
    const { container } = render(<MarkdownContent content={content} />)

    const diagram = container.querySelector('.mermaid-block')
    expect(diagram).not.toBeNull()
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
quadrantChart
  x-axis Low --> High
\`\`\``
    const { container } = render(<MarkdownContent content={content} />)

    expect(container.querySelector('.mermaid-block')).toBeNull()
    expect(container.querySelector('.markdown-code-block code')?.textContent).toContain('quadrantChart')
  })
})
