/**
 * Theme token resolution — the single source of truth that turns a Pi theme
 * file (or a built-in palette mapped into one) into the app's CSS custom
 * properties.
 *
 * Why this module exists: the mapping used to be duplicated. applyPiChatTheme
 * covered 79 variables and applyRawThemeObject (Theme Studio's live preview)
 * covered 46. The preview therefore lied about markdown, tool, diff and
 * message colours, and neither side set the palette variables that
 * _themes.less declares for its light theme. Everything is computed once here.
 *
 * Pi themes follow the pi-coding-agent JSON schema: background and text arrive
 * as "surface" / "ink", never as "background". Missing that made user themes
 * apply only their accent while the whole background stayed at the app default.
 */

export interface PiThemeFile {
  name?: string
  vars?: Record<string, string>
  colors?: Record<string, string>
  export?: {
    pageBg?: string
  }
}

export type ThemeScheme = 'dark' | 'light'

export interface ThemePalette {
  background: string
  panel: string
  panelAlt: string
  text: string
  muted: string
  dim: string
  accent: string
  border: string
  success: string
  warning: string
  error: string
  purple: string
  code: string
  markdown: string
}

export interface ComputedThemeVars {
  scheme: ThemeScheme | null
  /** var name -> ready-to-use CSS value (correctly formatted per variable). */
  vars: Record<string, string>
  /** Plain hex values for UI previews that cannot use CSS variables. */
  palette: ThemePalette
}

export interface ThemePreview {
  selection: string
  label: string
  source: 'built-in' | 'user'
  scheme: ThemeScheme
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

type Rgb = [number, number, number]

export function normalizeHexColor(hex: string | undefined | null): string | null {
  if (!hex) return null
  const value = hex.trim()
  if (!value.startsWith('#')) return null
  if (value.length === 4) {
    return '#' + value[1] + value[1] + value[2] + value[2] + value[3] + value[3]
  }
  if (value.length === 7) return value.toLowerCase()
  return null
}

function hexToRgb(hex: string | null): Rgb | null {
  if (!hex) return null
  const parsed = Number.parseInt(hex.slice(1), 16)
  if (Number.isNaN(parsed)) return null
  return [(parsed >> 16) & 255, (parsed >> 8) & 255, parsed & 255]
}

function channelHex(value: number): string {
  const clamped = Math.max(0, Math.min(255, Math.round(value)))
  const out = clamped.toString(16)
  return out.length === 1 ? '0' + out : out
}

function rgbToHex(rgb: Rgb): string {
  return '#' + channelHex(rgb[0]) + channelHex(rgb[1]) + channelHex(rgb[2])
}

/** Tailwind-style space separated triplet, for "r g b" + alpha usage. */
function rgbSpace(hex: string): string | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return rgb[0] + ' ' + rgb[1] + ' ' + rgb[2]
}

/** Legacy comma separated triplet, for rgba(var(...)) usage. */
function rgbComma(hex: string): string | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return rgb[0] + ', ' + rgb[1] + ', ' + rgb[2]
}

