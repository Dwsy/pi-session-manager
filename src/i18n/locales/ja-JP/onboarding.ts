export const onboarding = {
  skip: 'スキップ',
  next: '次へ',
  prev: '戻る',
  finish: '始める',
  steps: {
    welcome: {
      title: 'Pi セッションマネージャーへようこそ',
      description: 'Pi AI コーディングセッションの閲覧、検索、管理のための強力なツールです。主要機能を簡単にご紹介します。',
    },
    browse: {
      title: 'プロジェクト別にセッションを閲覧',
      description: 'すべてのコーディングセッションはプロジェクトごとに整理されています。リスト表示とプロジェクト表示を切り替えて、必要なセッションをすばやく見つけましょう。',
      hint: 'Cmd+P でプロジェクト表示に切替',
    },
    search: {
      title: '全セッション横断検索',
      description: 'グローバル検索でワークスペース全体のメッセージ、セッション、プロジェクトを検索できます。セッション内検索で個別の会話内をすばやく検索できます。',
      hint: 'Cmd+K でグローバル検索、Cmd+F でセッション内検索',
    },
    tree: {
      title: 'セッションツリーをナビゲート',
      description: 'サイドバーのツリー表示で会話の流れを確認できます。矢印をクリックしてセクションを折りたたみ・展開し、重要な部分に集中しましょう。',
      hint: 'ノードをクリックでメッセージにジャンプ、矢印で折りたたみ/展開',
    },
    settings: {
      title: '体験をカスタマイズ',
      description: 'テーマ、フォントサイズ、コードブロックスタイル、エクスポート形式などを調整できます。ワークフローに合わせてすべて設定可能です。',
      hint: 'Cmd+, でいつでも設定を開く',
    },
    services: {
      title: 'サービスと機能の設定',
      description: '有効にするサービスを選択します。WebSocket と HTTP API で外部ツールが接続でき、内蔵ターミナルでアプリ内から直接操作できます。',
      terminal: '内蔵ターミナル',
      terminalHint: 'アプリ内でターミナルを直接使用',
      bindLocal: 'ローカルアクセスのみ',
      bindRemote: 'LAN デバイス（スマホ/タブレット）の接続を許可',
      mobileHint: 'モバイルからブラウザで http://<PC の IP>:52131 にアクセス — HTTP モードが自動選択されます',
      websocket: 'WebSocket',
      httpApi: 'HTTP API',
    },
  },
} as const
