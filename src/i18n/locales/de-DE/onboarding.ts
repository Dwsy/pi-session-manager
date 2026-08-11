export const onboarding = {
  subtitle: 'Ersteinrichtung',
  progressLabel: 'Einrichtungsschritte',
  stepProgress: 'Schritt {{current}} von {{total}}',
  skip: 'Überspringen',
  next: 'Weiter',
  prev: 'Zurück',
  finish: 'Loslegen',
  steps: {
    welcome: {
      title: 'Deine Sitzungsbibliothek',
      description:
        'Pi Session Manager hat diesen Rechner bereits durchsucht. Das wurde gefunden.',
      stats: {
        sessions: 'Sitzungen',
        projects: 'Projekte',
        since: 'Älteste Sitzung',
      },
      scanning: 'Sitzungen werden durchsucht…',
      topProjectsTitle: 'Aktivste Projekte',
      topProjectsEmpty:
        'Noch keine Sitzungen gefunden. Füge im nächsten Schritt eine Quelle hinzu, dann erscheinen sie hier.',
      sessionCount: '{{count}} Sitzungen',
      sessionCount_one: '{{count}} Sitzung',
    },
    sources: {
      title: 'Sitzungsquellen',
      description:
        'Wähle, welche Coding-Agents in deine Bibliothek gehören. Jederzeit in den Einstellungen änderbar.',
      piTitle: 'Pi-Sitzungen',
      piDescription:
        'Das Standardverzeichnis für Pi-Sitzungen gehört immer zur Bibliothek.',
      alwaysOn: 'Immer durchsucht',
      supportedTitle: 'Von PSM durchsuchbare Agents',
      detectedTitle: 'Weitere Agents auf diesem Rechner',
      detectedDescription:
        'Erkannt anhand des Sitzungsverzeichnisses jedes Agents. Aktiviert erscheinen dessen Sitzungen in Liste, Suche und Konvertierung.',
      selectedCount: '{{selected}} von {{total}} aktiviert',
      enabled: 'Enthalten',
      disabled: 'Übersprungen',
      noneTitle: 'Nur Pi-Sitzungen gefunden',
      noneDescription:
        'Claude Code, Codex, Cursor und andere tauchen hier auf, sobald sie Sitzungen auf diesem Rechner haben. Eigene Verzeichnisse lassen sich später in den Einstellungen ergänzen.',
    },
    appearance: {
      title: 'Aussehen und Sprache',
      description:
        'Jede Änderung wirkt sofort — du siehst das Ergebnis, bevor du weitergehst.',
      themeLabel: 'Design',
      themes: {
        dark: 'Dunkel',
        light: 'Hell',
        system: 'System',
      },
      themeHints: {
        dark: 'Tokyo-Night-Palette',
        light: 'Hell und kontrastreich',
        system: 'Dem System folgen',
      },
      fontSizeLabel: 'Textgröße',
      fontSizeHint: 'Gilt sofort für die gesamte App.',
      fontSizes: {
        small: 'Klein',
        medium: 'Mittel',
        large: 'Groß',
      },
      languageLabel: 'Sprache',
      previewLabel: 'Live-Vorschau',
      preview: {
        sidebar: 'Sitzungen',
        userMessage: 'Warum schlägt der Build fehl?',
        assistantMessage:
          'Der Bundler kann den Alias nicht auflösen — ich sehe mir die Konfiguration an.',
        toolResult: 'in 1,24 s gebaut',
      },
    },
    ready: {
      title: 'Startklar',
      description:
        'Ein paar Kürzel zum Navigieren und die Stellen für mehr Kontrolle.',
      shortcutsTitle: 'Wichtige Tastenkürzel',
      shortcuts: {
        palette: 'Befehlspalette',
        search: 'Alle Sitzungen durchsuchen',
        inSessionSearch: 'In dieser Sitzung suchen',
        sidebar: 'Seitenleiste umschalten',
        projectView: 'Nach Projekt gruppieren',
        terminal: 'Terminal umschalten',
        settings: 'Einstellungen öffnen',
        resume: 'Sitzung fortsetzen',
      },
      nextTitle: 'Später feinjustieren',
      links: {
        sources: {
          title: 'Sitzungsquellen',
          description: 'Eigene Verzeichnisse, Datensätze und externe Agents',
        },
        server: {
          title: 'Server und Zugriff',
          description: 'HTTP- und WebSocket-Ports, LAN-Zugriff vom Handy-Browser',
        },
        plugins: {
          title: 'Plugins',
          description: 'Eingebaute Plugins aktivieren oder neue installieren',
        },
      },
    },
  },
} as const
