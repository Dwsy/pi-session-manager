// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { buildSessionSelection, resolveTranscriptSelection } from './sessionSelection'

const session = { path: '/tmp/s.jsonl', id: 'session-1', name: 'demo' }

function select(range: Range): Selection {
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
  return selection
}

function rangeIn(root: Node, exact: string): Range {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode() as Text | null
  while (node) {
    const at = node.data.indexOf(exact)
    if (at !== -1) {
      const range = document.createRange()
      range.setStart(node, at)
      range.setEnd(node, at + exact.length)
      return range
    }
    node = walker.nextNode() as Text | null
  }
  throw new Error(`fixture text not found: ${exact}`)
}

describe('resolveTranscriptSelection', () => {
  it('resolves entry id from an entry element id', () => {
    document.body.innerHTML = '<div id="entry-m1"><p>alpha beta</p></div>'
    const entry = document.getElementById('entry-m1')!
    const anchor = resolveTranscriptSelection(select(rangeIn(entry, 'beta')))
    expect(anchor?.entryId).toBe('m1')
    expect(anchor?.entryElement).toBe(entry)
  })

  it('resolves entry id from data-entry-id', () => {
    document.body.innerHTML = '<div data-entry-id="row-9"><p>alpha beta</p></div>'
    const anchor = resolveTranscriptSelection(select(rangeIn(document.body, 'beta')))
    expect(anchor?.entryId).toBe('row-9')
  })

  it('rejects selections spanning two entries', () => {
    document.body.innerHTML =
      '<div id="entry-m1"><p>alpha </p></div><div id="entry-m2"><p>beta</p></div>'
    const range = document.createRange()
    range.setStart(document.querySelector('#entry-m1 p')!.firstChild!, 0)
    range.setEnd(document.querySelector('#entry-m2 p')!.firstChild!, 4)
    expect(resolveTranscriptSelection(select(range))).toBeNull()
  })

  it('rejects collapsed or empty selections', () => {
    document.body.innerHTML = '<div id="entry-m1"><p>alpha</p></div>'
    expect(resolveTranscriptSelection(null)).toBeNull()
    expect(resolveTranscriptSelection(window.getSelection())).toBeNull()
    const collapsed = document.createRange()
    collapsed.selectNodeContents(document.querySelector('#entry-m1 p')!)
    collapsed.collapse(true)
    expect(resolveTranscriptSelection(select(collapsed))).toBeNull()
  })

  it('rejects selections outside any entry', () => {
    document.body.innerHTML = '<div id="entry-m1"><p>alpha</p></div><p>loose text</p>'
    expect(resolveTranscriptSelection(select(rangeIn(document.body, 'loose')))).toBeNull()
  })
})

describe('buildSessionSelection', () => {
  it('builds a plugin selection with a text quote', () => {
    document.body.innerHTML = '<div id="entry-m1"><p>alpha beta gamma</p></div>'
    const anchor = resolveTranscriptSelection(select(rangeIn(document.body, 'beta')))
    const selection = buildSessionSelection(session, anchor!, 'user')
    expect(selection).toEqual({
      sessionPath: '/tmp/s.jsonl',
      sessionId: 'session-1',
      entryId: 'm1',
      entryRole: 'user',
      selectedText: 'beta',
      textQuote: { exact: 'beta', prefix: 'alpha ', suffix: ' gamma' },
    })
  })
})
