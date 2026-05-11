import { describe, it, expect } from 'vitest'
import { pick, omit, deepClone, isEmpty, merge } from '../object'

describe('pick', () => {
  it('picks specified keys from object', () => {
    const obj = { a: 1, b: 2, c: 3 }
    expect(pick(obj, ['a', 'c'])).toEqual({ a: 1, c: 3 })
  })

  it('returns empty object when no keys specified', () => {
    expect(pick({ a: 1 }, [])).toEqual({})
  })

  it('handles missing keys gracefully', () => {
    const obj = { a: 1 }
    expect(pick(obj, ['a', 'b' as keyof typeof obj])).toEqual({ a: 1 })
  })
})

describe('omit', () => {
  it('omits specified keys from object', () => {
    const obj = { a: 1, b: 2, c: 3 }
    expect(omit(obj, ['b'])).toEqual({ a: 1, c: 3 })
  })

  it('returns original object when no keys omitted', () => {
    const obj = { a: 1, b: 2 }
    expect(omit(obj, [])).toEqual({ a: 1, b: 2 })
  })

  it('handles multiple keys', () => {
    const obj = { a: 1, b: 2, c: 3, d: 4 }
    expect(omit(obj, ['b', 'd'])).toEqual({ a: 1, c: 3 })
  })
})

describe('deepClone', () => {
  it('clones primitive values', () => {
    expect(deepClone(42)).toBe(42)
    expect(deepClone('hello')).toBe('hello')
    expect(deepClone(null)).toBe(null)
  })

  it('clones arrays', () => {
    const arr = [1, [2, 3], { a: 4 }]
    const cloned = deepClone(arr)
    expect(cloned).toEqual(arr)
    expect(cloned).not.toBe(arr)
    expect(cloned[1]).not.toBe(arr[1])
  })

  it('clones objects', () => {
    const obj = { a: 1, b: { c: 2 }, d: [3, 4] }
    const cloned = deepClone(obj)
    expect(cloned).toEqual(obj)
    expect(cloned).not.toBe(obj)
    expect(cloned.b).not.toBe(obj.b)
    expect(cloned.d).not.toBe(obj.d)
  })

  it('clones dates', () => {
    const date = new Date('2024-01-15')
    const cloned = deepClone(date)
    expect(cloned).toEqual(date)
    expect(cloned).not.toBe(date)
  })
})

describe('isEmpty', () => {
  it('returns true for empty values', () => {
    expect(isEmpty(null)).toBe(true)
    expect(isEmpty(undefined)).toBe(true)
    expect(isEmpty('')).toBe(true)
    expect(isEmpty([])).toBe(true)
    expect(isEmpty({})).toBe(true)
  })

  it('returns false for non-empty values', () => {
    expect(isEmpty(0)).toBe(false)
    expect(isEmpty('hello')).toBe(false)
    expect(isEmpty([1, 2])).toBe(false)
    expect(isEmpty({ a: 1 })).toBe(false)
    expect(isEmpty(false)).toBe(false)
  })
})

describe('merge', () => {
  it('merges objects shallowly', () => {
    const obj1 = { a: 1, b: 2 }
    const obj2 = { b: 3, c: 4 }
    expect(merge(obj1, obj2)).toEqual({ a: 1, b: 3, c: 4 })
  })

  it('does not mutate original objects', () => {
    const obj1 = { a: 1 }
    const obj2 = { b: 2 }
    const result = merge(obj1, obj2)
    expect(obj1).toEqual({ a: 1 })
    expect(obj2).toEqual({ b: 2 })
    expect(result).toEqual({ a: 1, b: 2 })
  })

  it('handles empty objects', () => {
    expect(merge({}, { a: 1 })).toEqual({ a: 1 })
    expect(merge({ a: 1 }, {})).toEqual({ a: 1 })
  })
})
