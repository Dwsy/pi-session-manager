import type { PsmPluginConfiguration } from '@pi-session-manager/plugin-sdk'

export const codeReviewConfiguration: PsmPluginConfiguration = {
  title: 'Code Review Settings',
  description: 'Controls how diffs are displayed in the code review modal. These settings are independent from the global appearance settings.',
  properties: [
    {
      key: 'diffView',
      title: 'Default View Style',
      description: 'Side-by-side split view or unified inline view',
      type: 'select',
      default: 'split',
      options: [
        { label: 'Split (Side-by-side)', value: 'split' },
        { label: 'Unified (Inline)', value: 'unified' },
      ],
    },
    {
      key: 'diffLineDiffType',
      title: 'Line Diff Granularity',
      description: 'Granularity of diff highlighting: full lines, words, or characters',
      type: 'select',
      default: 'words',
      options: [
        { label: 'Words', value: 'words' },
        { label: 'Characters', value: 'chars' },
        { label: 'Full Lines', value: 'full' },
      ],
    },
    {
      key: 'diffLineNumbers',
      title: 'Show Line Numbers',
      description: 'Display line numbers in diff views',
      type: 'boolean',
      default: true,
    },
    {
      key: 'diffWrap',
      title: 'Wrap Long Lines',
      description: 'Wrap long lines instead of horizontal scrolling',
      type: 'boolean',
      default: false,
    },
    {
      key: 'diffIndicators',
      title: 'Show +/- Indicators',
      description: 'Show +/− indicators for added and removed lines',
      type: 'boolean',
      default: true,
    },
    {
      key: 'diffExpandUnchanged',
      title: 'Expand Unchanged Lines',
      description: 'Expand unchanged regions in diff views by default',
      type: 'boolean',
      default: false,
    },
  ],
}
