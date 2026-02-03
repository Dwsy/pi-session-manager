export const app = {
  title: 'Pi 会话管理器',
  subtitle: '选择一个会话查看详情',
  projects: '项目',
  demoMode: '演示模式',
  demoModeDescription: '查看演示数据以探索所有功能',
  viewMode: {
    list: '列表视图',
    project: '项目视图',
  },
  shortcuts: {
    resume: '恢复会话 (Cmd+R)',
    exportHtml: '导出并打开 (Cmd+E)',
    projectView: '项目视图 (Cmd+P)',
    search: '聚焦搜索框 (Cmd+F)',
    settings: '打开设置 (Cmd+,)',
    close: '关闭 (Esc)',
  },
  errors: {
    loadSessions: '加载会话失败',
    deleteSession: '删除会话失败',
    renameSession: '重命名会话失败',
    exportFailed: '导出失败',
    exportSuccess: '导出成功！',
  },
  confirm: {
    deleteSession: '确定要删除会话 "{name}" 吗？',
  },
} as const