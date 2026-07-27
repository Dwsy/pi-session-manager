import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import {
  FolderOpen,
  Search,
  GitBranch,
  Settings,
  ChevronRight,
  ChevronLeft,
  X,
  Sparkles,
  Server,
  Bot,
  Puzzle,
} from 'lucide-react'
import { invoke } from '@/transport'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { AppSubagentSettings, ForcedSubagentProvider } from '@/components/settings/types'
import type { PiSettingsFull } from '@/types'
import { detectConfiguredSubagentProviders } from '@/utils/subagentCompatibility'
import { psmPluginHost, setPsmPluginSettings } from '@/plugins/runtime-host'
import type { PsmPluginStatus } from '@/plugins/runtime-host'
import type { PsmPluginSettingValue } from '@pi-session-manager/plugin-sdk'

interface OnboardingProps {
  onComplete: () => void
}

interface StepConfig {
  icon: React.ReactNode
  titleKey: string
  descriptionKey: string
  hintKey?: string
  interactiveKind?: 'services' | 'subagents' | 'plugins'
}

interface ServerSettings {
  ws_enabled: boolean
  ws_port: number
  http_enabled: boolean
  http_port: number
  auth_enabled: boolean
  bind_addr: string
}

type OpenPosition = 'top' | 'bottom'

const FORCED_PROVIDER_OPTIONS: Array<Exclude<ForcedSubagentProvider, 'none'>> = [
  'nicobailon/pi-subagents',
  'HazAT/pi-interactive-subagents',
  '@tintinweb/pi-subagents',
]