function relativeLuminance(hex: string): number | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const channels = rgb.map((value) => {
    const scaled = value / 255
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

function toHsl(hex: string): { h: number; s: number; l: number } | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  const r = rgb[0] / 255
  const g = rgb[1] / 255
  const b = rgb[2] / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const delta = max - min
  if (delta === 0) return { h: 0, s: 0, l }
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)
  let h: number
  if (max === r) h = ((g - b) / delta) % 6
  else if (max === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4
  h = Math.round(h * 60)
  if (h < 0) h += 360
  return { h, s, l }
}

function fromHsl(h: number, s: number, l: number): string {
  const hue = ((h % 360) + 360) % 360
  const saturation = Math.max(0, Math.min(1, s))
  const lightness = Math.max(0, Math.min(1, l))
  const c = (1 - Math.abs(2 * lightness - 1)) * saturation
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
  const m = lightness - c / 2
  let rgb: Rgb
  if (hue < 60) rgb = [c, x, 0]
  else if (hue < 120) rgb = [x, c, 0]
  else if (hue < 180) rgb = [0, c, x]
  else if (hue < 240) rgb = [0, x, c]
  else if (hue < 300) rgb = [x, 0, c]
  else rgb = [c, 0, x]
  return rgbToHex([(rgb[0] + m) * 255, (rgb[1] + m) * 255, (rgb[2] + m) * 255])
}

/**
 * Rotate a colour's hue while pinning saturation and lightness. Used to derive
 * the tool and branch palettes: a theme only defines ~10 semantic colours, but
 * tool kinds and branch routes need a repeatable set of distinct hues that
 * still belong to the same theme. Pinning s/l keeps them from reading as neon.
 */
function rotateHue(hex: string, degrees: number, saturation?: number, lightness?: number): string {
  const hsl = toHsl(hex)
  if (!hsl) return hex
  return fromHsl(hsl.h + degrees, saturation ?? hsl.s, lightness ?? hsl.l)
}

function mixHex(from: string, to: string, ratio: number): string {
  const a = hexToRgb(from)
  const b = hexToRgb(to)
  if (!a || !b) return from
  const t = Math.max(0, Math.min(1, ratio))
  return rgbToHex([
    a[0] * (1 - t) + b[0] * t,
    a[1] * (1 - t) + b[1] * t,
    a[2] * (1 - t) + b[2] * t,
  ])
}

/**
 * Resolve one semantic colour. A theme may point a colour at a hex literal or
 * at a variable name, so both forms are tried before the fallback keys.
 */
function resolveColor(
  theme: PiThemeFile,
  key: string,
  fallbacks: string[] = [],
): string | undefined {
  const vars = theme.vars || {}
  const mapped = theme.colors?.[key]

  if (mapped) {
    const direct = normalizeHexColor(mapped)
    if (direct) return direct
    const viaVar = normalizeHexColor(vars[mapped])
    if (viaVar) return viaVar
  }

  const directVar = normalizeHexColor(vars[key])
  if (directVar) return directVar

  for (const fallbackKey of fallbacks) {
    const fallback = normalizeHexColor(vars[fallbackKey])
    if (fallback) return fallback
  }

  return undefined
}

function firstDefined(...candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (candidate) return candidate
  }
  return undefined
}

export function resolveThemeScheme(theme: PiThemeFile): ThemeScheme | null {
  const name = (theme.name || '').toLowerCase()
  if (name.includes('dark')) return 'dark'
  if (name.includes('light')) return 'light'

  const background = firstDefined(
    resolveColor(theme, 'background', ['bg', 'surface', 'black']),
    normalizeHexColor(theme.export?.pageBg) ?? undefined,
  )
  if (!background) return null

  const luminance = relativeLuminance(background)
  if (luminance === null) return null
  return luminance >= 0.5 ? 'light' : 'dark'
}

/**
 * Every variable a theme is allowed to own. Declared once so that applying and
 * clearing can never drift apart again — the previous split (112 declared in
 * _themes.less, 83 cleared here) left light themes with dark tool colours.
 */
