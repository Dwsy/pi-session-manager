const translations = {
  en: {
    nav: {
      philosophy: 'Philosophy',
      capabilities: 'Capabilities',
      sources: 'Sources',
      docs: 'Docs',
      download: 'Download',
      demo: 'Live Demo',
    },
    hero: {
      eyebrow: 'SESSION WORKSPACE · KNOWLEDGE · OBSERVABILITY',
      titleLeading: 'Keep the work',
      titleAccent: 'your agents leave behind.',
      description:
        'Pi Session Manager turns coding-agent history into a local-first workspace you can browse, search, understand, and continue -- without replacing the agents that created it.',
      primaryAction: 'Try the live demo',
      secondaryAction: 'Download',
      docsAction: 'Read the docs',
      windowLabel: 'SESSION OBSERVATORY',
      windowStatus: 'INDEXED LOCALLY',
      screenshotAlt: 'Pi Session Manager session viewer showing a coding-agent conversation and tool history',
      screenshotCaption: 'Trace a session from the original request to decisions, tools, compaction, and the next handoff.',
      screenshotFeatures: ['Conversation timeline', 'Tool-call evidence', 'Copyable handoff context'],
      metrics: [
        { value: '9', label: 'session sources' },
        { value: 'LOCAL', label: 'index by default' },
        { value: 'MIT', label: 'open source' },
      ],
    },
    positioning: {
      kicker: 'THE BOUNDARY',
      title: 'Not another Agent GUI.',
      description:
        'PSM does not compete with Pi, Claude Code, Codex, or the terminal. It gives the work they already produced a durable place to live.',
      isLabel: 'PSM IS',
      isNotLabel: 'PSM IS NOT',
      is: [
        {
          title: 'A durable session library',
          description: 'Index and browse session artifacts across projects and tools.',
        },
        {
          title: 'A continuity layer',
          description: 'Recover context and hand work back to the original workflow.',
        },
        {
          title: 'An analysis surface',
          description: 'Inspect branches, tool traces, compaction, usage, and cost.',
        },
      ],
      isNot: [
        {
          title: 'A prompt shell',
          description: 'You do not need another chat window to manage your history.',
        },
        {
          title: 'An agent runtime',
          description: 'Execution stays with the agents and terminals you chose.',
        },
        {
          title: 'A proprietary archive',
          description: 'Your local session artifacts remain the source of truth.',
        },
      ],
    },
    layers: {
      kicker: 'THREE LAYERS',
      title: 'One history. Three ways to use it.',
      description:
        'PSM organizes the same session artifacts as a workspace, a searchable knowledge layer, and an observability record.',
      items: [
        {
          index: '01',
          label: 'SESSION WORKSPACE',
          title: 'Organize the work, not another inbox.',
          description:
            'Move through sessions by project, tree, or kanban. Add structure without rewriting the original conversation files.',
          points: ['Tags, favorites, names, and metadata', 'Resume, convert, export, and terminal handoff'],
          imageAlt: 'Kanban view organizing coding-agent sessions by project and status',
          imageCaption: 'A single board for session state across projects, labels, and agent sources.',
          imageFeatures: ['Project sidebar', 'Drag-ready status columns', 'Source and label badges'],
        },
        {
          index: '02',
          label: 'KNOWLEDGE LAYER',
          title: 'Find the decision, not just the keyword.',
          description:
            'Search across messages, labels, and session content, then return to the exact branch where the context was created.',
          points: ['Full-text search with source filters', 'Tree navigation, labels, and dataset exploration'],
          imageAlt: 'Session tree showing searchable conversation structure and branches',
          imageCaption: 'Expand a fork back to its shared decision point, then inspect every alternate outcome in context.',
          imageFeatures: ['Branch Map', 'Fork-aware tree', 'Per-branch transcript'],
        },
        {
          index: '03',
          label: 'OBSERVABILITY LAYER',
          title: 'See how the work actually happened.',
          description:
            'See the operational context around an answer: recent activity, source, model, message volume, branches, tools, and compaction.',
          points: ['Session and project activity at a glance', 'Branch Atlas, traces, and tool-call rendering'],
          imageAlt: 'Session observatory showing recent sessions, sources, projects, and message volume',
          imageCaption: 'Start from the current workload: recent sessions, agent sources, message volume, and project concentration.',
          imageFeatures: ['Session volume', 'Recent activity', 'Project concentration'],
        },
      ],
    },
    sources: {
      kicker: 'SESSION SOURCES',
      title: 'Follow the session, not the vendor.',
      description:
        'PSM reads the history created by multiple coding agents and presents it through one consistent session model.',
      principleLabel: 'THE DURABLE UNIT',
      principle:
        'The session artifact -- decisions, messages, branches, and tool traces -- matters more than the UI that created it.',
    },
    runtime: {
      kicker: 'RUN IT YOUR WAY',
      title: 'One session layer, wherever you work.',
      description:
        'Keep data local on a workstation, expose the same workspace from a headless server, or explore a static dataset with no backend.',
      flow: ['SESSION FILES', 'LOCAL INDEX', 'PSM', 'CONTINUE'],
      modes: [
        {
          title: 'Desktop',
          label: 'TAURI APP',
          description: 'Native desktop shell for macOS, Windows, and Linux.',
        },
        {
          title: 'Browser',
          label: 'HEADLESS SERVER',
          description: 'The full workspace through a browser-accessible server.',
        },
        {
          title: 'API',
          label: 'HTTP · WS · CLI',
          description: 'One command surface for automation and integrations.',
        },
        {
          title: 'Static',
          label: 'DEMO · DATASET',
          description: 'Explore the interface without local sessions or a backend.',
        },
      ],
    },
    download: {
      kicker: 'START HERE',
      title: 'Keep your agents. Keep their history.',
      description:
        'Try the complete interface with demo data, then install PSM when you are ready to index your own sessions.',
      downloadFor: 'Download for',
      viewReleases: 'View all releases',
      demoAction: 'Open live demo',
      docsAction: 'Installation docs',
      recommended: 'Detected',
    },
    footer: {
      tagline: 'The local-first session layer for coding-agent work.',
      docs: 'Docs',
      demo: 'Demo',
      releases: 'Releases',
      github: 'GitHub',
    },
  },
  cn: {
    nav: {
      philosophy: '理念',
      capabilities: '能力',
      sources: '来源',
      docs: '文档',
      download: '下载',
      demo: '在线体验',
    },
    hero: {
      eyebrow: '会话工作台 · 知识层 · 观测层',
      titleLeading: '让 Agent 留下的工作，',
      titleAccent: '不再消失。',
      description:
        'Pi Session Manager 将 Coding Agent 历史转化为本地优先的工作台，用于浏览、检索、理解和继续既有工作，而不是替代创建它们的 Agent。',
      primaryAction: '体验在线 Demo',
      secondaryAction: '下载应用',
      docsAction: '阅读文档',
      windowLabel: '会话观测台',
      windowStatus: '本地索引',
      screenshotAlt: 'Pi Session Manager 会话查看器，展示 Coding Agent 对话与工具历史',
      screenshotCaption: '从原始请求一路追踪到决策、工具调用、Compaction 与下一次交接。',
      screenshotFeatures: ['对话时间线', '工具调用证据', '可复制的交接上下文'],
      metrics: [
        { value: '9', label: '种会话来源' },
        { value: 'LOCAL', label: '默认本地索引' },
        { value: 'MIT', label: '开源许可' },
      ],
    },
    positioning: {
      kicker: '产品边界',
      title: '不是另一个 Agent GUI。',
      description:
        'PSM 不与 Pi、Claude Code、Codex 或终端竞争。它为这些工具已经产生的工作提供一个持久归处。',
      isLabel: 'PSM 是',
      isNotLabel: 'PSM 不是',
      is: [
        {
          title: '持久的会话档案库',
          description: '跨项目、跨工具索引并浏览会话产物。',
        },
        {
          title: '工作延续层',
          description: '找回上下文，并将工作交还给原本的工作流。',
        },
        {
          title: '分析界面',
          description: '检查分支、工具轨迹、Compaction、用量与成本。',
        },
      ],
      isNot: [
        {
          title: 'Prompt 外壳',
          description: '管理历史不需要再打开一个聊天窗口。',
        },
        {
          title: 'Agent 运行时',
          description: '实际执行仍由你选择的 Agent 与终端完成。',
        },
        {
          title: '封闭档案格式',
          description: '本地会话产物仍然是事实来源。',
        },
      ],
    },
    layers: {
      kicker: '三层价值',
      title: '同一份历史，三种使用方式。',
      description:
        'PSM 将相同的会话产物组织为工作台、可检索的知识层，以及可回溯的观测记录。',
      items: [
        {
          index: '01',
          label: '会话工作台',
          title: '组织工作，而不是再造一个收件箱。',
          description:
            '按项目、树或看板浏览会话，在不重写原始对话文件的前提下建立结构。',
          points: ['标签、收藏、命名与元数据', '恢复、转换、导出与终端交接'],
          imageAlt: '通过项目和状态组织 Coding Agent 会话的看板视图',
          imageCaption: '在同一块看板中按项目、标签、来源与状态组织会话。',
          imageFeatures: ['项目侧栏', '可拖拽状态列', '来源与标签徽标'],
        },
        {
          index: '02',
          label: '知识层',
          title: '找到决策，而不只是命中关键词。',
          description:
            '跨消息、标签和会话内容检索，再回到上下文产生时的准确分支。',
          points: ['带来源过滤的全文检索', '会话树、节点标签与数据集浏览'],
          imageAlt: '展示可搜索对话结构与分支的会话树',
          imageCaption: '从共同的决策锚点展开分叉，并在上下文中检查每一条替代结果。',
          imageFeatures: ['Branch Map', '感知分叉的树', '逐分支对话正文'],
        },
        {
          index: '03',
          label: '观测层',
          title: '看清工作究竟如何发生。',
          description:
            '看清答案周围的运行上下文：近期活动、来源、模型、消息量、分支、工具调用与 Compaction。',
          points: ['快速总览会话与项目活动', 'Branch Atlas、Trace 与工具调用渲染'],
          imageAlt: '展示近期会话、来源、项目与消息量的会话观测台',
          imageCaption: '从当前工作负载开始：近期会话、Agent 来源、消息量与项目集中度。',
          imageFeatures: ['会话数量', '近期活动', '项目集中度'],
        },
      ],
    },
    sources: {
      kicker: '会话来源',
      title: '跟随 Session，而不是绑定供应商。',
      description:
        'PSM 读取多个 Coding Agent 产生的历史，并通过统一的会话模型呈现。',
      principleLabel: '持久的价值单元',
      principle:
        '真正值得保留的是 Session 产物——决策、消息、分支和工具轨迹，而不是创建它们的某个 UI。',
    },
    runtime: {
      kicker: '按你的方式运行',
      title: '一层会话基础，覆盖每个工作位置。',
      description:
        '在工作站本地保留数据，从无头服务器提供相同工作台，或在无后端环境中浏览静态数据集。',
      flow: ['会话文件', '本地索引', 'PSM', '继续工作'],
      modes: [
        {
          title: '桌面端',
          label: 'TAURI 应用',
          description: '面向 macOS、Windows 与 Linux 的原生桌面外壳。',
        },
        {
          title: '浏览器',
          label: '无头服务器',
          description: '通过浏览器访问完整的会话工作台。',
        },
        {
          title: 'API',
          label: 'HTTP · WS · CLI',
          description: '为自动化与集成提供统一命令入口。',
        },
        {
          title: '静态版',
          label: 'DEMO · 数据集',
          description: '无需本地会话或后端即可体验界面。',
        },
      ],
    },
    download: {
      kicker: '从这里开始',
      title: '保留你的 Agent，也保留它们的历史。',
      description:
        '先用 Demo 数据体验完整界面，准备好索引自己的会话时再安装 PSM。',
      downloadFor: '下载',
      viewReleases: '查看全部版本',
      demoAction: '打开在线 Demo',
      docsAction: '安装文档',
      recommended: '已检测',
    },
    footer: {
      tagline: '面向 Coding Agent 工作的本地优先会话层。',
      docs: '文档',
      demo: 'Demo',
      releases: '版本',
      github: 'GitHub',
    },
  },
} as const;

export type LandingLang = keyof typeof translations;

export function t(lang: string) {
  return translations[lang as LandingLang] ?? translations.en;
}
