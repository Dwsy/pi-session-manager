import { describe, expect, it } from 'vitest'

import {
  ensureOrderContains,
  moveId,
  orderAppViewItems,
  resolvePinnedAppViewIds,
  sortAppViewsForMenu,
  togglePinnedId,
} from './appViewOrder'

describe('appViewOrder', () => {
  const items = [
    { id: 'semantic' },
    { id: 'word-cloud' },
    { id: 'agent-usage' },
  ]

  it('orders plugin app views by saved preference and appends new ones', () => {
    expect(orderAppViewItems(items, {
      pinnedIds: [],
      orderIds: ['word-cloud', 'semantic'],
    }).map((item) => item.id)).toEqual(['word-cloud', 'semantic', 'agent-usage'])
  })

  it('resolves pinned ids only from known plugin app views', () => {
    expect(resolvePinnedAppViewIds(items, {
      pinnedIds: ['missing', 'agent-usage'],
      orderIds: [],
    })).toEqual(['agent-usage'])
  })

  it('auto-pins only kanban when no pin is stored', () => {
    const withKanban = [
      { id: 'semantic' },
      { id: 'builtin.kanban-board.view' },
      { id: 'word-cloud' },
    ]
    expect(resolvePinnedAppViewIds(withKanban, {
      pinnedIds: [],
      orderIds: [],
    })).toEqual(['builtin.kanban-board.view'])

    expect(resolvePinnedAppViewIds(items, {
      pinnedIds: [],
      orderIds: ['word-cloud', 'semantic'],
    })).toEqual([])
  })

  it('lists unpinned items above pinned ones in the overflow menu', () => {
    expect(sortAppViewsForMenu(items, ['word-cloud']).map((item) => item.id)).toEqual([
      'semantic',
      'agent-usage',
      'word-cloud',
    ])
  })

  it('moves and pins only plugin app views', () => {
    expect(moveId(['a', 'b', 'c'], 'b', -1)).toEqual(['b', 'a', 'c'])
    expect(togglePinnedId(['a'], 'b')).toEqual(['b'])
    expect(togglePinnedId(['b'], 'b')).toEqual([])
    expect(ensureOrderContains(['b'], ['a', 'b', 'c'])).toEqual(['b', 'a', 'c'])
  })
})
