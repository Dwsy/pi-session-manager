export const onboarding = {
  skip: '跳过',
  next: '下一步',
  prev: '上一步',
  finish: '开始使用',
  steps: {
    welcome: {
      title: '欢迎使用 Pi 会话管理器',
      description: '一款强大的工具，用于浏览、搜索和管理你的 Pi AI 编程会话。让我们快速了解一下核心功能。',
    },
    browse: {
      title: '按项目浏览会话',
      description: '所有编程会话都按项目分组。在列表视图和项目视图之间切换，快速找到你需要的会话。',
      hint: 'Cmd+P 切换到项目视图',
    },
    search: {
      title: '跨会话全局搜索',
      description: '使用全局搜索来查找所有工作区中的消息、会话和项目。会话内搜索帮助你在单个对话中快速定位。',
      hint: 'Cmd+K 全局搜索，Cmd+F 会话内搜索',
    },
    tree: {
      title: '导航会话树',
      description: '侧边栏树形视图展示了对话流程，支持展开和折叠分支。点击箭头来收起或展开区域，专注于重要内容。',
      hint: '点击节点跳转到消息，点击箭头折叠/展开',
    },
    settings: {
      title: '自定义你的体验',
      description: '调整主题、字体大小、代码块样式、导出格式等。一切都可以根据你的工作流程进行配置。',
      hint: 'Cmd+, 随时打开设置',
    },
    services: {
      title: '服务与功能配置',
      description: '选择启用哪些服务。WebSocket 和 HTTP API 允许外部工具连接本应用，内置终端可直接在应用内操作。',
      terminal: '内置终端',
      terminalHint: '在应用内直接使用终端',
      bindLocal: '仅本机访问',
      bindRemote: '允许局域网设备（手机/平板）连接',
      mobileHint: '移动端通过浏览器访问 http://<电脑IP>:52131 即可使用，自动切换 HTTP 模式',
      websocket: 'WebSocket',
      httpApi: 'HTTP API',
    },
  },
} as const
