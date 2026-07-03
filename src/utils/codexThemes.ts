import { BUILT_IN_CODEX_THEMES, type CodexTheme } from './codexThemesData'
import type { PiThemeFile } from './piTheme'

export { BUILT_IN_CODEX_THEMES, type CodexTheme } from './codexThemesData'

export const CODEX_SELECTION_PREFIX = 'codex:'

function normalizeSelection(selection: string): string {
  return selection.trim().toLowerCase()
}

export function toCodexSelection(slug: string): string {
  return `${CODEX_SELECTION_PREFIX}${slug}`
}

export function isBuiltInCodexThemeSelection(selection: string | undefined): boolean {
  if (!selection) return false
  return normalizeSelection(selection).startsWith(CODEX_SELECTION_PREFIX)
}

export function getBuiltInCodexThemes(): CodexTheme[] {
  return BUILT_IN_CODEX_THEMES.map((theme) => ({
    ...theme,
    tags: [...theme.tags],
    theme: { ...theme.theme },
  }))
}

export function getBuiltInCodexTheme(selection: string | undefined): CodexTheme | null {
  if (!selection || !isBuiltInCodexThemeSelection(selection)) return null
  const slug = normalizeSelection(selection).slice(CODEX_SELECTION_PREFIX.length)
  return BUILT_IN_CODEX_THEMES.find((theme) => theme.slug === slug) ?? null
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const parsed = parseInt(clean, 16)
  if (isNaN(parsed)) {
    return [0, 0, 0]
  }
  const r = (parsed >> 16) & 255
  const g = (parsed >> 8) & 255
  const b = parsed & 255
  return [r, g, b]
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) => {
    const h = Math.max(0, Math.min(255, Math.round(c))).toString(16)
    return h.length === 1 ? '0' + h : h
  }
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

function blendHex(hex1: string, hex2: string, ratio: number): string {
  try {
    const rgb1 = hexToRgb(hex1)
    const rgb2 = hexToRgb(hex2)
    const r = rgb1[0] * (1 - ratio) + rgb2[0] * ratio
    const g = rgb1[1] * (1 - ratio) + rgb2[1] * ratio
    const b = rgb1[2] * (1 - ratio) + rgb2[2] * ratio
    return rgbToHex(r, g, b)
  } catch {
    return hex1
  }
}

export function toPiThemeFileFromCodex(theme: CodexTheme): PiThemeFile {
  const t = theme.theme
  const background = t.background
  const foreground = t.foreground
  const surface = t.surface
  const accent = t.accent

  const isLight = theme.mode === 'light'
  const panelAlt = isLight ? blendHex(surface, background, 0.06) : blendHex(surface, foreground, 0.06)
  const selectedBg = isLight ? blendHex(surface, background, 0.12) : blendHex(surface, foreground, 0.12)
  const border = isLight ? blendHex(surface, foreground, 0.15) : blendHex(surface, foreground, 0.15)
  const muted = blendHex(background, foreground, 0.6)
  const dim = blendHex(background, foreground, 0.3)

  const diffAdded = t.semanticColors?.diffAdded || t.semanticColors?.success || (isLight ? '#28a745' : '#9ece6a')
  const diffRemoved = t.semanticColors?.diffRemoved || t.semanticColors?.error || (isLight ? '#cb2431' : '#f7768e')
  const success = t.semanticColors?.success || diffAdded
  const error = t.semanticColors?.error || diffRemoved
  const warning = t.semanticColors?.warning || (isLight ? '#b58900' : '#e0af68')
  const purple = t.semanticColors?.skill || (isLight ? '#a31d1d' : '#bb9af7')

  return {
    name: theme.name,
    vars: {
      background,
      bg: background,
      panel: surface,
      bgLighter: surface,
      panelAlt,
      bgSlightlyLighter: panelAlt,
      text: foreground,
      foreground,
      muted,
      comment: muted,
      dim,
      dimGray: dim,
      accent,
      blue: accent,
      cyan: purple,
      teal: purple,
      purple,
      violet: purple,
      red: diffRemoved,
      orange: warning,
      yellow: warning,
      green: diffAdded,
      success,
      warning,
      error,
      border,
      selected: selectedBg,
      selection: selectedBg,
      userMessageBg: panelAlt,
      customMessageBg: surface,
      customMessageLabel: purple,
      toolPendingBg: surface,
      toolSuccessBg: surface,
      toolErrorBg: surface,
      toolTitle: accent,
      toolOutput: muted,
      mdHeading: accent,
      mdLink: accent,
      mdLinkUrl: muted,
      mdCode: purple,
      mdCodeBlock: diffAdded,
      mdCodeBlockBorder: dim,
      mdQuote: muted,
      mdQuoteBorder: accent,
      mdHr: dim,
      mdListBullet: purple,
      toolDiffAdded: diffAdded,
      toolDiffRemoved: diffRemoved,
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
      pageBg: background,
    },
  }
}
