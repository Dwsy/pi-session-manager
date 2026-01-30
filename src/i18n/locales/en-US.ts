export const enUS = {
  common: {
    loading: 'Loading...',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    rename: 'Rename',
    export: 'Export',
    search: 'Search',
    searchPlaceholder: 'Search sessions...',
    searching: 'Searching...',
    results: 'results',
    result: 'result',
    noData: 'No data available',
    back: 'Back',
    refresh: 'Refresh',
    close: 'Close',
    settings: 'Settings',
    messages: 'messages',
    session: 'Session',
    sessions: 'Sessions',
    projects: 'Projects',
    project: 'Project',
    untitled: 'Untitled',
  },
  app: {
    title: 'Pi Session Manager',
    subtitle: 'Select a session to view details',
    viewMode: {
      list: 'List view',
      directory: 'Directory view',
      project: 'Project view',
    },
    shortcuts: {
      refresh: 'Refresh session list (Cmd+R)',
      search: 'Focus search (Cmd+F)',
      stats: 'Open statistics (Cmd+Shift+S)',
      close: 'Close (Esc)',
    },
    errors: {
      loadSessions: 'Failed to load sessions',
      deleteSession: 'Failed to delete session',
      renameSession: 'Failed to rename session',
      exportFailed: 'Export failed',
      exportSuccess: 'Export successful!',
    },
    confirm: {
      deleteSession: 'Delete session "{name}"?',
    },
  },
  session: {
    list: {
      empty: 'No sessions found',
      loading: 'Loading sessions...',
      untitled: 'Untitled Session',
      unknownDirectory: 'Unknown directory',
      messages: 'messages',
    },
    viewer: {
      loading: 'Loading session...',
      error: 'Error loading session',
      empty: 'No messages found in this session',
      rename: 'Rename',
      export: 'Export',
    },
    rename: {
      title: 'Rename Session',
      placeholder: 'Enter session name...',
    },
  },
  project: {
    list: {
      loading: 'Loading projects...',
      empty: 'No projects found',
      count: '{count} projects',
      sessions: 'sessions',
      backToProjects: 'Back to projects',
      unknownDirectory: 'Unknown Directory',
    },
  },
  search: {
    panel: {
      placeholder: 'Search sessions...',
      searching: 'Searching...',
      results: '{count} result{count, plural, =1 {} other{s}}',
    },
  },
  export: {
    dialog: {
      title: 'Export Session',
      formats: {
        html: {
          label: 'HTML',
          description: 'Styled web page with formatting',
        },
        md: {
          label: 'Markdown',
          description: 'Plain text with markdown formatting',
        },
        json: {
          label: 'JSON',
          description: 'Raw data format',
        },
      },
    },
  },
  stats: {
    panel: {
      title: 'Analytics Dashboard',
      subtitle: 'Session insights and activity metrics',
      loading: 'Loading analytics...',
      noData: 'No statistics data available',
      tabs: {
        overview: 'Overview',
        activity: 'Activity',
        projects: 'Projects',
        time: 'Time',
        tokens: 'Tokens',
        productivity: 'Productivity',
        achievements: 'Achievements',
      },
      tooltips: {
        refresh: 'Refresh',
        export: 'Export',
        settings: 'Settings',
        close: 'Close',
      },
    },
    cards: {
      totalSessions: 'Total Sessions',
      totalMessages: 'Total Messages',
      avgPerSession: 'Avg/Session',
      activeDays: 'Active Days',
    },
    activity: {
      title: 'Activity Levels',
      levels: {
        veryHigh: 'Very High',
        high: 'High',
        medium: 'Medium',
        low: 'Low',
        veryLow: 'Very Low',
      },
    },
    time: {
      hourly: 'Hourly Activity',
      weekly: 'Weekly Activity',
      monthly: 'Monthly Activity',
    },
    productivity: {
      title: 'Session Insights',
      totalSessions: 'Total Sessions',
      totalMessages: 'Total Messages',
      messagesPerSession: 'Messages/Session',
      userMessages: 'User Messages',
      assistantMessages: 'Assistant Messages',
    },
    achievements: {
      title: 'Achievements',
    },
  },
  dashboard: {
    statCard: {
      change: 'Change',
    },
    activityTrend: {
      title: 'Activity Trend',
      messages: 'Messages',
    },
    messageDistribution: {
      title: 'Message Distribution',
      user: 'User',
      assistant: 'Assistant',
      tools: 'Tools',
      system: 'System',
    },
    projectsChart: {
      title: 'Top Projects',
      sessions: 'Sessions',
    },
    topModels: {
      title: 'Top Models',
      sessions: 'Sessions',
    },
    timeDistribution: {
      title: 'Time Distribution',
    },
    recentSessions: {
      title: 'Recent Sessions',
      noRecentSessions: 'No recent sessions',
    },
    sessionLength: {
      title: 'Session Length Distribution',
      sessions: 'Sessions',
      messages: 'Messages',
    },
    tokenStats: {
      title: 'Token Statistics',
      totalTokens: 'Total Tokens',
      avgTokensPerMessage: 'Avg Tokens/Message',
      userTokens: 'User Tokens',
      assistantTokens: 'Assistant Tokens',
      systemTokens: 'System Tokens',
    },
    weeklyComparison: {
      title: 'Weekly Comparison',
      thisWeek: 'This Week',
      lastWeek: 'Last Week',
      sessions: 'Sessions',
      messages: 'Messages',
      change: 'Change',
    },
    productivityMetrics: {
      title: 'Productivity Metrics',
      avgSessionLength: 'Avg Session Length',
      avgMessagesPerDay: 'Avg Messages/Day',
      mostActiveDay: 'Most Active Day',
      mostActiveHour: 'Most Active Hour',
      streak: 'Current Streak',
      longestStreak: 'Longest Streak',
    },
    achievements: {
      title: 'Achievements',
      firstSession: 'First Session',
      powerUser: 'Power User',
      consistency: 'Consistency',
      explorer: 'Explorer',
      nightOwl: 'Night Owl',
      earlyBird: 'Early Bird',
    },
    activityLevels: {
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    },
    msgs: 'msgs',
  },
  languageSwitcher: {
    title: 'Language',
    en: 'English',
    zh: '中文',
  },
} as const

export type Translations = typeof enUS