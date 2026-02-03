export const app = {
  title: 'Pi Session Manager',
  subtitle: 'Select a session to view details',
  projects: 'Projects',
  demoMode: 'Demo Mode',
  demoModeDescription: 'View demo data to explore all features',
  viewMode: {
    list: 'List view',
    project: 'Project view',
  },
  shortcuts: {
    resume: 'Resume session (Cmd+R)',
    exportHtml: 'Export & open (Cmd+E)',
    projectView: 'Project view (Cmd+P)',
    search: 'Focus search (Cmd+F)',
    settings: 'Open settings (Cmd+,)',
    close: 'Close (Esc)',
  },
  errors: {
    loadSessions: 'Failed to load sessions',
    deleteSession: 'Failed to delete session',
    renameSession: 'Failed to rename session',
    exportFailed: 'Export failed',
    exportSuccess: 'Export successful!',
  },
  confirm: {
    deleteSession: 'Delete session "{name}"?',
  },
} as const