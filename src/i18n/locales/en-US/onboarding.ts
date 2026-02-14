export const onboarding = {
  skip: 'Skip',
  next: 'Next',
  prev: 'Back',
  finish: 'Get Started',
  steps: {
    welcome: {
      title: 'Welcome to Pi Session Manager',
      description: 'A powerful tool for browsing, searching, and managing your Pi AI coding sessions. Let\'s take a quick tour of the key features.',
    },
    browse: {
      title: 'Browse Sessions by Project',
      description: 'All your coding sessions are organized by project. Switch between list view and project view to find exactly what you need.',
      hint: 'Cmd+P to switch to project view',
    },
    search: {
      title: 'Search Across All Sessions',
      description: 'Use the global search to find messages, sessions, and projects across your entire workspace. In-session search helps you navigate within a single conversation.',
      hint: 'Cmd+K for global search, Cmd+F for in-session search',
    },
    tree: {
      title: 'Navigate the Session Tree',
      description: 'The sidebar tree shows the conversation flow with expandable branches. Click the chevrons to collapse or expand sections and focus on what matters.',
      hint: 'Click nodes to jump to messages, chevrons to collapse',
    },
    settings: {
      title: 'Customize Your Experience',
      description: 'Adjust themes, font sizes, code block styles, export formats, and more. Everything is configurable to match your workflow.',
      hint: 'Cmd+, to open settings anytime',
    },
    services: {
      title: 'Services & Features',
      description: 'Choose which services to enable. WebSocket and HTTP API allow external tools to connect. The built-in terminal lets you work directly inside the app.',
      terminal: 'Built-in Terminal',
      terminalHint: 'Use terminal directly in the app',
      bindLocal: 'Local access only',
      bindRemote: 'Allow LAN devices (phone/tablet) to connect',
      mobileHint: 'Access from mobile via http://<your-PC-IP>:52131 in a browser — HTTP mode is auto-selected',
      websocket: 'WebSocket',
      httpApi: 'HTTP API',
    },
  },
} as const
