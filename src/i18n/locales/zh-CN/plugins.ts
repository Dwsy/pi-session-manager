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
} as const
