import { invoke } from '@/transport'
import type { ResourceInfo } from '@/types'
import {
  getBuiltInBase46Theme,
  isBuiltInBase46ThemeSelection,
  toPiThemeFileFromBase46,
} from './base46Themes'
import {
  getBuiltInCodexTheme,
  isBuiltInCodexThemeSelection,
  toPiThemeFileFromCodex,
} from './codexThemes'
import {
  applyThemeVars,
  clearThemeVars,
  computeThemeVars,
  resolveThemeScheme,
} from './themeTokens'
import type { PiThemeFile, ThemePreview, ThemeScheme } from './themeTokens'

export type { PiThemeFile, ThemePreview, ThemeScheme } from './themeTokens'
export { THEME_OVERRIDE_VARS, normalizeHexColor } from './themeTokens'

export {
  getBuiltInBase46Themes,
  isBuiltInBase46ThemeSelection,
  toBase46Selection,
  toPiThemeFileFromBase46,
} from './base46Themes'

export {
  getBuiltInCodexThemes,
  isBuiltInCodexThemeSelection,
  toCodexSelection,
  toPiThemeFileFromCodex,
} from './codexThemes'

const APP_DEFAULT_THEME = 'app-default'

const THEME_FILE_PATTERN = /^[a-zA-Z0-9._\/-]+$/

const themeCache = new Map<string, PiThemeFile | null>()
let activeThemeApplyId = 0

