import { invoke } from '@/transport'
import type { ResourceInfo } from '@/types'
import {
  getBuiltInBase46Theme,
  isBuiltInBase46ThemeSelection,
  toPiThemeFileFromBase46,
} from './base46Themes'

export {
  getBuiltInBase46Themes,
  isBuiltInBase46ThemeSelection,
  resolveThemePreview,
  toBase46Selection,
  toPiThemeFileFromBase46,
} from './base46Themes'

interface PiThemeFile {
  name?: string
  vars?: Record<string, string>
  colors?: Record<string, string>
  export?: {
    pageBg?: string
  }
}

const APP_DEFAULT_THEME = 'app-default'

const OVERRIDE_VARS = [
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
  '--accent-rgb',
  '--border-rgb',
  '--highlight-rgb',
  '--info-rgb',
  '--success-rgb',
  '--warning-rgb',
  '--destructive-rgb',
  '--foreground-rgb',
  '--muted-fg-rgb',
  '--glass-rgb',
  '--text-secondary',
  '--accent',
  '--border',
  '--success',
  '--error',
  '--warning',
  '--muted',
  '--dim',
  '--text',
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
  '--toolExecutionBg',
  '--toolSuccessBgOverride',
  '--toolSuccessBorderOverride',
  '--toolOutputExpandedMargin',
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
] as const

const themeCache = new Map<string, PiThemeFile | null>()
let activeThemeApplyId = 0

const THEME_NAME_PATTERN = /^[a-zA-Z0-9._\/-]+$/

function normalizeHexColor(hex: string): string | null {
  const value = hex.trim()
  if (!value.startsWith('#')) return null

  if (value.length === 4) {
    const r = value[1]
    const g = value[2]
    const b = value[3]
    return `#${r}${r}${g}${g}${b}${b}`
  }

  if (value.length === 7) return value
  return null
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = normalizeHexColor(hex)
  if (!normalized) return null

  const parsed = Number.parseInt(normalized.slice(1), 16)
  if (Number.isNaN(parsed)) return null

  const red = (parsed >> 16) & 255
  const green = (parsed >> 8) & 255
  const blue = parsed & 255
  return [red, green, blue]
}

function toRelativeLuminance(rgb: [number, number, number]): number {
  const channels = rgb.map((value) => {
    const scaled = value / 255
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]

  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2])
}

function resolveThemeColorScheme(theme: PiThemeFile): 'dark' | 'light' | null {
  // 1. Try to infer from theme name
  const themeName = (theme.name || '').toLowerCase()
  if (themeName.includes('dark')) return 'dark'
  if (themeName.includes('light')) return 'light'

  // 2. Try to resolve from background color with extended fallbacks
  const backgroundHex = resolveThemeHex(theme, 'background', [
    'bg',
    'panel',
    'userBg',
    'customBg',
    'toolPending',
    'userMessageBg',
    'customMessageBg',
  ])

  // 3. Fallback to export.pageBg
  const exportPageBg = theme.export?.pageBg ? normalizeHexColor(theme.export.pageBg) : undefined

  const finalBg = backgroundHex || exportPageBg
  if (!finalBg) return null

  const rgb = hexToRgb(finalBg)
  if (!rgb) return null

  return toRelativeLuminance(rgb) >= 0.5 ? 'light' : 'dark'
}

function setColorVar(root: HTMLElement, variable: string, hex: string | undefined) {
  if (!hex) return
  const rgb = hexToRgb(hex)
  if (!rgb) return
  root.style.setProperty(variable, `${rgb[0]} ${rgb[1]} ${rgb[2]}`)
}

function setRgbVar(root: HTMLElement, variable: string, hex: string | undefined) {
  if (!hex) return
  const rgb = hexToRgb(hex)
  if (!rgb) return
  root.style.setProperty(variable, `${rgb[0]}, ${rgb[1]}, ${rgb[2]}`)
}

function setHexVar(root: HTMLElement, variable: string, hex: string | undefined) {
  if (!hex) return
  const normalized = normalizeHexColor(hex)
  if (!normalized) return
  root.style.setProperty(variable, normalized)
}

