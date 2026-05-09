export const app = {
  title: 'Pi Session Manager',
  subtitle: 'Wählen Sie eine Sitzung aus, um Details anzuzeigen',
  projects: 'Projekte',
  demoMode: 'Demo-Modus',
  demoModeDescription: 'Demo-Daten anzeigen, um alle Funktionen zu erkunden',
  viewMode: {
    list: 'Listenansicht',
    project: 'Projektansicht',
  },
  shortcuts: {
    resume: 'Sitzung fortsetzen (Cmd+R)',
    exportHtml: 'Exportieren & öffnen (Cmd+E)',
    deleteSelected: 'Ausgewählte Sitzung(en) löschen (Cmd+Backspace)',
    projectView: 'Projektansicht (Cmd+P)',
    searchAll: 'Alle Sitzungen durchsuchen (Cmd+Shift+F)',
    search: 'In Sitzung suchen (Cmd+F)',
    settings: 'Einstellungen öffnen (Cmd+,)',
    close: 'Schließen (Esc)',
  },
  errors: {
    loadSessions: 'Sitzungen konnten nicht geladen werden',
    deleteSession: 'Sitzung konnte nicht gelöscht werden',
    deleteSessionPartial: '{{count}} Sitzungen konnten nicht gelöscht werden. Details stehen in der Konsole.',
    renameSession: 'Sitzung konnte nicht umbenannt werden',
    exportFailed: 'Export fehlgeschlagen',
    exportSuccess: 'Export erfolgreich!',
  },
  confirm: {
    deleteSession: 'Sitzung „{name}" löschen?',
    deleteSessions: '{{count}} ausgewählte Sitzungen löschen?',
    deleteIrreversible: 'Diese Aktion kann nicht rückgängig gemacht werden.',
  },
  splash: {
    scanning: 'Sitzungen werden gescannt...',
    firstLaunchHint: 'Der erste Start kann einen Moment dauern',
  },
} as const
