export const plugins = {
  session: {
    name: 'Búsqueda de sesiones',
    description: 'Buscar nombres y metadatos de sesiones',
  },
  project: {
    name: 'Búsqueda de proyectos',
    description: 'Buscar rutas de proyectos',
  },
  message: {
    name: 'Búsqueda de mensajes',
    description: 'Buscar mensajes de usuario y respuestas del asistente',
  },
  builtin: {
    'code-review': {
      name: 'Revisión de código',
      configuration: {
        title: 'Ajustes de revisión de código',
        description: 'Controla cómo se muestran las diferencias en el modal de revisión de código. Estos ajustes son independientes de los ajustes de apariencia globales.',
      },
      settings: {
        diffView: {
          title: 'Estilo de vista predeterminado',
          description: 'Vista dividida lado a lado o vista unificada en línea',
          options: {
            split: 'Dividida (lado a lado)',
            unified: 'Unificada (en línea)',
          },
        },
        diffLineDiffType: {
          title: 'Granularidad de diferencias de línea',
          description: 'Granularidad del resaltado de diferencias: líneas completas, palabras o caracteres',
          options: {
            words: 'Palabras',
            chars: 'Caracteres',
            full: 'Líneas completas',
          },
        },
        diffLineNumbers: {
          title: 'Mostrar números de línea',
          description: 'Mostrar números de línea en las vistas de diferencias',
        },
        diffWrap: {
          title: 'Ajustar líneas largas',
          description: 'Ajustar líneas largas en lugar de desplazamiento horizontal',
        },
        diffIndicators: {
          title: 'Mostrar indicadores +/-',
          description: 'Mostrar indicadores +/− para líneas añadidas y eliminadas',
        },
        diffExpandUnchanged: {
          title: 'Expandir líneas sin cambios',
          description: 'Expandir regiones sin cambios en las vistas de diferencias de forma predeterminada',
        },
        interceptExpand: {
          title: 'Interceptar expansión de llamadas a herramientas',
          description: 'Abrir llamadas a herramientas revisables en el popup de revisión en lugar de expandirlas en la vista de conversación',
        },
      },
    },
    'semantic-search': {
      name: 'Búsqueda semántica',
      configuration: {
        title: 'Ajustes de búsqueda semántica',
        description: 'Controla opciones clave de la búsqueda semántica, como ámbitos de índice y expansión de consultas con IA.',
      },
      settings: {
        defaultScope: {
          title: 'Ámbito de búsqueda predeterminado',
          description: 'Ámbito predeterminado para la búsqueda semántica',
          options: {
            project: 'Proyecto actual',
            global: 'Todos los proyectos',
          },
        },
        maxResults: {
          title: 'Resultados máximos',
          description: 'Número máximo de resultados de búsqueda a mostrar',
        },
        enableAiExpansion: {
          title: 'Expansión de consultas con IA',
          description: 'Usar IA para expandir consultas de búsqueda con sinónimos y términos relacionados',
        },
        provider: {
          title: 'Proveedor del modelo del agente',
          description: 'Proveedor usado por el agente de búsqueda semántica. Deja vacío para usar el predeterminado del host.',
        },
        model: {
          title: 'Modelo del agente',
          description: 'Modelo usado por el agente de búsqueda semántica. Deja vacío para usar el predeterminado del host.',
        },
      },
    },
    'session-summary': {
      name: 'Resumen de sesión con IA',
      configuration: {
        title: 'Ajustes de resumen de sesión con IA',
        description: 'Controla los valores predeterminados de generación y lo que muestra el panel lateral de inteligencia de sesión.',
      },
      settings: {
        provider: {
          title: 'Proveedor predeterminado',
          description: 'Anulación de proveedor opcional. Deja vacío para selección automática del host.',
        },
        model: {
          title: 'Modelo predeterminado',
          description: 'Anulación de modelo opcional. Deja vacío para selección automática del host.',
        },
        language: {
          title: 'Idioma del resumen',
          description: 'Idioma de destino para el resumen generado',
          options: {
            auto: 'Auto',
            'en-US': 'Inglés',
            'zh-CN': 'Chino simplificado',
            'ja-JP': 'Japonés',
          },
        },
        autoOpenAfterRefresh: {
          title: 'Abrir resultado tras actualizar',
          description: 'Mostrar el panel automáticamente tras generar el resumen',
        },
        showMetadata: {
          title: 'Mostrar mosaicos de metadatos',
          description: 'Mostrar mosaicos de metadatos sobre tamaño, rama, tokens, etc.',
        },
        showTopics: {
          title: 'Mostrar temas',
          description: 'Mostrar los temas detectados en la sesión',
        },
        showNextSteps: {
          title: 'Mostrar siguientes pasos',
          description: 'Mostrar las acciones recomendadas siguientes',
        },
        showUnresolved: {
          title: 'Mostrar tareas sin resolver',
          description: 'Mostrar las tareas de código sin resolver en la sesión',
        },
      },
    },
    sidechat: {
      name: 'Chat lateral',
      configuration: {
        title: 'Ajustes del chat lateral',
        description: 'Valores predeterminados usados por el panel de chat lateral de la sesión y el comando de chat lateral.',
      },
      settings: {
        provider: {
          title: 'Proveedor predeterminado',
          description: 'Anulación de proveedor opcional. Deja vacío para selección automática del host.',
        },
        model: {
          title: 'Modelo predeterminado',
          description: 'Anulación de modelo opcional. Deja vacío para selección automática del host.',
        },
        thinkingLevel: {
          title: 'Nivel de razonamiento',
          description: 'Nivel de las salidas de razonamiento',
          options: {
            off: 'Desactivado',
            minimal: 'Mínimo',
            low: 'Bajo',
            medium: 'Medio',
            high: 'Alto',
            xhigh: 'Muy alto',
          },
        },
        snippetLimit: {
          title: 'Límite de fragmentos',
          description: 'Cuántas citas/fragmentos recuperar para cada respuesta.',
        },
        panelWidth: {
          title: 'Ancho del panel',
          description: 'Ancho predeterminado del panel derecho en píxeles.',
        },
        optionsExpanded: {
          title: 'Mostrar opciones de forma predeterminada',
          description: 'Mostrar los ajustes de parámetros del modelo de forma predeterminada',
        },
        showQuickPrompts: {
          title: 'Mostrar sugerencias rápidas',
          description: 'Mostrar sugerencias útiles de acción rápida de un clic',
        },
      },
    },
    'generative-ui-renderer': {
      name: 'Renderizador de UI generativa',
      configuration: {
        title: 'Renderizador de UI generativa',
        description: 'Permite a los plugins integrados y locales renderizar widgets y ventanas enriquecidas generativas en las sesiones.',
      },
    },
    'kanban-board': {
      name: 'Tablero Kanban',
      configuration: {
        title: 'Tablero Kanban',
        description: 'Ver y gestionar sesiones mediante un tablero visual agrupado por proyectos, etiquetas y rangos de tiempo.',
      },
    },
    'session-graph': {
      name: 'Grafo de sesión',
      configuration: {
        title: 'Grafo de sesión',
        description: 'Visualizar la evolución de sesiones multirrama y los nodos de contexto en un grafo interactivo.',
      },
    },
    trace: {
      name: 'Traza de sesión',
      configuration: {
        title: 'Traza de sesión',
        description: 'Rastrear y auditar los detalles de ejecución de llamadas al modelo e invocaciones de herramientas.',
      },
    },
    'word-cloud': {
      name: 'Ajustes de nube de palabras',
      configuration: {
        title: 'Ajustes de nube de palabras',
        description: 'Genera nubes de palabras visuales basadas en las frecuencias de mensajes del usuario en las sesiones.',
      },
      settings: {
        minWordLength: {
          title: 'Longitud mínima de palabra',
          description: 'Número mínimo de caracteres para que una palabra sea contada.',
        },
        maxWords: {
          title: 'Palabras máximas',
          description: 'Número máximo de palabras a mostrar en la nube.',
        },
      },
    },
  },
} as const
