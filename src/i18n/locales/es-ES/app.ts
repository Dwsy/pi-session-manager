export const app = {
  title: 'Pi Session Manager',
  subtitle: 'Selecciona una sesión para ver los detalles',
  projects: 'Proyectos',
  demoMode: 'Modo demo',
  demoModeDescription: 'Ver datos de demostración para explorar todas las funciones',
  viewMode: {
    list: 'Vista de lista',
    project: 'Vista de proyecto',
  },
  shortcuts: {
    resume: 'Reanudar sesión (Cmd+R)',
    exportHtml: 'Exportar y abrir (Cmd+E)',
    deleteSelected: 'Eliminar las sesiones seleccionadas (Cmd+Backspace)',
    projectView: 'Vista de proyecto (Cmd+P)',
    searchAll: 'Alternar barra lateral del árbol de sesiones (Cmd+Shift+F)',
    search: 'Buscar en la sesión (Cmd+F)',
    settings: 'Abrir ajustes (Cmd+,)',
    close: 'Cerrar (Esc)',
  },
  errors: {
    loadSessions: 'Error al cargar las sesiones',
    deleteSession: 'Error al eliminar la sesión',
    deleteSessionPartial: '{{count}} sesiones no se pudieron eliminar. Revisa la consola para más detalles.',
    renameSession: 'Error al renombrar la sesión',
    exportFailed: 'Error en la exportación',
    exportSuccess: '¡Exportación completada!',
  },
  confirm: {
    deleteSession: '¿Eliminar la sesión "{name}"?',
    deleteSessions: '¿Eliminar las {{count}} sesiones seleccionadas?',
    deleteIrreversible: 'Esta acción no se puede deshacer.',
  },
} as const
