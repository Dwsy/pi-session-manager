export const exportModule = {
  dialog: {
    title: '导出会话',
    untitledSession: '未命名会话',
    formats: {
      html: {
        name: 'HTML',
        description: '带格式化的网页',
      },
      md: {
        name: 'Markdown',
        description: '带 Markdown 格式的纯文本',
      },
      json: {
        name: 'JSON',
        description: '原始数据格式',
      },
    },
  },
  cancel: '取消',
} as const