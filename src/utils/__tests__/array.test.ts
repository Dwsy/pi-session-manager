import { describe, it, expect } from 'vitest'
import { unique, groupBy, chunk, flatten, intersection, difference } from '../array'

describe('unique', () => {
  it('removes duplicate primitives', () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3])
    expect(unique(['a', 'b', 'a', 'c'])).toEqual(['a', 'b', 'c'])
  })

  it('returns empty array for empty input', () => {
    expect(unique([])).toEqual([])
  })

  it('handles single element', () => {
    expect(unique([1])).toEqual([1])
  })
})

describe('groupBy', () => {
  it('groups items by key function', () => {
    const items = [
      { type: 'a', value: 1 },
      { type: 'b', value: 2 },
      { type: 'a', value: 3 },
    ]
    const result = groupBy(items, item => item.type)
    expect(result.a).toHaveLength(2)
    expect(result.b).toHaveLength(1)
  })

  it('returns empty object for empty array', () => {
    expect(groupBy([], () => 'key')).toEqual({})
  })
})

describe('chunk', () => {
  it('splits array into chunks', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([1, 2, 3], 1)).toEqual([[1], [2], [3]])
  })

  it('handles empty array', () => {
    expect(chunk([], 2)).toEqual([])
  })

  it('handles chunk size larger than array', () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]])
  })
})

describe('flatten', () => {
  it('flattens nested arrays', () => {
    expect(flatten([[1, 2], [3, 4], [5]])).toEqual([1, 2, 3, 4, 5])
    expect(flatten([[], [1], [2, 3]])).toEqual([1, 2, 3])
  })

  it('handles empty array', () => {
    expect(flatten([])).toEqual([])
  })
})

describe('intersection', () => {
  it('returns common elements', () => {
    expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3])
    expect(intersection(['a', 'b'], ['b', 'c'])).toEqual(['b'])
  })

  it('returns empty array when no intersection', () => {
    expect(intersection([1, 2], [3, 4])).toEqual([])
  })

  it('handles empty arrays', () => {
    expect(intersection([], [1, 2])).toEqual([])
    expect(intersection([1, 2], [])).toEqual([])
  })
})

describe('difference', () => {
  it('returns elements in first array not in second', () => {
    expect(difference([1, 2, 3], [2, 3, 4])).toEqual([1])
    expect(difference(['a', 'b', 'c'], ['b'])).toEqual(['a', 'c'])
  })

  it('returns all elements when no overlap', () => {
    expect(difference([1, 2], [3, 4])).toEqual([1, 2])
  })

  it('handles empty arrays', () => {
    expect(difference([], [1, 2])).toEqual([])
    expect(difference([1, 2], [])).toEqual([1, 2])
  })
})
