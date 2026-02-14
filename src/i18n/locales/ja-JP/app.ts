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
    projectView: 'プロジェクト表示 (Cmd+P)',
    searchAll: '全セッション検索 (Cmd+K)',
    search: '検索にフォーカス (Cmd+F)',
    settings: '設定を開く (Cmd+,)',
    close: '閉じる (Esc)',
  },
  errors: {
    loadSessions: 'セッションの読み込みに失敗',
    deleteSession: 'セッションの削除に失敗',
    renameSession: 'セッションの名前変更に失敗',
    exportFailed: 'エクスポートに失敗',
    exportSuccess: 'エクスポート成功！',
  },
  confirm: {
    deleteSession: 'セッション「{name}」を削除しますか？',
  },
} as const
