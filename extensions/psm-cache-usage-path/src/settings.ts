import type { PsmPluginConfiguration } from '../../../packages/runtime-sdk/src'

export const cacheUsageConfiguration: PsmPluginConfiguration = {
  title: 'Cache Usage',
  description: 'Show cache hit trends, branch vs tree totals, and recent assistant cache metrics.',
  properties: [
    {
      key: 'recentTurns',
      title: 'Recent turns',
      description: 'How many recent assistant turns to show in the recent list.',
      type: 'number',
      default: 8,
      min: 3,
      max: 20,
      step: 1,
    },
  ],
}
