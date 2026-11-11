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
  builtin: {
    'code-review': {
      name: 'コードレビュー',
      configuration: {
        title: 'コードレビュー設定',
        description: 'コードレビューモーダルでの diff 表示方法を制御します。これらの設定はグローバルな外観設定とは独立しています。',
      },
      settings: {
        diffView: {
          title: 'デフォルトの表示スタイル',
          description: '並列の分割ビューまたはインラインの統合ビュー',
          options: {
            split: '分割（並列）',
            unified: '統合（インライン）',
          },
        },
        diffLineDiffType: {
          title: '行差分の粒度',
          description: '差分ハイライトの粒度：行全体、単語、文字',
          options: {
            words: '単語',
            chars: '文字',
            full: '行全体',
          },
        },
        diffLineNumbers: {
          title: '行番号を表示',
          description: 'diff ビューに行番号を表示します',
        },
        diffWrap: {
          title: '長い行を折り返す',
          description: '横スクロールの代わりに長い行を折り返します',
        },
        diffIndicators: {
          title: '+/− インジケータを表示',
          description: '追加・削除された行に +/− インジケータを表示します',
        },
        diffExpandUnchanged: {
          title: '変更のない行を展開',
          description: 'diff ビューで変更のない領域をデフォルトで展開します',
        },
        interceptExpand: {
          title: 'ツール呼び出し展開をインターセプト',
          description: 'レビュー可能なツール呼び出しを会話ビューで展開せず、レビューポップアップで開きます',
        },
      },
    },
    'semantic-search': {
      name: 'セマンティック検索',
      configuration: {
        title: 'セマンティック検索設定',
        description: 'インデックスのスコープや AI によるクエリ拡張など、セマンティック検索の主要オプションを制御します。',
      },
      settings: {
        defaultScope: {
          title: 'デフォルトの検索スコープ',
          description: 'セマンティック検索のデフォルトスコープ',
          options: {
            project: '現在のプロジェクト',
            global: 'すべてのプロジェクト',
          },
        },
        maxResults: {
          title: '最大結果数',
          description: '表示する検索結果の最大数',
        },
        enableAiExpansion: {
          title: 'AI クエリ拡張',
          description: 'AI を使って検索クエリを同義語・関連語で拡張します',
        },
        provider: {
          title: 'エージェントのモデルプロバイダー',
          description: 'セマンティック検索エージェントが使用するプロバイダー。空にするとホストのデフォルトを使用します。',
        },
        model: {
          title: 'エージェントのモデル',
          description: 'セマンティック検索エージェントが使用するモデル。空にするとホストのデフォルトを使用します。',
        },
      },
    },
    'session-summary': {
      name: 'AI セッション要約',
      configuration: {
        title: 'AI セッション要約設定',
        description: '生成のデフォルト値と、セッションインテリジェンスサイドパネルの表示内容を制御します。',
      },
      settings: {
        provider: {
          title: 'デフォルトプロバイダー',
          description: '任意のプロバイダー上書き。空にするとホストが自動選択します。',
        },
        model: {
          title: 'デフォルトモデル',
          description: '任意のモデル上書き。空にするとホストが自動選択します。',
        },
        language: {
          title: '要約の言語',
          description: '生成する要約の対象言語',
          options: {
            auto: '自動',
            'en-US': 'English',
            'zh-CN': '简体中文',
            'ja-JP': '日本語',
          },
        },
        autoOpenAfterRefresh: {
          title: '更新後に結果を開く',
          description: '要約生成後にパネルを自動表示します',
        },
        showMetadata: {
          title: 'メタデータタイルを表示',
          description: 'サイズ・ブランチ・トークンなどに関するメタデータタイルを表示します',
        },
        showTopics: {
          title: 'トピックを表示',
          description: 'セッションで検出されたトピックを表示します',
        },
        showNextSteps: {
          title: '次のステップを表示',
          description: '推奨される次のアクションを表示します',
        },
        showUnresolved: {
          title: '未解決タスクを表示',
          description: 'セッション内の未解決のコードタスクを表示します',
        },
      },
    },
    sidechat: {
      name: 'サイドチャット',
      configuration: {
        title: 'サイドチャット設定',
        description: 'セッションのサイドチャットパネルと sidechat コマンドで使用されるデフォルト値です。',
      },
      settings: {
        provider: {
          title: 'デフォルトプロバイダー',
          description: '任意のプロバイダー上書き。空にするとホストが自動選択します。',
        },
        model: {
          title: 'デフォルトモデル',
          description: '任意のモデル上書き。空にするとホストが自動選択します。',
        },
        thinkingLevel: {
          title: '思考レベル',
          description: '推論出力のレベル',
          options: {
            off: 'オフ',
            minimal: '最小',
            low: '低',
            medium: '中',
            high: '高',
            xhigh: '超高',
          },
        },
        snippetLimit: {
          title: 'スニペット上限',
          description: '各回答で取得する引用・スニペットの数です。',
        },
        panelWidth: {
          title: 'パネル幅',
          description: '右パネルのデフォルト幅（ピクセル）です。',
        },
        optionsExpanded: {
          title: 'デフォルトでオプションを表示',
          description: 'モデルパラメータ設定をデフォルトで表示します',
        },
        showQuickPrompts: {
          title: 'クイックプロンプトを表示',
          description: 'ワンクリックで使える便利なクイックアクション候補を表示します',
        },
      },
    },
    'generative-ui-renderer': {
      name: '生成 UI レンダラー',
      configuration: {
        title: '生成 UI レンダラー',
        description: '組み込み・ローカルプラグインがセッション内でリッチな生成ウィジェットやウィンドウをレンダリングできるようにします。',
      },
    },
    'kanban-board': {
      name: 'カンバンボード',
      configuration: {
        title: 'カンバンボード',
        description: 'プロジェクト・タグ・期間でグループ化したビジュアルボードでセッションを表示・管理します。',
      },
    },
    'session-graph': {
      name: 'セーショングラフ',
      configuration: {
        title: 'セーショングラフ',
        description: 'マルチブランチのセッション変遷とコンテキストノードをインタラクティブなグラフで可視化します。',
      },
    },
    trace: {
      name: 'セッショントレース',
      configuration: {
        title: 'セッショントレース',
        description: 'モデル呼び出しとツール実行の実行詳細をトレース・監査します。',
      },
    },
    'word-cloud': {
      name: 'ワードクラウド設定',
      configuration: {
        title: 'ワードクラウド設定',
        description: 'セッション内のユーザーメッセージ頻度に基づいてビジュアルなワードクラウドを生成します。',
      },
      settings: {
        minWordLength: {
          title: '最小単語長',
          description: '単語として集計される最小文字数です。',
        },
        maxWords: {
          title: '最大単語数',
          description: 'クラウドに表示する単語の最大数です。',
        },
      },
    },
  },
} as const
