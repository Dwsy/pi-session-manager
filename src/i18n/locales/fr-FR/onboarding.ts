export const onboarding = {
  subtitle: 'Configuration initiale',
  progressLabel: 'Étapes de configuration',
  stepProgress: 'Étape {{current}} sur {{total}}',
  skip: 'Ignorer',
  next: 'Suivant',
  prev: 'Retour',
  finish: 'Commencer',
  steps: {
    welcome: {
      title: 'Votre bibliothèque de sessions',
      description:
        'Pi Session Manager a déjà analysé cette machine. Voici ce qu’il a trouvé.',
      stats: {
        sessions: 'Sessions',
        projects: 'Projets',
        since: 'Session la plus ancienne',
      },
      scanning: 'Analyse des sessions…',
      topProjectsTitle: 'Projets les plus actifs',
      topProjectsEmpty:
        'Aucune session pour le moment. Ajoutez une source à l’étape suivante et elles apparaîtront ici.',
      sessionCount: '{{count}} sessions',
      sessionCount_one: '{{count}} session',
    },
    sources: {
      title: 'Sources de sessions',
      description:
        'Choisissez les agents de code à inclure dans votre bibliothèque. Modifiable à tout moment dans les réglages.',
      piTitle: 'Sessions Pi',
      piDescription:
        'Le dossier de sessions Pi par défaut fait toujours partie de la bibliothèque.',
      alwaysOn: 'Toujours analysé',
      supportedTitle: 'Agents analysables par PSM',
      detectedTitle: 'Autres agents trouvés sur cette machine',
      detectedDescription:
        'Détectés en cherchant le dossier de sessions de chaque agent. Une fois activés, leurs sessions rejoignent la liste, la recherche et les conversions.',
      selectedCount: '{{selected}} sur {{total}} activés',
      enabled: 'Inclus',
      disabled: 'Ignoré',
      noneTitle: 'Seules des sessions Pi ont été trouvées',
      noneDescription:
        'Claude Code, Codex, Cursor et les autres apparaîtront ici dès qu’ils auront des sessions sur cette machine. Les dossiers personnalisés s’ajoutent plus tard dans les réglages.',
    },
    appearance: {
      title: 'Apparence et langue',
      description:
        'Chaque changement s’applique immédiatement : vous voyez le résultat avant de continuer.',
      themeLabel: 'Thème',
      themes: {
        dark: 'Sombre',
        light: 'Clair',
        system: 'Système',
      },
      themeHints: {
        dark: 'Palette Tokyo Night',
        light: 'Lumineux, fort contraste',
        system: 'Suivre le système',
      },
      fontSizeLabel: 'Taille du texte',
      fontSizeHint: 'S’applique immédiatement à toute l’application.',
      fontSizes: {
        small: 'Petite',
        medium: 'Moyenne',
        large: 'Grande',
      },
      languageLabel: 'Langue',
      previewLabel: 'Aperçu en direct',
      preview: {
        sidebar: 'Sessions',
        userMessage: 'Pourquoi la compilation échoue-t-elle ?',
        assistantMessage:
          'Le bundler ne résout pas l’alias — je vérifie la configuration.',
        toolResult: 'compilé en 1,24 s',
      },
    },
    ready: {
      title: 'Tout est prêt',
      description:
        'Quelques raccourcis pour naviguer, et où aller pour aller plus loin.',
      shortcutsTitle: 'Raccourcis à connaître',
      shortcuts: {
        palette: 'Palette de commandes',
        search: 'Rechercher dans toutes les sessions',
        inSessionSearch: 'Rechercher dans cette session',
        sidebar: 'Afficher/masquer la barre latérale',
        projectView: 'Grouper par projet',
        terminal: 'Afficher/masquer le terminal',
        settings: 'Ouvrir les réglages',
        resume: 'Reprendre la session',
      },
      nextTitle: 'À ajuster plus tard',
      links: {
        sources: {
          title: 'Sources de sessions',
          description: 'Dossiers personnalisés, jeux de données et agents externes',
        },
        server: {
          title: 'Serveur et accès',
          description:
            'Ports HTTP et WebSocket, accès réseau local depuis un téléphone',
        },
        plugins: {
          title: 'Extensions',
          description: 'Activer les extensions intégrées ou en installer d’autres',
        },
      },
    },
  },
} as const
