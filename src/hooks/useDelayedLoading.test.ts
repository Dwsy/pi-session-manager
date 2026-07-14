// @vitest-environment jsdom

import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi, afterEach } from 'vitest'
import {
  DEFAULT_DELAYED_LOADING_MS,
  useDelayedLoading,
} from './useDelayedLoading'

describe('useDelayedLoading', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stays false until delay elapses while loading', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ loading }) => useDelayedLoading(loading),
      { initialProps: { loading: true } },
    )

    expect(result.current).toBe(false)
    act(() => {
      vi.advanceTimersByTime(DEFAULT_DELAYED_LOADING_MS - 1)
    })
    expect(result.current).toBe(false)

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe(true)

    rerender({ loading: false })
    expect(result.current).toBe(false)
  })

  it('never shows when loading finishes before delay', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ loading }) => useDelayedLoading(loading, 500),
      { initialProps: { loading: true } },
    )

    act(() => {
      vi.advanceTimersByTime(200)
    })
    rerender({ loading: false })
    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe(false)
  })
})