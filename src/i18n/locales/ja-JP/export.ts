export const exportModule = {
  dialog: {
    title: 'セッションをエクスポート',
    untitledSession: '無題のセッション',
    formats: {
      html: {
        name: 'HTML',
        description: 'フォーマット付きウェブページ',
      },
      md: {
        name: 'Markdown',
        description: 'Markdown 形式のプレーンテキスト',
      },
      json: {
        name: 'JSON',
        description: '生データ形式',
      },
    },
  },
  cancel: 'キャンセル',
} as const
