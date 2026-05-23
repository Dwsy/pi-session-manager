import type { PsmPluginI18nResources } from '@pi-session-manager/plugin-sdk'

export const sessionSummaryI18n: PsmPluginI18nResources = {
  'en-US': {
    session: {
      intelligence: {
        title: 'Session intelligence',
        shortLabel: 'AI',
        noSummary: 'No summary',
        emptyTitle: 'No AI summary yet',
        updatedAt: 'Updated {{time}}',
        refresh: 'Refresh',
        generate: 'Generate',
        loading: 'Loading intelligence...',
        language: 'Language',
        languageAuto: 'Auto',
        whatYouWillGet: 'What you will get',
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
    plugins: {
      builtin: {
        'session-summary': {
          configuration: {
            title: 'AI Session Summary Settings',
            description: 'Controls generation defaults and what the session intelligence side panel displays.',
          },
          settings: {
            provider: { title: 'Default provider', description: 'Optional provider override. Leave empty for host auto selection.' },
            model: { title: 'Default model', description: 'Optional model override. Leave empty for host auto selection.' },
            language: { title: 'Summary language', options: { auto: 'Auto', 'en-US': 'English', 'zh-CN': 'Simplified Chinese', 'ja-JP': 'Japanese' } },
            autoOpenAfterRefresh: { title: 'Open result after refresh' },
            showMetadata: { title: 'Show metadata tiles' },
            showTopics: { title: 'Show topics' },
            showNextSteps: { title: 'Show next steps' },
            showUnresolved: { title: 'Show unresolved tasks' },
          },
        },
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
        emptyTitle: '尚未生成 AI 摘要',
        updatedAt: '{{time}} 更新',
        refresh: '刷新',
        generate: '生成',
        loading: '正在加载会话智能...',
        language: '语言',
        languageAuto: '自动',
        whatYouWillGet: '生成内容',
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
    plugins: {
      builtin: {
        'session-summary': {
          configuration: {
            title: 'AI 会话摘要设置',
            description: '控制摘要生成默认值，以及会话智能侧边栏显示哪些内容。',
          },
          settings: {
            provider: { title: '默认供应商', description: '可选供应商覆盖。留空则由主程序自动选择。' },
            model: { title: '默认模型', description: '可选模型覆盖。留空则由主程序自动选择。' },
            language: { title: '摘要语言', options: { auto: '自动', 'en-US': '英语', 'zh-CN': '简体中文', 'ja-JP': '日语' } },
            autoOpenAfterRefresh: { title: '刷新后打开结果' },
            showMetadata: { title: '显示元数据卡片' },
            showTopics: { title: '显示主题' },
            showNextSteps: { title: '显示下一步' },
            showUnresolved: { title: '显示未解决任务' },
          },
        },
      },
    },
    common: { close: '关闭' },
  },
}
