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
    projectView: 'Vista de proyecto (Cmd+P)',
    searchAll: 'Buscar en todas las sesiones (Cmd+K)',
    search: 'Enfocar búsqueda (Cmd+F)',
    settings: 'Abrir ajustes (Cmd+,)',
    close: 'Cerrar (Esc)',
  },
  errors: {
    loadSessions: 'Error al cargar las sesiones',
    deleteSession: 'Error al eliminar la sesión',
    renameSession: 'Error al renombrar la sesión',
    exportFailed: 'Error en la exportación',
    exportSuccess: '¡Exportación completada!',
  },
  confirm: {
    deleteSession: '¿Eliminar la sesión "{name}"?',
  },
} as const
