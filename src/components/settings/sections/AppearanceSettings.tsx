/**
 * Appearance settings component — code theme, typography, and visual preferences.
 */

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Search, X, Sparkles, Trash2, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import SettingsCard from '@/components/settings/SettingsCard'
import SettingsField from '@/components/settings/SettingsField'
import SettingsInput from '@/components/settings/SettingsInput'
import SettingsOptionGroup from '@/components/settings/SettingsOptionGroup'
import SettingsToggleRow from '@/components/settings/SettingsToggleRow'
import SettingsSelect from '@/components/settings/SettingsSelect'
import {
  getBuiltInBase46Themes,
  getBuiltInCodexThemes,
  listUserPiThemes,
  deleteUserPiTheme,
  resolveThemePreview,
  toBase46Selection,
  toCodexSelection,
} from '@/utils/piTheme'
import ThemeStudioModal from '@/components/settings/sections/ThemeStudioModal'
import { CODE_THEMES, MONOSPACE_FONTS } from '@/utils/codeThemes'
import { listAllSystemFonts, listSystemMonospaceFonts, type DetectedFont } from '@/utils/fontDetection'
import { renderCodeHtmlWithTheme } from '@/utils/markdown'
import { useResolvedCodeTheme } from '@/hooks/useResolvedCodeTheme'
import type { AppearanceSettingsProps } from '@/components/settings/types'

const CODE_FONT_SIZES = [12, 13, 14, 15, 16, 18, 20]
const CODE_FONT_WEIGHTS = [400, 500, 600, 700] as const
const CODE_PREVIEW_SNIPPET = `fn main() {
  println!("Hello World");
}`

// Aa glyph size used to telegraph each UI font-size step inside its option card.
const FONT_SIZE_PREVIEW_PX: Record<'small' | 'medium' | 'large', number> = {
  small: 13,
  medium: 16,
  large: 20,
}

// Shared selected-state classes so theme/size/code chips all read as the same
// system-accent control instead of mixing brand blue with the native accent.
const SELECTED_CARD = 'border-transparent text-foreground settings-accent-bg-soft settings-accent-ring'
const UNSELECTED_CARD = 'border-border bg-background/30 hover:border-border-hover'

type SwatchColors = {
  bg: string
  bar: string
  accent: string
  line: string
  border: string
}

const DARK_SWATCH: SwatchColors = {
  bg: '#1b1e24',
  bar: '#272b33',
  accent: '#5b9dd9',
  line: '#454b57',
  border: 'rgba(0,0,0,0.45)',
}

const LIGHT_SWATCH: SwatchColors = {
  bg: '#f4f5f7',
  bar: '#ffffff',
  accent: '#3b7de0',
  line: '#c9cdd6',
  border: 'rgba(0,0,0,0.10)',
}

type FontChoice = {
  label: string
  value: string
  source: 'system' | 'preset' | 'custom'
}