export default function Onboarding({ onComplete }: OnboardingProps) {
  const { t } = useTranslation()
  const isMobile = useIsMobile()
  const [currentStep, setCurrentStep] = useState(0)
  const [serverSettings, setServerSettings] = useState<ServerSettings>({
    ws_enabled: true, ws_port: 52131,  // Single-port: same as HTTP
    http_enabled: true, http_port: 52131,
    auth_enabled: true,
    bind_addr: '127.0.0.1',
  })
  const [terminalEnabled, setTerminalEnabled] = useState(true)
  const [openPosition, setOpenPosition] = useState<OpenPosition>('top')
  const [subagentSettings, setSubagentSettings] = useState<AppSubagentSettings>({
    mode: 'smart',
    showProviderBadge: true,
    enableAsyncStatusProbe: true,
  })
  const [recommendedProvider, setRecommendedProvider] = useState<Exclude<ForcedSubagentProvider, 'none'>>('nicobailon/pi-subagents')
  const [detectedSubagentText, setDetectedSubagentText] = useState('')
  const [plugins, setPlugins] = useState<PsmPluginStatus[]>([])
  const [pluginSettings, setPluginSettings] = useState<Record<string, Record<string, PsmPluginSettingValue>>>({})

  useEffect(() => {
    invoke<ServerSettings>('load_server_settings').then(setServerSettings).catch(() => {})
    invoke<Record<string, unknown>>('load_app_settings').then((s) => {
      if (s?.terminal && typeof (s.terminal as Record<string, unknown>).builtinTerminalEnabled === 'boolean') {
        setTerminalEnabled((s.terminal as Record<string, unknown>).builtinTerminalEnabled as boolean)
      }
      if (
        s?.session &&
        ((s.session as Record<string, unknown>).openPosition === 'top' ||
          (s.session as Record<string, unknown>).openPosition === 'bottom')
      ) {
        setOpenPosition((s.session as Record<string, unknown>).openPosition as OpenPosition)
      }
      const rawSubagents = (s?.subagents as Record<string, unknown> | undefined) || {}
      setSubagentSettings({
        mode: rawSubagents.mode === 'forced' ? 'forced' : 'smart',
        forcedProvider:
          rawSubagents.mode === 'forced' && typeof rawSubagents.forcedProvider === 'string'
            ? rawSubagents.forcedProvider as ForcedSubagentProvider
            : undefined,
        showProviderBadge: rawSubagents.showProviderBadge !== false,
        enableAsyncStatusProbe: rawSubagents.enableAsyncStatusProbe !== false,
      })
    }).catch(() => {})

    invoke<PiSettingsFull>('load_pi_settings_full').then((piSettings) => {
      const summary = detectConfiguredSubagentProviders(piSettings)
      setRecommendedProvider(summary.recommendedProvider)
      const segments: string[] = []
      if (summary.enabledProviders.length > 0) {
        segments.push(t('onboarding.steps.subagents.enabledDetected', {
          defaultValue: 'Enabled: {{providers}}',
          providers: summary.enabledProviders.join(', '),
        }))
      }
      if (summary.disabledProviders.length > 0) {
        segments.push(t('onboarding.steps.subagents.disabledDetected', {
          defaultValue: 'Installed but disabled: {{providers}}',
          providers: summary.disabledProviders.join(', '),
        }))
      }
      setDetectedSubagentText(
        segments.join(' · ') || t('onboarding.steps.subagents.noDetection', 'No known subagent extension detected from Pi settings.'),
      )
      setSubagentSettings((prev) => (
        prev.mode === 'forced' && !prev.forcedProvider
          ? { ...prev, forcedProvider: summary.recommendedProvider }
          : prev
      ))
    }).catch(() => {})

    const loadedPlugins = psmPluginHost.listPlugins()
    setPlugins(loadedPlugins)
    const initialSettings: Record<string, Record<string, PsmPluginSettingValue>> = {}
    for (const p of loadedPlugins) {
      if (p.manifest?.configuration?.properties) {
        const settingsForP: Record<string, PsmPluginSettingValue> = {}
        for (const prop of p.manifest.configuration.properties) {
          if (prop.onboarding) {
            settingsForP[prop.key] = p.settings?.[prop.key] ?? prop.default ?? ''
          }
        }
        if (Object.keys(settingsForP).length > 0) {
          initialSettings[p.id] = settingsForP
        }
      }
    }
    setPluginSettings(initialSettings)
  }, [t])

  const steps: StepConfig[] = [
    {
      icon: <Sparkles className="h-6 w-6" />,
      titleKey: 'onboarding.steps.welcome.title',
      descriptionKey: 'onboarding.steps.welcome.description',
    },
    {
      icon: <FolderOpen className="h-6 w-6" />,
      titleKey: 'onboarding.steps.browse.title',
      descriptionKey: 'onboarding.steps.browse.description',
      hintKey: 'onboarding.steps.browse.hint',
    },
    {
      icon: <Search className="h-6 w-6" />,
      titleKey: 'onboarding.steps.search.title',
      descriptionKey: 'onboarding.steps.search.description',
      hintKey: 'onboarding.steps.search.hint',
    },
    {
      icon: <GitBranch className="h-6 w-6" />,
      titleKey: 'onboarding.steps.tree.title',
      descriptionKey: 'onboarding.steps.tree.description',
      hintKey: 'onboarding.steps.tree.hint',
    },
    {
      icon: <Server className="h-6 w-6" />,
      titleKey: 'onboarding.steps.services.title',
      descriptionKey: 'onboarding.steps.services.description',
      interactiveKind: 'services',
    },
    {
      icon: <Bot className="h-6 w-6" />,
      titleKey: 'onboarding.steps.subagents.title',
      descriptionKey: 'onboarding.steps.subagents.description',
      interactiveKind: 'subagents',
    },
    {
      icon: <Puzzle className="h-6 w-6" />,
      titleKey: 'onboarding.steps.plugins.title',
      descriptionKey: 'onboarding.steps.plugins.description',
      interactiveKind: 'plugins',
    },
    {
      icon: <Settings className="h-6 w-6" />,
      titleKey: 'onboarding.steps.settings.title',
      descriptionKey: 'onboarding.steps.settings.description',
      hintKey: 'onboarding.steps.settings.hint',
    },
  ]

  const totalSteps = steps.length
  const isFirst = currentStep === 0
  const isLast = currentStep === totalSteps - 1

  const handleComplete = useCallback(async () => {
    try {
      await invoke('save_server_settings', { settings: serverSettings })
      const appSettings = await invoke<Record<string, unknown>>('load_app_settings').catch(() => ({}))
      const merged = {
        ...appSettings,
        terminal: {
          ...((appSettings as Record<string, unknown>)?.terminal as Record<string, unknown> || {}),
          builtinTerminalEnabled: terminalEnabled,
        },
        session: {
          ...((appSettings as Record<string, unknown>)?.session as Record<string, unknown> || {}),
          openPosition,
        },
        subagents: {
          ...((appSettings as Record<string, unknown>)?.subagents as Record<string, unknown> || {}),
          ...subagentSettings,
          forcedProvider: subagentSettings.mode === 'forced' ? subagentSettings.forcedProvider : undefined,
        },
      }
      await invoke('save_app_settings', { settings: merged })

      // Save plugin onboarding configurations
      for (const [pluginId, settingsMap] of Object.entries(pluginSettings)) {
        const plugin = psmPluginHost.listPlugins().find((p) => p.id === pluginId)
        if (plugin) {
          const mergedSettings = {
            ...(plugin.settings ?? {}),
            ...settingsMap,
          }
          await setPsmPluginSettings({
            pluginId,
            settings: mergedSettings,
            source: plugin.source,
            packageName: plugin.packageName,
            entryPath: plugin.entryPath,
            projectPath: plugin.projectPath,
          }).catch((err) => {
            console.error(`Failed to save onboarding settings for plugin ${pluginId}:`, err)
          })
        }
      }
      await psmPluginHost.reload().catch(() => {})
    } catch (e) {
      console.error('Failed to save onboarding settings:', e)
    }
    onComplete()
  }, [serverSettings, terminalEnabled, openPosition, subagentSettings, pluginSettings, onComplete])

  const handleNext = useCallback(() => {
    if (isLast) {
      handleComplete()
    } else {
      setCurrentStep((s) => s + 1)
    }
  }, [isLast, handleComplete])

  const handlePrev = useCallback(() => {
    if (!isFirst) {
      setCurrentStep((s) => s - 1)
    }
  }, [isFirst])

  const handleSkip = useCallback(() => {
    handleComplete()
  }, [handleComplete])

  const step = steps[currentStep]

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="onboarding-step-title" className={`relative max-h-[90vh] overflow-y-auto rounded-lg border border-border bg-background shadow-xl ${isMobile ? 'w-full' : 'w-[560px]'}`}>
        <button
          type="button"
          onClick={handleSkip}
          aria-label={t('common.close', 'Close')}
          className="focus-ring absolute right-3 top-3 z-10 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="px-6 pb-5 pt-6 text-left">
          <div className="mb-4 flex items-center justify-start">
            <div className="text-muted-foreground">
              {step.icon}
            </div>
          </div>

          <h2 id="onboarding-step-title" className="mb-2 text-lg font-semibold text-foreground">
            {t(step.titleKey)}
          </h2>

          <p className="max-w-lg text-sm leading-relaxed text-muted-foreground mb-4">
            {t(step.descriptionKey)}
          </p>

          {step.hintKey && (
            <div className="mb-4 border-l-2 border-primary/40 pl-3">
              <span className="text-xs text-muted-foreground">
                {t(step.hintKey)}
              </span>
            </div>
          )}

          {step.interactiveKind === 'services' && (
            <div className="mt-4 space-y-3 text-left max-w-xs mx-auto">
              <div className="space-y-1 rounded-md border border-border px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{t('settings.advanced.bindAddr', 'Bind Address')}</span>
                  <select
                    value={serverSettings.bind_addr}
                    onChange={(e) => setServerSettings((s) => ({ ...s, bind_addr: e.target.value }))}
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                  >
                    <option value="127.0.0.1">127.0.0.1</option>
                    <option value="0.0.0.0">0.0.0.0</option>
                  </select>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {serverSettings.bind_addr === '0.0.0.0'
                    ? t('onboarding.steps.services.bindRemote', 'Allow LAN devices (phone/tablet) to connect')
                    : t('onboarding.steps.services.bindLocal', 'Local access only')}
                </p>
              </div>
              <ToggleRow
                label={t('onboarding.steps.services.websocket')}
                hint={`ws://${serverSettings.bind_addr}:${serverSettings.ws_port}`}
                checked={serverSettings.ws_enabled}
                onChange={(v) => setServerSettings((s) => ({ ...s, ws_enabled: v }))}
              />
              <ToggleRow
                label={t('onboarding.steps.services.httpApi')}
                hint={`http://${serverSettings.bind_addr}:${serverSettings.http_port}/api`}
                checked={serverSettings.http_enabled}
                onChange={(v) => setServerSettings((s) => ({ ...s, http_enabled: v }))}
              />
              <ToggleRow
                label={t('onboarding.steps.services.terminal', 'Built-in Terminal')}
                hint={t('onboarding.steps.services.terminalHint', 'Use terminal directly in the app')}
                checked={terminalEnabled}
                onChange={setTerminalEnabled}
              />
              <div className="space-y-1 rounded-md border border-border px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{t('settings.session.openPosition', 'Task positioning open position')}</span>
                  <select
                    value={openPosition}
                    onChange={(e) => setOpenPosition(e.target.value as OpenPosition)}
                    className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                  >
                    <option value="top">{t('settings.session.openPositions.top', 'Top')}</option>
                    <option value="bottom">{t('settings.session.openPositions.bottom', 'Bottom')}</option>
                  </select>
                </div>
              </div>
              {serverSettings.bind_addr === '0.0.0.0' && (
                <p className="text-[11px] text-amber-400/80 px-1">
                  {t('onboarding.steps.services.mobileHint', {
                    port: serverSettings.http_port,
                    defaultValue: 'Mobile devices can access via browser at http://<computer-IP>:{{port}}, automatically switches to HTTP mode',
                  })}
                </p>
              )}
            </div>
          )}

          {step.interactiveKind === 'subagents' && (
            <div className="mt-4 space-y-3 text-left max-w-sm mx-auto">
              <div className="space-y-1 rounded-md border border-border px-3 py-2">
                <div className="text-sm text-foreground font-medium">
                  {t('onboarding.steps.subagents.modeLabel', 'Compatibility mode')}
                </div>
                <select
                  value={subagentSettings.mode}
                  onChange={(e) => {
                    const nextMode = e.target.value === 'forced' ? 'forced' : 'smart'
                    setSubagentSettings((prev) => ({
                      ...prev,
                      mode: nextMode,
                      forcedProvider: nextMode === 'forced'
                        ? prev.forcedProvider || recommendedProvider
                        : undefined,
                    }))
                  }}
                  className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                >
                  <option value="smart">{t('onboarding.steps.subagents.smartMode', 'Smart (Recommended)')}</option>
                  <option value="forced">{t('onboarding.steps.subagents.forcedMode', 'Forced')}</option>
                </select>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  {subagentSettings.mode === 'smart'
                    ? t('onboarding.steps.subagents.smartHint', 'Infer the subagent protocol from JSON structure and session entries.')
                    : t('onboarding.steps.subagents.forcedHint', 'Prefer one known subagent protocol, then safely fall back when needed.')}
                </p>
              </div>

              {subagentSettings.mode === 'forced' && (
                <div className="space-y-1 rounded-md border border-border px-3 py-2">
                  <div className="text-sm text-foreground font-medium">
                    {t('onboarding.steps.subagents.providerLabel', 'Forced provider')}
                  </div>
                  <select
                    value={subagentSettings.forcedProvider || recommendedProvider}
                    onChange={(e) => setSubagentSettings((prev) => ({
                      ...prev,
                      forcedProvider: e.target.value as ForcedSubagentProvider,
                    }))}
                    className="mt-2 w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                  >
                    {FORCED_PROVIDER_OPTIONS.map((provider) => (
                      <option key={provider} value={provider}>{provider}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1 rounded-md border border-border px-3 py-2">
                <div className="text-sm text-foreground font-medium">
                  {t('onboarding.steps.subagents.detectedTitle', 'Detected from Pi settings')}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">{detectedSubagentText}</p>
                <p className="text-[11px] text-info mt-1">
                  {t('onboarding.steps.subagents.recommended', {
                    defaultValue: 'Recommended provider: {{provider}}',
                    provider: recommendedProvider,
                  })}
                </p>
              </div>
            </div>
          )}

          {step.interactiveKind === 'plugins' && (
            <div className="mt-4 space-y-3 text-left max-w-sm mx-auto overflow-y-auto max-h-[220px] pr-1 scrollbar-thin">
              {plugins.filter(p => p.manifest?.configuration?.properties?.some(prop => prop.onboarding)).map(plugin => {
                const onboardingProps = plugin.manifest?.configuration?.properties?.filter(prop => prop.onboarding) || [];
                return (
                  <div key={plugin.id} className="space-y-3 rounded-md border border-border p-3">
                    <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 border-b border-border/50 pb-1.5 mb-1">
                      <Puzzle className="h-3.5 w-3.5 text-pink-400" />
                      <span>{t(`plugins.${plugin.id}.configuration.title`, plugin.manifest?.configuration?.title ?? plugin.name)}</span>
                    </div>
                    {onboardingProps.map(prop => {
                      const value = pluginSettings[plugin.id]?.[prop.key] ?? prop.default ?? '';
                      const base = `plugins.${plugin.id}`;
                      const title = t(`${base}.settings.${prop.key}.title`, prop.title);
                      const description = prop.description ? t(`${base}.settings.${prop.key}.description`, prop.description) : "";

                      return (
                        <div key={prop.key} className="space-y-1">
                          {prop.type === 'boolean' ? (
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <span className="text-sm font-medium text-foreground">{title}</span>
                                {description && <p className="text-[11px] text-muted-foreground leading-normal mt-0.5">{description}</p>}
                              </div>
                              <label className="relative inline-flex items-center flex-shrink-0 ml-3 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={Boolean(value)}
                                  onChange={(e) => {
                                    setPluginSettings(prev => ({
                                      ...prev,
                                      [plugin.id]: {
                                        ...(prev[plugin.id] || {}),
                                        [prop.key]: e.target.checked
                                      }
                                    }));
                                  }}
                                  className="sr-only peer"
                                />
                                <div className="w-10 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
                              </label>
                            </div>
                          ) : prop.type === 'select' ? (
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <span className="text-sm font-medium text-foreground">{title}</span>
                                {description && <p className="text-[11px] text-muted-foreground leading-normal mt-0.5">{description}</p>}
                              </div>
                              <select
                                value={String(value)}
                                onChange={(e) => {
                                  setPluginSettings(prev => ({
                                    ...prev,
                                    [plugin.id]: {
                                      ...(prev[plugin.id] || {}),
                                      [prop.key]: e.target.value
                                    }
                                  }));
                                }}
                                className="rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground max-w-[150px]"
                              >
                                {(prop.options ?? []).map(opt => (
                                  <option key={String(opt.value)} value={String(opt.value)}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div>
                                <span className="text-sm font-medium text-foreground">{title}</span>
                                {description && <p className="text-[11px] text-muted-foreground leading-normal mt-0.5">{description}</p>}
                              </div>
                              <input
                                type={prop.type === 'number' ? 'number' : 'text'}
                                value={String(value)}
                                onChange={(e) => {
                                  const val = prop.type === 'number' ? Number(e.target.value) : e.target.value;
                                  setPluginSettings(prev => ({
                                    ...prev,
                                    [plugin.id]: {
                                      ...(prev[plugin.id] || {}),
                                      [prop.key]: val
                                    }
                                  }));
                                }}
                                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground"
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {plugins.filter(p => p.manifest?.configuration?.properties?.some(prop => prop.onboarding)).length === 0 && (
                <p className="text-sm text-center text-muted-foreground py-4">
                  {t('onboarding.steps.plugins.empty', 'No plug-in configuration is available for onboarding.')}
                </p>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <div className="flex items-center gap-2">
            {steps.map((_, i) => (
              <div
                key={i}
                aria-label={t('onboarding.stepProgress', 'Step {{current}} of {{total}}', { current: i + 1, total: steps.length })}
                className={`h-1.5 ${
                  i === currentStep
                    ? 'w-6 bg-primary'
                    : i < currentStep
                    ? 'w-1.5 bg-primary/40'
                    : 'w-1.5 bg-muted'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={handlePrev}
                className="focus-ring flex items-center gap-1 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
                {t('onboarding.prev')}
              </button>
            )}
            {isFirst && (
              <button
                onClick={handleSkip}
                className="focus-ring rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {t('onboarding.skip')}
              </button>
            )}
            <button
              onClick={handleNext}
              className="focus-ring flex items-center gap-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              {isLast ? t('onboarding.finish') : t('onboarding.next')}
              {!isLast && <ChevronRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ToggleRow({ label, hint, checked, onChange }: {
  label: string
  hint: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <div>
        <span className="text-sm text-foreground">{label}</span>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <label className="relative inline-flex items-center flex-shrink-0 ml-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className="w-10 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary" />
      </label>
    </div>
  )
}
