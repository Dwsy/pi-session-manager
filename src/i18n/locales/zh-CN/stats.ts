export const stats = {
  panel: {
    title: '分析仪表板',
    subtitle: 'session洞察和活动指标',
    loading: '加载分析数据中...',
    noData: '无统计数据可用',
    tabs: {
      overview: '概览',
      activity: '活动',
      projects: 'project',
      time: '时间',
      tokens: '令牌',
      productivity: '生产力',
      achievements: '成就',
    },
    tooltips: {
      refresh: '刷新',
      export: '导出',
      settings: '设置',
      close: '关闭',
    },
  },
  cards: {
    totalSessions: '总session数',
    totalMessages: '总message数',
    avgPerSession: '平均/session',
    activeDays: '活跃天数',
    sessions: 'session',
    messages: 'message',
  },
  activity: {
    title: '活动等级',
    levels: {
      veryHigh: '非常高',
      high: '高',
      medium: '中',
      low: '低',
      veryLow: '非常低',
    },
  },
  time: {
    hourly: '每小时活动',
    weekly: '每周活动',
    monthly: '每月活动',
  },
  productivity: {
    title: 'session洞察',
    totalSessions: '总session数',
    totalMessages: '总message数',
    messagesPerSession: 'message/session',
    userMessages: '用户message',
    assistantMessages: '助手message',
  },
  achievements: {
    title: '成就',
  },
} as const