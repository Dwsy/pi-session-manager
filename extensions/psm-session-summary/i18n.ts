import type { PsmPluginI18nResources } from '@pi-session-manager/plugin-sdk'

export const sessionSummaryI18n: PsmPluginI18nResources = {
  'en-US': {
    session: {
      intelligence: {
        title: 'Session intelligence',
        shortLabel: 'AI',
        noSummary: 'No summary',
        updatedAt: 'Updated {{time}}',
        refresh: 'Refresh',
        generate: 'Generate',
        loading: 'Loading intelligence...',
        summary: 'Summary',
        noSummaryText: 'No summary text.',
        objective: 'Objective',
        status: 'Status',
        confidence: 'Confidence',
        messages: 'Messages',
        model: 'Model',
        topics: 'Topics',
        nextSteps: 'Next steps',
        unresolved: 'Unresolved',
        empty: 'No AI summary has been generated for this session yet.',
      },
    },
    common: { close: 'Close' },
  },
  'zh-CN': {
    session: {
      intelligence: {
        title: '会话智能',
        shortLabel: 'AI',
        noSummary: '暂无摘要',
        updatedAt: '{{time}} 更新',
        refresh: '刷新',
        generate: '生成',
        loading: '正在加载会话智能...',
        summary: '摘要',
        noSummaryText: '暂无摘要文本。',
        objective: '目标',
        status: '状态',
        confidence: '置信度',
        messages: '消息数',
        model: '模型',
        topics: '主题',
        nextSteps: '下一步',
        unresolved: '未解决',
        empty: '此会话尚未生成 AI 摘要。',
      },
    },
    common: { close: '关闭' },
  },
}
