const translations = {
  en: {
    hero: {
      badge: 'Open Source · MIT Licensed',
      titleLine1: 'Your Pi Sessions,',
      titleLine2: 'Beautifully Managed',
      description:
        'Browse, search, and manage your Pi AI coding sessions across every platform. Full-text search, tree visualization, dashboards, and more.',
      getStarted: 'Get Started',
      github: 'GitHub',
    },
    features: {
      title: 'Everything you need',
      subtitle: 'A complete toolkit for managing your AI coding sessions',
      items: [
        {
          title: 'Multi-View Browser',
          description:
            'List, project, and kanban views to organize sessions your way. Filter by tags, search, and sort.',
        },
        {
          title: 'Full-Text Search',
          description:
            'SQLite FTS5 + Tantivy powered search across all sessions. Find any conversation instantly.',
        },
        {
          title: 'Session Visualization',
          description:
            'Tree view and flow visualization to explore branching conversations and tool call chains.',
        },
        {
          title: 'Built-in Terminal',
          description:
            'Integrated xterm.js terminal for running commands without leaving the session viewer.',
        },
        {
          title: 'Dashboard & Stats',
          description:
            'Activity heatmaps, usage statistics, and achievement badges to track your coding journey.',
        },
        {
          title: 'Hierarchical Tags',
          description:
            'Organize sessions with nested tags. Bulk operations and smart auto-tagging support.',
        },
        {
          title: 'Flexible Export',
          description:
            'Export sessions to HTML, Markdown, or JSON. Share conversations or archive them offline.',
        },
        {
          title: 'Multi-Protocol API',
          description:
            'Tauri IPC, WebSocket, and HTTP endpoints. CLI mode for headless servers. Mobile optimized.',
        },
      ],
    },
    architecture: {
      title: 'Built for every platform',
      subtitle: 'One codebase, three protocols, runs everywhere',
    },
    quickstart: {
      title: 'Up and running in minutes',
      subtitle: 'Three steps to manage all your Pi sessions',
      steps: [
        {
          title: 'Download',
          description:
            'Grab the latest release for your platform from GitHub Releases.',
        },
        {
          title: 'Configure paths',
          description:
            'Point to your Pi session directories. Auto-detects the default location.',
        },
        {
          title: 'Start exploring',
          description:
            'Browse sessions, search conversations, view dashboards, and manage tags.',
        },
      ],
    },
    download: {
      title: 'Download',
      subtitle:
        'Available on macOS, Windows, and Linux. CLI mode for headless servers.',
      recommended: 'Recommended',
      viewAll: 'View all releases',
    },
    footer: {
      madeWith: 'Made with',
      by: 'by Dwsy',
    },
  },
  cn: {
    hero: {
      badge: '开源 · MIT 许可',
      titleLine1: '你的 Pi 会话，',
      titleLine2: '优雅管理',
      description:
        '跨平台浏览、搜索和管理你的 Pi AI 编码会话。全文搜索、树形可视化、数据仪表板，一应俱全。',
      getStarted: '快速开始',
      github: 'GitHub',
    },
    features: {
      title: '你需要的一切',
      subtitle: '管理 AI 编码会话的完整工具箱',
      items: [
        {
          title: '多视图浏览',
          description:
            '列表、项目和看板视图，按你的方式组织会话。支持标签过滤、搜索和排序。',
        },
        {
          title: '全文搜索',
          description:
            'SQLite FTS5 + Tantivy 驱动，跨所有会话搜索。即时找到任何对话。',
        },
        {
          title: '会话可视化',
          description:
            '树形视图和流程可视化，探索分支对话和工具调用链。',
        },
        {
          title: '内置终端',
          description:
            '集成 xterm.js 终端，无需离开会话查看器即可运行命令。',
        },
        {
          title: '仪表板与统计',
          description:
            '活动热图、使用统计和成就徽章，追踪你的编码旅程。',
        },
        {
          title: '层级标签',
          description:
            '使用嵌套标签组织会话。支持批量操作和智能自动标签。',
        },
        {
          title: '灵活导出',
          description:
            '导出会话为 HTML、Markdown 或 JSON。分享对话或离线归档。',
        },
        {
          title: '多协议 API',
          description:
            'Tauri IPC、WebSocket 和 HTTP 端点。CLI 模式支持无头服务器。移动端优化。',
        },
      ],
    },
    architecture: {
      title: '为每个平台而生',
      subtitle: '一套代码，三种协议，随处运行',
    },
    quickstart: {
      title: '几分钟即可上手',
      subtitle: '三步管理你的所有 Pi 会话',
      steps: [
        {
          title: '下载',
          description: '从 GitHub Releases 获取适合你平台的最新版本。',
        },
        {
          title: '配置路径',
          description: '指向你的 Pi 会话目录。自动检测默认位置。',
        },
        {
          title: '开始探索',
          description: '浏览会话、搜索对话、查看仪表板、管理标签。',
        },
      ],
    },
    download: {
      title: '下载',
      subtitle: '支持 macOS、Windows 和 Linux。CLI 模式适用于无头服务器。',
      recommended: '推荐',
      viewAll: '查看所有版本',
    },
    footer: {
      madeWith: '用',
      by: '制作 by Dwsy',
    },
  },
} as const;

export type LandingLang = keyof typeof translations;

export function t(lang: string) {
  return translations[lang as LandingLang] ?? translations.en;
}
