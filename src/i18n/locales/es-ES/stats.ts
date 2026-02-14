export const stats = {
  panel: {
    title: 'Panel de analíticas',
    subtitle: 'Estadísticas y métricas de actividad',
    loading: 'Cargando analíticas...',
    noData: 'No hay datos estadísticos disponibles',
    tabs: {
      overview: 'Resumen',
      activity: 'Actividad',
      projects: 'Proyectos',
      time: 'Tiempo',
      tokens: 'Tokens',
      productivity: 'Productividad',
      achievements: 'Logros',
    },
    tooltips: {
      refresh: 'Actualizar',
      export: 'Exportar',
      settings: 'Ajustes',
      close: 'Cerrar',
    },
  },
  cards: {
    totalSessions: 'Sesiones totales',
    totalMessages: 'Mensajes totales',
    avgPerSession: 'Media/Sesión',
    activeDays: 'Días activos',
    sessions: 'Sesiones',
    messages: 'Mensajes',
  },
  activity: {
    title: 'Niveles de actividad',
    levels: {
      veryHigh: 'Muy alta',
      high: 'Alta',
      medium: 'Media',
      low: 'Baja',
      veryLow: 'Muy baja',
    },
  },
  time: {
    hourly: 'Actividad por hora',
    weekly: 'Actividad semanal',
    monthly: 'Actividad mensual',
  },
  productivity: {
    title: 'Estadísticas de sesión',
    totalSessions: 'Sesiones totales',
    totalMessages: 'Mensajes totales',
    messagesPerSession: 'Mensajes/Sesión',
    userMessages: 'Mensajes del usuario',
    assistantMessages: 'Mensajes del asistente',
  },
  achievements: {
    title: 'Logros',
  },
} as const
