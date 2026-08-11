export const onboarding = {
  subtitle: 'Configuración inicial',
  progressLabel: 'Pasos de configuración',
  stepProgress: 'Paso {{current}} de {{total}}',
  skip: 'Omitir',
  next: 'Siguiente',
  prev: 'Atrás',
  finish: 'Empezar',
  steps: {
    welcome: {
      title: 'Tu biblioteca de sesiones',
      description:
        'Pi Session Manager ya ha analizado este equipo. Esto es lo que encontró.',
      stats: {
        sessions: 'Sesiones',
        projects: 'Proyectos',
        since: 'Sesión más antigua',
      },
      scanning: 'Analizando sesiones…',
      topProjectsTitle: 'Proyectos más activos',
      topProjectsEmpty:
        'Aún no hay sesiones. Añade una fuente en el siguiente paso y aparecerán aquí.',
      sessionCount: '{{count}} sesiones',
      sessionCount_one: '{{count}} sesión',
    },
    sources: {
      title: 'Fuentes de sesiones',
      description:
        'Elige qué agentes de código formarán parte de tu biblioteca. Puedes cambiarlo cuando quieras en Ajustes.',
      piTitle: 'Sesiones de Pi',
      piDescription:
        'El directorio de sesiones de Pi por defecto siempre forma parte de la biblioteca.',
      alwaysOn: 'Siempre analizado',
      supportedTitle: 'Agentes que PSM puede analizar',
      detectedTitle: 'Otros agentes encontrados en este equipo',
      detectedDescription:
        'Detectados buscando el directorio de sesiones de cada agente. Al activarlos, sus sesiones entran en la lista, la búsqueda y las conversiones.',
      selectedCount: '{{selected}} de {{total}} activados',
      enabled: 'Incluido',
      disabled: 'Omitido',
      noneTitle: 'Solo se encontraron sesiones de Pi',
      noneDescription:
        'Claude Code, Codex, Cursor y otros aparecerán aquí en cuanto tengan sesiones en este equipo. Los directorios personalizados se añaden después en Ajustes.',
    },
    appearance: {
      title: 'Aspecto e idioma',
      description:
        'Cada cambio se aplica al instante, así puedes ver el resultado antes de continuar.',
      themeLabel: 'Tema',
      themes: {
        dark: 'Oscuro',
        light: 'Claro',
        system: 'Sistema',
      },
      themeHints: {
        dark: 'Paleta Tokyo Night',
        light: 'Luminoso y con contraste',
        system: 'Seguir al sistema',
      },
      fontSizeLabel: 'Tamaño del texto',
      fontSizeHint: 'Se aplica de inmediato a toda la aplicación.',
      fontSizes: {
        small: 'Pequeño',
        medium: 'Medio',
        large: 'Grande',
      },
      languageLabel: 'Idioma',
      previewLabel: 'Vista previa en vivo',
      preview: {
        sidebar: 'Sesiones',
        userMessage: '¿Por qué falla la compilación?',
        assistantMessage:
          'El bundler no resuelve el alias; voy a revisar la configuración.',
        toolResult: 'compilado en 1,24 s',
      },
    },
    ready: {
      title: 'Todo listo',
      description:
        'Algunos atajos para moverte y dónde mirar cuando quieras más control.',
      shortcutsTitle: 'Atajos que conviene saber',
      shortcuts: {
        palette: 'Paleta de comandos',
        search: 'Buscar en todas las sesiones',
        inSessionSearch: 'Buscar en esta sesión',
        sidebar: 'Mostrar u ocultar la barra lateral',
        projectView: 'Agrupar por proyecto',
        terminal: 'Mostrar u ocultar la terminal',
        settings: 'Abrir ajustes',
        resume: 'Reanudar sesión',
      },
      nextTitle: 'Ajustar más adelante',
      links: {
        sources: {
          title: 'Fuentes de sesiones',
          description: 'Directorios propios, conjuntos de datos y agentes externos',
        },
        server: {
          title: 'Servidor y acceso',
          description:
            'Puertos HTTP y WebSocket, acceso por red local desde el móvil',
        },
        plugins: {
          title: 'Complementos',
          description: 'Activar los integrados o instalar nuevos',
        },
      },
    },
  },
} as const
