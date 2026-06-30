/**
 * Code block theme definitions with metadata for preview cards.
 *
 * Curated from high-star editor themes (VS Code, GitHub, Catppuccin, etc.)
 * All themes are available in Shiki's bundled theme set.
 */

export interface CodeThemeMeta {
  /** Shiki theme identifier, or 'github' for follow-system */
  id: string
  /** Display name */
  label: string
  /** Light or dark scheme */
  scheme: 'dark' | 'light' | 'follow'
  /** Accent color for badge/highlight */
  accent: string
  /** 6-color preview swatches [keyword, string, function, comment, type, variable] */
  previewColors: [string, string, string, string, string, string]
}

export const CODE_THEMES: CodeThemeMeta[] = [
  {
    id: 'github',
    label: 'GitHub',
    scheme: 'follow',
    accent: '#0969da',
    previewColors: ['#cf222e', '#0a3069', '#8250df', '#6e7781', '#0550ae', '#953800'],
  },
  {
    id: 'github-dark',
    label: 'GitHub Dark',
    scheme: 'dark',
    accent: '#58a6ff',
    previewColors: ['#ff7b72', '#a5d6ff', '#d2a8ff', '#8b949e', '#79c0ff', '#ffa657'],
  },
  {
    id: 'github-light',
    label: 'GitHub Light',
    scheme: 'light',
    accent: '#0969da',
    previewColors: ['#cf222e', '#0a3069', '#8250df', '#6e7781', '#0550ae', '#953800'],
  },
  {
    id: 'one-dark-pro',
    label: 'One Dark Pro',
    scheme: 'dark',
    accent: '#61afef',
    previewColors: ['#c678dd', '#98c379', '#61afef', '#5c6370', '#e5c07b', '#e06c75'],
  },
  {
    id: 'catppuccin-mocha',
    label: 'Catppuccin Mocha',
    scheme: 'dark',
    accent: '#89b4fa',
    previewColors: ['#cba6f7', '#a6e3a1', '#89b4fa', '#6c7086', '#f9e2af', '#f38ba8'],
  },
  {
    id: 'catppuccin-latte',
    label: 'Catppuccin Latte',
    scheme: 'light',
    accent: '#1e66f5',
    previewColors: ['#8839ef', '#40a02b', '#1e66f5', '#9ca0b0', '#df8e1d', '#d20f39'],
  },
  {
    id: 'dracula',
    label: 'Dracula',
    scheme: 'dark',
    accent: '#bd93f9',
    previewColors: ['#ff79c6', '#f1fa8c', '#50fa7b', '#6272a4', '#8be9fd', '#ffb86c'],
  },
  {
    id: 'monokai',
    label: 'Monokai',
    scheme: 'dark',
    accent: '#a6e22e',
    previewColors: ['#f92672', '#e6db74', '#a6e22e', '#75715e', '#66d9ef', '#fd971f'],
  },
  {
    id: 'tokyo-night',
    label: 'Tokyo Night',
    scheme: 'dark',
    accent: '#7aa2f7',
    previewColors: ['#bb9af7', '#9ece6a', '#7aa2f7', '#565f89', '#e0af68', '#f7768e'],
  },
  {
    id: 'night-owl',
    label: 'Night Owl',
    scheme: 'dark',
    accent: '#82aaff',
    previewColors: ['#c792ea', '#addb67', '#82aaff', '#637777', '#ffcb6b', '#f78c6c'],
  },
  {
    id: 'nord',
    label: 'Nord',
    scheme: 'dark',
    accent: '#88c0d0',
    previewColors: ['#b48ead', '#a3be8c', '#88c0d0', '#616e88', '#ebcb8b', '#bf616a'],
  },
  {
    id: 'solarized-dark',
    label: 'Solarized Dark',
    scheme: 'dark',
    accent: '#268bd2',
    previewColors: ['#d33682', '#859900', '#268bd2', '#586e75', '#b58900', '#cb4b16'],
  },
  {
    id: 'solarized-light',
    label: 'Solarized Light',
    scheme: 'light',
    accent: '#268bd2',
    previewColors: ['#d33682', '#859900', '#268bd2', '#93a1a1', '#b58900', '#cb4b16'],
  },
  {
    id: 'rose-pine',
    label: 'Rosé Pine',
    scheme: 'dark',
    accent: '#c4a7e7',
    previewColors: ['#c4a7e7', '#9ccfd8', '#31748f', '#6e6a86', '#f6c177', '#eb6f92'],
  },
  {
    id: 'one-light',
    label: 'One Light',
    scheme: 'light',
    accent: '#4078f2',
    previewColors: ['#a626a4', '#50a14f', '#4078f2', '#a0a1a7', '#c18401', '#e45649'],
  },
]

