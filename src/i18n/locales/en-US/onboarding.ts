export const onboarding = {
  subtitle: 'First-launch setup',
  progressLabel: 'Onboarding steps',
  stepProgress: 'Step {{current}} of {{total}}',
  skip: 'Skip setup',
  next: 'Next',
  prev: 'Back',
  finish: 'Start using',
  steps: {
    welcome: {
      title: 'Your session library',
      description:
        'Pi Session Manager already scanned this machine. Here is what it found.',
      stats: {
        sessions: 'Sessions',
        projects: 'Projects',
        since: 'Earliest session',
      },
      scanning: 'Scanning sessions…',
      topProjectsTitle: 'Busiest projects',
      topProjectsEmpty:
        'No sessions found yet. Add a source in the next step and they will show up here.',
      sessionCount: '{{count}} sessions',
      sessionCount_one: '{{count}} session',
    },
    sources: {
      title: 'Session sources',
      description:
        'Choose which coding agents belong in your library. You can change this at any time in Settings.',
      piTitle: 'Pi sessions',
      piDescription:
        'The default Pi session directory is always part of your library.',
      alwaysOn: 'Always scanned',
      supportedTitle: 'Agents PSM can scan',
      detectedTitle: 'Other agents found on this machine',
      detectedDescription:
        "Detected by looking for each agent's session directory. Enabling one adds its sessions to the list, search, and conversions.",
      selectedCount: '{{selected}} of {{total}} enabled',
      enabled: 'Included',
      disabled: 'Skipped',
      noneTitle: 'Only Pi sessions found',
      noneDescription:
        'Claude Code, Codex, Cursor and others show up here once they have sessions on this machine. Custom directories can be added in Settings later.',
    },
    appearance: {
      title: 'Look and language',
      description:
        'Every change applies immediately, so you can see the result before moving on.',
      themeLabel: 'Theme',
      themes: {
        dark: 'Dark',
        light: 'Light',
        system: 'System',
      },
      themeHints: {
        dark: 'Tokyo Night surfaces',
        light: 'Bright, high contrast',
        system: 'Follow the OS',
      },
      fontSizeLabel: 'Text size',
      fontSizeHint: 'Applies to the whole app right away.',
      fontSizes: {
        small: 'Small',
        medium: 'Medium',
        large: 'Large',
      },
      languageLabel: 'Language',
      previewLabel: 'Live preview',
      preview: {
        sidebar: 'Sessions',
        userMessage: 'Why is the build failing?',
        assistantMessage:
          'The bundler cannot resolve the alias — let me check the config.',
        toolResult: 'built in 1.24s',
      },
    },
    ready: {
      title: 'Ready to go',
      description:
        'A few shortcuts to get around, and where to look when you want more control.',
      shortcutsTitle: 'Shortcuts worth knowing',
      shortcuts: {
        palette: 'Command palette',
        search: 'Search all sessions',
        inSessionSearch: 'Search in this session',
        sidebar: 'Toggle sidebar',
        projectView: 'Group by project',
        terminal: 'Toggle terminal',
        settings: 'Open settings',
        resume: 'Resume session',
      },
      nextTitle: 'Fine-tune later',
      links: {
        sources: {
          title: 'Session sources',
          description: 'Custom directories, datasets, and external agents',
        },
        server: {
          title: 'Server and access',
          description: 'HTTP and WebSocket ports, LAN access for phone browsers',
        },
        plugins: {
          title: 'Plugins',
          description: 'Enable built-in plugins or install new ones',
        },
      },
    },
  },
} as const
