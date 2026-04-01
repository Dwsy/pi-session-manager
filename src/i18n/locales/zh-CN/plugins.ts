export const plugins = {
  session: {
    name: 'session搜索',
    description: '搜索sessionName和元数据',
  },
  project: {
    name: 'project搜索',
    description: '搜索project路径',
  },
  message: {
    name: 'message搜索',
    description: '搜索用户message和助手回复',
  },
} as const
