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
  AlertTriangle,
} from 'lucide-react'
import SettingsCard from '../SettingsCard'
import { invoke } from '../../../transport'

type TestStatus = 'success' | 'error' | 'warning' | 'pending'

interface TestResult {
  endpoint: string
  status: TestStatus
  latency: number
  message: string
  detail?: string
}

interface ValidationResult {
  valid: boolean
  message: string
}

interface EndpointStatus {
  name: string
  endpoint: string
  method: 'GET' | 'POST'
  body?: Record<string, unknown>
  validate: (payload: unknown) => ValidationResult
}

interface ServerSettings {
  http_port: number
  bind_addr: string
}

const DEFAULT_API_TEST_BASE_URL = 'http://127.0.0.1:52131'

function toApiBaseUrl(settings: ServerSettings): string {
  const host = settings.bind_addr === '0.0.0.0' ? '127.0.0.1' : settings.bind_addr
  return `http://${host}:${settings.http_port}`
}

function getHttpOriginBaseUrl(): string | null {
  if (typeof window === 'undefined') return null
  const protocol = window.location.protocol
  if (protocol !== 'http:' && protocol !== 'https:') return null
  return `${protocol}//${window.location.host}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getObjectField(obj: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const value = obj[key]
  return isRecord(value) ? value : null
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

function ensureSuccessEnvelope(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) return null
  return payload.success === true ? payload : null
}

function validateSessions(payload: unknown): ValidationResult {
  const envelope = ensureSuccessEnvelope(payload)
  if (!envelope) return { valid: false, message: '响应缺少 success=true' }
  const data = envelope.data
  if (!Array.isArray(data)) return { valid: false, message: 'sessions.data 不是数组' }
  return { valid: true, message: `返回 ${data.length} 条会话` }
}

function validateFullText(payload: unknown): ValidationResult {
  const envelope = ensureSuccessEnvelope(payload)
  if (!envelope) return { valid: false, message: '响应缺少 success=true' }
  const data = isRecord(envelope.data) ? envelope.data : null
  if (!data) return { valid: false, message: 'search.data 不是对象' }
  const hits = getArrayField(data, 'hits')
  const totalHits = getNumberField(data, 'total_hits')
  if (!hits) return { valid: false, message: 'search.data.hits 不是数组' }
  if (totalHits === null) return { valid: false, message: 'search.data.total_hits 不是数字' }
  return { valid: true, message: `命中 ${hits.length} 条，total_hits=${totalHits}` }
}

function validateMemoryRecall(payload: unknown): ValidationResult {
  const envelope = ensureSuccessEnvelope(payload)
  if (!envelope) return { valid: false, message: '响应缺少 success=true' }
  const data = isRecord(envelope.data) ? envelope.data : null
  if (!data) return { valid: false, message: 'memory_recall.data 不是对象' }
  const evidence = getArrayField(data, 'evidence')
  const intent = getStringField(data, 'intent')
  const routePlan = getArrayField(data, 'route_plan')
  const nextActions = getArrayField(data, 'next_actions')
  if (!evidence) return { valid: false, message: 'memory_recall.data.evidence 不是数组' }
  if (!intent) return { valid: false, message: 'memory_recall.data.intent 不是字符串' }
  if (!routePlan && !nextActions) {
    return { valid: false, message: 'memory_recall 缺少 route_plan/next_actions' }
  }
  return { valid: true, message: `intent=${intent}, evidence=${evidence.length}` }
}

function validateMemoryUnified(payload: unknown): ValidationResult {
  const envelope = ensureSuccessEnvelope(payload)
  if (!envelope) return { valid: false, message: '响应缺少 success=true' }
  const data = isRecord(envelope.data) ? envelope.data : null
  if (!data) return { valid: false, message: 'memory_unified.data 不是对象' }
  const evidence = getArrayField(data, 'evidence')
  const experience = getArrayField(data, 'experience')
  if (!evidence) return { valid: false, message: 'memory_unified.data.evidence 不是数组' }
  if (!experience) return { valid: false, message: 'memory_unified.data.experience 不是数组' }
  return { valid: true, message: `evidence=${evidence.length}, experience=${experience.length}` }
}

function validateAnalytics(payload: unknown): ValidationResult {
  const envelope = ensureSuccessEnvelope(payload)
  if (!envelope) return { valid: false, message: '响应缺少 success=true' }
  const data = isRecord(envelope.data) ? envelope.data : null
  if (!data) return { valid: false, message: 'analytics.data 不是对象' }
  const sessions = getNumberField(data, 'sessions')
  if (sessions === null) return { valid: false, message: 'analytics.data.sessions 不是数字' }
  return { valid: true, message: `总会话数=${sessions}` }
}

function validateObservability(payload: unknown): ValidationResult {
  const envelope = ensureSuccessEnvelope(payload)
  if (!envelope) return { valid: false, message: '响应缺少 success=true' }
  const data = isRecord(envelope.data) ? envelope.data : null
  if (!data) return { valid: false, message: 'observability.data 不是对象' }
  const endpoints = getArrayField(data, 'endpoints')
  const capabilities = getObjectField(data, 'capabilities')
  if (!endpoints) return { valid: false, message: 'observability.data.endpoints 不是数组' }
  if (!capabilities) return { valid: false, message: 'observability.data.capabilities 不是对象' }
  return { valid: true, message: `对外接口清单 ${endpoints.length} 条` }
}

const ENDPOINTS: EndpointStatus[] = [
  { name: 'Sessions List', endpoint: '/v1/sessions?limit=2', method: 'GET', validate: validateSessions },
  {
    name: 'FullText Search',
    endpoint: '/v1/search/fulltext',
    method: 'POST',
    body: { query: 'test', role_filter: 'all', page: 0, page_size: 5, match_mode: 'any' },
    validate: validateFullText,
  },
  {
    name: 'Memory Recall',
    endpoint: '/v1/memory/recall',
    method: 'POST',
    body: { query: 'test', top_k: 5 },
    validate: validateMemoryRecall,
  },
  {
    name: 'Memory Unified',
    endpoint: '/v1/memory/unified',
    method: 'POST',
    body: { query: 'test', top_k: 5, experience_limit: 5 },
    validate: validateMemoryUnified,
  },
  { name: 'Analytics Overview', endpoint: '/v1/analytics/overview', method: 'GET', validate: validateAnalytics },
  {
    name: 'Observability Summary',
    endpoint: '/v1/observability/summary',
    method: 'GET',
    validate: validateObservability,
  },
]

export default function APITestSettings() {
  const { t } = useTranslation()
  const [baseUrl, setBaseUrl] = useState(getHttpOriginBaseUrl() || DEFAULT_API_TEST_BASE_URL)
  const [baseUrlBootstrapped, setBaseUrlBootstrapped] = useState(false)
  const [results, setResults] = useState<TestResult[]>([])
  const [isTesting, setIsTesting] = useState(false)
  const [overallStatus, setOverallStatus] = useState<'idle' | 'running' | 'completed'>('idle')

  const testEndpoint = async (ep: EndpointStatus): Promise<TestResult> => {
    const startTime = performance.now()
    try {
      const url = `${baseUrl}${ep.endpoint}`
      const options: RequestInit = {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
      }

      if (ep.method === 'POST' && ep.body) {
        options.body = JSON.stringify(ep.body)
      }

      const response = await fetch(url, options)
      const latency = Math.round(performance.now() - startTime)
      const contentType = response.headers.get('content-type') || ''
      const bodyText = await response.text()

      if (!response.ok) {
        return {
          endpoint: ep.name,
          status: 'error',
          latency,
          message: `${response.status} ${response.statusText}`,
          detail: bodyText.slice(0, 180),
        }
      }

      if (!contentType.includes('application/json')) {
        return {
          endpoint: ep.name,
          status: 'error',
          latency,
          message: `响应不是 JSON: ${contentType || 'unknown'}`,
          detail: bodyText.slice(0, 180),
        }
      }

      let payload: unknown
      try {
        payload = JSON.parse(bodyText)
      } catch {
        return {
          endpoint: ep.name,
          status: 'error',
          latency,
          message: 'JSON 解析失败',
          detail: bodyText.slice(0, 180),
        }
      }

      const validation = ep.validate(payload)
      if (!validation.valid) {
        return {
          endpoint: ep.name,
          status: 'error',
          latency,
          message: validation.message,
          detail: bodyText.slice(0, 180),
        }
      }

      return {
        endpoint: ep.name,
        status: 'success',
        latency,
        message: validation.message,
      }
    } catch (error) {
      const latency = Math.round(performance.now() - startTime)
      return {
        endpoint: ep.name,
        status: 'error',
        latency,
        message: error instanceof Error ? error.message : 'Connection failed',
      }
    }
  }

  const runAllTests = async () => {
    setIsTesting(true)
    setOverallStatus('running')
    setResults([])

    const newResults: TestResult[] = []
    for (const ep of ENDPOINTS) {
      const result = await testEndpoint(ep)
      newResults.push(result)
      setResults([...newResults])
    }

    setOverallStatus('completed')
    setIsTesting(false)
  }

  const runSingleTest = async (ep: EndpointStatus) => {
    setIsTesting(true)
    const result = await testEndpoint(ep)
    setResults((prev) => {
      const filtered = prev.filter((r) => r.endpoint !== ep.name)
      return [...filtered, result]
    })
    setIsTesting(false)
  }

  useEffect(() => {
    const originBase = getHttpOriginBaseUrl()
    if (originBase) {
      setBaseUrl(originBase)
      setBaseUrlBootstrapped(true)
      return
    }

    let active = true
    invoke<ServerSettings>('load_server_settings')
      .then((settings) => {
        if (!active) return
        setBaseUrl(toApiBaseUrl(settings))
      })
      .catch(() => {})
      .finally(() => {
        if (!active) return
        setBaseUrlBootstrapped(true)
      })

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!baseUrlBootstrapped) return
    runAllTests()
  }, [baseUrlBootstrapped])

  const successCount = results.filter((r) => r.status === 'success').length
  const warningCount = results.filter((r) => r.status === 'warning').length
  const errorCount = results.filter((r) => r.status === 'error').length

  return (
    <div className="space-y-6">
      <SettingsCard
        icon={<Activity className="h-5 w-5" />}
        title={t('settings.apiTest.title', 'API 连接测试')}
        description={t('settings.apiTest.description', '对外会话检索 API 的真实连通性与响应结构测试')}
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground/80">
              {t('settings.apiTest.baseUrl', '服务地址')}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="flex-1 px-3 py-2 bg-background border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-info/50"
                placeholder={DEFAULT_API_TEST_BASE_URL}
              />
              <button
                onClick={runAllTests}
                disabled={isTesting}
                className="px-4 py-2 bg-info text-info-foreground rounded-md text-sm font-medium hover:bg-info/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isTesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                {t('settings.apiTest.testAll', '测试全部')}
              </button>
            </div>
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
                      ? t('settings.apiTest.allPassed', '所有测试通过')
                      : t('settings.apiTest.someFailed', '{{count}} 个测试失败', { count: errorCount })}
                  </p>
                  <p className="text-sm opacity-80">
                    {t('settings.apiTest.summary', '{{success}}/{{total}} 成功', {
                      success: successCount,
                      total: results.length,
                    })}
                    {warningCount > 0 ? `, warning=${warningCount}` : ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3">
            {ENDPOINTS.map((ep) => {
              const result = results.find((r) => r.endpoint === ep.name)
              const status = result?.status || 'pending'
              const statusClass =
                status === 'success'
                  ? 'bg-success/5 border-success/20'
                  : status === 'warning'
                    ? 'bg-warning/5 border-warning/20'
                    : status === 'error'
                      ? 'bg-destructive/5 border-destructive/20'
                      : 'bg-muted/50 border-border'

              return (
                <div key={ep.name} className={`p-4 rounded-lg border motion-surface motion-color ${statusClass}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {status === 'success' ? (
                        <CheckCircle className="h-5 w-5 text-success" />
                      ) : status === 'warning' ? (
                        <AlertTriangle className="h-5 w-5 text-warning" />
                      ) : status === 'error' ? (
                        <XCircle className="h-5 w-5 text-destructive" />
                      ) : (
                        <div className="h-5 w-5 rounded-full border-2 border-muted-foreground/30" />
                      )}

                      <div>
                        <p className="font-medium text-sm">{ep.name}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {ep.method} {ep.endpoint}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
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
                        onClick={() => runSingleTest(ep)}
                        disabled={isTesting}
                        className="px-3 py-1.5 text-xs bg-muted hover:bg-muted/80 rounded-md disabled:opacity-50"
                      >
                        {t('settings.apiTest.retest', '重试')}
                      </button>
                    </div>
                  </div>

                  {result && (
                    <p
                      className={`mt-2 text-xs pl-8 ${
                        result.status === 'success'
                          ? 'text-success'
                          : result.status === 'warning'
                            ? 'text-warning'
                            : 'text-destructive'
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
              {t('settings.apiTest.troubleshooting', '故障排除')}
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 text-xs">
              <li>{t('settings.apiTest.help1', '确保 pi-session-manager CLI 正在运行')}</li>
              <li>{t('settings.apiTest.help2', '检查服务地址和端口是否正确')}</li>
              <li>{t('settings.apiTest.help3', '确认接口返回 JSON，而不是前端 HTML 回退页面')}</li>
              <li>{t('settings.apiTest.help4', '仅暴露会话检索类 API，embedding 相关接口默认关闭')}</li>
            </ul>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
