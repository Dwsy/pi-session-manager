export const app = {
  title: 'Pi セッションマネージャー',
  subtitle: 'セッションを選択して詳細を表示',
  projects: 'プロジェクト',
  demoMode: 'デモモード',
  demoModeDescription: 'デモデータで全機能を体験',
  viewMode: {
    list: 'リスト表示',
    project: 'プロジェクト表示',
  },
  shortcuts: {
    resume: 'セッション再開 (Cmd+R)',
    exportHtml: 'エクスポート＆開く (Cmd+E)',
    deleteSelected: '選択したセッションを削除 (Cmd+Backspace)',
    projectView: 'プロジェクト表示 (Cmd+Shift+G)',
    searchAll: 'グローバル検索 (Cmd+P / Cmd+Shift+F)',
    search: 'セッション内検索 (Cmd+F)',
    settings: '設定を開く (Cmd+,)',
    close: '閉じる (Esc)',
  },
  errors: {
    loadSessions: 'セッションの読み込みに失敗',
    deleteSession: 'セッションの削除に失敗',
    deleteSessionPartial: '{{count}} 件のセッションを削除できませんでした。詳細はコンソールを確認してください。',
    renameSession: 'セッションの名前変更に失敗',
    exportFailed: 'エクスポートに失敗',
    exportSuccess: 'エクスポート成功',
  },
  confirm: {
    deleteSession: 'セッション「{name}」を削除しますか？',
    deleteSessions: '選択した {{count}} 件のセッションを削除しますか？',
    deleteIrreversible: 'この操作は元に戻せません。',
  },
  splash: {
    scanning: 'セッションをスキャン中...',
    firstLaunchHint: '初回起動時はしばらくお待ちください',
  },
} as const
