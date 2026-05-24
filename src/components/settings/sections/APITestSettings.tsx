import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Activity,
  CheckCircle,
  Clock,
  Loader2,
  RefreshCw,
  Server,
  XCircle,
} from 'lucide-react'

import SettingsCard from '@/components/settings/SettingsCard'
import { invoke } from '@/transport'

type TestStatus = 'success' | 'error' | 'pending'

interface TestResult {
  probe: string
  command: string
  status: TestStatus
  latency: number
  message: string
  detail?: string
}

interface ValidationResult {
  valid: boolean
  message: string
}

interface InvokeProbe {
  name: string
  command: string
  payload?: Record<string, unknown>
  validate: (payload: unknown) => ValidationResult
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getArrayField(obj: Record<string, unknown>, key: string): unknown[] | null {
  const value = obj[key]
  return Array.isArray(value) ? value : null
}

function getNumberField(obj: Record<string, unknown>, key: string): number | null {
  const value = obj[key]
  return typeof value === 'number' ? value : null
}

function getStringField(obj: Record<string, unknown>, key: string): string | null {
  const value = obj[key]
  return typeof value === 'string' ? value : null
}

function validateServerSettings(payload: unknown): ValidationResult {
  if (!isRecord(payload)) return { valid: false, message: 'server settings response is not an object' }
  const port = getNumberField(payload, 'http_port')
  const bindAddr = getStringField(payload, 'bind_addr')
  if (port === null) return { valid: false, message: 'http_port is not a number' }
  if (!bindAddr) return { valid: false, message: 'bind_addr is not a string' }
  return { valid: true, message: `bind=${bindAddr}, port=${port}` }
}

function validatePaginatedSessions(payload: unknown): ValidationResult {
  if (!isRecord(payload)) return { valid: false, message: 'paginated sessions response is not an object' }
  const sessions = getArrayField(payload, 'sessions')
  const total = getNumberField(payload, 'total')
  if (!sessions) return { valid: false, message: 'sessions is not an array' }
  if (total === null) return { valid: false, message: 'total is not a number' }
  return { valid: true, message: `Returned ${sessions.length} sessions, total=${total}` }
}

function validateFullText(payload: unknown): ValidationResult {
  if (!isRecord(payload)) return { valid: false, message: 'full text response is not an object' }
  const hits = getArrayField(payload, 'hits')
  const totalHits = getNumberField(payload, 'total_hits')
  if (!hits) return { valid: false, message: 'hits is not an array' }
  if (totalHits === null) return { valid: false, message: 'total_hits is not a number' }
  return { valid: true, message: `Hit ${hits.length} results, total_hits=${totalHits}` }
}

function validateStringArray(payload: unknown): ValidationResult {
  if (!Array.isArray(payload)) return { valid: false, message: 'response is not an array' }
  if (!payload.every((item) => typeof item === 'string')) {
    return { valid: false, message: 'array contains non-string items' }
  }
  return { valid: true, message: `Returned ${payload.length} items` }
}

function validateProviders(payload: unknown): ValidationResult {
  if (!Array.isArray(payload)) return { valid: false, message: 'providers response is not an array' }
  const invalid = payload.some((item) => !isRecord(item) || !getStringField(item, 'slug'))
  if (invalid) return { valid: false, message: 'provider item is missing slug' }
  return { valid: true, message: `Returned ${payload.length} providers` }
}

function validatePluginRecords(payload: unknown): ValidationResult {
  if (!Array.isArray(payload)) return { valid: false, message: 'plugin records response is not an array' }
  return { valid: true, message: `Returned ${payload.length} records` }
}

const PROBES: InvokeProbe[] = [
  {
    name: 'Transport Settings',
    command: 'load_server_settings',
    validate: validateServerSettings,
  },
  {
    name: 'Sessions Page',
    command: 'scan_sessions_paginated',
    payload: { offset: 0, limit: 2, sortBy: 'updated_desc' },
    validate: validatePaginatedSessions,
  },
  {
    name: 'FullText Search',
    command: 'full_text_search',
    payload: {
      query: 'test',
      roleFilter: 'all',
      sourceFilter: 'all',
      globPattern: null,
      projectPath: null,
      page: 0,
      pageSize: 5,
      matchMode: 'any',
      sortOrder: 'newest',
    },
    validate: validateFullText,
  },
  {
    name: 'Session Sources',
    command: 'get_all_session_dirs',
    validate: validateStringArray,
  },
  {
    name: 'Session Providers',
    command: 'list_supported_session_providers',
    validate: validateProviders,
  },
  {
    name: 'Plugin Records',
    command: 'search_plugin_records',
    payload: { query: 'test', limit: 5 },
    validate: validatePluginRecords,
  },
]

export default function APITestSettings() {
  const { t } = useTranslation()
  const [results, setResults] = useState<TestResult[]>([])
  const [isTesting, setIsTesting] = useState(false)
  const [overallStatus, setOverallStatus] = useState<'idle' | 'running' | 'completed'>('idle')

  const testProbe = async (probe: InvokeProbe): Promise<TestResult> => {
    const startTime = performance.now()
    try {
      const payload = await invoke<unknown>(probe.command, probe.payload)
      const latency = Math.round(performance.now() - startTime)
      const validation = probe.validate(payload)

      if (!validation.valid) {
        return {
          probe: probe.name,
          command: probe.command,
          status: 'error',
          latency,
          message: validation.message,
          detail: JSON.stringify(payload).slice(0, 180),
        }
      }

      return {
        probe: probe.name,
        command: probe.command,
        status: 'success',
        latency,
        message: validation.message,
      }
    } catch (error) {
      const latency = Math.round(performance.now() - startTime)
      return {
        probe: probe.name,
        command: probe.command,
        status: 'error',
        latency,
        message: error instanceof Error ? error.message : 'Invoke failed',
      }
    }
  }

  const runAllTests = async () => {
    setIsTesting(true)
    setOverallStatus('running')
    setResults([])

    const newResults: TestResult[] = []
    for (const probe of PROBES) {
      const result = await testProbe(probe)
      newResults.push(result)
      setResults([...newResults])
    }

    setOverallStatus('completed')
    setIsTesting(false)
  }

  const runSingleTest = async (probe: InvokeProbe) => {
    setIsTesting(true)
    const result = await testProbe(probe)
    setResults((prev) => {
      const filtered = prev.filter((item) => item.probe !== probe.name)
      return [...filtered, result]
    })
    setIsTesting(false)
  }

  useEffect(() => {
    runAllTests()
  }, [])

  const successCount = results.filter((result) => result.status === 'success').length
  const errorCount = results.filter((result) => result.status === 'error').length

  return (
    <div className="space-y-6">
      <SettingsCard
        icon={<Activity className="h-5 w-5" />}
        title={t('settings.apiTest.title', 'Invoke Connection Test')}
        description={t('settings.apiTest.description', 'Test the current runtime invoke transport and command response structure')}
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div className="text-xs text-muted-foreground">
              {t('settings.apiTest.transportHint', 'Uses the same IPC / HTTP / WebSocket invoke path as the application runtime.')}
            </div>
            <button
              onClick={runAllTests}
              disabled={isTesting}
              className="px-4 py-2 bg-info text-info-foreground rounded-md text-sm font-medium hover:bg-info/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t('settings.apiTest.testAll', 'Test All')}
            </button>
          </div>

          {overallStatus === 'completed' && (
            <div
              className={`p-4 rounded-lg border ${
                errorCount === 0
                  ? 'bg-success/10 border-success/30 text-success'
                  : 'bg-warning/10 border-warning/30 text-warning'
              }`}
            >
              <div className="flex items-center gap-3">
                {errorCount === 0 ? <CheckCircle className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                <div>
                  <p className="font-medium">
                    {errorCount === 0
                      ? t('settings.apiTest.allPassed', 'All tests passed')
                      : t('settings.apiTest.someFailed', '{{count}} tests failed', { count: errorCount })}
                  </p>
                  <p className="text-sm opacity-80">
                    {t('settings.apiTest.summary', '{{success}}/{{total}} passed', {
                      success: successCount,
                      total: results.length,
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3">
            {PROBES.map((probe) => {
              const result = results.find((item) => item.probe === probe.name)
              const status = result?.status || 'pending'
              const statusClass =
                status === 'success'
                  ? 'bg-success/5 border-success/20'
                  : status === 'error'
                    ? 'bg-destructive/5 border-destructive/20'
                    : 'bg-muted/50 border-border'

              return (
                <div key={probe.name} className={`p-4 rounded-lg border motion-surface motion-color ${statusClass}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {status === 'success' ? (
                        <CheckCircle className="h-5 w-5 text-success shrink-0" />
                      ) : status === 'error' ? (
                        <XCircle className="h-5 w-5 text-destructive shrink-0" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                      )}

                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{probe.name}</p>
                        <p className="text-xs text-muted-foreground font-mono truncate">invoke({probe.command})</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {result && (
                        <span
                          className={`text-xs font-mono flex items-center gap-1 ${
                            result.latency < 120 ? 'text-success' : result.latency < 600 ? 'text-warning' : 'text-destructive'
                          }`}
                        >
                          <Clock className="h-3 w-3" />
                          {result.latency}ms
                        </span>
                      )}

                      <button
                        onClick={() => runSingleTest(probe)}
                        disabled={isTesting}
                        className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-md disabled:opacity-50"
                      >
                        {t('settings.apiTest.retest', 'Retry')}
                      </button>
                    </div>
                  </div>

                  {result && (
                    <p
                      className={`mt-2 text-xs pl-8 ${
                        result.status === 'success' ? 'text-success' : 'text-destructive'
                      }`}
                    >
                      {result.message}
                    </p>
                  )}

                  {result?.detail && (
                    <pre className="mt-2 text-[11px] leading-4 pl-8 text-muted-foreground whitespace-pre-wrap break-all">
                      {result.detail}
                    </pre>
                  )}
                </div>
              )
            })}
          </div>

          <div className="p-4 bg-muted/50 rounded-lg border border-border text-sm space-y-2">
            <p className="font-medium flex items-center gap-2">
              <Server className="h-4 w-4" />
              {t('settings.apiTest.troubleshooting', 'Troubleshooting')}
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 text-xs">
              <li>{t('settings.apiTest.help1', 'This page no longer calls removed HTTP routes directly.')}</li>
              <li>{t('settings.apiTest.help2', 'Desktop uses Tauri IPC; web and mobile use the same command contract through HTTP or WebSocket invoke.')}</li>
              <li>{t('settings.apiTest.help3', 'If a command fails, check the transport banner and backend command logs.')}</li>
              <li>{t('settings.apiTest.help4', 'Probe failures usually mean a command contract changed or runtime transport is unavailable.')}</li>
            </ul>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