export const THEME_OVERRIDE_VARS: string[] = [
  // Semantic surfaces (space separated RGB)
  '--color-background',
  '--color-foreground',
  '--color-card',
  '--color-card-foreground',
  '--color-popover',
  '--color-popover-foreground',
  '--color-primary',
  '--color-primary-foreground',
  '--color-secondary',
  '--color-secondary-foreground',
  '--color-muted',
  '--color-muted-foreground',
  '--color-accent',
  '--color-accent-foreground',
  '--color-destructive',
  '--color-destructive-foreground',
  '--color-border',
  '--color-input',
  '--color-ring',
  '--color-info',
  '--color-success',
  '--color-warning',
  '--color-surface',
  '--color-surface-dark',
  '--color-secondary-hover',
  '--color-border-hover',
  '--color-purple',
  '--heatmap-active-background',
  '--heatmap-active-foreground',
  // RGB triplets for alpha composition (comma separated)
  '--accent-rgb',
  '--border-rgb',
  '--shadow-rgb',
  '--highlight-rgb',
  '--info-rgb',
  '--success-rgb',
  '--warning-rgb',
  '--destructive-rgb',
  '--foreground-rgb',
  '--muted-fg-rgb',
  '--glass-rgb',
  // Overlay strengths
  '--text-secondary',
  '--bg-subtle',
  '--bg-inset',
  '--bg-inset-hover',
  // Legacy component colours (hex)
  '--accent',
  '--border',
  '--borderAccent',
  '--borderMuted',
  '--success',
  '--error',
  '--warning',
  '--muted',
  '--dim',
  '--text',
  '--thinkingText',
  '--selectedBg',
  '--userMessageBg',
  '--userMessageText',
  '--customMessageBg',
  '--customMessageText',
  '--customMessageLabel',
  '--toolPendingBg',
  '--toolSuccessBg',
  '--toolErrorBg',
  '--toolTitle',
  '--toolOutput',
  '--mdHeading',
  '--mdLink',
  '--mdLinkUrl',
  '--mdCode',
  '--mdCodeBlock',
  '--mdCodeBlockBorder',
  '--mdQuote',
  '--mdQuoteBorder',
  '--mdHr',
  '--mdListBullet',
  '--toolDiffAdded',
  '--toolDiffRemoved',
  '--toolDiffContext',
  '--syntaxComment',
  '--syntaxKeyword',
  '--syntaxFunction',
  '--syntaxVariable',
  '--syntaxString',
  '--syntaxNumber',
  '--syntaxType',
  '--syntaxOperator',
  '--syntaxPunctuation',
  '--bashMode',
  '--body-bg',
  '--container-bg',
  '--info-bg',
  '--tool-color-read',
  '--tool-color-edit',
  '--tool-color-write',
  '--tool-color-bash',
  '--tool-color-search',
  '--tool-color-web-fetch',
  '--tool-palette-0',
  '--tool-palette-1',
  '--tool-palette-2',
  '--tool-palette-3',
  '--tool-palette-4',
  '--tool-palette-5',
  '--tool-palette-6',
  '--tool-palette-7',
  '--branch-palette-0',
  '--branch-palette-1',
  '--branch-palette-2',
  '--branch-palette-3',
  '--branch-palette-4',
  '--branch-palette-5',
]

/**
 * Synthesize a distinct surface tint. Built-in palettes frequently map
 * toolPendingBg / toolSuccessBg / toolErrorBg straight onto the panel colour,
 * which erases the visual difference between a running, failed and finished
 * tool call. When the theme has no opinion, tint the panel with the status hue
 * instead of collapsing to a flat card.
 */
function surfaceOrTint(
  explicit: string | undefined,
  base: string,
  tint: string,
  isLight: boolean,
): string {
  if (explicit && explicit.toLowerCase() !== base.toLowerCase()) return explicit
  return mixHex(base, tint, isLight ? 0.1 : 0.14)
}

