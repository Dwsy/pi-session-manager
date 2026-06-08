import { describe, expect, it } from 'vitest'

import { resolveCustomMessageRendererKind } from './customMessageAdapters'

describe('resolveCustomMessageRendererKind', () => {
  it('routes supported subagent custom message types to subagent renderer', () => {
    expect(resolveCustomMessageRendererKind('subagent_result')).toBe('subagent')
    expect(resolveCustomMessageRendererKind('subagent-notify')).toBe('subagent')
    expect(resolveCustomMessageRendererKind('subagent-slash-result')).toBe('subagent')
  })

  it('falls back to default renderer for unrelated message types', () => {
    expect(resolveCustomMessageRendererKind('quality_gate')).toBe('default')
    expect(resolveCustomMessageRendererKind(undefined)).toBe('default')
  })
})
