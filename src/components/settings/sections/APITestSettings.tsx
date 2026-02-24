import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { 
  Activity, 
  CheckCircle, 
  XCircle, 
  Loader2, 
  Server,
  Cpu,
  Database,
  RefreshCw,
  Zap,
  Clock
} from 'lucide-react'
import SettingsCard from '../SettingsCard'

interface TestResult {
  endpoint: string
  status: 'success' | 'error' | 'pending'
  latency?: number
  message?: string
  data?: any
}

interface EndpointStatus {
  name: string
  endpoint: string
  method: 'GET' | 'POST'
  body?: object
}

const ENDPOINTS: EndpointStatus[] = [
  { name: 'Health Check', endpoint: '/v1/embedding/status', method: 'GET' },
  { name: 'Sessions List', endpoint: '/v1/sessions?limit=1', method: 'GET' },
  { name: 'Memory Recall', endpoint: '/v1/memory/recall', method: 'POST', body: { query: 'test', top_k: 1 } },
  { name: 'Analytics Overview', endpoint: '/v1/analytics/overview', method: 'GET' },
  { name: 'Embedding (Single)', endpoint: '/v1/embedding', method: 'POST', body: { text: 'hello world', normalize: true } },
]

export default function APITestSettings() {
  const { t } = useTranslation()
  const [baseUrl, setBaseUrl] = useState('http://127.0.0.1:52131')
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
      
      if (response.ok) {
        const data = await response.json().catch(() => null)
        return {
          endpoint: ep.name,
          status: 'success',
          latency,
          message: `${response.status} ${response.statusText}`,
          data: ep.endpoint.includes('embedding/status') ? data : undefined
        }
      } else {
        return {
          endpoint: ep.name,
          status: 'error',
          latency,
          message: `${response.status} ${response.statusText}`
        }
      }
    } catch (error) {
      const latency = Math.round(performance.now() - startTime)
      return {
        endpoint: ep.name,
        status: 'error',
        latency,
        message: error instanceof Error ? error.message : 'Connection failed'
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
    setResults(prev => {
      const filtered = prev.filter(r => r.endpoint !== ep.name)
      return [...filtered, result]
    })
    setIsTesting(false)
  }

  useEffect(() => {
    // Auto-test on mount
    runAllTests()
  }, [])

  const successCount = results.filter(r => r.status === 'success').length
  const errorCount = results.filter(r => r.status === 'error').length

  return (
    <div className="space-y-6">
      <SettingsCard
        icon={<Activity className="h-5 w-5" />}
        title={t('settings.apiTest.title', 'API 连接测试')}
        description={t('settings.apiTest.description', '测试与 pi-session-manager 后端服务的连接状态')}
      >
        <div className="space-y-4">
          {/* Base URL Input */}
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
                placeholder="http://127.0.0.1:52131"
              />
              <button
                onClick={runAllTests}
                disabled={isTesting}
                className="px-4 py-2 bg-info text-info-foreground rounded-md text-sm font-medium hover:bg-info/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isTesting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                {t('settings.apiTest.testAll', '测试全部')}
              </button>
            </div>
          </div>

          {/* Overall Status */}
          {overallStatus === 'completed' && (
            <div className={`p-4 rounded-lg border ${
              errorCount === 0 
                ? 'bg-success/10 border-success/30 text-success' 
                : 'bg-warning/10 border-warning/30 text-warning'
            }`}>
              <div className="flex items-center gap-3">
                {errorCount === 0 ? (
                  <CheckCircle className="h-5 w-5" />
                ) : (
                  <XCircle className="h-5 w-5" />
                )}
                <div>
                  <p className="font-medium">
                    {errorCount === 0 
                      ? t('settings.apiTest.allPassed', '所有测试通过')
                      : t('settings.apiTest.someFailed', '{count} 个测试失败', { count: errorCount })
                    }
                  </p>
                  <p className="text-sm opacity-80">
                    {t('settings.apiTest.summary', '{success}/{total} 成功', { 
                      success: successCount, 
                      total: results.length 
                    })}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Results Grid */}
          <div className="grid gap-3">
            {ENDPOINTS.map((ep) => {
              const result = results.find(r => r.endpoint === ep.name)
              
              return (
                <div
                  key={ep.name}
                  className={`p-4 rounded-lg border transition-all ${
                    result?.status === 'success'
                      ? 'bg-success/5 border-success/20'
                      : result?.status === 'error'
                      ? 'bg-destructive/5 border-destructive/20'
                      : 'bg-muted/50 border-border'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {result?.status === 'success' ? (
                        <CheckCircle className="h-5 w-5 text-success" />
                      ) : result?.status === 'error' ? (
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
                      {result?.latency && (
                        <span className={`text-xs font-mono flex items-center gap-1 ${
                          result.latency < 100 ? 'text-success' : 
                          result.latency < 500 ? 'text-warning' : 'text-destructive'
                        }`}>
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

                  {/* Error Message */}
                  {result?.status === 'error' && result.message && (
                    <p className="mt-2 text-xs text-destructive pl-8">
                      {result.message}
                    </p>
                  )}

                  {/* Embedding Status Details */}
                  {result?.data && ep.endpoint.includes('embedding/status') && (
                    <div className="mt-3 pl-8 p-3 bg-muted/50 rounded-md text-xs space-y-1">
                      <div className="flex items-center gap-2">
                        <Cpu className="h-3 w-3" />
                        <span>Model: {result.data.model}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Database className="h-3 w-3" />
                        <span>Dimensions: {result.data.dimensions}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Zap className="h-3 w-3" />
                        <span>Ready: {result.data.ready ? 'Yes' : 'No'}</span>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Help Text */}
          <div className="p-4 bg-muted/50 rounded-lg border border-border text-sm space-y-2">
            <p className="font-medium flex items-center gap-2">
              <Server className="h-4 w-4" />
              {t('settings.apiTest.troubleshooting', '故障排除')}
            </p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 text-xs">
              <li>{t('settings.apiTest.help1', '确保 pi-session-manager CLI 正在运行')}</li>
              <li>{t('settings.apiTest.help2', '检查服务地址和端口是否正确')}</li>
              <li>{t('settings.apiTest.help3', '首次测试 embedding 可能需要 400-500ms 加载模型')}</li>
              <li>{t('settings.apiTest.help4', 'Embedding 服务会在空闲 5 分钟后自动释放内存')}</li>
            </ul>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
