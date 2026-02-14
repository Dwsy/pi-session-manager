export const exportModule = {
  dialog: {
    title: 'Sitzung exportieren',
    untitledSession: 'Unbenannte Sitzung',
    formats: {
      html: {
        name: 'HTML',
        description: 'Gestaltete Webseite mit Formatierung',
      },
      md: {
        name: 'Markdown',
        description: 'Klartext mit Markdown-Formatierung',
      },
      json: {
        name: 'JSON',
        description: 'Rohdatenformat',
      },
    },
  },
  cancel: 'Abbrechen',
} as const
