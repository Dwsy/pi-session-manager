import { describe, expect, it } from 'vitest'
import { getLayoutMode } from './useIsMobile'

describe('getLayoutMode', () => {
  it.each([
    [767, 'mobile'],
    [768, 'compact'],
    [911, 'compact'],
    [1093, 'compact'],
    [1119, 'compact'],
    [1120, 'desktop'],
  ])('maps %i logical pixels to %s', (width, expected) => {
    expect(getLayoutMode(width)).toBe(expected)
  })
})
