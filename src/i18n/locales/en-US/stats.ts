export const stats = {
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
    sessions: 'Sessions',
    messages: 'Messages',
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
} as const