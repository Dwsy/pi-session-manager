export const onboarding = {
  subtitle: '初回起動セットアップ',
  progressLabel: 'オンボーディングの手順',
  stepProgress: 'ステップ {{current}} / {{total}}',
  skip: 'スキップ',
  next: '次へ',
  prev: '戻る',
  finish: '使い始める',
  steps: {
    welcome: {
      title: 'セッションライブラリ',
      description:
        'Pi Session Manager はこの端末をすでにスキャンしました。見つかった内容です。',
      stats: {
        sessions: 'セッション',
        projects: 'プロジェクト',
        since: '最も古い記録',
      },
      scanning: 'セッションをスキャン中…',
      topProjectsTitle: '活発なプロジェクト',
      topProjectsEmpty:
        'まだセッションが見つかりません。次のステップでソースを追加すると、ここに表示されます。',
      sessionCount: '{{count}} セッション',
    },
    sources: {
      title: 'セッションのソース',
      description:
        'ライブラリに含めるコーディングエージェントを選びます。設定からいつでも変更できます。',
      piTitle: 'Pi セッション',
      piDescription: '既定の Pi セッションディレクトリは常にライブラリに含まれます。',
      alwaysOn: '常にスキャン',
      supportedTitle: 'PSM がスキャンできるエージェント',
      detectedTitle: 'この端末で見つかった他のエージェント',
      detectedDescription:
        '各エージェントのセッションディレクトリを探して検出しています。有効にすると、一覧・検索・変換の対象になります。',
      selectedCount: '{{total}} 件中 {{selected}} 件を有効化',
      enabled: '対象',
      disabled: '対象外',
      noneTitle: 'Pi セッションのみ見つかりました',
      noneDescription:
        'Claude Code、Codex、Cursor などはこの端末にセッションができると表示されます。独自のディレクトリは後から設定で追加できます。',
    },
    appearance: {
      title: '外観と言語',
      description: '変更はすぐに反映されるので、結果を見ながら選べます。',
      themeLabel: 'テーマ',
      themes: {
        dark: 'ダーク',
        light: 'ライト',
        system: 'システム',
      },
      themeHints: {
        dark: 'Tokyo Night 系の配色',
        light: '明るく高コントラスト',
        system: 'OS の設定に従う',
      },
      fontSizeLabel: '文字サイズ',
      fontSizeHint: 'アプリ全体にすぐ適用されます。',
      fontSizes: {
        small: '小',
        medium: '中',
        large: '大',
      },
      languageLabel: '言語',
      previewLabel: 'ライブプレビュー',
      preview: {
        sidebar: 'セッション',
        userMessage: 'ビルドが失敗するのはなぜ？',
        assistantMessage:
          'バンドラーがエイリアスを解決できていません。設定を確認します。',
        toolResult: 'ビルド完了 1.24s',
      },
    },
    ready: {
      title: '準備完了',
      description: 'よく使うショートカットと、さらに細かく設定したいときの入口です。',
      shortcutsTitle: '覚えておきたいショートカット',
      shortcuts: {
        palette: 'コマンドパレット',
        search: '全セッションを検索',
        inSessionSearch: 'このセッション内を検索',
        sidebar: 'サイドバーの表示切替',
        projectView: 'プロジェクト別に表示',
        terminal: 'ターミナルの表示切替',
        settings: '設定を開く',
        resume: 'セッションを再開',
      },
      nextTitle: 'あとで調整',
      links: {
        sources: {
          title: 'セッションのソース',
          description: '独自ディレクトリ、データセット、外部エージェント',
        },
        server: {
          title: 'サーバーとアクセス',
          description: 'HTTP と WebSocket のポート、スマホからの LAN アクセス',
        },
        plugins: {
          title: 'プラグイン',
          description: '内蔵プラグインの有効化や新規インストール',
        },
      },
    },
  },
} as const
