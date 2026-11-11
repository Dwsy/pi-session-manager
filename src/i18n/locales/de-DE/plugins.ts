export const plugins = {
  session: {
    name: 'Sitzungssuche',
    description: 'Sitzungsnamen und Metadaten durchsuchen',
  },
  project: {
    name: 'Projektsuche',
    description: 'Projektpfade durchsuchen',
  },
  message: {
    name: 'Nachrichtensuche',
    description: 'Benutzernachrichten und Assistenzantworten durchsuchen',
  },
  builtin: {
    'code-review': {
      name: 'Code-Review',
      configuration: {
        title: 'Code-Review-Einstellungen',
        description: 'Steuert, wie Diffs im Code-Review-Modal angezeigt werden. Diese Einstellungen sind unabhängig von den globalen Darstellungseinstellungen.',
      },
      settings: {
        diffView: {
          title: 'Standard-Darstellungsstil',
          description: 'Nebeneinander-Ansicht oder vereinheitlichte Inline-Ansicht',
          options: {
            split: 'Geteilt (nebeneinander)',
            unified: 'Vereinheitlicht (inline)',
          },
        },
        diffLineDiffType: {
          title: 'Granularität der Zeilen-Unterschiede',
          description: 'Granularität der Diff-Hervorhebung: ganze Zeilen, Wörter oder Zeichen',
          options: {
            words: 'Wörter',
            chars: 'Zeichen',
            full: 'Ganze Zeilen',
          },
        },
        diffLineNumbers: {
          title: 'Zeilennummern anzeigen',
          description: 'Zeilennummern in Diff-Ansichten anzeigen',
        },
        diffWrap: {
          title: 'Lange Zeilen umbrechen',
          description: 'Lange Zeilen umbrechen statt horizontal zu scrollen',
        },
        diffIndicators: {
          title: '+/- Indikatoren anzeigen',
          description: '+/− Indikatoren für hinzugefügte und entfernte Zeilen anzeigen',
        },
        diffExpandUnchanged: {
          title: 'Unveränderte Zeilen ausklappen',
          description: 'Unveränderte Bereiche in Diff-Ansichten standardmäßig ausklappen',
        },
        interceptExpand: {
          title: 'Tool-Call-Ausklappen abfangen',
          description: 'Überprüfbare Tool-Calls im Prüf-Popup öffnen, statt sie in der Konversationsansicht auszuklappen',
        },
      },
    },
    'semantic-search': {
      name: 'Semantische Suche',
      configuration: {
        title: 'Einstellungen für semantische Suche',
        description: 'Steuert wichtige Optionen für die semantische Suche, wie Indexbereiche und KI-Abfrageerweiterung.',
      },
      settings: {
        defaultScope: {
          title: 'Standard-Suchbereich',
          description: 'Standardbereich für die semantische Suche',
          options: {
            project: 'Aktuelles Projekt',
            global: 'Alle Projekte',
          },
        },
        maxResults: {
          title: 'Maximale Ergebnisse',
          description: 'Maximale Anzahl anzuzeigender Suchergebnisse',
        },
        enableAiExpansion: {
          title: 'KI-Abfrageerweiterung',
          description: 'KI verwenden, um Suchanfragen mit Synonymen und verwandten Begriffen zu erweitern',
        },
        provider: {
          title: 'Agent-Modell-Anbieter',
          description: 'Vom semantischen Suchagenten verwendeter Anbieter. Leer lassen, um den Host-Standard zu verwenden.',
        },
        model: {
          title: 'Agent-Modell',
          description: 'Vom semantischen Suchagenten verwendetes Modell. Leer lassen, um den Host-Standard zu verwenden.',
        },
      },
    },
    'session-summary': {
      name: 'KI-Sitzungszusammenfassung',
      configuration: {
        title: 'Einstellungen für KI-Sitzungszusammenfassung',
        description: 'Steuert Generierungsstandards und die Anzeige des Sitzungs-Intelligence-Seitenpanels.',
      },
      settings: {
        provider: {
          title: 'Standard-Anbieter',
          description: 'Optionale Anbieter-Überschreibung. Leer lassen für automatische Host-Auswahl.',
        },
        model: {
          title: 'Standard-Modell',
          description: 'Optionale Modell-Überschreibung. Leer lassen für automatische Host-Auswahl.',
        },
        language: {
          title: 'Zusammenfassungssprache',
          description: 'Zielsprache für die generierte Zusammenfassung',
          options: {
            auto: 'Auto',
            'en-US': 'Englisch',
            'zh-CN': 'Vereinfachtes Chinesisch',
            'ja-JP': 'Japanisch',
          },
        },
        autoOpenAfterRefresh: {
          title: 'Ergebnis nach Aktualisierung öffnen',
          description: 'Panel nach Generierung der Zusammenfassung automatisch anzeigen',
        },
        showMetadata: {
          title: 'Metadaten-Kacheln anzeigen',
          description: 'Metadaten-Kacheln zu Größe, Branch, Tokens usw. anzeigen',
        },
        showTopics: {
          title: 'Themen anzeigen',
          description: 'Erkannte Themen in der Sitzung anzeigen',
        },
        showNextSteps: {
          title: 'Nächste Schritte anzeigen',
          description: 'Empfohlene nächste Aktionen anzeigen',
        },
        showUnresolved: {
          title: 'Ungelöste Aufgaben anzeigen',
          description: 'Ungelöste Code-Aufgaben in der Sitzung anzeigen',
        },
      },
    },
    sidechat: {
      name: 'Sidechat',
      configuration: {
        title: 'Sidechat-Einstellungen',
        description: 'Vom Sitzungs-Sidechat-Panel und Sidechat-Befehl verwendete Standardwerte.',
      },
      settings: {
        provider: {
          title: 'Standard-Anbieter',
          description: 'Optionale Anbieter-Überschreibung. Leer lassen für automatische Host-Auswahl.',
        },
        model: {
          title: 'Standard-Modell',
          description: 'Optionale Modell-Überschreibung. Leer lassen für automatische Host-Auswahl.',
        },
        thinkingLevel: {
          title: 'Denkstufe',
          description: 'Stufe der Denk-Ausgaben',
          options: {
            off: 'Aus',
            minimal: 'Minimal',
            low: 'Niedrig',
            medium: 'Mittel',
            high: 'Hoch',
            xhigh: 'Sehr hoch',
          },
        },
        snippetLimit: {
          title: 'Snippet-Limit',
          description: 'Wie viele Zitate/Snippets pro Antwort abgerufen werden.',
        },
        panelWidth: {
          title: 'Panel-Breite',
          description: 'Standard-Breite des rechten Panels in Pixeln.',
        },
        optionsExpanded: {
          title: 'Optionen standardmäßig anzeigen',
          description: 'Modellparameter-Einstellungen standardmäßig anzeigen',
        },
        showQuickPrompts: {
          title: 'Schnellaktionen anzeigen',
          description: 'Hilfreiche Ein-Klick-Schnellaktionen anzeigen',
        },
      },
    },
    'generative-ui-renderer': {
      name: 'Generativer UI-Renderer',
      configuration: {
        title: 'Generativer UI-Renderer',
        description: 'Ermöglicht integrierten und lokalen Plugins, generative Rich-Widgets und Fenster in Sitzungen darzustellen.',
      },
    },
    'kanban-board': {
      name: 'Kanban-Board',
      configuration: {
        title: 'Kanban-Board',
        description: 'Sitzungen über ein visuelles Board anzeigen und verwalten, gruppiert nach Projekten, Tags und Zeiträumen.',
      },
    },
    'session-graph': {
      name: 'Sitzungsgraph',
      configuration: {
        title: 'Sitzungsgraph',
        description: 'Mehrzweig-Sitzungsentwicklung und Kontextknoten in einem interaktiven Graphen visualisieren.',
      },
    },
    trace: {
      name: 'Sitzungs-Trace',
      configuration: {
        title: 'Sitzungs-Trace',
        description: 'Ausführungsdetails von Modellaufrufen und Tool-Aufrufen nachverfolgen und prüfen.',
      },
    },
    'word-cloud': {
      name: 'Wortwolke',
      configuration: {
        title: 'Wortwolken-Einstellungen',
        description: 'Generiert visuelle Wortwolken basierend auf der Häufigkeit von Benutzernachrichten in Sitzungen.',
      },
      settings: {
        minWordLength: {
          title: 'Minimale Wortlänge',
          description: 'Minimale Anzahl Zeichen, damit ein Wort gezählt wird.',
        },
        maxWords: {
          title: 'Maximale Wörter',
          description: 'Maximale Anzahl in der Wolke anzuzeigender Wörter.',
        },
      },
    },
  },
} as const
