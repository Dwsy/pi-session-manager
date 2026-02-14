export const onboarding = {
  skip: 'Omitir',
  next: 'Siguiente',
  prev: 'Atrás',
  finish: 'Empezar',
  steps: {
    welcome: {
      title: 'Bienvenido a Pi Session Manager',
      description: 'Una herramienta potente para explorar, buscar y gestionar tus sesiones de Pi AI. Hagamos un recorrido rápido por las funciones principales.',
    },
    browse: {
      title: 'Explorar sesiones por proyecto',
      description: 'Todas tus sesiones de programación están organizadas por proyecto. Alterna entre vista de lista y vista de proyecto para encontrar lo que necesitas.',
      hint: 'Cmd+P para cambiar a vista de proyecto',
    },
    search: {
      title: 'Buscar en todas las sesiones',
      description: 'Usa la búsqueda global para encontrar mensajes, sesiones y proyectos en todo tu espacio de trabajo. La búsqueda dentro de la sesión te ayuda a navegar en una conversación.',
      hint: 'Cmd+K para búsqueda global, Cmd+F para buscar en la sesión',
    },
    tree: {
      title: 'Navegar por el árbol de sesión',
      description: 'La barra lateral muestra el flujo de la conversación con ramas expandibles. Haz clic en los chevrones para contraer o expandir secciones y centrarte en lo importante.',
      hint: 'Clic en los nodos para ir a los mensajes, chevrones para contraer',
    },
    settings: {
      title: 'Personaliza tu experiencia',
      description: 'Ajusta temas, tamaños de fuente, estilos de bloques de código, formatos de exportación y más. Todo es configurable para adaptarse a tu flujo de trabajo.',
      hint: 'Cmd+, para abrir ajustes en cualquier momento',
    },
    services: {
      title: 'Servicios y funciones',
      description: 'Elige qué servicios activar. WebSocket y HTTP API permiten que herramientas externas se conecten. El terminal integrado te permite trabajar directamente dentro de la aplicación.',
      terminal: 'Terminal integrado',
      terminalHint: 'Usa el terminal directamente en la aplicación',
      bindLocal: 'Solo acceso local',
      bindRemote: 'Permitir dispositivos de la red local (móvil/tablet)',
      mobileHint: 'Accede desde el móvil vía http://<IP-de-tu-PC>:52131 en un navegador — el modo HTTP se selecciona automáticamente',
      websocket: 'WebSocket',
      httpApi: 'HTTP API',
    },
  },
} as const