export function computeThemeVars(theme: PiThemeFile): ComputedThemeVars | null {
  const vars = theme.vars
  if (!vars) return null

  const schemeHint = resolveThemeScheme(theme)

  // Pi's own schema carries the app background as "surface" and body text as
  // "ink"; both must be in the chain or user themes resolve to nothing.
  const background = resolveColor(theme, 'background', ['bg', 'surface', 'black'])
  if (!background) return null

  const isLight = schemeHint ? schemeHint === 'light' : (relativeLuminance(background) ?? 0) >= 0.5
  const scheme: ThemeScheme = isLight ? 'light' : 'dark'

  const text = resolveColor(theme, 'text', ['ink', 'foreground', 'base05'])
  if (!text) return null

  // A theme that defines no panel gets one synthesized from its background so
  // cards, popovers and the sidebar stay visually separated.
  const panel =
    resolveColor(theme, 'panel', ['bgLighter', 'card', 'one_bg']) ??
    mixHex(background, '#ffffff', isLight ? 0.45 : 0.06)
  const panelAltSource = resolveColor(theme, 'panelAlt', ['bgSlightlyLighter', 'bgLighter', 'one_bg2'])
  const panelAlt =
    panelAltSource && (!isLight || (relativeLuminance(panelAltSource) ?? 1) >= 0.5)
      ? panelAltSource
      : isLight
        ? mixHex(panel, '#000000', 0.05)
        : mixHex(panel, '#ffffff', 0.05)

  const muted = resolveColor(theme, 'muted', ['comment', 'grey_fg']) ?? mixHex(background, text, 0.55)
  const dim = resolveColor(theme, 'dim', ['dimGray', 'darkGray', 'grey']) ?? mixHex(background, text, 0.35)
  const accent =
    resolveColor(theme, 'accent', ['blue', 'violet', 'purple', 'cyan', 'teal']) ??
    mixHex(background, text, 0.7)
  const border = resolveColor(theme, 'border', ['teal', 'cyan', 'dimGray', 'line']) ?? mixHex(panel, text, 0.15)
  const success = resolveColor(theme, 'success', ['green', 'vibrant_green']) ?? (isLight ? '#16a34a' : '#7ee787')
  const error = resolveColor(theme, 'error', ['red']) ?? (isLight ? '#dc2626' : '#ef4444')
  const warning = resolveColor(theme, 'warning', ['orange', 'yellow']) ?? (isLight ? '#d97706' : '#ffa657')
  const purple = resolveColor(theme, 'purple', ['violet', 'dark_purple', 'pink']) ?? rotateHue(accent, 60)
  const selectedBg =
    resolveColor(theme, 'selectedBg', ['selected', 'selection', 'one_bg3']) ??
    mixHex(panel, accent, isLight ? 0.12 : 0.18)

  const mdHeading = resolveColor(theme, 'mdHeading', ['orange', 'yellow']) ?? warning
  const mdLink = resolveColor(theme, 'mdLink', ['accent', 'cyan', 'blue']) ?? accent
  const mdCode = resolveColor(theme, 'mdCode', ['cyan', 'teal']) ?? accent
  const mdCodeBlock = resolveColor(theme, 'mdCodeBlock', ['green']) ?? success

  const userMessageBg = resolveColor(theme, 'userMessageBg', ['userMsgBg']) ?? panelAlt
  const customMessageBg = resolveColor(theme, 'customMessageBg', ['customMsgBg']) ?? panel
  const customMessageLabel = resolveColor(theme, 'customMessageLabel', ['skill', 'purple', 'violet']) ?? purple

  const toolPendingBg = surfaceOrTint(resolveColor(theme, 'toolPendingBg'), panel, accent, isLight)
  const toolSuccessBg = surfaceOrTint(resolveColor(theme, 'toolSuccessBg'), panel, success, isLight)
  const toolErrorBg = surfaceOrTint(resolveColor(theme, 'toolErrorBg'), panel, error, isLight)
  const toolTitle = resolveColor(theme, 'toolTitle', ['accent', 'skill']) ?? accent
  const toolOutput = resolveColor(theme, 'toolOutput', ['muted', 'comment', 'ink']) ?? muted

  const diffAdded = resolveColor(theme, 'toolDiffAdded', ['green']) ?? success
  const diffRemoved = resolveColor(theme, 'toolDiffRemoved', ['red']) ?? error
  const diffContext = resolveColor(theme, 'toolDiffContext', ['muted', 'comment']) ?? muted

  // Pi defines syntax colours explicitly; keep them instead of discarding them.
  const syntaxComment = resolveColor(theme, 'syntaxComment', ['comment', 'muted']) ?? muted
  const syntaxKeyword = resolveColor(theme, 'syntaxKeyword', ['blue', 'accent']) ?? accent
  const syntaxFunction = resolveColor(theme, 'syntaxFunction', ['yellow', 'orange']) ?? warning
  const syntaxVariable = resolveColor(theme, 'syntaxVariable', ['cyan', 'mdCode']) ?? mdCode
  const syntaxString = resolveColor(theme, 'syntaxString', ['green', 'success']) ?? success
  const syntaxNumber = resolveColor(theme, 'syntaxNumber', ['orange', 'warning']) ?? warning
  const syntaxType = resolveColor(theme, 'syntaxType', ['teal', 'cyan']) ?? mdCode
  const syntaxOperator = resolveColor(theme, 'syntaxOperator', ['text', 'ink']) ?? mixHex(background, text, 0.75)
  const syntaxPunctuation = resolveColor(theme, 'syntaxPunctuation', ['dim', 'muted']) ?? muted
  const bashMode = resolveColor(theme, 'bashMode', ['green', 'success']) ?? success

  // Tool kind colours: reuse the theme's own hues so icons never fall back to
  // another theme's palette.
  const toolColorRead = resolveColor(theme, 'blue') ?? accent
  const toolColorEdit = resolveColor(theme, 'orange') ?? warning
  const toolColorWrite = purple
  const toolColorBash = resolveColor(theme, 'green') ?? success
  const toolColorSearch = mdCode
  const toolColorWebFetch = resolveColor(theme, 'orange', ['red']) ?? warning

  const toolPalette = [
    error,
    toolColorEdit,
    mdCode,
    purple,
    success,
    resolveColor(theme, 'pink') ?? rotateHue(purple, -40),
    toolColorRead,
    warning,
  ]

  // Branch routes need medium-saturation hues; pin s/l so a vivid accent does
  // not turn ten routes into confetti.
  const branchBase = accent
  const branchSaturation = isLight ? 0.45 : 0.5
  const branchLightness = isLight ? 0.42 : 0.62
  const branchPalette = Array.from({ length: 6 }, (_, index) =>
    rotateHue(branchBase, index * 60, branchSaturation, branchLightness),
  )

  const out: Record<string, string> = {}

  const colorVars: Array<[string, string]> = [
    ['--color-background', background],
    ['--color-foreground', text],
    ['--color-card', panel],
    ['--color-card-foreground', text],
    ['--color-popover', panel],
    ['--color-popover-foreground', text],
    ['--color-primary', text],
    ['--color-primary-foreground', background],
    ['--color-secondary', panelAlt],
    ['--color-secondary-foreground', text],
    ['--color-muted', panelAlt],
    ['--color-muted-foreground', muted],
    ['--color-accent', panelAlt],
    ['--color-accent-foreground', text],
    ['--color-destructive', error],
    ['--color-destructive-foreground', text],
    ['--color-border', border],
    ['--color-input', border],
    ['--color-ring', accent],
    ['--color-info', accent],
    ['--color-success', success],
    ['--color-warning', warning],
    ['--color-surface', panel],
    ['--color-surface-dark', panelAlt],
    ['--color-secondary-hover', selectedBg],
    ['--color-border-hover', border],
    ['--color-purple', purple],
  ]
  for (const [name, value] of colorVars) {
    const triplet = rgbSpace(value)
    if (triplet) out[name] = triplet
  }

  const heatmapBackground = rgbSpace(success)
  const heatmapForeground = rgbSpace(background)
  if (heatmapBackground) out['--heatmap-active-background'] = heatmapBackground
  if (heatmapForeground) out['--heatmap-active-foreground'] = heatmapForeground

  const commaVars: Array<[string, string]> = [
    ['--accent-rgb', accent],
    ['--border-rgb', border],
    ['--shadow-rgb', '#000000'],
    ['--highlight-rgb', text],
    ['--info-rgb', accent],
    ['--success-rgb', success],
    ['--warning-rgb', warning],
    ['--destructive-rgb', error],
    ['--foreground-rgb', text],
    ['--muted-fg-rgb', muted],
    ['--glass-rgb', panelAlt],
  ]
  for (const [name, value] of commaVars) {
    const triplet = rgbComma(value)
    if (triplet) out[name] = triplet
  }

  out['--text-secondary'] = muted
  if (isLight) {
    out['--bg-subtle'] = 'rgba(0, 0, 0, 0.03)'
    out['--bg-inset'] = 'rgba(0, 0, 0, 0.05)'
    out['--bg-inset-hover'] = 'rgba(0, 0, 0, 0.08)'
  } else {
    out['--bg-subtle'] = 'rgba(0, 0, 0, 0.18)'
    out['--bg-inset'] = 'rgba(0, 0, 0, 0.28)'
    out['--bg-inset-hover'] = 'rgba(0, 0, 0, 0.38)'
  }

  const hexVars: Array<[string, string]> = [
    ['--accent', accent],
    ['--border', border],
    ['--borderAccent', resolveColor(theme, 'borderAccent', ['accent']) ?? accent],
    ['--borderMuted', resolveColor(theme, 'borderMuted', ['dim', 'border']) ?? dim],
    ['--success', success],
    ['--error', error],
    ['--warning', warning],
    ['--muted', muted],
    ['--dim', dim],
    ['--text', text],
    ['--thinkingText', resolveColor(theme, 'thinkingText', ['muted', 'comment']) ?? muted],
    ['--selectedBg', selectedBg],
    ['--userMessageBg', userMessageBg],
    ['--userMessageText', resolveColor(theme, 'userMessageText', ['text', 'ink']) ?? text],
    ['--customMessageBg', customMessageBg],
    ['--customMessageText', resolveColor(theme, 'customMessageText', ['text', 'ink']) ?? text],
    ['--customMessageLabel', customMessageLabel],
    ['--toolPendingBg', toolPendingBg],
    ['--toolSuccessBg', toolSuccessBg],
    ['--toolErrorBg', toolErrorBg],
    ['--toolTitle', toolTitle],
    ['--toolOutput', toolOutput],
    ['--mdHeading', mdHeading],
    ['--mdLink', mdLink],
    ['--mdLinkUrl', resolveColor(theme, 'mdLinkUrl', ['dim', 'dimGray']) ?? dim],
    ['--mdCode', mdCode],
    ['--mdCodeBlock', mdCodeBlock],
    ['--mdCodeBlockBorder', resolveColor(theme, 'mdCodeBlockBorder', ['border']) ?? border],
    ['--mdQuote', resolveColor(theme, 'mdQuote', ['muted', 'comment']) ?? muted],
    ['--mdQuoteBorder', resolveColor(theme, 'mdQuoteBorder', ['border']) ?? border],
    ['--mdHr', resolveColor(theme, 'mdHr', ['border']) ?? border],
    ['--mdListBullet', resolveColor(theme, 'mdListBullet', ['purple', 'violet']) ?? purple],
    ['--toolDiffAdded', diffAdded],
    ['--toolDiffRemoved', diffRemoved],
    ['--toolDiffContext', diffContext],
    ['--syntaxComment', syntaxComment],
    ['--syntaxKeyword', syntaxKeyword],
    ['--syntaxFunction', syntaxFunction],
    ['--syntaxVariable', syntaxVariable],
    ['--syntaxString', syntaxString],
    ['--syntaxNumber', syntaxNumber],
    ['--syntaxType', syntaxType],
    ['--syntaxOperator', syntaxOperator],
    ['--syntaxPunctuation', syntaxPunctuation],
    ['--bashMode', bashMode],
    ['--body-bg', background],
    ['--container-bg', panel],
    ['--info-bg', panelAlt],
    ['--tool-color-read', toolColorRead],
    ['--tool-color-edit', toolColorEdit],
    ['--tool-color-write', toolColorWrite],
    ['--tool-color-bash', toolColorBash],
    ['--tool-color-search', toolColorSearch],
    ['--tool-color-web-fetch', toolColorWebFetch],
  ]
  for (const [name, value] of hexVars) {
    out[name] = value
  }

  toolPalette.forEach((value, index) => {
    out['--tool-palette-' + index] = value
  })
  branchPalette.forEach((value, index) => {
    out['--branch-palette-' + index] = value
  })

  return {
    scheme,
    vars: out,
    palette: {
      background,
      panel,
      panelAlt,
      text,
      muted,
      dim,
      accent,
      border,
      success,
      warning,
      error,
      purple,
      code: mdCode,
      markdown: mdHeading,
    },
  }
}

