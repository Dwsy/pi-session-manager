// @vitest-environment jsdom

import React from 'react'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PsmSessionHighlight } from '@dwsy/plugin-sdk'

const snapshot: {
  selectionActions: Array<{
    id: string
    title: string
    order: number
    run: (props: { selection: unknown; close: () => void }) => void
  }>
  highlightProviders: Array<{
    id: string
    pluginId: string
    resolveHighlights: (props: unknown) => PsmSessionHighlight[] | Promise<PsmSessionHighlight[]>
    renderPopover?: (props: unknown) => unknown
    subscribe?: (onChange: () => void) => (() => void) | void
  }>
} = {
  selectionActions: [],
  highlightProviders: [],
}

vi.mock('@/plugins/runtime-host', () => ({
  usePsmPluginSessionUi: () => snapshot,
  PluginContributionBoundary: ({ children }: { children: React.ReactNode }) => children,
  requestOpenSessionPanel: vi.fn(),
}))

import SessionSelectionLayer from './SessionSelectionLayer'

const session = { path: '/tmp/session.jsonl', id: 'session-1', name: 'demo' }

async function flushFrames() {
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    await Promise.resolve()
  })
}

async function flushTimers() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30))
  })
}

let container: HTMLDivElement
let root: Root
let layerHost: HTMLDivElement

beforeEach(async () => {
  container = document.createElement('div')
  container.innerHTML = '<div id="entry-m1"><p>alpha beta gamma</p></div>'
  document.body.append(container)
  layerHost = document.createElement('div')
  document.body.append(layerHost)
  root = createRoot(layerHost)
})

afterEach(async () => {
  await act(async () => {
    root.unmount()
  })
  document.body.innerHTML = ''
  snapshot.selectionActions = []
  snapshot.highlightProviders = []
})

function renderLayer(revisionKey = 1) {
  const ref = { current: container }
  return act(async () => {
    root.render(
      <SessionSelectionLayer containerRef={ref} session={session} revisionKey={revisionKey} />,
    )
  })
}

function selectText(text: string) {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  while (node) {
    const at = node.data.indexOf(text)
    if (at !== -1) {
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + text.length)
      const selection = window.getSelection()!
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    node = walker.nextNode() as Text | null
  }
  throw new Error(`text not found: ${text}`)
}

describe('SessionSelectionLayer highlights', () => {
  it('anchors provider highlights into the transcript and drops stale marks', async () => {
    snapshot.highlightProviders = [
      {
        id: 'provider',
        pluginId: 'plugin',
        resolveHighlights: () => [
          {
            id: 'h1',
            entryId: 'm1',
            textQuote: { exact: 'beta', prefix: 'alpha ', suffix: ' gamma' },
            label: 'note',
            hue: 42,
          },
        ],
      },
    ]
    await renderLayer()
    await flushTimers()

    const mark = container.querySelector('mark.psm-text-highlight')
    expect(mark?.textContent).toBe('beta')
    expect(mark?.getAttribute('data-psm-provider')).toBe('provider')
    expect(mark?.getAttribute('data-psm-highlight')).toBe('h1')
    expect(mark?.getAttribute('title')).toBe('note')

    // Provider returns nothing -> the host unwraps the stale mark.
    snapshot.highlightProviders[0]!.resolveHighlights = () => []
    await renderLayer(2)
    await flushTimers()
    expect(container.querySelector('mark.psm-text-highlight')).toBeNull()
    expect(container.textContent).toBe('alpha beta gamma')
  })

  it('re-resolves a provider immediately when it reports changes', async () => {
    let highlights: PsmSessionHighlight[] = [
      { id: 'h1', entryId: 'm1', textQuote: { exact: 'beta', prefix: 'alpha ', suffix: ' gamma' } },
    ]
    let notify: (() => void) | null = null
    snapshot.highlightProviders = [
      {
        id: 'provider',
        pluginId: 'plugin',
        resolveHighlights: () => highlights,
        subscribe: (onChange) => {
          notify = onChange
          return () => {
            notify = null
          }
        },
      },
    ]
    await renderLayer()
    await flushTimers()
    expect(container.querySelector('mark.psm-text-highlight')?.textContent).toBe('beta')

    highlights = []
    await act(async () => {
      notify?.()
      await Promise.resolve()
    })
    await flushTimers()
    expect(container.querySelector('mark.psm-text-highlight')).toBeNull()
    expect(container.textContent).toBe('alpha beta gamma')
  })

  it('survives DOM rebuilds between revisions', async () => {
    snapshot.highlightProviders = [
      {
        id: 'provider',
        pluginId: 'plugin',
        resolveHighlights: () => [
          { id: 'h1', entryId: 'm1', textQuote: { exact: 'beta', prefix: 'alpha ', suffix: ' gamma' } },
        ],
      },
    ]
    await renderLayer()
    await flushTimers()

    // Simulate a virtual-scroll remount wiping the entry DOM.
    container.innerHTML = '<div id="entry-m1"><p>alpha beta gamma</p></div>'
    await renderLayer(2)
    await flushTimers()
    expect(container.querySelector('mark.psm-text-highlight')?.textContent).toBe('beta')
  })
})

describe('SessionSelectionLayer selection menu', () => {
  it('shows registered actions and passes the selection to run', async () => {
    const run = vi.fn()
    snapshot.selectionActions = [
      { id: 'act', title: 'Bookmark', order: 10, run: run as never },
    ]
    await renderLayer()

    selectText('beta')
    await act(async () => {
      container.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })
    await flushFrames()

    const menu = document.querySelector('.psm-selection-menu')
    expect(menu?.textContent).toContain('Bookmark')

    await act(async () => {
      ;(menu as HTMLElement).querySelector('button')!.click()
    })
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        selection: expect.objectContaining({
          sessionPath: '/tmp/session.jsonl',
          entryId: 'm1',
          selectedText: 'beta',
          textQuote: { exact: 'beta', prefix: 'alpha ', suffix: ' gamma' },
        }),
      }),
    )
  })

  it('stays hidden for selections outside transcript entries', async () => {
    snapshot.selectionActions = [{ id: 'act', title: 'Bookmark', order: 10, run: vi.fn() as never }]
    const loose = document.createElement('p')
    loose.textContent = 'loose text'
    container.append(loose)
    await renderLayer()

    const walker = document.createTreeWalker(loose, NodeFilter.SHOW_TEXT)
    const node = walker.nextNode() as Text
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, 4)
    const selection = window.getSelection()!
    selection.removeAllRanges()
    selection.addRange(range)

    await act(async () => {
      loose.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }))
    })
    await flushFrames()
    expect(document.querySelector('.psm-selection-menu')).toBeNull()
  })
})
