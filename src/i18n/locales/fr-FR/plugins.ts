export const plugins = {
  session: {
    name: 'Recherche de sessions',
    description: 'Rechercher dans les noms et métadonnées des sessions',
  },
  project: {
    name: 'Recherche de projets',
    description: 'Rechercher dans les chemins de projets',
  },
  message: {
    name: 'Recherche de messages',
    description: 'Rechercher dans les messages utilisateur et les réponses de l\'assistant',
  },
  builtin: {
    'code-review': {
      name: 'Revue de code',
      configuration: {
        title: 'Paramètres de la revue de code',
        description: 'Contrôle l\'affichage des diffs dans la modale de revue de code. Ces paramètres sont indépendants des paramètres d\'apparence globaux.',
      },
      settings: {
        diffView: {
          title: 'Style de vue par défaut',
          description: 'Vue scindée côte à côte ou vue en ligne unifiée',
          options: {
            split: 'Scindée (côte à côte)',
            unified: 'Unifiée (en ligne)',
          },
        },
        diffLineDiffType: {
          title: 'Granularité du diff de ligne',
          description: 'Granularité de la coloration du diff : lignes entières, mots ou caractères',
          options: {
            words: 'Mots',
            chars: 'Caractères',
            full: 'Lignes entières',
          },
        },
        diffLineNumbers: {
          title: 'Afficher les numéros de ligne',
          description: 'Afficher les numéros de ligne dans les vues de diff',
        },
        diffWrap: {
          title: 'Retour à la ligne des longues lignes',
          description: 'Retourner les longues lignes au lieu du défilement horizontal',
        },
        diffIndicators: {
          title: 'Afficher les indicateurs +/−',
          description: 'Afficher les indicateurs +/− pour les lignes ajoutées et supprimées',
        },
        diffExpandUnchanged: {
          title: 'Développer les lignes inchangées',
          description: 'Développer par défaut les régions inchangées dans les vues de diff',
        },
        interceptExpand: {
          title: 'Intercepter le développement des appels d\'outils',
          description: 'Ouvrir les appels d\'outils examinables dans la popup de revue au lieu de les développer dans la vue de conversation',
        },
      },
    },
    'semantic-search': {
      name: 'Recherche sémantique',
      configuration: {
        title: 'Paramètres de la recherche sémantique',
        description: 'Contrôle les options clés de la recherche sémantique, comme les portées d\'index et l\'expansion de requêtes par IA.',
      },
      settings: {
        defaultScope: {
          title: 'Portée de recherche par défaut',
          description: 'Portée par défaut de la recherche sémantique',
          options: {
            project: 'Projet actif',
            global: 'Tous les projets',
          },
        },
        maxResults: {
          title: 'Résultats maximum',
          description: 'Nombre maximum de résultats de recherche à afficher',
        },
        enableAiExpansion: {
          title: 'Expansion de requêtes par IA',
          description: 'Utiliser l\'IA pour étendre les requêtes avec des synonymes et termes associés',
        },
        provider: {
          title: 'Fournisseur du modèle de l\'agent',
          description: 'Fournisseur utilisé par l\'agent de recherche sémantique. Laisser vide pour utiliser la valeur par défaut de l\'hôte.',
        },
        model: {
          title: 'Modèle de l\'agent',
          description: 'Modèle utilisé par l\'agent de recherche sémantique. Laisser vide pour utiliser la valeur par défaut de l\'hôte.',
        },
      },
    },
    'session-summary': {
      name: 'Résumé de session IA',
      configuration: {
        title: 'Paramètres du résumé de session IA',
        description: 'Contrôle les valeurs par défaut de génération et l\'affichage du panneau latéral d\'intelligence de session.',
      },
      settings: {
        provider: {
          title: 'Fournisseur par défaut',
          description: 'Substitution de fournisseur facultative. Laisser vide pour la sélection automatique de l\'hôte.',
        },
        model: {
          title: 'Modèle par défaut',
          description: 'Substitution de modèle facultative. Laisser vide pour la sélection automatique de l\'hôte.',
        },
        language: {
          title: 'Langue du résumé',
          description: 'Langue cible du résumé généré',
          options: {
            auto: 'Auto',
            'en-US': 'English',
            'zh-CN': '简体中文',
            'ja-JP': '日本語',
          },
        },
        autoOpenAfterRefresh: {
          title: 'Ouvrir le résultat après actualisation',
          description: 'Afficher automatiquement le panneau après génération du résumé',
        },
        showMetadata: {
          title: 'Afficher les tuiles de métadonnées',
          description: 'Afficher les tuiles de métadonnées sur la taille, la branche, les tokens, etc.',
        },
        showTopics: {
          title: 'Afficher les sujets',
          description: 'Afficher les sujets détectés dans la session',
        },
        showNextSteps: {
          title: 'Afficher les prochaines étapes',
          description: 'Afficher les actions recommandées',
        },
        showUnresolved: {
          title: 'Afficher les tâches non résolues',
          description: 'Afficher les tâches de code non résolues dans la session',
        },
      },
    },
    sidechat: {
      name: 'Chat latéral',
      configuration: {
        title: 'Paramètres du chat latéral',
        description: 'Valeurs par défaut utilisées par le panneau de chat latéral de session et la commande sidechat.',
      },
      settings: {
        provider: {
          title: 'Fournisseur par défaut',
          description: 'Substitution de fournisseur facultative. Laisser vide pour la sélection automatique de l\'hôte.',
        },
        model: {
          title: 'Modèle par défaut',
          description: 'Substitution de modèle facultative. Laisser vide pour la sélection automatique de l\'hôte.',
        },
        thinkingLevel: {
          title: 'Niveau de réflexion',
          description: 'Niveau des sorties de raisonnement',
          options: {
            off: 'Désactivé',
            minimal: 'Minimal',
            low: 'Faible',
            medium: 'Moyen',
            high: 'Élevé',
            xhigh: 'Très élevé',
          },
        },
        snippetLimit: {
          title: 'Limite d\'extraits',
          description: 'Nombre de citations/extraits à récupérer pour chaque réponse.',
        },
        panelWidth: {
          title: 'Largeur du panneau',
          description: 'Largeur par défaut du panneau droit en pixels.',
        },
        optionsExpanded: {
          title: 'Afficher les options par défaut',
          description: 'Afficher par défaut les paramètres du modèle',
        },
        showQuickPrompts: {
          title: 'Afficher les prompts rapides',
          description: 'Afficher des suggestions d\'actions rapides en un clic',
        },
      },
    },
    'generative-ui-renderer': {
      name: 'Rendu d\'UI générative',
      configuration: {
        title: 'Rendu d\'UI générative',
        description: 'Permet aux plugins intégrés et locaux de rendre des widgets riches génératifs et des fenêtres dans les sessions.',
      },
    },
    'kanban-board': {
      name: 'Tableau Kanban',
      configuration: {
        title: 'Tableau Kanban',
        description: 'Visualiser et gérer les sessions via un tableau visuel groupé par projets, étiquettes et plages de temps.',
      },
    },
    'session-graph': {
      name: 'Graphe de session',
      configuration: {
        title: 'Graphe de session',
        description: 'Visualiser l\'évolution multi-branches des sessions et les nœuds de contexte dans un graphe interactif.',
      },
    },
    trace: {
      name: 'Trace de session',
      configuration: {
        title: 'Trace de session',
        description: 'Tracer et auditer les détails d\'exécution des appels de modèle et des invocations d\'outils.',
      },
    },
    'word-cloud': {
      name: 'Paramètres du nuage de mots',
      configuration: {
        title: 'Paramètres du nuage de mots',
        description: 'Génère des nuages de mots visuels basés sur la fréquence des messages utilisateur dans les sessions.',
      },
      settings: {
        minWordLength: {
          title: 'Longueur minimale des mots',
          description: 'Nombre minimum de caractères pour qu\'un mot soit compté.',
        },
        maxWords: {
          title: 'Nombre maximum de mots',
          description: 'Nombre maximum de mots à afficher dans le nuage.',
        },
      },
    },
  },
} as const
