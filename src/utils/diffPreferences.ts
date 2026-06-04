import type { AppSettings } from '@/components/settings/types'

export function normalizeDiffView(value: unknown): AppSettings['appearance']['diffView'] {
  if (value === 'unified' || value === 'stacked') return 'unified'
  return 'split'
}

export function getDiffRenderOptions(appearance: AppSettings['appearance']) {
  return {
    diffStyle: normalizeDiffView(appearance.diffView),
    overflow: appearance.diffWrap ? 'wrap' : 'scroll',
    disableLineNumbers: !appearance.diffLineNumbers,
    lineDiffType: appearance.diffLineDiffType,
    diffIndicators: appearance.diffIndicators,
    expandUnchanged: appearance.diffExpandUnchanged,
  } as const
}
