export const exportModule = {
  dialog: {
    title: 'Exporter la session',
    untitledSession: 'Session sans titre',
    formats: {
      html: {
        name: 'HTML',
        description: 'Page web stylisée avec mise en forme',
      },
      md: {
        name: 'Markdown',
        description: 'Texte brut avec mise en forme Markdown',
      },
      json: {
        name: 'JSON',
        description: 'Format de données brut',
      },
    },
  },
  cancel: 'Annuler',
} as const
