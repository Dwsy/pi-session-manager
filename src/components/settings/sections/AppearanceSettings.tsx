/**
 * Appearance settings component — code theme, typography, and visual preferences.
 */

import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Check, ChevronDown, Search, X, Palette, Trash2, Loader2 } from 'lucide-react'
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
  isBuiltInBase46ThemeSelection,
  isBuiltInCodexThemeSelection,
  listUserPiThemes,
  deleteUserPiTheme,
  loadThemePreview,
  resolveThemePreview,
  toBase46Selection,
  toCodexSelection,
} from '@/utils/piTheme'
import type { ThemePreview } from '@/utils/piTheme'
import ThemeStudioModal from '@/components/settings/sections/ThemeStudioModal'
import { useEscapeToClose } from '@/components/dialogs/useEscapeToClose'
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
const SELECTED_CARD = 'border-transparent text-foreground settings-accent-bg-soft settings-accent-ring shadow-[shadow:var(--shadow-card)]'
const UNSELECTED_CARD = 'border-border/75 bg-surface/55 hover:border-border-hover hover:bg-surface/85'

type GallerySchemeFilter = 'all' | 'dark' | 'light'
type GalleryFamilyFilter = 'all' | 'base46' | 'codex' | 'user'

interface ThemeGalleryItem {
  selection: string
  label: string
  family: Exclude<GalleryFamilyFilter, 'all'>
  scheme: 'dark' | 'light'
  tags: string[]
  preview: ThemePreview | null
}

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
  const { t } = useTranslation()
  // Capture-phase Escape: closes the picker without dismissing the
  // settings panel, regardless of where focus sits.
  useEscapeToClose(onClose)
  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[80vh] w-[min(720px,calc(100vw-32px))] overflow-hidden rounded-xl border border-border/80 bg-popover text-popover-foreground shadow-[shadow:var(--shadow-popover)]">
        <div className="border-b border-border/75 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-lg font-semibold text-foreground">{title}</div>
              {subtitle && <div className="mt-1 text-sm text-muted-foreground">{subtitle}</div>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted-foreground hover:bg-secondary hover:text-foreground motion-color focus-ring"
              aria-label={t('common.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-4 flex items-center gap-3 rounded-[10px] border border-border/75 bg-surface/85 px-4 py-2.5">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder={placeholder}
              className="w-full bg-transparent text-base text-foreground placeholder:text-muted-foreground/75 outline-none"
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
  const [galleryQuery, setGalleryQuery] = useState('')
  const [galleryScheme, setGalleryScheme] = useState<GallerySchemeFilter>('all')
  const [galleryFamily, setGalleryFamily] = useState<GalleryFamilyFilter>('all')
  const [userThemePreviews, setUserThemePreviews] = useState<Record<string, ThemePreview>>({})
  const [studioOpen, setStudioOpen] = useState(false)
  const [studioInitialTheme, setStudioInitialTheme] = useState<string | undefined>(undefined)

  const handleOpenStudio = (initialName?: string) => {
    setStudioInitialTheme(initialName || settings.appearance.customTheme)
    setStudioOpen(true)
  }

  const handleThemeSaved = async (savedName: string) => {
    const updatedUserThemes = await listUserPiThemes()
    setPiThemes(updatedUserThemes)
    const preview = await loadThemePreview(savedName)
    if (preview) {
      setUserThemePreviews((prev) => ({ ...prev, [savedName]: preview }))
    }
    onUpdate('appearance', 'theme', 'custom')
    onUpdate('appearance', 'customTheme', savedName)
  }

  const [deleteConfirmTheme, setDeleteConfirmTheme] = useState<string | null>(null)

  const handleDeleteTheme = async (themeName: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setDeleteConfirmTheme(themeName)
  }

  const confirmDeleteTheme = async () => {
    if (!deleteConfirmTheme) return
    const name = deleteConfirmTheme
    setDeleteConfirmTheme(null)
    await deleteUserPiTheme(name)
    const updatedUserThemes = await listUserPiThemes()
    setPiThemes(updatedUserThemes)
    if (settings.appearance.customTheme === name) {
      onUpdate('appearance', 'customTheme', 'app-default')
    }
  }
  const deferredThemeQuery = useDeferredValue(themeQuery)
  const deferredUiFontQuery = useDeferredValue(uiFontQuery)
  const deferredFontQuery = useDeferredValue(fontQuery)
  const deferredGalleryQuery = useDeferredValue(galleryQuery)
  const builtInThemes = useMemo(() => getBuiltInBase46Themes(), [])
  const builtInCodexThemes = useMemo(() => getBuiltInCodexThemes(), [])
  const [selectedPreview, setSelectedPreview] = useState<ThemePreview | null>(null)

  useEffect(() => {
    let active = true
    loadThemePreview(settings.appearance.customTheme).then((preview) => {
      if (active) setSelectedPreview(preview)
    })
    return () => { active = false }
  }, [settings.appearance.customTheme])

  useEffect(() => {
    if (piThemes.length === 0) {
      setUserThemePreviews({})
      return
    }
    let active = true
    Promise.all(
      piThemes.map(async (themeName) => [themeName, await loadThemePreview(themeName)] as const),
    ).then((entries) => {
      if (!active) return
      const next: Record<string, ThemePreview> = {}
      for (const [name, preview] of entries) {
        if (preview) next[name] = preview
      }
      setUserThemePreviews(next)
    })
    return () => {
      active = false
    }
  }, [piThemes])

  const galleryItems = useMemo<ThemeGalleryItem[]>(() => {
    const base46Items: ThemeGalleryItem[] = builtInThemes.map((theme) => {
      const selection = toBase46Selection(theme.id)
      return {
        selection,
        label: theme.label,
        family: 'base46',
        scheme: theme.scheme,
        tags: ['base46', theme.id, theme.scheme],
        preview: resolveThemePreview(selection),
      }
    })
    const codexItems: ThemeGalleryItem[] = builtInCodexThemes.map((theme) => {
      const selection = toCodexSelection(theme.slug)
      return {
        selection,
        label: theme.name,
        family: 'codex',
        scheme: theme.mode,
        tags: ['codex', theme.slug, ...theme.tags],
        preview: resolveThemePreview(selection),
      }
    })
    const userItems: ThemeGalleryItem[] = piThemes.map((themeName) => {
      const preview = userThemePreviews[themeName] ?? resolveThemePreview(themeName)
      return {
        selection: themeName,
        label: preview?.label || themeName,
        family: 'user',
        scheme: preview?.scheme ?? 'dark',
        tags: ['user', themeName],
        preview,
      }
    })
    return [...base46Items, ...codexItems, ...userItems]
  }, [builtInCodexThemes, builtInThemes, piThemes, userThemePreviews])

  const filteredGalleryItems = useMemo(() => {
    const q = deferredGalleryQuery.trim().toLowerCase()
    return galleryItems.filter((item) => {
      if (galleryScheme !== 'all' && item.scheme !== galleryScheme) return false
      if (galleryFamily !== 'all' && item.family !== galleryFamily) return false
      if (!q) return true
      const haystack = `${item.label} ${item.selection} ${item.family} ${item.scheme} ${item.tags.join(' ')}`.toLowerCase()
      return haystack.includes(q)
    })
  }, [deferredGalleryQuery, galleryFamily, galleryItems, galleryScheme])

  const featuredQuickPreviews = useMemo(
    () =>
      [
        toBase46Selection('tokyonight'),
        toBase46Selection('catppuccin-latte'),
        toCodexSelection('ayu-dark'),
        toCodexSelection('rose-pine-dawn'),
      ]
        .map((selection) => resolveThemePreview(selection))
        .filter((item): item is ThemePreview => item !== null),
    [],
  )

  const selectedPresetKindLabel = useMemo(() => {
    if (isBuiltInBase46ThemeSelection(settings.appearance.customTheme)) {
      return t('settings.appearance.presetKind.base46', 'Base46 Preset')
    }
    if (isBuiltInCodexThemeSelection(settings.appearance.customTheme)) {
      return t('settings.appearance.presetKind.codex', 'Codex Preset')
    }
    return t('settings.appearance.presetKind.user', 'User Theme')
  }, [settings.appearance.customTheme, t])

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

          {settings.appearance.theme !== 'custom' && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-border/75 bg-surface/60 px-3.5 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex -space-x-1.5" aria-hidden="true">
                  {featuredQuickPreviews.map((preset) => (
                    <span
                      key={preset.selection}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border shadow-sm"
                      style={{
                        background: preset.colors.background,
                        borderColor: preset.colors.border,
                      }}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ background: preset.colors.accent }}
                      />
                    </span>
                  ))}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-xs font-medium text-foreground">
                    {t('settings.appearance.galleryPromoTitle', 'Built-in Theme Gallery')}
                  </div>
                  <div className="truncate text-[11px] leading-4 text-muted-foreground">
                    {t(
                      'settings.appearance.galleryPromoDesc',
                      'Browse {{count}} Base46 & Codex presets plus custom themes',
                      { count: builtInThemes.length + builtInCodexThemes.length },
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleThemeSelect('custom')}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium theme-accent-bg-soft theme-accent-border theme-accent-fg hover:opacity-90 motion-color focus-ring"
              >
                <Palette className="h-3.5 w-3.5" aria-hidden="true" />
                {t('settings.appearance.browsePresets', 'Browse Presets')}
              </button>
            </div>
          )}

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
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium theme-accent-bg-soft theme-accent-border theme-accent-fg hover:opacity-90 motion-color focus-ring"
                  >
                    <Palette className="h-4 w-4" />
                    {t('settings.themeStudio.open', 'Open Studio')}
                  </button>
                  {piThemes.includes(settings.appearance.customTheme) && (
                    <button
                      type="button"
                      onClick={(e) => handleDeleteTheme(settings.appearance.customTheme, e)}
                      title="Delete theme"
                      className="flex shrink-0 items-center justify-center rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-destructive hover:bg-destructive/20 transition-colors focus-ring"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>

                {/* Built-in Theme Gallery */}
                <div className="rounded-[10px] border border-border/75 bg-surface/45 p-3 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative min-w-[180px] flex-1">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                      <input
                        type="text"
                        value={galleryQuery}
                        onChange={(e) => setGalleryQuery(e.target.value)}
                        placeholder={t('settings.appearance.searchBuiltInThemes', 'Search Base46, Codex, or user themes...')}
                        aria-label={t('settings.appearance.searchBuiltInThemes', 'Search Base46, Codex, or user themes...')}
                        className="focus-ring h-8 w-full rounded-lg border border-border/75 bg-card/90 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground/75"
                      />
                      {galleryQuery && (
                        <button
                          type="button"
                          onClick={() => setGalleryQuery('')}
                          aria-label={t('common.clear', 'Clear')}
                          className="focus-ring absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>

                    <div
                      className="inline-flex items-center rounded-lg border border-border/65 bg-card/60 p-0.5"
                      role="group"
                      aria-label={t('settings.appearance.filterScheme', 'Filter by scheme')}
                    >
                      {([
                        ['all', t('settings.appearance.filterAll', 'All')],
                        ['dark', t('settings.appearance.themes.dark', 'Dark')],
                        ['light', t('settings.appearance.themes.light', 'Light')],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setGalleryScheme(value)}
                          aria-pressed={galleryScheme === value}
                          className={`focus-ring rounded-md px-2.5 py-1 text-[11px] leading-4 motion-color ${
                            galleryScheme === value
                              ? 'bg-card shadow-sm theme-accent-fg font-semibold'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <div
                      className="inline-flex items-center rounded-lg border border-border/65 bg-card/60 p-0.5"
                      role="group"
                      aria-label={t('settings.appearance.filterFamily', 'Filter by family')}
                    >
                      {([
                        ['all', t('settings.appearance.filterAll', 'All')],
                        ['base46', 'Base46'],
                        ['codex', 'Codex'],
                        ['user', t('settings.appearance.filterUser', 'User')],
                      ] as const).map(([value, label]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setGalleryFamily(value)}
                          aria-pressed={galleryFamily === value}
                          className={`focus-ring rounded-md px-2.5 py-1 text-[11px] leading-4 motion-color ${
                            galleryFamily === value
                              ? 'bg-card shadow-sm theme-accent-fg font-semibold'
                              : 'text-muted-foreground hover:text-foreground'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                      {filteredGalleryItems.length} / {galleryItems.length}
                    </span>
                  </div>

                  {filteredGalleryItems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border/75 bg-card/40 px-4 py-8 text-center">
                      <div className="text-xs text-muted-foreground">
                        {t('settings.appearance.noMatchingThemes', 'No themes match the current filters')}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setGalleryQuery('')
                          setGalleryScheme('all')
                          setGalleryFamily('all')
                        }}
                        className="focus-ring rounded-md border border-border/75 bg-card px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary"
                      >
                        {t('settings.appearance.resetThemeFilters', 'Reset filters')}
                      </button>
                    </div>
                  ) : (
                    <div className="settings-scrollbar grid max-h-[410px] scroll-py-1 grid-cols-1 gap-2.5 overflow-y-auto p-1 sm:grid-cols-2 lg:grid-cols-3">
                      {filteredGalleryItems.map((item) => {
                        const isSelected = settings.appearance.customTheme === item.selection
                        const colors = item.preview?.colors
                        const familyLabel =
                          item.family === 'base46'
                            ? 'Base46'
                            : item.family === 'codex'
                              ? 'Codex'
                              : t('settings.appearance.filterUser', 'User')
                        const schemeLabel =
                          item.scheme === 'dark'
                            ? t('settings.appearance.themes.dark', 'Dark')
                            : t('settings.appearance.themes.light', 'Light')

                        return (
                          <button
                            key={item.selection}
                            type="button"
                            onClick={() => onUpdate('appearance', 'customTheme', item.selection)}
                            aria-pressed={isSelected}
                            className={`focus-ring group flex flex-col rounded-[10px] border p-2.5 text-left motion-surface ${
                              isSelected
                                ? SELECTED_CARD
                                : 'border-border/75 bg-card/80 hover:border-border-hover hover:bg-card'
                            }`}
                          >
                            {colors ? (
                              <div
                                className="flex h-16 w-full flex-col overflow-hidden rounded-md border"
                                style={{
                                  background: colors.background,
                                  borderColor: colors.border,
                                }}
                                aria-hidden="true"
                              >
                                <div
                                  className="flex h-4 items-center justify-between border-b px-2"
                                  style={{
                                    background: colors.panel,
                                    borderColor: colors.border,
                                  }}
                                >
                                  <div className="flex items-center gap-1">
                                    <span
                                      className="h-1.5 w-1.5 rounded-full"
                                      style={{ background: colors.accent }}
                                    />
                                    <span
                                      className="h-1 w-8 rounded-full opacity-75"
                                      style={{ background: colors.text }}
                                    />
                                  </div>
                                  <span
                                    className="h-1.5 w-1.5 rounded-full"
                                    style={{ background: colors.code }}
                                  />
                                </div>
                                <div className="flex min-h-0 flex-1">
                                  <div
                                    className="flex w-[32%] flex-col gap-1 border-r p-1.5"
                                    style={{
                                      background: colors.panelAlt,
                                      borderColor: colors.border,
                                    }}
                                  >
                                    <span
                                      className="block h-1.5 w-full rounded-sm"
                                      style={{ background: colors.accent, opacity: 0.78 }}
                                    />
                                    <span
                                      className="block h-1 w-4/5 rounded-full opacity-65"
                                      style={{ background: colors.muted }}
                                    />
                                    <span
                                      className="block h-1 w-3/5 rounded-full opacity-50"
                                      style={{ background: colors.muted }}
                                    />
                                  </div>
                                  <div className="flex min-w-0 flex-1 flex-col justify-between p-1.5">
                                    <span
                                      className="block h-1.5 w-2/3 rounded-full"
                                      style={{ background: colors.markdown }}
                                    />
                                    <span
                                      className="block h-1 w-full rounded-full opacity-85"
                                      style={{ background: colors.text }}
                                    />
                                    <div className="flex items-center gap-1">
                                      <span
                                        className="block h-1.5 w-6 rounded-sm"
                                        style={{ background: colors.panel, border: `1px solid ${colors.border}` }}
                                      />
                                      <span
                                        className="block h-1 w-8 rounded-full"
                                        style={{ background: colors.success }}
                                      />
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="flex h-16 w-full items-center justify-center rounded-md border border-border/60 bg-surface text-[11px] text-muted-foreground">
                                {item.label}
                              </div>
                            )}

                            <div className="mt-2 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="truncate text-xs font-semibold text-foreground">
                                  {item.label}
                                </div>
                                <div className="text-[11px] leading-4 text-muted-foreground">
                                  {familyLabel} · {schemeLabel}
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                {colors && (
                                  <div className="flex items-center gap-0.5" aria-hidden="true">
                                    {[colors.accent, colors.success, colors.warning, colors.error].map((dot, idx) => (
                                      <span
                                        key={idx}
                                        className="h-2 w-2 rounded-full border border-black/15"
                                        style={{ background: dot }}
                                      />
                                    ))}
                                  </div>
                                )}
                                {isSelected && (
                                  <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full settings-accent-bg-strong">
                                    <Check className="h-3 w-3" />
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>

                {selectedPreview && (
                  <div
                    className="rounded-[10px] border p-3 shadow-[shadow:var(--shadow-card)]"
                    style={{
                      background: selectedPreview.colors.background,
                      borderColor: selectedPreview.colors.border,
                      color: selectedPreview.colors.text,
                    }}
                  >
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold">{selectedPreview.label}</div>
                        <div className="text-[11px] leading-4" style={{ color: selectedPreview.colors.muted }}>
                          {selectedPresetKindLabel}
                        </div>
                      </div>
                      <div
                        className="rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase"
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
                          <div className="mt-1 truncate text-[11px] leading-4" style={{ color: selectedPreview.colors.muted }}>{name}</div>
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
                className="w-full rounded-[10px] border border-border/75 bg-surface/55 px-4 py-3 text-left hover:border-border-hover hover:bg-surface/85 motion-color focus-ring"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">{currentUiFontLabel}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {uiFontsLoading
                        ? t('settings.appearance.detecting', 'Detecting fonts...')
                        : t('settings.appearance.searchFontsHint', 'Open searchable list with local installed fonts')}
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <div
                  className="mt-3 rounded-lg border border-border/65 bg-[var(--code-surface,rgb(var(--color-surface)))] px-3 py-2 text-sm text-foreground"
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
                className="w-full rounded-[10px] border border-border/75 bg-surface/55 px-4 py-3 text-left hover:border-border-hover hover:bg-surface/85 motion-color focus-ring"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-foreground">{currentCodeThemeMeta.label}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {codeThemeSchemeLabel(currentCodeThemeMeta.scheme)}
                    </div>
                  </div>
                  <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                </div>
                <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-border/65 bg-[var(--code-surface,rgb(var(--color-surface)))] p-2">
                  <div className="inline-flex h-7 min-w-10 items-center justify-center rounded-md border border-border/65 bg-card px-2 text-sm font-semibold text-foreground">
                    Ab
                  </div>
                  <div className="flex flex-1 gap-0.5 overflow-hidden rounded-md">
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
                  className="w-full rounded-[10px] border border-border/75 bg-surface/55 px-4 py-3 text-left hover:border-border-hover hover:bg-surface/85 motion-color focus-ring"
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground truncate">{currentMonoFontLabel}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {monoFontsLoading
                          ? t('settings.appearance.detecting', 'Detecting fonts...')
                          : t('settings.appearance.searchFontsHint', 'Open searchable list with local installed fonts')}
                      </div>
                    </div>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                  </div>
                  <div
                    className="mt-3 rounded-lg border border-border/65 bg-[var(--code-surface,rgb(var(--color-surface)))] px-3 py-2 text-sm text-foreground"
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

          <div className="rounded-[10px] border border-border/75 bg-surface/55 p-3.5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <div className="settings-section-label">
                {t('settings.appearance.preview', 'Preview')}
              </div>
              <div className="text-[11px] text-muted-foreground">
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
                className="code-block m-0 rounded-lg border border-border/70 bg-[var(--code-surface,rgb(var(--color-surface)))] px-3 py-2 text-foreground"
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
                      className={`min-w-[48px] rounded-lg border px-3 py-2 text-sm motion-color focus-ring ${
                        isSelected
                          ? `${SELECTED_CARD} font-semibold`
                          : 'border-border/75 bg-surface/65 text-foreground hover:border-border-hover hover:bg-surface'
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
                      className={`min-w-[60px] rounded-lg border px-3 py-2 text-sm motion-color focus-ring ${
                        isSelected
                          ? `${SELECTED_CARD} font-semibold`
                          : 'border-border/75 bg-surface/65 text-foreground hover:border-border-hover hover:bg-surface'
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
            description={<span className="font-mono text-muted-foreground">{'=> != -> ==='}</span>}
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
                  className={`w-full rounded-[10px] border px-4 py-3 text-left motion-color focus-ring ${
                    isSelected
                      ? SELECTED_CARD
                      : 'border-border/75 bg-surface/55 hover:border-border-hover hover:bg-surface/85'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{theme.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
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
                  <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-border/65 bg-[var(--code-surface,rgb(var(--color-surface)))] p-2">
                    <div className="inline-flex h-7 min-w-10 items-center justify-center rounded-md border border-border/65 bg-card px-2 text-sm font-semibold text-foreground">
                      Ab
                    </div>
                    <div className="flex flex-1 gap-0.5 overflow-hidden rounded-md">
                      {theme.previewColors.map((color, index) => (
                        <div key={index} className="h-7 flex-1" style={{ background: color }} />
                      ))}
                    </div>
                  </div>
                </button>
              )
            })}
            {filteredThemes.length === 0 && (
              <div className="rounded-[10px] border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
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
              <div className="flex items-center justify-center py-3 text-sm text-muted-foreground gap-2 border border-dashed border-border rounded-[10px] bg-surface/40">
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
                  className={`w-full rounded-[10px] border px-4 py-3 text-left motion-color focus-ring ${
                    isSelected
                      ? SELECTED_CARD
                      : 'border-border/75 bg-surface/55 hover:border-border-hover hover:bg-surface/85'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{font.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
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
                    className="mt-3 rounded-lg border border-border/65 bg-[var(--code-surface,rgb(var(--color-surface)))] px-3 py-2 text-sm text-foreground"
                    style={{ fontFamily: font.value }}
                  >
                    The quick brown fox 0123 中文
                  </div>
                </button>
              )
            })}
            {filteredUiFonts.length === 0 && (
              <div className="rounded-[10px] border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
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
              <div className="flex items-center justify-center py-3 text-sm text-muted-foreground gap-2 border border-dashed border-border rounded-[10px] bg-surface/40">
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
                  className={`w-full rounded-[10px] border px-4 py-3 text-left motion-color focus-ring ${
                    isSelected
                      ? SELECTED_CARD
                      : 'border-border/75 bg-surface/55 hover:border-border-hover hover:bg-surface/85'
                  }`}
                >
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-foreground">{font.label}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
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
                    className="mt-3 rounded-lg border border-border/65 bg-[var(--code-surface,rgb(var(--color-surface)))] px-3 py-2 text-sm text-foreground"
                    style={{ fontFamily: font.value }}
                  >
                    Hello World 0123  =&gt;  !=  -&gt;
                  </div>
                </button>
              )
            })}
            {filteredMonoFonts.length === 0 && (
              <div className="rounded-[10px] border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
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

      {deleteConfirmTheme && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-[min(440px,calc(100vw-32px))] rounded-xl border border-border/80 bg-popover p-6 text-popover-foreground shadow-[shadow:var(--shadow-popover)]">
            <h3 className="text-base font-semibold text-foreground">{t('settings.appearance.deleteThemeTitle', 'Delete Theme')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('settings.appearance.deleteThemeConfirm', 'Are you sure you want to delete the custom theme "{name}"? This cannot be undone.', { name: deleteConfirmTheme })}
            </p>
            <div className="mt-5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirmTheme(null)}
                className="rounded-lg px-4 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                type="button"
                onClick={confirmDeleteTheme}
                className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors"
              >
                {t('common.delete', 'Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
