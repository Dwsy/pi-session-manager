export const stats = {
  panel: {
    title: '分析ダッシュボード',
    subtitle: 'セッションの洞察とアクティビティ指標',
    loading: '分析データ読み込み中...',
    noData: '統計データがありません',
    tabs: {
      overview: '概要',
      activity: 'アクティビティ',
      projects: 'プロジェクト',
      time: '時間',
      tokens: 'トークン',
      productivity: '生産性',
      achievements: '実績',
    },
    tooltips: {
      refresh: '更新',
      export: 'エクスポート',
      settings: '設定',
      close: '閉じる',
    },
  },
  cards: {
    totalSessions: '総セッション数',
    totalMessages: '総メッセージ数',
    avgPerSession: '平均/セッション',
    activeDays: 'アクティブ日数',
    sessions: 'セッション',
    messages: 'メッセージ',
  },
  activity: {
    title: 'アクティビティレベル',
    levels: {
      veryHigh: '非常に高い',
      high: '高い',
      medium: '普通',
      low: '低い',
      veryLow: '非常に低い',
    },
  },
  time: {
    hourly: '時間別アクティビティ',
    weekly: '週別アクティビティ',
    monthly: '月別アクティビティ',
  },
  productivity: {
    title: 'セッション洞察',
    totalSessions: '総セッション数',
    totalMessages: '総メッセージ数',
    messagesPerSession: 'メッセージ/セッション',
    userMessages: 'ユーザーメッセージ',
    assistantMessages: 'アシスタントメッセージ',
  },
  achievements: {
    title: '実績',
  },
} as const
