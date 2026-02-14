export const plugins = {
  session: {
    name: 'Recherche de sessions',
    description: 'Rechercher dans les noms et métadonnées des sessions',
  },
  project: {
    name: 'Recherche de projets',
    description: 'Rechercher dans les chemins de projets',
  },
  message: {
    name: 'Recherche de messages',
    description: 'Rechercher dans les messages utilisateur et les réponses de l\'assistant',
  },
} as const
