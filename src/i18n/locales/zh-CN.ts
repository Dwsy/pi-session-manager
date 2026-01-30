export const zhCN = {
  common: {
    loading: '加载中...',
    cancel: '取消',
    save: '保存',
    delete: '删除',
    rename: '重命名',
    export: '导出',
    search: '搜索',
    searchPlaceholder: '搜索会话...',
    searching: '搜索中...',
    results: '个结果',
    result: '个结果',
    noData: '无可用数据',
    back: '返回',
    refresh: '刷新',
    close: '关闭',
    settings: '设置',
    messages: '条消息',
    session: '会话',
    sessions: '会话',
    projects: '项目',
    project: '项目',
    untitled: '未命名',
  },
  app: {
    title: 'Pi 会话管理器',
    subtitle: '选择一个会话查看详情',
    viewMode: {
      list: '列表视图',
      directory: '目录视图',
      project: '项目视图',
    },
    shortcuts: {
      refresh: '刷新会话列表 (Cmd+R)',
      search: '聚焦搜索框 (Cmd+F)',
      stats: '打开统计面板 (Cmd+Shift+S)',
      close: '关闭 (Esc)',
    },
    errors: {
      loadSessions: '加载会话失败',
      deleteSession: '删除会话失败',
      renameSession: '重命名会话失败',
      exportFailed: '导出失败',
      exportSuccess: '导出成功！',
    },
    confirm: {
      deleteSession: '确定要删除会话 "{name}" 吗？',
    },
  },
  session: {
    list: {
      empty: '未找到会话',
      loading: '加载会话中...',
      untitled: '未命名会话',
      unknownDirectory: '未知目录',
      messages: '条消息',
    },
    viewer: {
      loading: '加载会话中...',
      error: '加载会话出错',
      empty: '此会话中没有消息',
      rename: '重命名',
      export: '导出',
    },
    rename: {
      title: '重命名会话',
      placeholder: '输入会话名称...',
    },
  },
  project: {
    list: {
      loading: '加载项目中...',
      empty: '未找到项目',
      count: '{count} 个项目',
      sessions: '个会话',
      backToProjects: '返回项目列表',
      unknownDirectory: '未知目录',
    },
  },
  search: {
    panel: {
      placeholder: '搜索会话...',
      searching: '搜索中...',
      results: '{count} 个结果',
    },
  },
  export: {
    dialog: {
      title: '导出会话',
      formats: {
        html: {
          label: 'HTML',
          description: '带格式化的网页',
        },
        md: {
          label: 'Markdown',
          description: '带 Markdown 格式的纯文本',
        },
        json: {
          label: 'JSON',
          description: '原始数据格式',
        },
      },
    },
  },
  stats: {
    panel: {
      title: '分析仪表板',
      subtitle: '会话洞察和活动指标',
      loading: '加载分析数据中...',
      noData: '无统计数据可用',
      tabs: {
        overview: '概览',
        activity: '活动',
        projects: '项目',
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
      totalSessions: '总会话数',
      totalMessages: '总消息数',
      avgPerSession: '平均/会话',
      activeDays: '活跃天数',
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
      title: '会话洞察',
      totalSessions: '总会话数',
      totalMessages: '总消息数',
      messagesPerSession: '消息/会话',
      userMessages: '用户消息',
      assistantMessages: '助手消息',
    },
    achievements: {
      title: '成就',
    },
  },
  dashboard: {
    statCard: {
      change: '变化',
    },
    activityTrend: {
      title: '活动趋势',
      messages: '消息',
    },
    messageDistribution: {
      title: '消息分布',
      user: '用户',
      assistant: '助手',
      tools: '工具',
      system: '系统',
    },
    projectsChart: {
      title: '热门项目',
      sessions: '会话',
    },
    topModels: {
      title: '热门模型',
      sessions: '会话',
    },
    timeDistribution: {
      title: '时间分布',
    },
    recentSessions: {
      title: '最近会话',
    },
    sessionLength: {
      title: '会话长度分布',
      sessions: '会话',
      messages: '消息',
    },
    tokenStats: {
      title: '令牌统计',
      totalTokens: '总令牌数',
      avgTokensPerMessage: '平均令牌/消息',
      userTokens: '用户令牌',
      assistantTokens: '助手令牌',
      systemTokens: '系统令牌',
    },
    weeklyComparison: {
      title: '周对比',
      thisWeek: '本周',
      lastWeek: '上周',
      sessions: '会话',
      messages: '消息',
      change: '变化',
    },
    productivityMetrics: {
      title: '生产力指标',
      avgSessionLength: '平均会话长度',
      avgMessagesPerDay: '平均消息/天',
      mostActiveDay: '最活跃日',
      mostActiveHour: '最活跃时段',
      streak: '当前连续',
      longestStreak: '最长连续',
    },
    achievements: {
      title: '成就',
      firstSession: '首次会话',
      powerUser: '超级用户',
      consistency: '坚持不懈',
      explorer: '探索者',
      nightOwl: '夜猫子',
      earlyBird: '早起鸟',
    },
  },
  languageSwitcher: {
    title: '语言',
    en: 'English',
    zh: '中文',
  },
} as const

export type Translations = typeof zhCN