/** Monospace font presets with CSS font-family value */
export interface FontPreset {
  /** Display name */
  label: string
  /** CSS font-family value (with fallbacks) */
  value: string
}

export const MONOSPACE_FONTS: FontPreset[] = [
  {
    label: 'JetBrains Mono',
    value: '"JetBrains Mono", ui-monospace, monospace',
  },
  {
    label: 'Fira Code',
    value: '"Fira Code", ui-monospace, monospace',
  },
  {
    label: 'Cascadia Code',
    value: '"Cascadia Code", "Cascadia Mono", ui-monospace, monospace',
  },
  {
    label: 'SF Mono',
    value: '"SF Mono", "SFMono-Regular", ui-monospace, monospace',
  },
  {
    label: 'Menlo',
    value: 'Menlo, Monaco, ui-monospace, monospace',
  },
  {
    label: 'Consolas',
    value: 'Consolas, "Courier New", ui-monospace, monospace',
  },
  {
    label: 'Source Code Pro',
    value: '"Source Code Pro", ui-monospace, monospace',
  },
  {
    label: 'IBM Plex Mono',
    value: '"IBM Plex Mono", ui-monospace, monospace',
  },
  {
    label: 'Inconsolata',
    value: 'Inconsolata, ui-monospace, monospace',
  },
  {
    label: 'Ubuntu Mono',
    value: '"Ubuntu Mono", ui-monospace, monospace',
  },
]

/**
 * Get the actual Shiki theme name from a code block theme id.
 * 'github' follows the current app dark/light mode.
 */
export function resolveShikiTheme(themeId: string): string {
  if (themeId === 'monokai' || themeId === 'dracula') return themeId
  if (themeId === 'one-dark-pro') return 'one-dark-pro'

  // All other explicit themes use their id directly
  if (themeId !== 'github') return themeId

  if (typeof document !== 'undefined') {
    const chatTheme = (document.documentElement.getAttribute('data-chat-theme') || '').toLowerCase()
    if (chatTheme.includes('tokyo')) return 'tokyo-night'
    if (chatTheme.includes('catppuccin') && chatTheme.includes('latte')) return 'catppuccin-latte'
    if (chatTheme.includes('catppuccin')) return 'catppuccin-mocha'
    if (chatTheme.includes('dracula')) return 'dracula'
    if (chatTheme.includes('nord')) return 'nord'
    if (chatTheme.includes('rose') || chatTheme.includes('rosé')) return 'rose-pine'
    if (chatTheme.includes('night-owl') || chatTheme.includes('night owl')) return 'night-owl'
    if (chatTheme.includes('solarized') && chatTheme.includes('light')) return 'solarized-light'
    if (chatTheme.includes('solarized')) return 'solarized-dark'
    if (chatTheme.includes('one') && chatTheme.includes('dark')) return 'one-dark-pro'
    if (chatTheme.includes('gruvbox')) {
      return document.documentElement.classList.contains('theme-light') ? 'solarized-light' : 'solarized-dark'
    }

    return document.documentElement.classList.contains('theme-light')
      ? 'github-light'
      : 'github-dark'
  }

  return 'github-dark'
}

/** Look up theme metadata by id */
export function getCodeThemeMeta(id: string): CodeThemeMeta | undefined {
  return CODE_THEMES.find((t) => t.id === id)
}
