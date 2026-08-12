export const plugins = {
  session: {
    name: '会话搜索',
    description: '搜索会话名称和元数据',
  },
  project: {
    name: '项目搜索',
    description: '搜索项目路径',
  },
  message: {
    name: '消息搜索',
    description: '搜索用户消息和助手回复',
  },
  builtin: {
    'code-review': {
      name: '代码审查',
      configuration: {
        title: '代码审查配置',
        description: '控制代码审查弹窗中代码差异（diff）的显示方式。这些设置独立于系统的全局外观选项。',
      },
      settings: {
        diffView: {
          title: '默认视图样式',
          description: '选择双栏左右对比或单栏行内对比视图',
          options: {
            split: '双栏对照 (Split)',
            unified: '单栏行内 (Unified)',
          },
        },
        diffLineDiffType: {
          title: '代码高亮对比粒度',
          description: '高亮显示细致度：按整行、按单词或按字符',
          options: {
            words: '按单词 (Words)',
            chars: '按字符 (Characters)',
            full: '按整行 (Full Lines)',
          },
        },
        diffLineNumbers: {
          title: '显示行号',
          description: '在差异视图中展示代码行号',
        },
        diffWrap: {
          title: '长代码行折行显示',
          description: '自动对较长代码行进行折行处理，而不是水平滚动',
        },
        diffIndicators: {
          title: '显示 +/- 符号',
          description: '在代码修改行首添加 +/− 增删符号提示',
        },
        diffExpandUnchanged: {
          title: '默认展开未变更代码',
          description: '在差异视图中默认展开展示没有修改的代码行',
        },
        interceptExpand: {
          title: '拦截工具展开动作',
          description: '在对话中点击工具调用展开时，直接在代码审查弹窗中开启而不是在消息卡片中展开',
        },
      },
    },
    'semantic-search': {
      name: '语义搜索',
      configuration: {
        title: '语义搜索设置',
        description: '配置语义搜索的核心选项，如检索范围和 AI 辅助查询扩展。',
      },
      settings: {
        defaultScope: {
          title: '默认检索范围',
          description: '进行语义搜索时的默认范围',
          options: {
            project: '当前项目',
            global: '所有项目',
          },
        },
        maxResults: {
          title: '最大检索结果数',
          description: '要显示的最大搜索结果条数',
        },
        enableAiExpansion: {
          title: 'AI 搜索词扩展',
          description: '使用 AI 智能扩展搜索词的近义词和相关术语以提升搜索命中率',
        },
        provider: {
          title: '模型提供商',
          description: '语义搜索 Agent 使用的 AI 接口提供商。留空则代表采用系统默认设置。',
        },
        model: {
          title: '运行模型',
          description: '语义搜索 Agent 使用的具体 AI 模型。留空则代表采用系统默认设置。',
        },
      },
    },
    'session-summary': {
      name: 'AI 会话摘要',
      configuration: {
        title: '会话智能总结设置',
        description: '控制总结的生成选项以及智能信息侧边栏的展示偏好。',
      },
      settings: {
        provider: {
          title: '模型提供商',
          description: '会话总结所使用的可选提供商覆盖。留空表示由系统自动选择。',
        },
        model: {
          title: '运行模型',
          description: '会话总结所使用的可选模型覆盖。留空表示由系统自动选择。',
        },
        language: {
          title: '总结语言偏好',
          description: '生成总结的目标语言',
          options: {
            auto: '跟随系统 (Auto)',
            'en-US': '英文 (English)',
            'zh-CN': '简体中文',
            'ja-JP': '日本語',
          },
        },
        autoOpenAfterRefresh: {
          title: '刷新后自动展开',
          description: '在生成或刷新总结后自动拉起展示面板',
        },
        showMetadata: {
          title: '展示摘要数据卡片',
          description: '展示包含耗时、消耗 Token、代码变更行等统计卡片',
        },
        showTopics: {
          title: '展示会话技术主题',
          description: '展示检测到的技术与概念主题',
        },
        showNextSteps: {
          title: '展示后续行动建议',
          description: '展示会话建议的后续改动或测试计划',
        },
        showUnresolved: {
          title: '展示未决代码任务',
          description: '展示目前仍然在待办中或未完全解决的任务',
        },
      },
    },
    sidechat: {
      name: '会话侧聊',
      configuration: {
        title: '侧栏聊天辅助设置',
        description: '设定会话侧栏聊天辅助助手及 sidechat 命令行指令的默认参数。',
      },
      settings: {
        provider: {
          title: '模型提供商',
          description: '可选的提供商覆盖。留空表示由系统自动选择。',
        },
        model: {
          title: '运行模型',
          description: '可选的模型覆盖。留空表示由系统自动选择。',
        },
        thinkingLevel: {
          title: '推理思考级别',
          description: '模型运行时的推理和思考细致度设定',
          options: {
            off: '关闭 (Off)',
            minimal: '极简 (Minimal)',
            low: '轻度 (Low)',
            medium: '中度 (Medium)',
            high: '深度 (High)',
            xhigh: '极致 (X High)',
          },
        },
        snippetLimit: {
          title: '关联会话片段上限',
          description: '每次问答检索并作为上下文参考的最大会话消息片段数量',
        },
        panelWidth: {
          title: '面板默认宽度',
          description: '侧栏面板加载时的默认像素宽度',
        },
        optionsExpanded: {
          title: '默认展开高级参数',
          description: '在面板开启时，默认展示模型和 System Prompt 配置选项',
        },
        showQuickPrompts: {
          title: '展示快捷常用提问',
          description: '在对话框下方提供一键提问的常用快捷模板',
        },
      },
    },
    'generative-ui-renderer': {
      name: '生成式 UI 渲染器',
      configuration: {
        title: '生成式 UI 渲染器',
        description: '允许内置及本地插件在会话中渲染生成式富交互小组件和窗口。',
      },
    },
    'kanban-board': {
      name: '标签看板',
      configuration: {
        title: '标签看板',
        description: '在看板视图下按项目、标签和时间跨度查看并拖拽管理会话。',
      },
    },
    'session-graph': {
      name: '会话图谱',
      configuration: {
        title: '会话图谱',
        description: '提供图形可视化界面，直观展现多分支会话及上下文节点之间的演进关系。',
      },
    },
    trace: {
      name: '会话追踪',
      configuration: {
        title: '会话追踪',
        description: '详细追踪并审计模型调用及工具执行的过程细节。',
      },
    },
    'word-cloud': {
      name: '词云图',
      configuration: {
        title: '词云设置',
        description: '根据会话中的用户消息频率生成直观的词云图谱。',
      },
      settings: {
        minWordLength: {
          title: '最小单词长度',
          description: '参与统计的单词的最小长度字符数',
        },
        maxWords: {
          title: '最大显示单词数',
          description: '词云图展示词汇总数的上限',
        },
      },
    },
  },
} as const
