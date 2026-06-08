export type CustomMessageRendererKind = 'subagent' | 'default'

const SUBAGENT_CUSTOM_TYPES = new Set([
  'subagent_result',
  'subagent-notify',
  'subagent-slash-result',
])

export function resolveCustomMessageRendererKind(customType?: string): CustomMessageRendererKind {
  if (customType && SUBAGENT_CUSTOM_TYPES.has(customType)) {
    return 'subagent'
  }
  return 'default'
}