function sanitizeThemeName(themeName: string): string {
  const clean = themeName.trim().replace(/^themes\//, '').replace(/\.json$/i, '')
  if (!clean) return ''
  if (!THEME_FILE_PATTERN.test(clean)) return ''
  if (clean.includes('..') || clean.startsWith('/') || clean.startsWith('\\')) return ''
  return clean
}

function toThemePath(themeName: string): string {
  const clean = sanitizeThemeName(themeName)
  if (!clean) return ''
  return 'themes/' + clean + '.json'
}

async function loadThemeFile(themeName: string): Promise<PiThemeFile | null> {
  const key = sanitizeThemeName(themeName)
  if (!key) return null
  if (themeCache.has(key)) return themeCache.get(key) ?? null
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

function loadBuiltInTheme(selection: string): PiThemeFile | null {
  const base46 = getBuiltInBase46Theme(selection)
  if (base46) return toPiThemeFileFromBase46(base46)
  const codex = getBuiltInCodexTheme(selection)
  if (codex) return toPiThemeFileFromCodex(codex)
  return null
}

function resolveThemeName(selection: string): string | null {
  if (selection === APP_DEFAULT_THEME) return null
  if (isBuiltInBase46ThemeSelection(selection)) return null
  if (isBuiltInCodexThemeSelection(selection)) return null
  const sanitized = sanitizeThemeName(selection)
  return sanitized || null
}

function toPreview(
  selection: string,
  theme: PiThemeFile,
  source: ThemePreview['source'],
): ThemePreview | null {
  const computed = computeThemeVars(theme)
  if (!computed) return null
  return {
    selection,
    label: theme.name || selection,
    source,
    scheme: computed.scheme ?? 'dark',
    colors: {
      background: computed.palette.background,
      panel: computed.palette.panel,
      panelAlt: computed.palette.panelAlt,
      text: computed.palette.text,
      muted: computed.palette.muted,
      accent: computed.palette.accent,
      border: computed.palette.border,
      success: computed.palette.success,
      warning: computed.palette.warning,
      error: computed.palette.error,
      code: computed.palette.code,
      markdown: computed.palette.markdown,
    },
  }
}

/**
 * Sync preview for built-in themes and cached user themes.
 * Use loadThemePreview for uncached user themes (needs disk access).
 */
export function resolveThemePreview(selection: string | undefined): ThemePreview | null {
  if (!selection) return null
  const builtIn = loadBuiltInTheme(selection)
  if (builtIn) return toPreview(selection, builtIn, 'built-in')
  const cached = themeCache.get(sanitizeThemeName(selection))
  if (cached) return toPreview(selection, cached, 'user')
  return null
}

/** Async preview that also covers user theme files on disk. */
export async function loadThemePreview(selection: string | undefined): Promise<ThemePreview | null> {
  if (!selection) return null
  const builtIn = loadBuiltInTheme(selection)
  if (builtIn) return toPreview(selection, builtIn, 'built-in')
  const themeName = resolveThemeName(selection)
  if (!themeName) return null
  const theme = await loadThemeFile(themeName)
  if (!theme) return null
  return toPreview(selection, theme, 'user')
}

export async function listUserPiThemes(): Promise<string[]> {
  try {
    const resources = await invoke<ResourceInfo[]>('scan_all_resources', { cwd: null })
    const names = resources
      .filter((r) => r.resourceType === 'themes' && r.metadata.scope === 'user')
      .map((r) => r.path)
      .filter((p) => p.endsWith('.json'))
      .map((p) => p.replace(/^themes\//, '').replace(/\.json$/i, ''))
      .filter((name) => sanitizeThemeName(name) !== '')
    return [...new Set(names)].sort((a, b) => a.localeCompare(b))
  } catch {
    return []
  }
}

export async function resolvePiThemeColorScheme(
  selection: string | undefined,
): Promise<ThemeScheme | null> {
  const normalized = (selection || APP_DEFAULT_THEME).trim() || APP_DEFAULT_THEME
  const builtIn = loadBuiltInTheme(normalized)
  if (builtIn) return resolveThemeScheme(builtIn)
  const themeName = resolveThemeName(normalized)
  if (!themeName) return null
  const theme = await loadThemeFile(themeName)
  if (!theme?.vars) return null
  return resolveThemeScheme(theme)
}

export function clearPiThemeOverrides() {
  clearThemeVars()
}

export async function applyPiChatTheme(selection: string | undefined) {
  const applyId = ++activeThemeApplyId
  const normalized = (selection || APP_DEFAULT_THEME).trim() || APP_DEFAULT_THEME

  const builtIn = loadBuiltInTheme(normalized)
  const themeName = builtIn ? null : resolveThemeName(normalized)

  // App default: drop overrides and let appearance setting own theme classes.
  if (!builtIn && !themeName) {
    clearThemeVars()
    return
  }

  const theme = builtIn ?? (await loadThemeFile(themeName!))
  if (applyId !== activeThemeApplyId) return
  if (!theme) {
    clearThemeVars()
    return
  }

  const computed = computeThemeVars(theme)
  if (!computed) {
    clearThemeVars()
    return
  }

  clearThemeVars()
  applyThemeVars(computed.vars, computed.scheme)
  document.documentElement.setAttribute('data-chat-theme', theme.name || themeName || normalized)
}

export async function saveUserPiTheme(name: string, theme: PiThemeFile): Promise<void> {
  const cleanName = sanitizeThemeName(name)
  if (!cleanName) throw new Error('Invalid theme name')
  const path = 'themes/' + cleanName + '.json'
  const content = JSON.stringify({ ...theme, name: cleanName }, null, 2)
  await invoke('write_resource_file', { path, content, scope: 'user' })
  themeCache.set(cleanName, { ...theme, name: cleanName })
}

export async function deleteUserPiTheme(name: string): Promise<void> {
  const cleanName = sanitizeThemeName(name)
  if (!cleanName) throw new Error('Invalid theme name')
  const path = 'themes/' + cleanName + '.json'
  await invoke('delete_resource_file', { path, scope: 'user' })
  themeCache.delete(cleanName)
}

export function validateAndParseThemeJson(
  jsonStr: string,
): { valid: boolean; theme?: PiThemeFile; error?: string } {
  if (!jsonStr.trim()) return { valid: false, error: 'Theme JSON cannot be empty.' }
  try {
    const parsed = JSON.parse(jsonStr)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { valid: false, error: 'Root theme JSON must be an object.' }
    }
    if (!parsed.vars && !parsed.colors) {
      return { valid: false, error: 'Theme object must contain "vars" or "colors" map.' }
    }
    return { valid: true, theme: parsed as PiThemeFile }
  } catch (err: any) {
    return { valid: false, error: 'JSON Syntax Error: ' + (err.message || String(err)) }
  }
}

/**
 * Prompt handed to an external model to author a theme.
 * Mirrors the real pi-coding-agent schema: surface = background, ink = text.
 */
export function generateThemePrompt(baseTheme?: PiThemeFile): string {
  const currentVars = baseTheme?.vars ? JSON.stringify(baseTheme.vars, null, 2) : ''
  const lines = [
    'You are an expert UI/UX and colour-palette designer. Design a complete, accessible theme for a developer desktop app (Pi Session Manager).',
    '',
    'Return ONLY a raw JSON object in exactly this shape \u2014 no prose, no markdown fences:',
    '',
    '{',
    '  "name": "my-theme",',
    '  "vars": {',
    '    "surface": "#0d0d0f",',
    '    "ink": "#f5f5f7",',
    '    "accent": "#ff6600",',
    '    "border": "#7a818f",',
    '    "borderAccent": "#7a818f",',
    '    "borderMuted": "#505050",',
    '    "success": "#22c55e",',
    '    "error": "#ef4444",',
    '    "warning": "#f0c674",',
    '    "skill": "#7a818f",',
    '    "muted": "#808080",',
    '    "dim": "#666666",',
    '    "thinkingText": "#808080",',
    '    "selectedBg": "#1a1a1c",',
    '    "userMessageBg": "#141416",',
    '    "userMessageText": "#f5f5f7",',
    '    "customMessageBg": "#141416",',
    '    "customMessageText": "#f5f5f7",',
    '    "customMessageLabel": "#7a818f",',
    '    "toolPendingBg": "#141416",',
    '    "toolSuccessBg": "#12251a",',
    '    "toolErrorBg": "#2a1414",',
    '    "toolTitle": "#7a818f",',
    '    "toolOutput": "#c8c8cc",',
    '    "mdHeading": "#f0c674",',
    '    "mdLink": "#7a818f",',
    '    "mdLinkUrl": "#808080",',
    '    "mdCode": "#7a818f",',
    '    "mdCodeBlock": "#22c55e",',
    '    "mdCodeBlockBorder": "#808080",',
    '    "mdQuote": "#808080",',
    '    "mdQuoteBorder": "#808080",',
    '    "mdHr": "#808080",',
    '    "mdListBullet": "#7a818f",',
    '    "toolDiffAdded": "#22c55e",',
    '    "toolDiffRemoved": "#ef4444",',
    '    "toolDiffContext": "#808080",',
    '    "syntaxComment": "#6A9955",',
    '    "syntaxKeyword": "#569CD6",',
    '    "syntaxFunction": "#DCDCAA",',
    '    "syntaxVariable": "#9CDCFE",',
    '    "syntaxString": "#CE9178",',
    '    "syntaxNumber": "#B5CEA8",',
    '    "syntaxType": "#4EC0B0",',
    '    "syntaxOperator": "#D4D4D4",',
    '    "syntaxPunctuation": "#D4D4D4",',
    '    "bashMode": "#22c55e"',
    '  }',
    '}',
    '',
    'Critical rules \u2014 the app renders these literally:',
    '- "surface" IS the app background. There is no "background" key. Omitting "surface" makes the theme fail to load.',
    '- "ink" IS the primary body text colour. There is no "text" key.',
    '- Every value must be a 6-digit hex string like "#1a1b26". No rgb(), no hsl(), no alpha, no empty strings.',
    '- Provide the full palette. Do not abbreviate it or invent new keys.',
    '- toolPendingBg / toolSuccessBg / toolErrorBg must differ from the surface, otherwise running, failed and finished tool calls look identical.',
    '- Aim for WCAG AA contrast between "surface" and "ink", and between "surface" and each of success / error / warning.',
  ]
  if (currentVars) {
    lines.push('')
    lines.push('Design language reference (existing theme vars, for the general vibe only):')
    lines.push(currentVars)
  }
  return lines.join('\n')
}

/**
 * Apply a theme object straight to the DOM (Theme Studio live preview).
 * Uses the same computeThemeVars as applyPiChatTheme.
 */
export function applyRawThemeObject(theme: PiThemeFile) {
  const computed = computeThemeVars(theme)
  clearThemeVars()
  if (!computed) return
  applyThemeVars(computed.vars, computed.scheme)
  document.documentElement.setAttribute('data-chat-theme', theme.name || 'studio-preview')
}