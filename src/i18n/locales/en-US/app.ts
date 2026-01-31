export const app = {
  title: 'Pi Session Manager',
  subtitle: 'Select a session to view details',
  projects: 'Projects',
  viewMode: {
    list: 'List view',
    directory: 'Directory view',
    project: 'Project view',
  },
  shortcuts: {
    refresh: 'Refresh session list (Cmd+R)',
    search: 'Focus search (Cmd+F)',
    settings: 'Open settings (Cmd+,)',
    stats: 'Open statistics (Cmd+Shift+S)',
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