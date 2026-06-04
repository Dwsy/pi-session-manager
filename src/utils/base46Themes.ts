export type Base46Scheme = 'dark' | 'light'

export interface Base46Palette {
  base00: string
  base01: string
  base02: string
  base03: string
  base04: string
  base05: string
  base06: string
  base07: string
  base08: string
  base09: string
  base0A: string
  base0B: string
  base0C: string
  base0D: string
  base0E: string
  base0F: string
}

export interface BuiltInBase46Theme {
  id: string
  label: string
  scheme: Base46Scheme
  base16: Base46Palette
  base30?: Record<string, string>
}

export interface Base46PiThemeFile {
  name: string
  vars: Record<string, string>
  colors: Record<string, string>
  export: {
    pageBg: string
  }
}

export interface ThemePreviewModel {
  selection: string
  label: string
  source: 'built-in'
  scheme: Base46Scheme
  colors: {
    background: string
    panel: string
    panelAlt: string
    text: string
    muted: string
    accent: string
    border: string
    success: string
    warning: string
    error: string
    code: string
    markdown: string
  }
}

export const BASE46_SELECTION_PREFIX = 'base46:'

const BUILT_IN_BASE46_THEMES: BuiltInBase46Theme[] = [
  {
    id: 'tokyonight',
    label: 'Tokyo Night',
    scheme: 'dark',
    base16: {
      base00: '#1a1b26',
      base01: '#24283b',
      base02: '#414868',
      base03: '#565f89',
      base04: '#a9b1d6',
      base05: '#c0caf5',
      base06: '#c0caf5',
      base07: '#d5d6db',
      base08: '#f7768e',
      base09: '#ff9e64',
      base0A: '#e0af68',
      base0B: '#9ece6a',
      base0C: '#7dcfff',
      base0D: '#7aa2f7',
      base0E: '#bb9af7',
      base0F: '#c0caf5',
    },
  },
  {
    id: 'catppuccin-mocha',
    label: 'Catppuccin Mocha',
    scheme: 'dark',
    base16: {
      base00: '#1e1e2e',
      base01: '#313244',
      base02: '#45475a',
      base03: '#585b70',
      base04: '#bac2de',
      base05: '#cdd6f4',
      base06: '#f5e0dc',
      base07: '#b4befe',
      base08: '#f38ba8',
      base09: '#fab387',
      base0A: '#f9e2af',
      base0B: '#a6e3a1',
      base0C: '#89dceb',
      base0D: '#89b4fa',
      base0E: '#cba6f7',
      base0F: '#eba0ac',
    },
  },
  {
    id: 'catppuccin-latte',
    label: 'Catppuccin Latte',
    scheme: 'light',
    base16: {
      base00: '#eff1f5',
      base01: '#e6e9ef',
      base02: '#ccd0da',
      base03: '#bcc0cc',
      base04: '#5c5f77',
      base05: '#4c4f69',
      base06: '#313244',
      base07: '#1e1e2e',
      base08: '#d20f39',
      base09: '#fe640b',
      base0A: '#df8e1d',
      base0B: '#40a02b',
      base0C: '#179299',
      base0D: '#1e66f5',
      base0E: '#8839ef',
      base0F: '#dd7878',
    },
  },
  {
    id: 'gruvbox-dark',
    label: 'Gruvbox Dark',
    scheme: 'dark',
    base16: {
      base00: '#282828',
      base01: '#3c3836',
      base02: '#504945',
      base03: '#665c54',
      base04: '#bdae93',
      base05: '#d5c4a1',
      base06: '#ebdbb2',
      base07: '#fbf1c7',
      base08: '#fb4934',
      base09: '#fe8019',
      base0A: '#fabd2f',
      base0B: '#b8bb26',
      base0C: '#8ec07c',
      base0D: '#83a598',
      base0E: '#d3869b',
      base0F: '#d65d0e',
    },
  },
  {
    id: 'gruvbox-light',
    label: 'Gruvbox Light',
    scheme: 'light',
    base16: {
      base00: '#fbf1c7',
      base01: '#ebdbb2',
      base02: '#d5c4a1',
      base03: '#bdae93',
      base04: '#665c54',
      base05: '#3c3836',
      base06: '#282828',
      base07: '#1d2021',
      base08: '#9d0006',
      base09: '#af3a03',
      base0A: '#b57614',
      base0B: '#79740e',
      base0C: '#427b58',
      base0D: '#076678',
      base0E: '#8f3f71',
      base0F: '#d65d0e',
    },
  },
  {
    id: 'one-dark',
    label: 'One Dark',
    scheme: 'dark',
    base16: {
      base00: '#282c34',
      base01: '#353b45',
      base02: '#3e4451',
      base03: '#545862',
      base04: '#565c64',
      base05: '#abb2bf',
      base06: '#b6bdca',
      base07: '#c8ccd4',
      base08: '#e06c75',
      base09: '#d19a66',
      base0A: '#e5c07b',
      base0B: '#98c379',
      base0C: '#56b6c2',
      base0D: '#61afef',
      base0E: '#c678dd',
      base0F: '#be5046',
    },
  },
  {
    id: 'dracula',
    label: 'Dracula',
    scheme: 'dark',
    base16: {
      base00: '#282a36',
      base01: '#343746',
      base02: '#44475a',
      base03: '#6272a4',
      base04: '#9ea8c7',
      base05: '#f8f8f2',
      base06: '#f8f8f2',
      base07: '#ffffff',
      base08: '#ff5555',
      base09: '#ffb86c',
      base0A: '#f1fa8c',
      base0B: '#50fa7b',
      base0C: '#8be9fd',
      base0D: '#bd93f9',
      base0E: '#ff79c6',
      base0F: '#ffb86c',
    },
  },
  {
    id: 'nord',
    label: 'Nord',
    scheme: 'dark',
    base16: {
      base00: '#2e3440',
      base01: '#3b4252',
      base02: '#434c5e',
      base03: '#4c566a',
      base04: '#d8dee9',
      base05: '#e5e9f0',
      base06: '#eceff4',
      base07: '#8fbcbb',
      base08: '#bf616a',
      base09: '#d08770',
      base0A: '#ebcb8b',
      base0B: '#a3be8c',
      base0C: '#88c0d0',
      base0D: '#81a1c1',
      base0E: '#b48ead',
      base0F: '#5e81ac',
    },
  },
]

