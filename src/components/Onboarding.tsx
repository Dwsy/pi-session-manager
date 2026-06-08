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
} from 'lucide-react'
import { invoke } from '@/transport'
import { useIsMobile } from '@/hooks/useIsMobile'
import type { AppSubagentSettings, ForcedSubagentProvider } from '@/components/settings/types'
import type { PiSettingsFull } from '@/types'
import { detectConfiguredSubagentProviders } from '@/utils/subagentCompatibility'

interface OnboardingProps {
  onComplete: () => void
}

interface StepConfig {
  icon: React.ReactNode
  titleKey: string
  descriptionKey: string
  hintKey?: string
  interactiveKind?: 'services' | 'subagents'
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
  }, [t])

  const steps: StepConfig[] = [
    {
      icon: <Sparkles className="h-12 w-12 text-info" />,
      titleKey: 'onboarding.steps.welcome.title',
      descriptionKey: 'onboarding.steps.welcome.description',
    },
    {
      icon: <FolderOpen className="h-12 w-12 text-blue-400" />,
      titleKey: 'onboarding.steps.browse.title',
      descriptionKey: 'onboarding.steps.browse.description',
      hintKey: 'onboarding.steps.browse.hint',
    },
    {
      icon: <Search className="h-12 w-12 text-emerald-400" />,
      titleKey: 'onboarding.steps.search.title',
      descriptionKey: 'onboarding.steps.search.description',
      hintKey: 'onboarding.steps.search.hint',
    },
    {
      icon: <GitBranch className="h-12 w-12 text-purple-400" />,
      titleKey: 'onboarding.steps.tree.title',
      descriptionKey: 'onboarding.steps.tree.description',
      hintKey: 'onboarding.steps.tree.hint',
    },
    {
      icon: <Server className="h-12 w-12 text-orange-400" />,
      titleKey: 'onboarding.steps.services.title',
      descriptionKey: 'onboarding.steps.services.description',
      interactiveKind: 'services',
    },
    {
      icon: <Bot className="h-12 w-12 text-cyan-400" />,
      titleKey: 'onboarding.steps.subagents.title',
      descriptionKey: 'onboarding.steps.subagents.description',
      interactiveKind: 'subagents',
    },
    {
      icon: <Settings className="h-12 w-12 text-amber-400" />,
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
    } catch (e) {
      console.error('Failed to save onboarding settings:', e)
    }
    onComplete()
  }, [serverSettings, terminalEnabled, openPosition, subagentSettings, onComplete])

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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md">
      <div className={`relative ${isMobile ? 'w-[95vw]' : 'w-[520px]'} bg-surface-dark rounded-2xl border border-border shadow-2xl overflow-hidden`}>
        <button
          onClick={handleSkip}
          className="absolute top-4 right-4 p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors z-10"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="h-1.5 bg-gradient-to-r from-info via-purple-500 to-emerald-500" />

        <div className="px-10 pt-10 pb-6 text-center">
          <div className="flex items-center justify-center mb-6">
            <div className="p-5 rounded-2xl bg-surface border border-border">
              {step.icon}
            </div>
          </div>

          <h2 className="text-xl font-bold text-foreground mb-3">
            {t(step.titleKey)}
          </h2>

          <p className="text-sm text-muted-foreground leading-relaxed mb-4 max-w-sm mx-auto">
            {t(step.descriptionKey)}
          </p>

          {step.hintKey && (
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-border rounded-lg">
              <span className="text-xs text-info font-medium">
                {t(step.hintKey)}
              </span>
            </div>
          )}

          {step.interactiveKind === 'services' && (
            <div className="mt-4 space-y-3 text-left max-w-xs mx-auto">
              <div className="space-y-1 py-2 px-3 bg-surface rounded-lg border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{t('settings.advanced.bindAddr', 'Bind Address')}</span>
                  <select
                    value={serverSettings.bind_addr}
                    onChange={(e) => setServerSettings((s) => ({ ...s, bind_addr: e.target.value }))}
                    className="px-2 py-1 bg-background border border-border rounded text-xs text-foreground"
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
              <div className="space-y-1 py-2 px-3 bg-surface rounded-lg border border-border">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-foreground">{t('settings.session.openPosition', 'Task positioning open position')}</span>
                  <select
                    value={openPosition}
                    onChange={(e) => setOpenPosition(e.target.value as OpenPosition)}
                    className="px-2 py-1 bg-background border border-border rounded text-xs text-foreground"
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
              <div className="space-y-1 py-2 px-3 bg-surface rounded-lg border border-border">
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
                  className="mt-2 w-full px-2 py-1 bg-background border border-border rounded text-xs text-foreground"
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
                <div className="space-y-1 py-2 px-3 bg-surface rounded-lg border border-border">
                  <div className="text-sm text-foreground font-medium">
                    {t('onboarding.steps.subagents.providerLabel', 'Forced provider')}
                  </div>
                  <select
                    value={subagentSettings.forcedProvider || recommendedProvider}
                    onChange={(e) => setSubagentSettings((prev) => ({
                      ...prev,
                      forcedProvider: e.target.value as ForcedSubagentProvider,
                    }))}
                    className="mt-2 w-full px-2 py-1 bg-background border border-border rounded text-xs text-foreground"
                  >
                    {FORCED_PROVIDER_OPTIONS.map((provider) => (
                      <option key={provider} value={provider}>{provider}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="space-y-1 py-2 px-3 bg-surface rounded-lg border border-border">
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
        </div>

        <div className="flex items-center justify-between px-10 pb-8">
          <div className="flex items-center gap-2">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === currentStep
                    ? 'w-6 bg-info'
                    : i < currentStep
                    ? 'w-1.5 bg-info/40'
                    : 'w-1.5 bg-secondary'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={handlePrev}
                className="flex items-center gap-1 px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ChevronLeft className="h-4 w-4" />
                {t('onboarding.prev')}
              </button>
            )}
            {isFirst && (
              <button
                onClick={handleSkip}
                className="px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {t('onboarding.skip')}
              </button>
            )}
            <button
              onClick={handleNext}
              className="flex items-center gap-1 px-5 py-2 bg-info hover:bg-info/80 text-white text-sm font-medium rounded-lg transition-colors"
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
    <div className="flex items-center justify-between py-2 px-3 bg-surface rounded-lg border border-border">
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
        <div className="w-10 h-5 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-info" />
      </label>
    </div>
  )
}
