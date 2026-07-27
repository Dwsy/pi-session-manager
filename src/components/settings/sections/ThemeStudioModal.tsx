/**
 * Theme Studio Modal — Advanced visual theme customization and AI Prompt generator.
 */

import { useEffect, useState } from 'react'
import { Check, Copy, AlertCircle, Sparkles, Sliders, Code, X, Save } from 'lucide-react'
import {
  type PiThemeFile,
  getBuiltInBase46Themes,
  listUserPiThemes,
  saveUserPiTheme,
  generateThemePrompt,
  validateAndParseThemeJson,
  applyRawThemeObject,
  applyPiChatTheme,
} from '@/utils/piTheme'
import { toBase46Selection, getBuiltInBase46Theme, toPiThemeFileFromBase46 } from '@/utils/base46Themes'

interface ThemeStudioModalProps {
  isOpen: boolean
  onClose: () => void
  initialThemeName?: string
  onThemeSaved: (savedThemeName: string) => Promise<void>
}

const COLOR_GROUPS: Array<{
  label: string
  keys: Array<{ key: string; name: string }>
}> = [
  {
    label: 'Base Surfaces',
    keys: [
      { key: 'background', name: 'Background' },
      { key: 'panel', name: 'Panel / Card' },
      { key: 'panelAlt', name: 'Secondary Surface' },
    ],
  },
  {
    label: 'Typography & Contrast',
    keys: [
      { key: 'text', name: 'Primary Text' },
      { key: 'muted', name: 'Muted / Comments' },
      { key: 'dim', name: 'Dim / Subtitles' },
    ],
  },
  {
    label: 'Brand & Accents',
    keys: [
      { key: 'accent', name: 'Brand Accent' },
      { key: 'border', name: 'Border Color' },
      { key: 'selectedBg', name: 'Selection Background' },
    ],
  },
  {
    label: 'Status & Badges',
    keys: [
      { key: 'success', name: 'Success / Additions' },
      { key: 'error', name: 'Error / Deletions' },
      { key: 'warning', name: 'Warning' },
      { key: 'purple', name: 'Custom Accent' },
    ],
  },
]

const DEFAULT_VARS: Record<string, string> = {
  background: '#1a1b26',
  panel: '#242536',
  panelAlt: '#1e1f2e',
  text: '#e5e5e7',
  muted: '#565f89',
  dim: '#414868',
  accent: '#8abeb7',
  border: '#5f87ff',
  success: '#7ee787',
  error: '#ef4444',
  warning: '#ffa657',
  purple: '#c792ea',
  selectedBg: '#2e3248',
}