const UI_FONT_PRESETS: Array<Pick<FontChoice, 'label' | 'value'>> = [
  {
    label: 'System UI',
    value:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", "Helvetica Neue", Arial, sans-serif',
  },
  { label: 'Inter', value: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' },
  { label: 'SF Pro', value: '"SF Pro Text", -apple-system, BlinkMacSystemFont, sans-serif' },
  { label: 'PingFang SC', value: '"PingFang SC", "Microsoft YaHei", sans-serif' },
  { label: 'Segoe UI', value: '"Segoe UI", Arial, sans-serif' },
  { label: 'Helvetica Neue', value: '"Helvetica Neue", Arial, sans-serif' },
]

function extractPrimaryFontName(fontFamily: string): string {
  const match = fontFamily.match(/^\s*["']?([^"',]+)/)
  return match?.[1]?.trim() || fontFamily.trim() || 'Font'
}

function buildUiFontValue(family: string): string {
  return `"${family}", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`
}

function buildMonoFontValue(family: string): string {
  return `"${family}", ui-monospace, monospace`
}

function buildFontChoices(
  detected: DetectedFont[],
  presets: Array<Pick<FontChoice, 'label' | 'value'>>,
  currentValue: string,
  buildSystemValue: (family: string) => string,
): FontChoice[] {
  const seen = new Set<string>()
  const choices: FontChoice[] = []

  for (const font of detected) {
    const key = font.family.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    choices.push({
      label: font.family,
      value: buildSystemValue(font.family),
      source: 'system',
    })
  }

  for (const preset of presets) {
    const key = preset.label.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    choices.push({ ...preset, source: 'preset' })
  }

  if (currentValue.trim()) {
    const customLabel = extractPrimaryFontName(currentValue)
    const key = customLabel.toLowerCase()
    if (!seen.has(key)) {
      choices.unshift({
        label: customLabel,
        value: currentValue,
        source: 'custom',
      })
    }
  }

  return choices
}

/** Tiny window thumbnail: title bar with an accent dot + two content lines. */
function MiniWindow({ colors }: { colors: SwatchColors }) {
  return (
    <div
      className="h-full w-full overflow-hidden rounded-[5px] border"
      style={{ background: colors.bg, borderColor: colors.border }}
    >
      <div className="flex h-3 items-center gap-1 px-1.5" style={{ background: colors.bar }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: colors.accent }} />
        <span className="h-1 w-5 rounded-full opacity-70" style={{ background: colors.line }} />
      </div>
      <div className="space-y-1 px-1.5 pt-1.5">
        <span className="block h-1 w-4/5 rounded-full" style={{ background: colors.line }} />
        <span className="block h-1 w-1/2 rounded-full" style={{ background: colors.line }} />
      </div>
    </div>
  )
}

function ThemeMiniPreview({
  scheme,
  customColors,
}: {
  scheme: 'dark' | 'light' | 'system' | 'custom'
  customColors?: SwatchColors
}) {
  if (scheme === 'system') {
    return (
      <div className="flex h-10 gap-1">
        <div className="flex-1">
          <MiniWindow colors={DARK_SWATCH} />
        </div>
        <div className="flex-1">
          <MiniWindow colors={LIGHT_SWATCH} />
        </div>
      </div>
    )
  }
  const colors =
    scheme === 'light'
      ? LIGHT_SWATCH
      : scheme === 'custom' && customColors
        ? customColors
        : DARK_SWATCH
  return (
    <div className="h-10">
      <MiniWindow colors={colors} />
    </div>
  )
}

function ThemeOptionCard({
  scheme,
  label,
  selected,
  onSelect,
  customColors,
}: {
  scheme: 'dark' | 'light' | 'system' | 'custom'
  label: string
  selected: boolean
  onSelect: () => void
  customColors?: SwatchColors
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`rounded-[10px] border p-2 text-left motion-color focus-ring ${
        selected ? SELECTED_CARD : UNSELECTED_CARD
      }`}
    >
      <ThemeMiniPreview scheme={scheme} customColors={customColors} />
      <div className="mt-1.5 flex items-center justify-between gap-2 px-0.5">
        <span className={`text-sm font-medium ${selected ? 'text-foreground' : 'text-foreground/80'}`}>
          {label}
        </span>
        {selected && <Check className="h-3.5 w-3.5 settings-accent-fg" />}
      </div>
    </button>
  )
}

function FontSizeOptionCard({
  label,
  px,
  selected,
  onSelect,
}: {
  label: string
  px: number
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`flex h-12 flex-col items-center justify-center gap-0.5 rounded-lg border px-3 motion-color focus-ring ${
        selected ? SELECTED_CARD : UNSELECTED_CARD
      }`}
    >
      <span
        className={selected ? 'settings-accent-fg font-semibold' : 'text-foreground/75'}
        style={{ fontSize: `${px}px`, lineHeight: 1 }}
      >
        Aa
      </span>
      <span className={`text-[11px] ${selected ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</span>
    </button>
  )
}

function PickerDialog({
  title,
  subtitle,
  query,
  onQueryChange,
  onClose,
  placeholder,
  children,
}: {
  title: string
  subtitle?: string
  query: string
  onQueryChange: (value: string) => void
  onClose: () => void
  placeholder: string
  children: React.ReactNode
}) {
  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onClose()
        }
      }}
    >
      <div className="max-h-[80vh] w-[min(720px,calc(100vw-32px))] overflow-hidden rounded-lg border border-border bg-popover shadow-xl">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-foreground">{title}</div>
              {subtitle && <div className="mt-1 text-sm text-foreground/60">{subtitle}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground/60 hover:bg-surface hover:text-foreground motion-color"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-[10px] border border-border bg-surface px-4 py-3">
            <Search className="h-4 w-4 text-foreground/50" />
            <input
              autoFocus
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent text-base text-foreground placeholder:text-foreground/45 outline-none"
            />
          </div>
        </div>
        <div className="max-h-[calc(80vh-120px)] overflow-y-auto px-4 py-4">
          {children}
        </div>
      </div>
    </div>
  )
}

export default function AppearanceSettings({ settings, onUpdate }: AppearanceSettingsProps) {
  const { t } = useTranslation()
  const [piThemes, setPiThemes] = useState<string[]>([])
  const [systemFonts, setSystemFonts] = useState<DetectedFont[]>([])
  const [systemMonoFonts, setSystemMonoFonts] = useState<DetectedFont[]>([])
  const [uiFontsLoading, setUiFontsLoading] = useState(false)
  const [monoFontsLoading, setMonoFontsLoading] = useState(false)
  const [themePickerOpen, setThemePickerOpen] = useState(false)
  const [uiFontPickerOpen, setUiFontPickerOpen] = useState(false)
  const [fontPickerOpen, setFontPickerOpen] = useState(false)
  const [themeQuery, setThemeQuery] = useState('')
  const [uiFontQuery, setUiFontQuery] = useState('')
  const [fontQuery, setFontQuery] = useState('')
  const [studioOpen, setStudioOpen] = useState(false)
  const [studioInitialTheme, setStudioInitialTheme] = useState<string | undefined>(undefined)

  const handleOpenStudio = (initialName?: string) => {
    setStudioInitialTheme(initialName || settings.appearance.customTheme)
    setStudioOpen(true)
  }

  const handleThemeSaved = async (savedName: string) => {
    const updatedUserThemes = await listUserPiThemes()
    setPiThemes(updatedUserThemes)
    onUpdate('appearance', 'theme', 'custom')
    onUpdate('appearance', 'customTheme', savedName)
  }

  const handleDeleteTheme = async (themeName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm(`Are you sure you want to delete custom theme "${themeName}"?`)) {
      await deleteUserPiTheme(themeName)
      const updatedUserThemes = await listUserPiThemes()
      setPiThemes(updatedUserThemes)
      if (settings.appearance.customTheme === themeName) {
        onUpdate('appearance', 'customTheme', 'app-default')
      }
    }
  }
  const deferredThemeQuery = useDeferredValue(themeQuery)
  const deferredUiFontQuery = useDeferredValue(uiFontQuery)
  const deferredFontQuery = useDeferredValue(fontQuery)
  const builtInThemes = useMemo(() => getBuiltInBase46Themes(), [])
  const builtInCodexThemes = useMemo(() => getBuiltInCodexThemes(), [])
  const selectedPreview = useMemo(
    () => resolveThemePreview(settings.appearance.customTheme),
    [settings.appearance.customTheme]
  )

  const currentCodeTheme = settings.appearance.codeBlockTheme || 'github'
  const currentUiFont = settings.appearance.fontFamily || ''
  const currentMonoFont = settings.appearance.fontFamilyMono || ''
  const resolvedCodeTheme = useResolvedCodeTheme()
  const currentCodeThemeMeta = useMemo(() => {
    const selected = CODE_THEMES.find((theme) => theme.id === currentCodeTheme) ?? CODE_THEMES[0]
    const resolved = CODE_THEMES.find((theme) => theme.id === resolvedCodeTheme)
    return {
      ...selected,
      scheme: resolved?.scheme ?? selected.scheme,
      accent: resolved?.accent ?? selected.accent,
      previewColors: resolved?.previewColors ?? selected.previewColors,
    }
  }, [currentCodeTheme, resolvedCodeTheme])
  const currentFontLabel = extractPrimaryFontName(currentMonoFont)
  const codePreviewHtml = useMemo(
    () => renderCodeHtmlWithTheme(CODE_PREVIEW_SNIPPET, 'rust', resolvedCodeTheme),
    [resolvedCodeTheme],
  )

  const customThemeSwatch = useMemo<SwatchColors | undefined>(() => {
    if (!selectedPreview) return undefined
    return {
      bg: selectedPreview.colors.background,
      bar: selectedPreview.colors.panel,
      accent: selectedPreview.colors.accent,
      line: selectedPreview.colors.muted,
      border: selectedPreview.colors.border,
    }
  }, [selectedPreview])

  const uiFontChoices = useMemo<FontChoice[]>(
    () => buildFontChoices(systemFonts, UI_FONT_PRESETS, currentUiFont, buildUiFontValue),
    [currentUiFont, systemFonts],
  )

  const monoFontChoices = useMemo<FontChoice[]>(
    () => buildFontChoices(systemMonoFonts, MONOSPACE_FONTS, currentMonoFont, buildMonoFontValue),
    [currentMonoFont, systemMonoFonts],
  )

  const currentUiFontLabel = uiFontChoices.find((font) => font.value === currentUiFont)?.label ?? extractPrimaryFontName(currentUiFont)
  const currentMonoFontLabel = monoFontChoices.find((font) => font.value === currentMonoFont)?.label ?? currentFontLabel

  const filteredThemes = useMemo(() => {
    const q = deferredThemeQuery.trim().toLowerCase()
    if (!q) return CODE_THEMES
    return CODE_THEMES.filter((theme) => {
      const haystack = `${theme.label} ${theme.id} ${theme.scheme}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [deferredThemeQuery])

  const filteredUiFonts = useMemo(() => {
    const q = deferredUiFontQuery.trim().toLowerCase()
    if (!q) return uiFontChoices
    return uiFontChoices.filter((font) => {
      const haystack = `${font.label} ${font.source} ${font.value}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [deferredUiFontQuery, uiFontChoices])

  const filteredMonoFonts = useMemo(() => {
    const q = deferredFontQuery.trim().toLowerCase()
    if (!q) return monoFontChoices
    return monoFontChoices.filter((font) => {
      const haystack = `${font.label} ${font.source} ${font.value}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [deferredFontQuery, monoFontChoices])

  const handleThemeSelect = (theme: 'dark' | 'light' | 'system' | 'custom') => {
    onUpdate('appearance', 'theme', theme)

    if (theme === 'custom' && settings.appearance.customTheme === 'app-default') {
      const firstBuiltInTheme = builtInThemes[0]
      if (firstBuiltInTheme) {
        onUpdate('appearance', 'customTheme', toBase46Selection(firstBuiltInTheme.id))
      } else if (piThemes.length > 0) {
        onUpdate('appearance', 'customTheme', piThemes[0])
      }
    }
  }

  useEffect(() => {
    let active = true

    listUserPiThemes().then((themes) => {
      if (active) setPiThemes(themes)
    })

    return () => {
      active = false
    }
  }, [])

  // Lazily load UI fonts only when the picker is opened
  useEffect(() => {
    if (!uiFontPickerOpen || systemFonts.length > 0 || uiFontsLoading) return

    let active = true
    setUiFontsLoading(true)

    listAllSystemFonts()
      .then((fonts) => {
        if (active) {
          setSystemFonts(fonts)
          setUiFontsLoading(false)
        }
      })
      .catch(() => {
        if (active) setUiFontsLoading(false)
      })

    return () => {
      active = false
    }
  }, [uiFontPickerOpen, systemFonts.length, uiFontsLoading])

  // Lazily load Mono fonts only when the picker is opened
  useEffect(() => {
    if (!fontPickerOpen || systemMonoFonts.length > 0 || monoFontsLoading) return

    let active = true
    setMonoFontsLoading(true)

    listSystemMonospaceFonts()
      .then((fonts) => {
        if (active) {
          setSystemMonoFonts(fonts)
          setMonoFontsLoading(false)
        }
      })
      .catch(() => {
        if (active) setMonoFontsLoading(false)
      })

    return () => {
      active = false
    }
  }, [fontPickerOpen, systemMonoFonts.length, monoFontsLoading])

  useEffect(() => {
    if (!themePickerOpen) {
      setThemeQuery('')
    }
  }, [themePickerOpen])

  useEffect(() => {
    if (!uiFontPickerOpen) {
      setUiFontQuery('')
    }
  }, [uiFontPickerOpen])

  useEffect(() => {
    if (!fontPickerOpen) {
      setFontQuery('')
    }
  }, [fontPickerOpen])

  const codeThemeSchemeLabel = (scheme: string) =>
    scheme === 'follow'
      ? t('settings.appearance.followTheme', 'Follows theme')
      : scheme === 'dark'
        ? t('settings.appearance.themes.dark', 'Dark')
        : t('settings.appearance.themes.light', 'Light')

  return (
    <>
      <div className="space-y-4">
        <SettingsCard
          title={t('settings.appearance.theme', 'Theme')}
          contentClassName="p-3.5 space-y-4"
        >
          <SettingsField label={t('settings.appearance.theme', 'Theme')} searchKey="appearance-theme">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {(['dark', 'light', 'system', 'custom'] as const).map((scheme) => (
                <ThemeOptionCard
                  key={scheme}
                  scheme={scheme}
                  label={t(
                    `settings.appearance.themes.${scheme}`,
                    scheme === 'dark' ? 'Dark' : scheme === 'light' ? 'Light' : scheme === 'system' ? 'System' : 'Custom'
                  )}
                  selected={settings.appearance.theme === scheme}
                  onSelect={() => handleThemeSelect(scheme)}
                  customColors={scheme === 'custom' ? customThemeSwatch : undefined}
                />
              ))}
            </div>
          </SettingsField>

          {settings.appearance.theme === 'custom' && (
            <SettingsField
              label={t('settings.appearance.customTheme', 'Custom Theme Preset')}
              description={t('settings.appearance.customThemeHelp', 'Choose a built-in base46 theme or a theme file from ~/.pi/agent/themes')}
              searchKey="appearance-customTheme"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <SettingsSelect
                      value={settings.appearance.customTheme}
                      onChange={(e) => onUpdate('appearance', 'customTheme', e.target.value)}
                    >
                      <option value="app-default">{t('settings.appearance.appDefaultTheme', 'App default')}</option>
                      <optgroup label={t('settings.appearance.builtInBase46Themes', 'Built-in base46 themes')}>
                        {builtInThemes.map((theme) => (
                          <option key={theme.id} value={toBase46Selection(theme.id)}>
                            {theme.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label={t('settings.appearance.builtInCodexThemes', 'Built-in Codex themes')}>
                        {builtInCodexThemes.map((theme) => (
                          <option key={theme.slug} value={toCodexSelection(theme.slug)}>
                            {theme.name}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label={t('settings.appearance.userThemes', 'User themes')}>
                        {piThemes.length === 0 && (
                          <option value="" disabled>{t('settings.appearance.noCustomThemes', 'No custom themes found')}</option>
                        )}
                        {piThemes.map((themeName) => (
                          <option key={themeName} value={themeName}>
                            {themeName}
                          </option>
                        ))}
                      </optgroup>
                    </SettingsSelect>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleOpenStudio()}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs font-medium text-accent hover:bg-accent/20 transition-colors"
                  >
                    <Sparkles className="h-4 w-4" />
                    Open Studio
                  </button>
                  {piThemes.includes(settings.appearance.customTheme) && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteTheme(settings.appearance.customTheme, e)}
                      title="Delete theme"
                      className="flex shrink-0 items-center justify-center rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-destructive hover:bg-destructive/20 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {selectedPreview && (
                  <div
                    className="rounded-[10px] border p-3 shadow-sm"
                    style={{
                      background: selectedPreview.colors.background,
                      borderColor: selectedPreview.colors.border,
                      color: selectedPreview.colors.text,
                    }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{selectedPreview.label}</div>
                        <div className="text-[11px]" style={{ color: selectedPreview.colors.muted }}>
                          {t('settings.appearance.base46Preview', 'base46 preview')}
                        </div>
                      </div>
                      <div
                        className="rounded-full border px-2 py-0.5 text-[10px] uppercase"
                        style={{ borderColor: selectedPreview.colors.accent, color: selectedPreview.colors.accent }}
                      >
                        {selectedPreview.scheme}
                      </div>
                    </div>

                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-8">
                      {([
                        ['background', selectedPreview.colors.background],
                        ['panel', selectedPreview.colors.panel],
                        ['text', selectedPreview.colors.text],
                        ['muted', selectedPreview.colors.muted],
                        ['accent', selectedPreview.colors.accent],
                        ['success', selectedPreview.colors.success],
                        ['warning', selectedPreview.colors.warning],
                        ['error', selectedPreview.colors.error],
                      ] as const).map(([name, color]) => (
                        <div key={name} className="min-w-0">
                          <div className="h-6 rounded-md border" style={{ background: color, borderColor: selectedPreview.colors.border }} />
                          <div className="mt-1 truncate text-[10px]" style={{ color: selectedPreview.colors.muted }}>{name}</div>
                        </div>
                      ))}
                    </div>

                    <div
                      className="mt-3 rounded-md border px-3 py-2 font-mono text-[11px]"
                      style={{
                        background: selectedPreview.colors.panel,
                        borderColor: selectedPreview.colors.border,
                        color: selectedPreview.colors.code,
                      }}
                    >
                      <span style={{ color: selectedPreview.colors.markdown }}># markdown</span>{' '}
                      <span style={{ color: selectedPreview.colors.text }}>const theme = </span>
                      <span style={{ color: selectedPreview.colors.success }}>&apos;{selectedPreview.label}&apos;</span>
                    </div>
                  </div>
                )}
              </div>
            </SettingsField>
          )}
        </SettingsCard>

        <SettingsCard contentClassName="p-3.5 space-y-3">
          <SettingsField label={t('settings.appearance.fontSize', 'Font size')} searchKey="appearance-fontSize" className="space-y-2">
            <div className="grid grid-cols-3 gap-2.5">
              {(['small', 'medium', 'large'] as const).map((size) => (
                <FontSizeOptionCard
                  key={size}
                  label={t(`settings.appearance.fontSizes.${size}`, size === 'small' ? 'Small' : size === 'medium' ? 'Medium' : 'Large')}
                  px={FONT_SIZE_PREVIEW_PX[size]}
                  selected={settings.appearance.fontSize === size}
                  onSelect={() => onUpdate('appearance', 'fontSize', size)}
                />
              ))}
            </div>
          </SettingsField>

          <SettingsField label={t('settings.appearance.fontFamily', 'Font Family')} searchKey="appearance-fontFamily" className="space-y-2">
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() => setUiFontPickerOpen(true)}
                className="w-full rounded-[10px] border border-border bg-background/35 px-4 py-3 text-left hover:border-border-hover motion-color"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{currentUiFontLabel}</div>
                    <div className="mt-1 text-xs text-foreground/60">
                      {uiFontsLoading
                        ? t('settings.appearance.detecting', 'Detecting fonts...')
                        : t('settings.appearance.searchFontsHint', 'Open searchable list with local installed fonts')}
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0 text-foreground/55" />
                </div>
                <div
                  className="mt-3 rounded-lg border border-border/50 bg-surface-dark/45 px-3 py-2 text-sm text-foreground"
                  style={{ fontFamily: currentUiFont || undefined }}
                >
                  The quick brown fox 0123 中文
                </div>
              </button>

              <SettingsInput
                type="text"
                value={currentUiFont}
                onChange={(e) => onUpdate('appearance', 'fontFamily', e.target.value)}
                placeholder='-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
              />
            </div>
          </SettingsField>

          <SettingsField label={t('settings.appearance.messageSpacing', 'Message spacing')} searchKey="appearance-messageSpacing">
            <SettingsOptionGroup
              options={['compact', 'comfortable', 'spacious'] as const}
              value={settings.appearance.messageSpacing}
              onChange={(spacing) => onUpdate('appearance', 'messageSpacing', spacing)}
              renderLabel={(spacing) => t(`settings.appearance.spacing.${spacing}`)}
              containerClassName="grid grid-cols-3 gap-3"
              optionClassName="h-10 rounded-lg py-0"
            />
          </SettingsField>
        </SettingsCard>

        <SettingsCard
          title={t('settings.appearance.codeTypography', 'Code Typography')}
          description={t('settings.appearance.codeTypographyDesc', 'Theme, font, size and ligatures for code blocks')}
          contentClassName="p-3.5 space-y-3.5"
        >
          <div className="grid gap-3 lg:grid-cols-2">
            <SettingsField
              label={t('settings.appearance.codeBlockTheme', 'Code Theme')}
              description={t('settings.appearance.codeBlockThemeDesc', 'Search and switch syntax themes from a popup list')}
              searchKey="appearance-codeBlockTheme"
              className="space-y-2"
            >
              <button
                type="button"
                onClick={() => setThemePickerOpen(true)}
                className="w-full rounded-[10px] border border-border bg-background/35 px-4 py-3 text-left hover:border-border-hover motion-color"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">{currentCodeThemeMeta.label}</div>
                    <div className="mt-1 text-xs text-foreground/60">
                      {codeThemeSchemeLabel(currentCodeThemeMeta.scheme)}
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0 text-foreground/55" />
                </div>
                <div className="mt-3 flex items-center gap-1 rounded-lg border border-border/50 bg-surface-dark/45 p-2">
                  <div className="inline-flex h-7 min-w-10 items-center justify-center rounded-lg bg-black/35 px-2 text-sm font-semibold text-white/90">
                    Ab
                  </div>
                  <div className="flex flex-1 gap-0.5 overflow-hidden rounded-lg">
                    {currentCodeThemeMeta.previewColors.map((color, index) => (
                      <div key={index} className="h-7 flex-1" style={{ background: color }} />
                    ))}
                  </div>
                </div>
              </button>
            </SettingsField>

            <SettingsField
              label={t('settings.appearance.fontFamilyMono', 'Code Font')}
              description={t('settings.appearance.fontFamilyMonoDesc', 'Installed monospace fonts + manual fallback chain')}
              searchKey="appearance-fontFamilyMono"
              className="space-y-2"
            >
              <div className="space-y-2.5">
                <button
                  type="button"
                  onClick={() => setFontPickerOpen(true)}
                  className="w-full rounded-[10px] border border-border bg-background/35 px-4 py-3 text-left hover:border-border-hover motion-color"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{currentMonoFontLabel}</div>
                      <div className="mt-1 text-xs text-foreground/60">
                        {monoFontsLoading
                          ? t('settings.appearance.detecting', 'Detecting fonts...')
                          : t('settings.appearance.searchFontsHint', 'Open searchable list with local installed fonts')}
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 shrink-0 text-foreground/55" />
                  </div>
                  <div
                    className="mt-3 rounded-lg border border-border/50 bg-surface-dark/45 px-3 py-2 text-sm text-foreground"
                    style={{ fontFamily: currentMonoFont || undefined }}
                  >
                    Hello World 0123  =&gt;  !=  -&gt;
                  </div>
                </button>

                <SettingsInput
                  type="text"
                  value={currentMonoFont}
                  onChange={(e) => onUpdate('appearance', 'fontFamilyMono', e.target.value)}
                  placeholder='"JetBrains Mono", ui-monospace, monospace'
                />
              </div>
            </SettingsField>
          </div>

          <div className="rounded-[10px] border border-border bg-background/35 p-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="settings-section-label">
                {t('settings.appearance.preview', 'Preview')}
              </div>
              <div className="text-[11px] text-foreground/50">
                {currentCodeThemeMeta.label} · {currentMonoFontLabel}
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)] lg:items-start">
              <div className="space-y-1" style={{ fontFamily: currentMonoFont || undefined }}>
                <div className="text-sm leading-relaxed text-foreground">abcdefghijklmnopqrstuvwxyz</div>
                <div className="text-sm leading-relaxed text-foreground">ABCDEFGHIJKLMNOPQRSTUVWXYZ 0123456789</div>
                <div className="text-sm leading-relaxed text-foreground">(){}[]&lt;&gt; =!@#$%^&amp;*;: hello_world =&gt; != -&gt;</div>
              </div>
              <pre
                className="code-block m-0 rounded-lg border border-border/60 bg-surface-dark/55 px-3 py-2 text-foreground"
                style={{
                  fontFamily: currentMonoFont || undefined,
                  fontSize: 'var(--code-font-size, 13px)',
                  fontWeight: 'var(--code-font-weight, 400)' as any,
                  fontVariantLigatures: 'var(--code-ligatures, "calt", "liga", "dlig")' as any,
                  fontFeatureSettings: 'var(--code-ligatures, "calt", "liga", "dlig")' as any,
                }}
              >
                <code
                  className="shiki rust"
                  dangerouslySetInnerHTML={{ __html: codePreviewHtml }}
                />
              </pre>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <SettingsField
              label={t('settings.appearance.codeFontSize', 'Code Font Size')}
              description={`${settings.appearance.codeFontSize ?? 13}px`}
              searchKey="appearance-codeFontSize"
            >
              <div className="flex flex-wrap gap-1.5">
                {CODE_FONT_SIZES.map((size) => {
                  const isSelected = (settings.appearance.codeFontSize ?? 13) === size
                  return (
                    <button
                      key={size}
                      type="button"
                      onClick={() => onUpdate('appearance', 'codeFontSize', size)}
                      className={`min-w-[48px] rounded-lg border px-3 py-2 text-sm motion-color ${
                        isSelected
                          ? `${SELECTED_CARD} font-semibold`
                          : 'border-border bg-surface-dark/50 text-foreground/80 hover:border-border-hover hover:text-foreground'
                      }`}
                    >
                      {size}px
                    </button>
                  )
                })}
              </div>
            </SettingsField>

            <SettingsField
              label={t('settings.appearance.codeFontWeight', 'Code Font Weight')}
              searchKey="appearance-codeFontWeight"
            >
              <div className="flex flex-wrap gap-1.5">
                {CODE_FONT_WEIGHTS.map((weight) => {
                  const isSelected = (settings.appearance.codeFontWeight ?? 400) === weight
                  return (
                    <button
                      key={weight}
                      type="button"
                      onClick={() => onUpdate('appearance', 'codeFontWeight', weight)}
                      className={`min-w-[60px] rounded-lg border px-3 py-2 text-sm motion-color ${
                        isSelected
                          ? `${SELECTED_CARD} font-semibold`
                          : 'border-border bg-surface-dark/50 text-foreground/80 hover:border-border-hover hover:text-foreground'
                      }`}
                      style={{ fontWeight: weight }}
                    >
                      {weight}
                    </button>
                  )
                })}
              </div>
            </SettingsField>
          </div>

          <SettingsToggleRow
            className="px-0 py-1.5"
            toggleSize="sm"
            title={t('settings.appearance.codeLigatures', 'Code Ligatures')}
            description={<span className="font-mono text-foreground/50">{'=> != -> ==='}</span>}
            checked={settings.appearance.codeLigatures !== false}
            onChange={(v) => onUpdate('appearance', 'codeLigatures', v)}
            searchKey="appearance-codeLigatures"
          />
        </SettingsCard>

        <SettingsCard contentClassName="divide-y divide-border/40">
          <SettingsToggleRow
            className="px-3 py-2"
            toggleSize="sm"
            title={t('settings.appearance.disableToolSuccessStyle', 'Disable tool success style')}
            description={t(
              'settings.appearance.disableToolSuccessStyleDesc',
              'Disable green background and border on successful tool execution for cleaner tool cards'
            )}
            checked={settings.appearance.disableToolSuccessStyle}
            onChange={(v) => onUpdate('appearance', 'disableToolSuccessStyle', v)}
            searchKey="appearance-disableToolSuccessStyle"
          />
          <SettingsToggleRow
            className="px-3 py-2"
            toggleSize="sm"
            title={t('settings.appearance.disableToolCallStyle', 'Disable tool call style')}
            description={t(
              'settings.appearance.disableToolCallStyleDesc',
              'Disable background, border and shadow on tool call cards'
            )}
            checked={settings.appearance.disableToolCallStyle}
            onChange={(v) => onUpdate('appearance', 'disableToolCallStyle', v)}
            searchKey="appearance-disableToolCallStyle"
          />
        </SettingsCard>

        <SettingsCard
          title={t('settings.appearance.diffView', 'Diff View')}
          description={t('settings.appearance.diffViewDesc', 'Configure how code diffs are displayed in tool execution and review panels')}
          contentClassName="p-3.5 space-y-3"
        >
          <SettingsField
            label={t('settings.appearance.diffViewStyle', 'View Style')}
            description={t('settings.appearance.diffViewStyleDesc', 'Side-by-side split view or unified inline view')}
            searchKey="appearance-diffView"
          >
            <SettingsOptionGroup
              options={['split', 'unified'] as const}
              value={settings.appearance.diffView ?? 'split'}
              onChange={(value) => onUpdate('appearance', 'diffView', value)}
              renderLabel={(value) =>
                value === 'split'
                  ? t('settings.appearance.diffViewSplit', 'Split')
                  : t('settings.appearance.diffViewUnified', 'Unified')
              }
              containerClassName="grid grid-cols-2 gap-3"
              optionClassName="h-10 rounded-lg py-0"
            />
          </SettingsField>

          <SettingsField
            label={t('settings.appearance.diffLineDiffType', 'Line Diff Type')}
            description={t('settings.appearance.diffLineDiffTypeDesc', 'Granularity of diff highlighting: full lines, words, or characters')}
            searchKey="appearance-diffLineDiffType"
          >
            <SettingsOptionGroup
              options={['full', 'words', 'chars'] as const}
              value={settings.appearance.diffLineDiffType ?? 'words'}
              onChange={(value) => onUpdate('appearance', 'diffLineDiffType', value)}
              renderLabel={(value) =>
                value === 'full'
                  ? t('settings.appearance.diffLineDiffFull', 'Full Lines')
                  : value === 'words'
                    ? t('settings.appearance.diffLineDiffWords', 'Words')
                    : t('settings.appearance.diffLineDiffChars', 'Chars')
              }
              containerClassName="grid grid-cols-3 gap-3"
              optionClassName="h-10 rounded-lg py-0"
            />
          </SettingsField>


          <div className="grid grid-cols-2 divide-x divide-border/40">
            <SettingsToggleRow
              className="px-3 py-2 pr-4"
              toggleSize="sm"
              title={t('settings.appearance.diffLineNumbers', 'Show Line Numbers')}
              description={t('settings.appearance.diffLineNumbersDesc', 'Display line numbers in diff views')}
              checked={settings.appearance.diffLineNumbers ?? true}
              onChange={(v) => onUpdate('appearance', 'diffLineNumbers', v)}
              searchKey="appearance-diffLineNumbers"
            />
            <SettingsToggleRow
              className="px-3 py-2 pl-4"
              toggleSize="sm"
              title={t('settings.appearance.diffWrap', 'Wrap Long Lines')}
              description={t('settings.appearance.diffWrapDesc', 'Wrap long lines instead of horizontal scrolling')}
              checked={settings.appearance.diffWrap ?? false}
              onChange={(v) => onUpdate('appearance', 'diffWrap', v)}
              searchKey="appearance-diffWrap"
            />
          </div>

          <div className="grid grid-cols-2 divide-x divide-border/40 border-t border-border/40">
            <SettingsToggleRow
              className="px-3 py-2 pr-4"
              toggleSize="sm"
              title={t('settings.appearance.diffIndicators', 'Show Diff Indicators')}
              description={t('settings.appearance.diffIndicatorsDesc', 'Show +/− indicators for added and removed lines')}
              checked={settings.appearance.diffIndicators ?? true}
              onChange={(v) => onUpdate('appearance', 'diffIndicators', v)}
              searchKey="appearance-diffIndicators"
            />
            <SettingsToggleRow
              className="px-3 py-2 pl-4"
              toggleSize="sm"
              title={t('settings.appearance.diffExpandUnchanged', 'Expand Unchanged Lines')}
              description={t('settings.appearance.diffExpandUnchangedDesc', 'Expand unchanged regions in diff views')}
              checked={settings.appearance.diffExpandUnchanged ?? true}
              onChange={(v) => onUpdate('appearance', 'diffExpandUnchanged', v)}
              searchKey="appearance-diffExpandUnchanged"
            />
          </div>
        </SettingsCard>

      </div>

      {themePickerOpen && (
        <PickerDialog
          title={t('settings.appearance.codeBlockTheme', 'Code Theme')}
          subtitle={t('settings.appearance.themePickerHint', 'Search themes and compare color strips before applying')}
          query={themeQuery}
          onQueryChange={setThemeQuery}
          onClose={() => setThemePickerOpen(false)}
          placeholder={t('settings.appearance.searchThemes', 'Search themes')}
        >
          <div className="space-y-3">
            {filteredThemes.map((theme) => {
              const isSelected = currentCodeTheme === theme.id
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => {
                    onUpdate('appearance', 'codeBlockTheme', theme.id)
                    setThemePickerOpen(false)
                  }}
                  className={`w-full rounded-[10px] border px-4 py-3 text-left motion-color ${
                    isSelected
                      ? SELECTED_CARD
                      : 'border-border bg-background/35 hover:border-border-hover hover:bg-surface/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{theme.label}</div>
                      <div className="mt-1 text-xs text-foreground/55">
                        {codeThemeSchemeLabel(theme.scheme)}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {isSelected && (
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full settings-accent-bg-strong">
                          <Check className="h-3.5 w-3.5" />
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-1 rounded-lg border border-border/50 bg-surface-dark/45 p-2">
                    <div className="inline-flex h-7 min-w-10 items-center justify-center rounded-lg bg-black/35 px-2 text-sm font-semibold text-white/90">
                      Ab
                    </div>
                    <div className="flex flex-1 gap-0.5 overflow-hidden rounded-lg">
                      {theme.previewColors.map((color, index) => (
                        <div key={index} className="h-7 flex-1" style={{ background: color }} />
                      ))}
                    </div>
                  </div>
                </button>
              )
            })}
            {filteredThemes.length === 0 && (
              <div className="rounded-[10px] border border-dashed border-border px-4 py-8 text-center text-sm text-foreground/55">
                {t('settings.searchEmpty', 'No matching settings')}
              </div>
            )}
          </div>
        </PickerDialog>
      )}

      {uiFontPickerOpen && (
        <PickerDialog
          title={t('settings.appearance.fontFamily', 'Font Family')}
          subtitle={t('settings.appearance.uiFontPickerHint', 'Installed UI fonts first, then curated readable presets')}
          query={uiFontQuery}
          onQueryChange={setUiFontQuery}
          onClose={() => setUiFontPickerOpen(false)}
          placeholder={t('settings.appearance.searchFonts', 'Search fonts')}
        >
          <div className="space-y-3">
            {uiFontsLoading && (
              <div className="flex items-center justify-center py-3 text-sm text-foreground/55 gap-2 border border-dashed border-border rounded-[10px] bg-background/20">
                <Loader2 className="h-4 w-4 animate-spin settings-accent-fg" />
                <span>{t('settings.appearance.detecting', 'Detecting system fonts...')}</span>
              </div>
            )}
            {filteredUiFonts.map((font) => {
              const isSelected = currentUiFont === font.value
              return (
                <button
                  key={`${font.source}-${font.label}`}
                  type="button"
                  onClick={() => {
                    onUpdate('appearance', 'fontFamily', font.value)
                    setUiFontPickerOpen(false)
                  }}
                  className={`w-full rounded-[10px] border px-4 py-3 text-left motion-color ${
                    isSelected
                      ? SELECTED_CARD
                      : 'border-border bg-background/35 hover:border-border-hover hover:bg-surface/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{font.label}</div>
                      <div className="mt-1 text-xs text-foreground/55">
                        {font.source === 'system'
                          ? t('settings.appearance.systemFonts', 'System fonts')
                          : font.source === 'preset'
                            ? t('settings.appearance.popularUiFonts', 'Popular UI fonts')
                            : t('settings.appearance.custom', 'Custom')}
                      </div>
                    </div>
                    {isSelected && (
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full settings-accent-bg-strong">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                  <div
                    className="mt-3 rounded-lg border border-border/50 bg-surface-dark/45 px-3 py-2 text-sm text-foreground"
                    style={{ fontFamily: font.value }}
                  >
                    The quick brown fox 0123 中文
                  </div>
                </button>
              )
            })}
            {filteredUiFonts.length === 0 && (
              <div className="rounded-[10px] border border-dashed border-border px-4 py-8 text-center text-sm text-foreground/55">
                {t('settings.searchEmpty', 'No matching settings')}
              </div>
            )}
          </div>
        </PickerDialog>
      )}

      {fontPickerOpen && (
        <PickerDialog
          title={t('settings.appearance.fontFamilyMono', 'Code Font')}
          subtitle={t('settings.appearance.fontPickerHint', 'Installed monospace fonts first, then curated popular choices')}
          query={fontQuery}
          onQueryChange={setFontQuery}
          onClose={() => setFontPickerOpen(false)}
          placeholder={t('settings.appearance.searchFonts', 'Search fonts')}
        >
          <div className="space-y-3">
            {monoFontsLoading && (
              <div className="flex items-center justify-center py-3 text-sm text-foreground/55 gap-2 border border-dashed border-border rounded-[10px] bg-background/20">
                <Loader2 className="h-4 w-4 animate-spin settings-accent-fg" />
                <span>{t('settings.appearance.detecting', 'Detecting system fonts...')}</span>
              </div>
            )}
            {filteredMonoFonts.map((font) => {
              const isSelected = currentMonoFont === font.value
              return (
                <button
                  key={`${font.source}-${font.label}`}
                  type="button"
                  onClick={() => {
                    onUpdate('appearance', 'fontFamilyMono', font.value)
                    setFontPickerOpen(false)
                  }}
                  className={`w-full rounded-[10px] border px-4 py-3 text-left motion-color ${
                    isSelected
                      ? SELECTED_CARD
                      : 'border-border bg-background/35 hover:border-border-hover hover:bg-surface/70'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{font.label}</div>
                      <div className="mt-1 text-xs text-foreground/55">
                        {font.source === 'system'
                          ? t('settings.appearance.systemFonts', 'System fonts')
                          : font.source === 'preset'
                            ? t('settings.appearance.popularFonts', 'Popular monospace fonts')
                            : t('settings.appearance.custom', 'Custom')}
                      </div>
                    </div>
                    {isSelected && (
                      <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full settings-accent-bg-strong">
                        <Check className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </div>
                  <div
                    className="mt-3 rounded-lg border border-border/50 bg-surface-dark/45 px-3 py-2 text-sm text-foreground"
                    style={{ fontFamily: font.value }}
                  >
                    Hello World 0123  =&gt;  !=  -&gt;
                  </div>
                </button>
              )
            })}
            {filteredMonoFonts.length === 0 && (
              <div className="rounded-[10px] border border-dashed border-border px-4 py-8 text-center text-sm text-foreground/55">
                {t('settings.searchEmpty', 'No matching settings')}
              </div>
            )}
          </div>
        </PickerDialog>
      )}

      <ThemeStudioModal
        isOpen={studioOpen}
        onClose={() => setStudioOpen(false)}
        initialThemeName={studioInitialTheme}
        onThemeSaved={handleThemeSaved}
      />
    </>
  )
}
