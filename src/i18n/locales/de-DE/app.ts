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
    projectView: 'Projektansicht (Cmd+P)',
    searchAll: 'Alle Sitzungen durchsuchen (Cmd+K)',
    search: 'Suche fokussieren (Cmd+F)',
    settings: 'Einstellungen öffnen (Cmd+,)',
    close: 'Schließen (Esc)',
  },
  errors: {
    loadSessions: 'Sitzungen konnten nicht geladen werden',
    deleteSession: 'Sitzung konnte nicht gelöscht werden',
    renameSession: 'Sitzung konnte nicht umbenannt werden',
    exportFailed: 'Export fehlgeschlagen',
    exportSuccess: 'Export erfolgreich!',
  },
  confirm: {
    deleteSession: 'Sitzung „{name}" löschen?',
  },
} as const
