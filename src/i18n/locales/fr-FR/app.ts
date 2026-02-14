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
    projectView: 'Vue projet (Cmd+P)',
    searchAll: 'Rechercher dans toutes les sessions (Cmd+K)',
    search: 'Recherche (Cmd+F)',
    settings: 'Ouvrir les paramètres (Cmd+,)',
    close: 'Fermer (Esc)',
  },
  errors: {
    loadSessions: 'Échec du chargement des sessions',
    deleteSession: 'Échec de la suppression de la session',
    renameSession: 'Échec du renommage de la session',
    exportFailed: 'Échec de l\'exportation',
    exportSuccess: 'Exportation réussie !',
  },
  confirm: {
    deleteSession: 'Supprimer la session « {name} » ?',
  },
} as const
