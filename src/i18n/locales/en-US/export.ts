export const exportModule = {
  dialog: {
    title: 'Export Session',
    untitledSession: 'Untitled Session',
    formats: {
      html: {
        name: 'HTML',
        description: 'Styled web page with formatting',
      },
      md: {
        name: 'Markdown',
        description: 'Plain text with markdown formatting',
      },
      json: {
        name: 'JSON',
        description: 'Raw data format',
      },
    },
  },
  cancel: 'Cancel',
} as const