function firstValidHex(...candidates: Array<string | undefined>): string | undefined {
  for (const candidate of candidates) {
    if (!candidate) continue
    const normalized = normalizeHexColor(candidate)
    if (normalized) return normalized
  }
  return undefined
}

function resolveThemeHex(theme: PiThemeFile, colorKey: string, fallbackVarKeys: string[] = []): string | undefined {
  const vars = theme.vars || {}
  const mappedColor = theme.colors?.[colorKey]

  if (mappedColor) {
    const directMapped = normalizeHexColor(mappedColor)
    if (directMapped) return directMapped
    if (vars[mappedColor]) {
      const mappedVarHex = normalizeHexColor(vars[mappedColor])
      if (mappedVarHex) return mappedVarHex
    }
  }

  const directVarHex = normalizeHexColor(vars[colorKey] || '')
  if (directVarHex) return directVarHex

  for (const fallbackKey of fallbackVarKeys) {
    const fallbackHex = normalizeHexColor(vars[fallbackKey] || '')
    if (fallbackHex) return fallbackHex
  }

  return undefined
}

function sanitizeThemeName(themeName: string): string {
  const clean = themeName.trim().replace(/^themes\//, '').replace(/\.json$/i, '')

  if (!clean) return ''
  if (!THEME_NAME_PATTERN.test(clean)) return ''
  if (clean.includes('..') || clean.startsWith('/') || clean.startsWith('\\')) return ''

  return clean
}

function toThemePath(themeName: string): string {
  const clean = sanitizeThemeName(themeName)
  if (!clean) return ''
  return `themes/${clean}.json`
}

async function loadThemeFile(themeName: string): Promise<PiThemeFile | null> {
  const key = sanitizeThemeName(themeName)
  if (!key) return null

  if (themeCache.has(key)) {
    return themeCache.get(key) ?? null
  }

  try {
    const content = await invoke<string>('read_resource_file', {
      path: toThemePath(key),
      scope: 'user',
    })
    const parsed = JSON.parse(content) as PiThemeFile
    themeCache.set(key, parsed)
    return parsed
  } catch {
    themeCache.set(key, null)
    return null
  }
}

function loadBuiltInBase46Theme(selection: string): PiThemeFile | null {
  const theme = getBuiltInBase46Theme(selection)
  return theme ? toPiThemeFileFromBase46(theme) : null
}

function resolveThemeName(selection: string): string | null {
  if (selection === APP_DEFAULT_THEME) return null
  if (isBuiltInBase46ThemeSelection(selection)) return null
  const sanitized = sanitizeThemeName(selection)
  return sanitized || null
}

export async function listUserPiThemes(): Promise<string[]> {
  try {
    const resources = await invoke<ResourceInfo[]>('scan_all_resources', { cwd: null })
    const names = resources
      .filter((resource) => resource.resourceType === 'themes' && resource.metadata.scope === 'user')
      .map((resource) => resource.path)
      .filter((resourcePath) => resourcePath.endsWith('.json'))
      .map((resourcePath) => resourcePath.replace(/^themes\//, '').replace(/\.json$/i, ''))
      .filter((name) => sanitizeThemeName(name) !== '')

    return [...new Set(names)].sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

export async function resolvePiThemeColorScheme(selection: string | undefined): Promise<'dark' | 'light' | null> {
  const normalized = (selection || APP_DEFAULT_THEME).trim() || APP_DEFAULT_THEME
  const builtInTheme = loadBuiltInBase46Theme(normalized)
  if (builtInTheme) return resolveThemeColorScheme(builtInTheme)

  const themeName = resolveThemeName(normalized)
  if (!themeName) return null

  const theme = await loadThemeFile(themeName)
  if (!theme?.vars) return null

  return resolveThemeColorScheme(theme)
}

export function clearPiThemeOverrides() {
  const root = document.documentElement
  OVERRIDE_VARS.forEach((variable) => root.style.removeProperty(variable))
  root.removeAttribute('data-chat-theme')
  root.removeAttribute('data-chat-theme-scheme')
  root.classList.remove('theme-dark', 'theme-light')
}

export async function applyPiChatTheme(selection: string | undefined) {
  const root = document.documentElement
  const applyId = ++activeThemeApplyId

  const normalized = (selection || APP_DEFAULT_THEME).trim() || APP_DEFAULT_THEME
  const builtInTheme = loadBuiltInBase46Theme(normalized)
  const themeName = resolveThemeName(normalized)

  if (!builtInTheme && !themeName) {
    // Not a custom theme, clear only CSS variable overrides but preserve theme class
    OVERRIDE_VARS.forEach((variable) => root.style.removeProperty(variable))
    root.removeAttribute('data-chat-theme')
    root.removeAttribute('data-chat-theme-scheme')
    return
  }

  const theme = builtInTheme ?? await loadThemeFile(themeName!)
  if (applyId !== activeThemeApplyId) return

  clearPiThemeOverrides()
  if (!theme?.vars) return

  const background = resolveThemeHex(theme, 'background', ['bg'])
  const panel = resolveThemeHex(theme, 'panel', ['bgLighter', 'background', 'bg'])
  const panelAlt = resolveThemeHex(theme, 'panelAlt', ['bgSlightlyLighter', 'bgLighter', 'panel'])
  const text = resolveThemeHex(theme, 'text', ['foreground'])
  const muted = resolveThemeHex(theme, 'muted', ['comment'])
  const dim = resolveThemeHex(theme, 'dim', ['dimGray', 'darkGray'])
  const accent = resolveThemeHex(theme, 'accent', ['violet', 'purple', 'cyan'])
  const border = resolveThemeHex(theme, 'border', ['teal', 'cyan', 'dimGray'])
  const success = resolveThemeHex(theme, 'success', ['green'])
  const error = resolveThemeHex(theme, 'error', ['red'])
  const warning = resolveThemeHex(theme, 'warning', ['orange', 'yellow'])
  const purple = firstValidHex(resolveThemeHex(theme, 'purple', []), theme.vars.purple, theme.vars.violet)
  const selectedBg = resolveThemeHex(theme, 'selectedBg', ['selected', 'selection'])

  setColorVar(root, '--color-background', background)
  setColorVar(root, '--color-foreground', text)
  setColorVar(root, '--color-card', panel)
  setColorVar(root, '--color-card-foreground', text)
  setColorVar(root, '--color-popover', panel)
  setColorVar(root, '--color-popover-foreground', text)
  setColorVar(root, '--color-primary', text)
  setColorVar(root, '--color-primary-foreground', background)
  setColorVar(root, '--color-secondary', panelAlt)
  setColorVar(root, '--color-secondary-foreground', text)
  setColorVar(root, '--color-muted', panelAlt)
  setColorVar(root, '--color-muted-foreground', muted)
  setColorVar(root, '--color-accent', panelAlt)
  setColorVar(root, '--color-accent-foreground', text)
  setColorVar(root, '--color-destructive', error)
  setColorVar(root, '--color-destructive-foreground', text)
  setColorVar(root, '--color-border', border)
  setColorVar(root, '--color-input', border)
  setColorVar(root, '--color-ring', accent)
  setColorVar(root, '--color-info', accent)
  setColorVar(root, '--color-success', success)
  setColorVar(root, '--color-warning', warning)
  setColorVar(root, '--color-surface', panel)
  setColorVar(root, '--color-surface-dark', panelAlt || panel)
  setColorVar(root, '--color-secondary-hover', selectedBg || panelAlt)
  setColorVar(root, '--color-border-hover', border)
  setColorVar(root, '--color-purple', purple)

  setRgbVar(root, '--accent-rgb', accent)
  setRgbVar(root, '--border-rgb', border)
  setRgbVar(root, '--highlight-rgb', text)
  setRgbVar(root, '--info-rgb', accent)
  setRgbVar(root, '--success-rgb', success)
  setRgbVar(root, '--warning-rgb', warning)
  setRgbVar(root, '--destructive-rgb', error)
  setRgbVar(root, '--foreground-rgb', text)
  setRgbVar(root, '--muted-fg-rgb', muted)
  setRgbVar(root, '--glass-rgb', panelAlt || panel)

  setHexVar(root, '--accent', accent)
  setHexVar(root, '--border', border)
  setHexVar(root, '--success', success)
  setHexVar(root, '--error', error)
  setHexVar(root, '--warning', warning)
  setHexVar(root, '--muted', muted)
  setHexVar(root, '--dim', dim)
  setHexVar(root, '--text', text)
  setHexVar(root, '--selectedBg', selectedBg)
  setHexVar(root, '--userMessageBg', resolveThemeHex(theme, 'userMessageBg', ['userMsgBg']) || panel)
  setHexVar(root, '--userMessageText', resolveThemeHex(theme, 'userMessageText', ['foreground', 'text']) || text)
  setHexVar(root, '--customMessageBg', resolveThemeHex(theme, 'customMessageBg', ['customMsgBg']) || panelAlt || panel)
  setHexVar(root, '--customMessageText', resolveThemeHex(theme, 'customMessageText', ['foreground', 'text']) || text)
  setHexVar(root, '--customMessageLabel', resolveThemeHex(theme, 'customMessageLabel', ['purple', 'violet']) || accent)
  setHexVar(root, '--toolPendingBg', resolveThemeHex(theme, 'toolPendingBg', ['bgSlightlyLighter']) || panelAlt || panel)
  setHexVar(root, '--toolSuccessBg', resolveThemeHex(theme, 'toolSuccessBg', ['bgSlightlyLighter']) || panel)
  setHexVar(root, '--toolErrorBg', resolveThemeHex(theme, 'toolErrorBg', ['bgSlightlyLighter']) || panel)
  setHexVar(root, '--toolTitle', resolveThemeHex(theme, 'toolTitle', ['accent', 'foreground']) || accent || text)
  setHexVar(root, '--toolOutput', resolveThemeHex(theme, 'toolOutput', ['muted', 'comment']) || muted || text)
  setHexVar(root, '--mdHeading', resolveThemeHex(theme, 'mdHeading', ['orange', 'yellow']) || warning)
  setHexVar(root, '--mdLink', resolveThemeHex(theme, 'mdLink', ['accent', 'cyan']) || accent)
  setHexVar(root, '--mdLinkUrl', resolveThemeHex(theme, 'mdLinkUrl', ['dim', 'dimGray']) || dim || muted)
  setHexVar(root, '--mdCode', resolveThemeHex(theme, 'mdCode', ['cyan', 'accent']) || accent)
  setHexVar(root, '--mdCodeBlock', resolveThemeHex(theme, 'mdCodeBlock', ['green']) || success)
  setHexVar(root, '--mdCodeBlockBorder', resolveThemeHex(theme, 'mdCodeBlockBorder', ['border']) || border)
  setHexVar(root, '--mdQuote', resolveThemeHex(theme, 'mdQuote', ['muted', 'comment']) || muted)
  setHexVar(root, '--mdQuoteBorder', resolveThemeHex(theme, 'mdQuoteBorder', ['border']) || border)
  setHexVar(root, '--mdHr', resolveThemeHex(theme, 'mdHr', ['border']) || border)
  setHexVar(root, '--mdListBullet', resolveThemeHex(theme, 'mdListBullet', ['purple', 'violet']) || purple || accent)
  setHexVar(root, '--toolDiffAdded', resolveThemeHex(theme, 'toolDiffAdded', ['green']) || success)
  setHexVar(root, '--toolDiffRemoved', resolveThemeHex(theme, 'toolDiffRemoved', ['red']) || error)
  setHexVar(root, '--toolDiffContext', resolveThemeHex(theme, 'toolDiffContext', ['muted', 'comment']) || muted)

  if (muted) {
    root.style.setProperty('--text-secondary', muted)
  }

  const resolvedScheme = resolveThemeColorScheme(theme)
  if (resolvedScheme) {
    root.setAttribute('data-chat-theme-scheme', resolvedScheme)
    // Auto-set theme class for components that depend on theme-dark/theme-light
    root.classList.remove('theme-dark', 'theme-light')
    root.classList.add(resolvedScheme === 'dark' ? 'theme-dark' : 'theme-light')
  }

  root.setAttribute('data-chat-theme', theme.name || themeName || normalized)
}
