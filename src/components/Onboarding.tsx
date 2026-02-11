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
} from 'lucide-react'
import { invoke } from '../transport'

interface OnboardingProps {
  onComplete: () => void
}

interface StepConfig {
  icon: React.ReactNode
  titleKey: string
  descriptionKey: string
  hintKey?: string
  interactive?: boolean
}

interface ServerSettings {
  ws_enabled: boolean
  ws_port: number
  http_enabled: boolean
  http_port: number
  auth_enabled: boolean
}

export default function Onboarding({ onComplete }: OnboardingProps) {
  const { t } = useTranslation()
  const [currentStep, setCurrentStep] = useState(0)
  const [serverSettings, setServerSettings] = useState<ServerSettings>({
    ws_enabled: true, ws_port: 52130,
    http_enabled: true, http_port: 52131,
    auth_enabled: true,
  })
  const [terminalEnabled, setTerminalEnabled] = useState(true)

  useEffect(() => {
    invoke<ServerSettings>('load_server_settings').then(setServerSettings).catch(() => {})
    invoke<Record<string, unknown>>('load_app_settings').then((s) => {
      if (s?.terminal && typeof (s.terminal as Record<string, unknown>).builtinTerminalEnabled === 'boolean') {
        setTerminalEnabled((s.terminal as Record<string, unknown>).builtinTerminalEnabled as boolean)
      }
    }).catch(() => {})
  }, [])

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
      interactive: true,
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
      }
      await invoke('save_app_settings', { settings: merged })
    } catch (e) {
      console.error('Failed to save onboarding settings:', e)
    }
    onComplete()
  }, [serverSettings, terminalEnabled, onComplete])

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
      <div className="relative w-[520px] bg-surface-dark rounded-2xl border border-border shadow-2xl overflow-hidden">
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

          {/* Services interactive step */}
          {step.interactive && (
            <div className="mt-4 space-y-3 text-left max-w-xs mx-auto">
              <ToggleRow
                label="WebSocket"
                hint={`ws://0.0.0.0:${serverSettings.ws_port}`}
                checked={serverSettings.ws_enabled}
                onChange={(v) => setServerSettings((s) => ({ ...s, ws_enabled: v }))}
              />
              <ToggleRow
                label="HTTP API"
                hint={`http://0.0.0.0:${serverSettings.http_port}/api`}
                checked={serverSettings.http_enabled}
                onChange={(v) => setServerSettings((s) => ({ ...s, http_enabled: v }))}
              />
              <ToggleRow
                label={t('onboarding.steps.services.terminal', '内置终端')}
                hint={t('onboarding.steps.services.terminalHint', '在应用内直接使用终端')}
                checked={terminalEnabled}
                onChange={setTerminalEnabled}
              />
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
      <label className="relative inline-flex items-center cursor-pointer flex-shrink-0 ml-3">
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
