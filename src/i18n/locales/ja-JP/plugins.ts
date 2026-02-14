export const plugins = {
  session: {
    name: 'セッション検索',
    description: 'セッション名とメタデータを検索',
  },
  project: {
    name: 'プロジェクト検索',
    description: 'プロジェクトパスを検索',
  },
  message: {
    name: 'メッセージ検索',
    description: 'ユーザーメッセージとアシスタント返信を検索',
  },
} as const
