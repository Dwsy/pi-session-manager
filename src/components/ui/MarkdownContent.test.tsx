// @vitest-environment jsdom

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import MarkdownContent from './MarkdownContent'
import UserMessage from '@/components/messages/UserMessage'
import { enableMarkdownTableResize } from '@/utils/markdownTableResize'

const { invokeMock, isTauriMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  isTauriMock: vi.fn(() => false),
}))

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

  it('zooms each inline diagram independently and resets to fit', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300)
    const content = [
      '```mermaid\nflowchart LR\n A[Start] --> B[End]\n```',
      '```mermaid\nflowchart LR\n C[Other] --> D[End]\n```',
    ].join('\n\n')
    const { container } = render(<MarkdownContent content={content} />)
    const [first, second] = Array.from(container.querySelectorAll<HTMLElement>('.mermaid-block'))
    const firstSvg = first.querySelector<SVGSVGElement>('.mermaid-svg > svg')!
    const initialWidth = parseFloat(firstSvg.style.width)

    fireEvent.click(within(first).getByRole('button', { name: 'Zoom in' }))
    expect(parseFloat(firstSvg.style.width)).toBeCloseTo(initialWidth * 1.25)
    expect(within(first).getByRole('button', { name: /Fit diagram to width/ }).textContent).toBe('125%')
    expect(second.dataset.mermaidScale).toBeUndefined()

    fireEvent.click(within(first).getByRole('button', { name: /Fit diagram to width/ }))
    expect(parseFloat(firstSvg.style.width)).toBeCloseTo(initialWidth)
    expect(first.dataset.mermaidScale).toBeUndefined()
  })

  it('allows a very wide diagram to reach its natural size and keeps manual zoom on resize', () => {
    const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200)
    const nodes = Array.from({ length: 12 }, (_, index) => 'N' + index + '[Long diagram node ' + index + ']')
    const content = '```mermaid\nflowchart LR\n ' + nodes.join(' --> ') + '\n```'
    const { container } = render(<MarkdownContent content={content} />)
    const block = container.querySelector<HTMLElement>('.mermaid-block')!
    const svg = block.querySelector<SVGSVGElement>('.mermaid-svg > svg')!
    const naturalWidth = Number(block.dataset.mermaidWidth)
    expect(naturalWidth).toBeGreaterThan(1600)
    expect(parseFloat(svg.style.width)).toBeCloseTo(200)

    const zoomIn = within(block).getByRole('button', { name: 'Zoom in' })
    const steps = Math.ceil(Math.log(naturalWidth / 200) / Math.log(1.25))
    for (let index = 0; index < steps; index++) fireEvent.click(zoomIn)
    expect(parseFloat(svg.style.width)).toBeGreaterThanOrEqual(naturalWidth)
    const manualWidth = parseFloat(svg.style.width)

    width.mockReturnValue(400)
    fireEvent(window, new Event('resize'))
    expect(parseFloat(svg.style.width)).toBeCloseTo(manualWidth)
    fireEvent.click(within(block).getByRole('button', { name: /Fit diagram to width/ }))
    expect(parseFloat(svg.style.width)).toBeCloseTo(400)
    expect(within(block).getByRole('button', { name: /Fit diagram to width/ }).textContent)
      .toBe(Math.round(400 / naturalWidth * 100) + '%')
    fireEvent.click(within(block).getByRole('button', { name: 'Actual size (100%)' }))
    expect(parseFloat(svg.style.width)).toBeCloseTo(naturalWidth)
    expect(within(block).getByRole('button', { name: /Fit diagram to width/ }).textContent).toBe('100%')
  })

  it('opens a separate full-window diagram, supports zoom and restores focus on Escape', () => {
    const content = '```mermaid\nflowchart LR\n A[Start] --> B[End]\n```'
    const { container } = render(<MarkdownContent content={content} />)
    const open = screen.getByRole('button', { name: 'Open diagram full screen' })
    open.focus()
    fireEvent.click(open)

    const dialog = screen.getByRole('dialog', { name: 'Mermaid diagram' })
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Close diagram' }))
    expect(document.body.style.overflow).toBe('hidden')
    const inlineSvg = container.querySelector<SVGSVGElement>('.mermaid-svg > svg')!
    const fullscreenSvg = dialog.querySelector<SVGSVGElement>('.mermaid-fullscreen-diagram > svg')!
    expect(fullscreenSvg).not.toBe(inlineSvg)
    expect(fullscreenSvg.textContent).toContain('Start')

    const diagram = dialog.querySelector<HTMLElement>('.mermaid-fullscreen-diagram')!
    const initialWidth = parseFloat(diagram.style.width)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom in' }))
    expect(parseFloat(diagram.style.width)).toBeCloseTo(initialWidth * 1.25)
    const canvas = dialog.querySelector<HTMLElement>('.mermaid-fullscreen-canvas')!
    fireEvent.wheel(canvas, { ctrlKey: true, deltaY: -100 })
    expect(parseFloat(diagram.style.width)).toBeCloseTo(initialWidth * 1.25 * 1.25)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Actual size (100%)' }))
    expect(parseFloat(diagram.style.width)).toBeCloseTo(initialWidth)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Zoom in' }))
    fireEvent.keyDown(window, { key: '0' })
    expect(parseFloat(diagram.style.width)).toBeCloseTo(initialWidth)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(open)
    expect(document.body.style.overflow).toBe('')
  })

  it('keeps the viewer open and restores focus after markdown or search updates', () => {
    const content = '```mermaid\nflowchart LR\n A[Start] --> B[End]\n```'
    const { rerender } = render(<MarkdownContent content={content} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open diagram full screen' }))
    rerender(<MarkdownContent content={content + '\n\nMore text'} searchQuery="Start" />)
    const dialog = screen.getByRole('dialog', { name: 'Mermaid diagram' })
    expect(dialog).toBeTruthy()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open diagram full screen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Open diagram full screen' }))
    rerender(<MarkdownContent content="The diagram was removed." />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('accumulates a burst of small wheel events and reports the zoom level', () => {
    const content = '```mermaid\nflowchart LR\n A[Start] --> B[End]\n```'
    render(<MarkdownContent content={content} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open diagram full screen' }))
    const dialog = screen.getByRole('dialog', { name: 'Mermaid diagram' })
    const diagram = dialog.querySelector<HTMLElement>('.mermaid-fullscreen-diagram')!
    const initialWidth = parseFloat(diagram.style.width)
    const canvas = dialog.querySelector<HTMLElement>('.mermaid-fullscreen-canvas')!
    act(() => {
      for (let index = 0; index < 5; index++) {
        fireEvent.wheel(canvas, { ctrlKey: true, deltaY: -20 })
      }
    })
    expect(parseFloat(diagram.style.width)).toBeCloseTo(initialWidth * 1.25)
    expect(within(dialog).getByLabelText('Zoom 125%')).toBeTruthy()
  })

  it('supports pinch zoom and continues panning with the remaining touch', () => {
    const content = '```mermaid\nflowchart LR\n A[Start] --> B[End]\n```'
    render(<MarkdownContent content={content} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open diagram full screen' }))
    const dialog = screen.getByRole('dialog', { name: 'Mermaid diagram' })
    const diagram = dialog.querySelector<HTMLElement>('.mermaid-fullscreen-diagram')!
    const canvas = dialog.querySelector<HTMLElement>('.mermaid-fullscreen-canvas')!
    const initialWidth = parseFloat(diagram.style.width)

    fireEvent.pointerDown(canvas, { pointerId: 1, pointerType: 'touch', button: 0, clientX: 100, clientY: 100 })
    fireEvent.pointerDown(canvas, { pointerId: 2, pointerType: 'touch', button: 0, clientX: 200, clientY: 100 })
    fireEvent.pointerMove(canvas, { pointerId: 2, pointerType: 'touch', clientX: 300, clientY: 100 })
    expect(parseFloat(diagram.style.width)).toBeCloseTo(initialWidth * 2)

    canvas.scrollLeft = 120
    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'touch' })
    fireEvent.pointerMove(canvas, { pointerId: 2, pointerType: 'touch', clientX: 280, clientY: 100 })
    expect(canvas.scrollLeft).toBe(140)
    fireEvent.pointerUp(canvas, { pointerId: 2, pointerType: 'touch' })
    expect(canvas.classList.contains('is-dragging')).toBe(false)
  })

  it('closes the diagram before its enclosing full-message dialog', () => {
    const content = '```mermaid\nflowchart LR\n A[Start] --> B[End]\n```'
    const { container } = render(
      <UserMessage id="mermaid-message" content={[{ type: 'text', text: content }]} />,
    )
    fireEvent.click(container.querySelector<HTMLButtonElement>('.user-message-copy-button[aria-haspopup="dialog"]')!)
    const messageDialog = screen.getByRole('dialog')
    fireEvent.click(within(messageDialog).getByRole('button', { name: 'Open diagram full screen' }))
    const diagramDialog = screen.getByRole('dialog', { name: 'Mermaid diagram' })

    fireEvent.keyDown(within(diagramDialog).getByRole('button', { name: 'Close diagram' }), { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Mermaid diagram' })).toBeNull()
    expect(screen.getByRole('dialog')).toBe(messageDialog)
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
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
