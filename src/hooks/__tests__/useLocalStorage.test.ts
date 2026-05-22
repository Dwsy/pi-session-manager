// @vitest-environment jsdom
import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useLocalStorage } from '../useLocalStorage'

describe('useLocalStorage', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns initial value when no stored value', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'default'))
    expect(result.current[0]).toBe('default')
  })

  it('returns stored value when available', () => {
    localStorage.setItem('key', JSON.stringify('stored'))
    const { result } = renderHook(() => useLocalStorage('key', 'default'))
    expect(result.current[0]).toBe('stored')
  })

  it('updates value and localStorage', () => {
    const { result } = renderHook(() => useLocalStorage('key', 'initial'))

    act(() => {
      result.current[1]('updated')
    })

    expect(result.current[0]).toBe('updated')
    expect(localStorage.getItem('key')).toBe('"updated"')
  })

  it('handles object values', () => {
    const initialValue = { name: 'test', count: 0 }
    const { result } = renderHook(() => useLocalStorage('key', initialValue))

    act(() => {
      result.current[1]({ name: 'updated', count: 1 })
    })

    expect(result.current[0]).toEqual({ name: 'updated', count: 1 })
    expect(JSON.parse(localStorage.getItem('key')!)).toEqual({ name: 'updated', count: 1 })
  })

  it('handles function updater', () => {
    const { result } = renderHook(() => useLocalStorage('key', 0))

    act(() => {
      result.current[1](prev => prev + 1)
    })

    expect(result.current[0]).toBe(1)
  })

  it('handles invalid JSON in localStorage gracefully', () => {
    localStorage.setItem('key', 'invalid-json')
    const { result } = renderHook(() => useLocalStorage('key', 'default'))
    expect(result.current[0]).toBe('default')
  })
})