function normalizeSelection(selection: string): string {
  return selection.trim().toLowerCase()
}

export function toBase46Selection(id: string): string {
  return `${BASE46_SELECTION_PREFIX}${id}`
}

export function isBuiltInBase46ThemeSelection(selection: string | undefined): boolean {
  if (!selection) return false
  return normalizeSelection(selection).startsWith(BASE46_SELECTION_PREFIX)
}

export function getBuiltInBase46Themes(): BuiltInBase46Theme[] {
  return BUILT_IN_BASE46_THEMES.map((theme) => ({
    ...theme,
    base16: { ...theme.base16 },
  }))
}

export function getBuiltInBase46Theme(selection: string | undefined): BuiltInBase46Theme | null {
  if (!selection || !isBuiltInBase46ThemeSelection(selection)) return null
  const id = normalizeSelection(selection).slice(BASE46_SELECTION_PREFIX.length)
  return BUILT_IN_BASE46_THEMES.find((theme) => theme.id === id) ?? null
}

export function toPiThemeFileFromBase46(theme: BuiltInBase46Theme): Base46PiThemeFile {
  const palette = theme.base16
  const panel = palette.base01
  const panelAlt = palette.base02
  const muted = theme.scheme === 'light' ? palette.base04 : palette.base03
  const selectedBg = theme.scheme === 'light' ? palette.base02 : palette.base03

  return {
    name: theme.label,
    vars: {
      background: palette.base00,
      bg: palette.base00,
      panel,
      bgLighter: panel,
      panelAlt,
      bgSlightlyLighter: panelAlt,
      text: palette.base05,
      foreground: palette.base05,
      muted,
      comment: muted,
      dim: palette.base03,
      dimGray: palette.base03,
      accent: palette.base0D,
      blue: palette.base0D,
      cyan: palette.base0C,
      teal: palette.base0C,
      purple: palette.base0E,
      violet: palette.base0E,
      red: palette.base08,
      orange: palette.base09,
      yellow: palette.base0A,
      green: palette.base0B,
      success: palette.base0B,
      warning: palette.base0A,
      error: palette.base08,
      border: palette.base03,
      selected: selectedBg,
      selection: selectedBg,
      userMessageBg: panelAlt,
      customMessageBg: panel,
      customMessageLabel: palette.base0E,
      toolPendingBg: panel,
      toolSuccessBg: panel,
      toolErrorBg: panel,
      toolTitle: palette.base0D,
      toolOutput: muted,
      mdHeading: palette.base0A,
      mdLink: palette.base0D,
      mdLinkUrl: muted,
      mdCode: palette.base0C,
      mdCodeBlock: palette.base0B,
      mdCodeBlockBorder: palette.base03,
      mdQuote: muted,
      mdQuoteBorder: palette.base03,
      mdHr: palette.base03,
      mdListBullet: palette.base0E,
      toolDiffAdded: palette.base0B,
      toolDiffRemoved: palette.base08,
      toolDiffContext: muted,
    },
    colors: {
      background: 'background',
      panel: 'panel',
      panelAlt: 'panelAlt',
      text: 'text',
      muted: 'muted',
      dim: 'dim',
      accent: 'accent',
      border: 'border',
      success: 'success',
      warning: 'warning',
      error: 'error',
      purple: 'purple',
      selectedBg: 'selected',
      mdHeading: 'mdHeading',
      mdLink: 'mdLink',
      mdCode: 'mdCode',
      mdCodeBlock: 'mdCodeBlock',
      toolDiffAdded: 'toolDiffAdded',
      toolDiffRemoved: 'toolDiffRemoved',
      toolDiffContext: 'toolDiffContext',
    },
    export: {
      pageBg: palette.base00,
    },
  }
}

export function resolveThemePreview(selection: string | undefined): ThemePreviewModel | null {
  const theme = getBuiltInBase46Theme(selection)
  if (!theme) return null

  const mapped = toPiThemeFileFromBase46(theme)
  const vars = mapped.vars

  return {
    selection: toBase46Selection(theme.id),
    label: theme.label,
    source: 'built-in',
    scheme: theme.scheme,
    colors: {
      background: vars.background,
      panel: vars.panel,
      panelAlt: vars.panelAlt,
      text: vars.text,
      muted: vars.muted,
      accent: vars.accent,
      border: vars.border,
      success: vars.success,
      warning: vars.warning,
      error: vars.error,
      code: vars.mdCode,
      markdown: vars.mdHeading,
    },
  }
}
