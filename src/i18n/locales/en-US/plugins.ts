export const plugins = {
  session: {
    name: 'Session Search',
    description: 'Search session names and metadata',
  },
  project: {
    name: 'Project Search',
    description: 'Search project paths',
  },
  message: {
    name: 'Message Search',
    description: 'Search user messages and assistant replies',
  },
  builtin: {
    'code-review': {
      name: 'Code Review',
      configuration: {
        title: 'Code Review Settings',
        description: 'Controls how diffs are displayed in the code review modal. These settings are independent from the global appearance settings.',
      },
      settings: {
        diffView: {
          title: 'Default View Style',
          description: 'Side-by-side split view or unified inline view',
          options: {
            split: 'Split (Side-by-side)',
            unified: 'Unified (Inline)',
          },
        },
        diffLineDiffType: {
          title: 'Line Diff Granularity',
          description: 'Granularity of diff highlighting: full lines, words, or characters',
          options: {
            words: 'Words',
            chars: 'Characters',
            full: 'Full Lines',
          },
        },
        diffLineNumbers: {
          title: 'Show Line Numbers',
          description: 'Display line numbers in diff views',
        },
        diffWrap: {
          title: 'Wrap Long Lines',
          description: 'Wrap long lines instead of horizontal scrolling',
        },
        diffIndicators: {
          title: 'Show +/- Indicators',
          description: 'Show +/− indicators for added and removed lines',
        },
        diffExpandUnchanged: {
          title: 'Expand Unchanged Lines',
          description: 'Expand unchanged regions in diff views by default',
        },
        interceptExpand: {
          title: 'Intercept Tool Call Expand',
          description: 'Open reviewable tool calls in the review popup instead of expanding them in the conversation view',
        },
      },
    },
    'semantic-search': {
      name: 'Semantic Search',
      configuration: {
        title: 'Semantic Search Settings',
        description: 'Controls key options for semantic search, such as index scopes and AI query expansion.',
      },
      settings: {
        defaultScope: {
          title: 'Default Search Scope',
          description: 'Default scope for semantic search',
          options: {
            project: 'Current Project',
            global: 'All Projects',
          },
        },
        maxResults: {
          title: 'Max Results',
          description: 'Maximum number of search results to display',
        },
        enableAiExpansion: {
          title: 'AI Query Expansion',
          description: 'Use AI to expand search queries with synonyms and related terms',
        },
        provider: {
          title: 'Agent Model Provider',
          description: 'Provider used by the semantic search agent. Leave empty to use the host default.',
        },
        model: {
          title: 'Agent Model',
          description: 'Model used by the semantic search agent. Leave empty to use the host default.',
        },
      },
    },
    'session-summary': {
      name: 'AI Session Summary',
      configuration: {
        title: 'AI Session Summary Settings',
        description: 'Controls generation defaults and what the session intelligence side panel displays.',
      },
      settings: {
        provider: {
          title: 'Default provider',
          description: 'Optional provider override. Leave empty for host auto selection.',
        },
        model: {
          title: 'Default model',
          description: 'Optional model override. Leave empty for host auto selection.',
        },
        language: {
          title: 'Summary language',
          description: 'Target language for the generated summary',
          options: {
            auto: 'Auto',
            'en-US': 'English',
            'zh-CN': '简体中文',
            'ja-JP': '日本語',
          },
        },
        autoOpenAfterRefresh: {
          title: 'Open result after refresh',
          description: 'Automatically show panel after generating summary',
        },
        showMetadata: {
          title: 'Show metadata tiles',
          description: 'Show metadata tiles about size, branch, tokens etc.',
        },
        showTopics: {
          title: 'Show topics',
          description: 'Show detected topics in the session',
        },
        showNextSteps: {
          title: 'Show next steps',
          description: 'Show recommended next actions',
        },
        showUnresolved: {
          title: 'Show unresolved tasks',
          description: 'Show unresolved code tasks in the session',
        },
      },
    },
    sidechat: {
      name: 'Sidechat',
      configuration: {
        title: 'Sidechat Settings',
        description: 'Defaults used by the session sidechat panel and sidechat command.',
      },
      settings: {
        provider: {
          title: 'Default provider',
          description: 'Optional provider override. Leave empty for host auto selection.',
        },
        model: {
          title: 'Default model',
          description: 'Optional model override. Leave empty for host auto selection.',
        },
        thinkingLevel: {
          title: 'Thinking level',
          description: 'Level of reasoning outputs',
          options: {
            off: 'Off',
            minimal: 'Minimal',
            low: 'Low',
            medium: 'Medium',
            high: 'High',
            xhigh: 'X High',
          },
        },
        snippetLimit: {
          title: 'Snippet limit',
          description: 'How many citations/snippets to retrieve for each answer.',
        },
        panelWidth: {
          title: 'Panel width',
          description: 'Default right panel width in pixels.',
        },
        optionsExpanded: {
          title: 'Show options by default',
          description: 'Display model parameter settings by default',
        },
        showQuickPrompts: {
          title: 'Show quick prompts',
          description: 'Display helpful one-click quick action suggestions',
        },
      },
    },
    'generative-ui-renderer': {
      name: 'Generative UI Renderer',
      configuration: {
        title: 'Generative UI Renderer',
        description: 'Allows built-in and local plugins to render generative rich widgets and windows in sessions.',
      },
    },
    'kanban-board': {
      name: 'Kanban Board',
      configuration: {
        title: 'Kanban Board',
        description: 'View and manage sessions via a visual board grouped by projects, tags, and time ranges.',
      },
    },
    'session-graph': {
      name: 'Session Graph',
      configuration: {
        title: 'Session Graph',
        description: 'Visualize multi-branch session evolution and context nodes in an interactive graph.',
      },
    },
    trace: {
      name: 'Session Trace',
      configuration: {
        title: 'Session Trace',
        description: 'Trace and audit execution details of model calls and tool invocations.',
      },
    },
    'word-cloud': {
      name: 'Word Cloud Settings',
      configuration: {
        title: 'Word Cloud Settings',
        description: 'Generates visual word clouds based on user message frequencies in sessions.',
      },
      settings: {
        minWordLength: {
          title: 'Minimum Word Length',
          description: 'Minimum number of characters for a word to be counted.',
        },
        maxWords: {
          title: 'Maximum Words',
          description: 'Maximum number of words to display in the cloud.',
        },
      },
    },
  },
} as const