export default function ThemeStudioModal({
  isOpen,
  onClose,
  initialThemeName,
  onThemeSaved,
}: ThemeStudioModalProps) {
  const [activeTab, setActiveTab] = useState<'palette' | 'ai'>('palette')
  const [baseSelection, setBaseSelection] = useState<string>('app-default')
  const [userThemes, setUserThemes] = useState<string[]>([])
  const [themeVars, setThemeVars] = useState<Record<string, string>>(DEFAULT_VARS)
  const [themeNameInput, setThemeNameInput] = useState('')
  const [jsonText, setJsonText] = useState('')
  const [jsonValidation, setJsonValidation] = useState<{ valid: boolean; error?: string }>({ valid: true })
  const [copiedPrompt, setCopiedPrompt] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Load available user themes on open
  useEffect(() => {
    if (isOpen) {
      listUserPiThemes().then(setUserThemes)
      if (initialThemeName) {
        setThemeNameInput(initialThemeName.replace(/^themes\//, '').replace(/\.json$/i, ''))
      } else {
        setThemeNameInput('my-custom-theme')
      }
    }
  }, [isOpen, initialThemeName])

  // Apply theme to variables and live preview
  const updateThemeVars = (newVars: Record<string, string>) => {
    setThemeVars(newVars)
    const formattedTheme: PiThemeFile = { vars: newVars }
    applyRawThemeObject(formattedTheme)
    setJsonText(JSON.stringify(formattedTheme, null, 2))
  }

  // Handle Base Theme change
  const handleBaseSelectionChange = (selection: string) => {
    setBaseSelection(selection)
    if (selection.startsWith('base46:')) {
      const base46Theme = getBuiltInBase46Theme(selection)
      if (base46Theme) {
        const piFile = toPiThemeFileFromBase46(base46Theme)
        if (piFile.vars) updateThemeVars({ ...DEFAULT_VARS, ...piFile.vars })
      }
    } else if (selection !== 'app-default') {
      // User theme selection
      const formattedTheme: PiThemeFile = { vars: { ...DEFAULT_VARS } }
      updateThemeVars(formattedTheme.vars!)
    } else {
      updateThemeVars(DEFAULT_VARS)
    }
  }

  const handleColorChange = (key: string, value: string) => {
    const nextVars = { ...themeVars, [key]: value }
    updateThemeVars(nextVars)
  }

  const handleJsonTextChange = (text: string) => {
    setJsonText(text)
    const result = validateAndParseThemeJson(text)
    setJsonValidation({ valid: result.valid, error: result.error })
    if (result.valid && result.theme?.vars) {
      setThemeVars({ ...DEFAULT_VARS, ...result.theme.vars })
      applyRawThemeObject(result.theme)
    }
  }

  const handleCopyPrompt = () => {
    const prompt = generateThemePrompt({ vars: themeVars })
    navigator.clipboard.writeText(prompt)
    setCopiedPrompt(true)
    setTimeout(() => setCopiedPrompt(false), 2000)
  }

  const handleSave = async () => {
    if (!themeNameInput.trim()) {
      setSaveError('Please enter a theme name')
      return
    }
    setIsSaving(true)
    setSaveError(null)
    try {
      const cleanName = themeNameInput.trim().toLowerCase().replace(/\s+/g, '-')
      await saveUserPiTheme(cleanName, { name: cleanName, vars: themeVars })
      await onThemeSaved(cleanName)
      onClose()
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save theme')
    } finally {
      setIsSaving(false)
    }
  }

  const handleCancel = () => {
    // Restore initial app theme
    applyPiChatTheme(initialThemeName)
    onClose()
  }

  if (!isOpen) return null

  const builtInBase46List = getBuiltInBase46Themes()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="theme-studio-title" className="flex h-[85vh] w-full max-w-6xl flex-col overflow-hidden rounded-md border border-border bg-background shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border bg-background px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/20 text-accent">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 id="theme-studio-title" className="text-lg font-semibold text-foreground">Theme Studio</h2>
              <p className="text-xs text-muted-foreground">Customise palette variables or generate JSON with AI</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Base preset dropdown */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>Base Template:</span>
              <select
                value={baseSelection}
                onChange={(e) => handleBaseSelectionChange(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2.5 text-xs text-foreground focus:border-accent focus:outline-none"
              >
                <option value="app-default">App Default</option>
                <optgroup label="Built-in Base46 Presets">
                  {builtInBase46List.map((t) => (
                    <option key={t.id} value={toBase46Selection(t.id)}>
                      {t.label} ({t.scheme})
                    </option>
                  ))}
                </optgroup>
                {userThemes.length > 0 && (
                  <optgroup label="User Custom Themes">
                    {userThemes.map((ut) => (
                      <option key={ut} value={ut}>
                        {ut}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <button
              onClick={handleCancel}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-surface-dark hover:text-foreground"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="grid flex-1 grid-cols-12 overflow-hidden">
          {/* Left Controls Panel */}
          <div className="col-span-7 flex flex-col border-r border-border bg-card">
            {/* Tabs */}
            <div className="flex border-b border-border bg-surface-dark/50 px-4 pt-2">
              <button
                type="button"
                onClick={() => setActiveTab('palette')}
                className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
                  activeTab === 'palette'
                    ? 'settings-accent-border settings-accent-fg font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Sliders className="h-4 w-4" />
                Palette Editor
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ai')}
                className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-medium transition-colors ${
                  activeTab === 'ai'
                    ? 'settings-accent-border settings-accent-fg font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Code className="h-4 w-4" />
                AI Prompt & JSON
              </button>
            </div>

            {/* Tab Panels */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'palette' ? (
                <div className="space-y-6">
                  {COLOR_GROUPS.map((group) => (
                    <div key={group.label} className="space-y-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {group.label}
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        {group.keys.map(({ key, name }) => {
                          const val = themeVars[key] || '#000000'
                          return (
                            <div
                              key={key}
                              className="flex items-center justify-between rounded-md border border-border/60 bg-background/50 p-2.5"
                            >
                              <span className="text-xs font-medium text-foreground">{name}</span>
                              <div className="flex items-center gap-2">
                                <input
                                  type="color"
                                  value={val.startsWith('#') ? val : '#000000'}
                                  onChange={(e) => handleColorChange(key, e.target.value)}
                                  className="h-6 w-6 cursor-pointer rounded border-0 bg-transparent p-0"
                                />
                                <input
                                  type="text"
                                  value={val}
                                  onChange={(e) => handleColorChange(key, e.target.value)}
                                  className="h-7 w-20 rounded border border-border bg-background px-2 text-center text-xs font-mono text-foreground focus:border-accent focus:outline-none"
                                />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex h-full flex-col space-y-4">
                  {/* AI Generator Helper */}
                  <div className="rounded-md border border-accent/30 bg-accent/10 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-accent">
                          <Sparkles className="h-4 w-4" /> Generate Theme with AI
                        </h4>
                        <p className="text-xs text-muted-foreground">
                          Copy this structured prompt to ChatGPT / Claude to design a custom theme, then paste the returned JSON below.
                        </p>
                      </div>
                      <button
                        onClick={handleCopyPrompt}
                        className="flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
                      >
                        {copiedPrompt ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                        {copiedPrompt ? 'Copied Prompt' : 'Copy AI Prompt'}
                      </button>
                    </div>
                  </div>

                  {/* JSON Editor */}
                  <div className="flex flex-1 flex-col space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-foreground">Paste or Edit Theme JSON</label>
                      {jsonValidation.valid ? (
                        <span className="flex items-center gap-1 text-xs text-success">
                          <Check className="h-3.5 w-3.5" /> Valid JSON
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-destructive">
                          <AlertCircle className="h-3.5 w-3.5" /> Syntax Error
                        </span>
                      )}
                    </div>
                    <textarea
                      value={jsonText}
                      onChange={(e) => handleJsonTextChange(e.target.value)}
                      placeholder="Paste JSON theme object here..."
                      className="flex-1 font-mono text-xs rounded-md border border-border bg-background p-3 text-foreground focus:border-accent focus:outline-none"
                    />
                    {!jsonValidation.valid && (
                      <p className="text-xs font-mono text-destructive">{jsonValidation.error}</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Live Preview Panel */}
          <div className="col-span-5 flex flex-col bg-surface/30 p-6">
            <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Live Mockup Preview
            </h3>

            <div className="flex-1 space-y-4 rounded-xl border border-border bg-background p-4 shadow-inner">
              {/* Header Bar */}
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full bg-destructive" />
                  <div className="h-3 w-3 rounded-full bg-warning" />
                  <div className="h-3 w-3 rounded-full bg-success" />
                  <span className="ml-2 text-xs font-mono text-muted-foreground">Session Viewer</span>
                </div>
                <span className="rounded-full bg-accent/20 px-2 py-0.5 text-[10px] font-medium text-accent">
                  Active Theme
                </span>
              </div>

              {/* Chat Dialog Simulation */}
              <div className="space-y-3 pt-2">
                {/* User Message */}
                <div className="ml-auto max-w-[80%] rounded-md bg-surface-dark p-3 text-xs text-foreground">
                  <p className="font-medium text-accent">User</p>
                  <p className="mt-1">Can you create a custom theme for me?</p>
                </div>

                {/* Assistant Message */}
                <div className="mr-auto max-w-[90%] space-y-2 rounded-md border border-border bg-card p-3 text-xs text-foreground">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-purple">Assistant Agent</span>
                    <span className="text-[10px] text-muted-foreground">16:35</span>
                  </div>
                  <p className="text-foreground">
                    Sure! I have generated the theme variables below. Here is a preview code block:
                  </p>

                  {/* Code Snippet Preview */}
                  <div className="rounded-md border border-border bg-background p-2.5 font-mono text-[11px] text-accent">
                    <span className="text-muted">fn</span> main() {'{'}
                    <br />
                    &nbsp;&nbsp;<span className="text-success">println!</span>(
                    <span className="text-warning">&quot;Hello, Studio!&quot;</span>);
                    <br />
                    {'}'}
                  </div>
                </div>
              </div>

              {/* Badges & Actions */}
              <div className="mt-4 flex flex-wrap gap-2 pt-4">
                <button className="rounded bg-accent px-3 py-1 text-xs font-medium text-primary-foreground">
                  Primary Action
                </button>
                <button className="rounded border border-border bg-surface px-3 py-1 text-xs font-medium text-foreground">
                  Secondary
                </button>
                <span className="rounded bg-success/20 px-2 py-1 text-[11px] font-medium text-success">
                  Success State
                </span>
                <span className="rounded bg-destructive/20 px-2 py-1 text-[11px] font-medium text-destructive">
                  Error Tag
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-border bg-background px-5 py-4">
          <div className="flex items-center gap-3">
            <label className="text-xs font-medium text-foreground">Save as Theme Name:</label>
            <input
              type="text"
              value={themeNameInput}
              onChange={(e) => setThemeNameInput(e.target.value)}
              placeholder="e.g. my-cool-theme"
              className="h-9 w-56 rounded-md border border-border bg-background px-3 text-xs text-foreground focus:border-accent focus:outline-none"
            />
            {saveError && <span className="text-xs text-destructive">{saveError}</span>}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleCancel}
              className="rounded-md border border-border px-4 py-2 text-xs font-medium text-foreground hover:bg-surface-dark"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save & Apply Theme'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
