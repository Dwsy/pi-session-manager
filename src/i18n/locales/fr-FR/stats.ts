export const stats = {
  panel: {
    title: 'Tableau de bord analytique',
    subtitle: 'Aperçu des sessions et métriques d\'activité',
    loading: 'Chargement des analyses...',
    noData: 'Aucune donnée statistique disponible',
    tabs: {
      overview: 'Vue d\'ensemble',
      activity: 'Activité',
      projects: 'Projets',
      time: 'Temps',
      tokens: 'Tokens',
      productivity: 'Productivité',
      achievements: 'Réalisations',
    },
    tooltips: {
      refresh: 'Actualiser',
      export: 'Exporter',
      settings: 'Paramètres',
      close: 'Fermer',
    },
  },
  cards: {
    totalSessions: 'Total des sessions',
    totalMessages: 'Total des messages',
    avgPerSession: 'Moy./Session',
    activeDays: 'Jours actifs',
    sessions: 'Sessions',
    messages: 'Messages',
  },
  activity: {
    title: 'Niveaux d\'activité',
    levels: {
      veryHigh: 'Très élevé',
      high: 'Élevé',
      medium: 'Moyen',
      low: 'Faible',
      veryLow: 'Très faible',
    },
  },
  time: {
    hourly: 'Activité horaire',
    weekly: 'Activité hebdomadaire',
    monthly: 'Activité mensuelle',
  },
  productivity: {
    title: 'Aperçu des sessions',
    totalSessions: 'Total des sessions',
    totalMessages: 'Total des messages',
    messagesPerSession: 'Messages/Session',
    userMessages: 'Messages utilisateur',
    assistantMessages: 'Messages assistant',
  },
  achievements: {
    title: 'Réalisations',
  },
} as const
