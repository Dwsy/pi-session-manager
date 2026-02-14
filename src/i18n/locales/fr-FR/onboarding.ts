export const onboarding = {
  skip: 'Passer',
  next: 'Suivant',
  prev: 'Retour',
  finish: 'Commencer',
  steps: {
    welcome: {
      title: 'Bienvenue dans Pi Session Manager',
      description: 'Un outil puissant pour parcourir, rechercher et gérer vos sessions de codage Pi AI. Faisons un rapide tour des fonctionnalités principales.',
    },
    browse: {
      title: 'Parcourir les sessions par projet',
      description: 'Toutes vos sessions de codage sont organisées par projet. Basculez entre la vue liste et la vue projet pour trouver exactement ce que vous cherchez.',
      hint: 'Cmd+P pour passer en vue projet',
    },
    search: {
      title: 'Rechercher dans toutes les sessions',
      description: 'Utilisez la recherche globale pour trouver des messages, sessions et projets dans tout votre espace de travail. La recherche dans la session vous aide à naviguer dans une conversation.',
      hint: 'Cmd+K pour la recherche globale, Cmd+F pour la recherche dans la session',
    },
    tree: {
      title: 'Naviguer dans l\'arbre de session',
      description: 'L\'arbre latéral affiche le flux de conversation avec des branches dépliables. Cliquez sur les chevrons pour réduire ou développer les sections et vous concentrer sur l\'essentiel.',
      hint: 'Cliquez sur les nœuds pour accéder aux messages, sur les chevrons pour réduire',
    },
    settings: {
      title: 'Personnalisez votre expérience',
      description: 'Ajustez les thèmes, tailles de police, styles de blocs de code, formats d\'exportation et plus encore. Tout est configurable pour s\'adapter à votre flux de travail.',
      hint: 'Cmd+, pour ouvrir les paramètres à tout moment',
    },
    services: {
      title: 'Services et fonctionnalités',
      description: 'Choisissez les services à activer. WebSocket et HTTP API permettent aux outils externes de se connecter. Le terminal intégré vous permet de travailler directement dans l\'application.',
      terminal: 'Terminal intégré',
      terminalHint: 'Utilisez le terminal directement dans l\'application',
      bindLocal: 'Accès local uniquement',
      bindRemote: 'Autoriser les appareils du réseau local (téléphone/tablette) à se connecter',
      mobileHint: 'Accédez depuis un mobile via http://<votre-IP-PC>:52131 dans un navigateur — le mode HTTP est sélectionné automatiquement',
      websocket: 'WebSocket',
      httpApi: 'HTTP API',
    },
  },
} as const
