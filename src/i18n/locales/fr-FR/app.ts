export const app = {
  title: 'Pi Session Manager',
  subtitle: 'Sélectionnez une session pour voir les détails',
  projects: 'Projets',
  demoMode: 'Mode démo',
  demoModeDescription: 'Afficher des données de démonstration pour explorer toutes les fonctionnalités',
  viewMode: {
    list: 'Vue liste',
    project: 'Vue projet',
  },
  shortcuts: {
    resume: 'Reprendre la session (Cmd+R)',
    exportHtml: 'Exporter et ouvrir (Cmd+E)',
    deleteSelected: 'Supprimer les sessions sélectionnées (Cmd+Backspace)',
    projectView: 'Vue projet (Cmd+Shift+G)',
    searchAll: 'Rechercher dans toutes les sessions (Cmd+P / Cmd+Shift+F)',
    search: 'Rechercher dans la session (Cmd+F)',
    settings: 'Ouvrir les paramètres (Cmd+,)',
    close: 'Fermer (Esc)',
  },
  errors: {
    loadSessions: 'Échec du chargement des sessions',
    deleteSession: 'Échec de la suppression de la session',
    deleteSessionPartial: "{{count}} sessions n'ont pas pu être supprimées. Consultez la console pour plus de détails.",
    renameSession: 'Échec du renommage de la session',
    exportFailed: "Échec de l'exportation",
    exportSuccess: 'Exportation réussie',
  },
  confirm: {
    deleteSession: 'Supprimer la session « {name} » ?',
    deleteSessions: 'Supprimer les {{count}} sessions sélectionnées ?',
    deleteIrreversible: 'Cette action est irréversible.',
  },
  splash: {
    scanning: 'Analyse des sessions...',
    firstLaunchHint: 'Le premier lancement peut prendre un instant',
  },
} as const