/**
 * Write a computed theme onto the document root.
 *
 * The scheme class is flipped *after* the variables are in place. Clearing the
 * class first (the old behaviour) dropped the whole app back to the media-query
 * default for one frame, so every palette tweak in Theme Studio flashed.
 */
export function applyThemeVars(vars: Record<string, string>, scheme: ThemeScheme | null): void {
  const root = document.documentElement

  for (const [name, value] of Object.entries(vars)) {
    root.style.setProperty(name, value)
  }

  if (scheme) {
    root.setAttribute('data-chat-theme-scheme', scheme)
    root.classList.remove('theme-dark', 'theme-light')
    root.classList.add(scheme === 'dark' ? 'theme-dark' : 'theme-light')
  }
}

/**
 * Drop every theme-owned variable and marker.
 *
 * Deliberately does NOT touch theme-dark / theme-light: the appearance setting
 * owns those classes. Removing them here is what made "Dark" silently render
 * light on a machine whose OS was in light mode — applyPiChatTheme ran after
 * applyThemeClass and undid it.
 */
export function clearThemeVars(): void {
  const root = document.documentElement
  for (const name of THEME_OVERRIDE_VARS) {
    root.style.removeProperty(name)
  }
  root.removeAttribute('data-chat-theme')
  root.removeAttribute('data-chat-theme-scheme')
}
