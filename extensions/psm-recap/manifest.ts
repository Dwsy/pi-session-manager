import type { PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.recap',
  name: 'Recap',
  version: '0.1.0',
  permissions: ['sessions:read'],
  i18n: {
    'en-US': {
      plugins: {
        recap: {
          week: 'Recap: this week',
          month: 'Recap: this month',
          quarter: 'Recap: this quarter',
          midyear: 'Recap: first half of the year',
          year: 'Recap: this year',
          description: 'Open the story-style look back at this period',
        },
      },
    },
    'zh-CN': {
      plugins: {
        recap: {
          week: '回顾：本周',
          month: '回顾：本月',
          quarter: '回顾：本季度',
          midyear: '回顾：上半年',
          year: '回顾：今年',
          description: '打开该时间段的故事式回顾',
        },
      },
    },
  },
}

export default manifest
