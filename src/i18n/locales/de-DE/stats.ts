export const stats = {
  panel: {
    title: 'Analyse-Dashboard',
    subtitle: 'Sitzungseinblicke und Aktivitätsmetriken',
    loading: 'Analysen werden geladen...',
    noData: 'Keine Statistikdaten verfügbar',
    tabs: {
      overview: 'Übersicht',
      activity: 'Aktivität',
      projects: 'Projekte',
      time: 'Zeit',
      tokens: 'Tokens',
      productivity: 'Produktivität',
      achievements: 'Erfolge',
    },
    tooltips: {
      refresh: 'Aktualisieren',
      export: 'Exportieren',
      settings: 'Einstellungen',
      close: 'Schließen',
    },
  },
  cards: {
    totalSessions: 'Sitzungen gesamt',
    totalMessages: 'Nachrichten gesamt',
    avgPerSession: 'Ø/Sitzung',
    activeDays: 'Aktive Tage',
    sessions: 'Sitzungen',
    messages: 'Nachrichten',
  },
  activity: {
    title: 'Aktivitätsstufen',
    levels: {
      veryHigh: 'Sehr hoch',
      high: 'Hoch',
      medium: 'Mittel',
      low: 'Niedrig',
      veryLow: 'Sehr niedrig',
    },
  },
  time: {
    hourly: 'Stündliche Aktivität',
    weekly: 'Wöchentliche Aktivität',
    monthly: 'Monatliche Aktivität',
  },
  productivity: {
    title: 'Sitzungseinblicke',
    totalSessions: 'Sitzungen gesamt',
    totalMessages: 'Nachrichten gesamt',
    messagesPerSession: 'Nachrichten/Sitzung',
    userMessages: 'Benutzernachrichten',
    assistantMessages: 'Assistenznachrichten',
  },
  achievements: {
    title: 'Erfolge',
  },
} as const
