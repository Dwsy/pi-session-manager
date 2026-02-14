export const onboarding = {
  skip: 'Überspringen',
  next: 'Weiter',
  prev: 'Zurück',
  finish: 'Loslegen',
  steps: {
    welcome: {
      title: 'Willkommen beim Pi Session Manager',
      description: 'Ein leistungsstarkes Tool zum Durchsuchen, Suchen und Verwalten Ihrer Pi-KI-Coding-Sitzungen. Lassen Sie uns einen kurzen Rundgang durch die wichtigsten Funktionen machen.',
    },
    browse: {
      title: 'Sitzungen nach Projekt durchsuchen',
      description: 'Alle Ihre Coding-Sitzungen sind nach Projekt organisiert. Wechseln Sie zwischen Listen- und Projektansicht, um genau das zu finden, was Sie brauchen.',
      hint: 'Cmd+P zum Wechseln zur Projektansicht',
    },
    search: {
      title: 'Über alle Sitzungen suchen',
      description: 'Verwenden Sie die globale Suche, um Nachrichten, Sitzungen und Projekte in Ihrem gesamten Arbeitsbereich zu finden. Die Sitzungssuche hilft Ihnen, innerhalb einer einzelnen Konversation zu navigieren.',
      hint: 'Cmd+K für globale Suche, Cmd+F für Sitzungssuche',
    },
    tree: {
      title: 'Im Sitzungsbaum navigieren',
      description: 'Die Seitenleiste zeigt den Gesprächsverlauf mit aufklappbaren Zweigen. Klicken Sie auf die Pfeile, um Abschnitte ein- oder auszuklappen und sich auf das Wesentliche zu konzentrieren.',
      hint: 'Knoten anklicken, um zu Nachrichten zu springen; Pfeile zum Ein-/Ausklappen',
    },
    settings: {
      title: 'Passen Sie Ihr Erlebnis an',
      description: 'Passen Sie Themes, Schriftgrößen, Codeblock-Stile, Exportformate und mehr an. Alles ist konfigurierbar, um Ihrem Workflow zu entsprechen.',
      hint: 'Cmd+, um Einstellungen jederzeit zu öffnen',
    },
    services: {
      title: 'Dienste & Funktionen',
      description: 'Wählen Sie, welche Dienste aktiviert werden sollen. WebSocket und HTTP API ermöglichen externen Tools die Verbindung. Das integrierte Terminal ermöglicht direktes Arbeiten in der App.',
      terminal: 'Integriertes Terminal',
      terminalHint: 'Terminal direkt in der App verwenden',
      bindLocal: 'Nur lokaler Zugriff',
      bindRemote: 'LAN-Geräte (Handy/Tablet) verbinden lassen',
      mobileHint: 'Zugriff vom Handy über http://<Ihre-PC-IP>:52131 im Browser — HTTP-Modus wird automatisch gewählt',
      websocket: 'WebSocket',
      httpApi: 'HTTP API',
    },
  },
} as const
