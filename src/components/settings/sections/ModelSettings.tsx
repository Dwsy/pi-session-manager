/**
 * 模型管理组件
 */

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'
import {
  Loader2,
  Play,
  RefreshCw,
  Check,
  X,
  Clock,
  Zap,
  Search,
  ChevronRight,
  ExternalLink,
} from 'lucide-react'

interface ModelInfo {
  provider: string
  model: string
  available: boolean
  tested: boolean
  last_test_time: string | null
  response_time: number | null
  status: string
}

interface ModelTestResult {
  provider: string
  model: string
  time: number
  output: string
  status: string
  error_msg: string | null
}

export default function ModelSettings() {
  const { t } = useTranslation()
  const [models, setModels] = useState<ModelInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testingModel, setTestingModel] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<ModelTestResult[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedModel, setSelectedModel] = useState<ModelInfo | null>(null)
  const [showDetails, setShowDetails] = useState(false)

  useEffect(() => {
    loadModels()
  }, [])

  const loadModels = async () => {
    setLoading(true)
    try {
      const data = await invoke<ModelInfo[]>('list_models', { search: searchQuery || null })
      setModels(data)
    } catch (error) {
      console.error('Failed to load models:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    await loadModels()
    setRefreshing(false)
  }

  const handleSearch = (query: string) => {
    setSearchQuery(query)
    loadModels()
  }

  const testSingleModel = async (provider: string, model: string) => {
    setTesting(true)
    setTestingModel(`${provider}/${model}`)

    try {
      const result = await invoke<ModelTestResult>('test_model', {
        provider,
        model,
        prompt: '用一句话介绍你自己，不超过50字。',
      })

      // 更新模型信息
      setModels((prev) =>
        prev.map((m) => {
          if (m.provider === provider && m.model === model) {
            return {
              ...m,
              tested: true,
              last_test_time: new Date().toISOString(),
              response_time: result.time,
              status: result.status,
            }
          }
          return m
        })
      )

      // 添加到测试结果
      setTestResults((prev) => [...prev, result])
    } catch (error) {
      console.error('Failed to test model:', error)
    } finally {
      setTesting(false)
      setTestingModel(null)
    }
  }

  const testAllModels = async () => {
    setTesting(true)
    const results: ModelTestResult[] = []

    for (const model of models) {
      try {
        const result = await invoke<ModelTestResult>('test_model', {
          provider: model.provider,
          model: model.model,
          prompt: '用一句话介绍你自己，不超过50字。',
        })

        // 更新模型信息
        setModels((prev) =>
          prev.map((m) => {
            if (m.provider === model.provider && m.model === model.model) {
              return {
                ...m,
                tested: true,
                last_test_time: new Date().toISOString(),
                response_time: result.time,
                status: result.status,
              }
            }
            return m
          })
        )

        results.push(result)
      } catch (error) {
        console.error(`Failed to test ${model.provider}/${model.model}:`, error)
      }
    }

    setTestResults(results)
    setTesting(false)
  }

  const handleSelectModel = (model: ModelInfo) => {
    setSelectedModel(model)
    setShowDetails(true)
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <Check className="h-4 w-4 text-green-400" />
      case 'error':
        return <X className="h-4 w-4 text-red-400" />
      case 'running':
      case 'testing':
        return <Loader2 className="h-4 w-4 text-yellow-400 animate-spin" />
      default:
        return <Clock className="h-4 w-4 text-[#6a6f85]" />
    }
  }

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return '-'
    return `${seconds.toFixed(2)}s`
  }

  const filteredModels = models.filter(
    (m) =>
      m.provider.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.model.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const testedModels = models.filter((m) => m.tested)
  const avgResponseTime =
    testedModels.length > 0
      ? testedModels.reduce((sum, m) => sum + (m.response_time || 0), 0) / testedModels.length
      : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-[#569cd6]" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 搜索和操作栏 */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6a6f85]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={t('settings.models.searchPlaceholder', '搜索模型...')}
            className="w-full pl-10 pr-4 py-2 bg-[#252636] border border-[#2c2d3b] rounded-lg text-sm text-white placeholder:text-[#6a6f85] focus:outline-none focus:border-[#569cd6]"
          />
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="p-2 bg-[#252636] border border-[#2c2d3b] rounded-lg text-[#6a6f85] hover:text-white hover:border-[#3a3b4f] disabled:opacity-50 transition-colors"
          title={t('common.refresh', '刷新')}
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
        <button
          onClick={testAllModels}
          disabled={testing || models.length === 0}
          className="flex items-center gap-2 px-3 py-2 bg-[#569cd6] hover:bg-[#4a8bc2] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
        >
          {testing ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Play className="h-4 w-4" />
          )}
          {t('settings.models.testAll', '测试全部')}
        </button>
      </div>

      {/* 统计信息 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-[#252636] border border-[#2c2d3b] rounded-lg p-3">
          <div className="text-2xl font-semibold text-white">{models.length}</div>
          <div className="text-xs text-[#6a6f85]">{t('settings.models.total', '总模型数')}</div>
        </div>
        <div className="bg-[#252636] border border-[#2c2d3b] rounded-lg p-3">
          <div className="text-2xl font-semibold text-green-400">{testedModels.length}</div>
          <div className="text-xs text-[#6a6f85]">{t('settings.models.tested', '已测试')}</div>
        </div>
        <div className="bg-[#252636] border border-[#2c2d3b] rounded-lg p-3">
          <div className="text-2xl font-semibold text-[#569cd6]">{avgResponseTime.toFixed(2)}s</div>
          <div className="text-xs text-[#6a6f85]">{t('settings.models.avgTime', '平均响应')}</div>
        </div>
      </div>

      {/* 模型列表 */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {filteredModels.length === 0 ? (
          <div className="text-center py-8 text-[#6a6f85]">
            {t('settings.models.noModels', '未找到模型')}
          </div>
        ) : (
          filteredModels.map((model, index) => (
            <div
              key={`${model.provider}/${model.model}`}
              className="flex items-center gap-3 p-3 rounded-lg border border-[#2c2d3b] hover:border-[#3a3b4f] transition-all cursor-pointer"
              onClick={() => handleSelectModel(model)}
            >
              <div className="flex-shrink-0">{getStatusIcon(model.status)}</div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-white">{model.provider}</span>
                  <span className="text-[#6a6f85]">/</span>
                  <span className="text-sm text-[#6a6f85]">{model.model}</span>
                </div>
                {model.tested && model.response_time !== null && (
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="h-3 w-3 text-[#6a6f85]" />
                    <span className="text-xs text-[#6a6f85]">
                      {t('settings.models.responseTime', '响应时间')}: {formatTime(model.response_time)}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                {model.tested && model.response_time !== null && (
                  <div className="text-xs text-[#6a6f85] bg-[#252636] px-2 py-1 rounded">
                    {model.response_time < 3 ? (
                      <span className="text-green-400 flex items-center gap-1">
                        <Zap className="h-3 w-3" />
                        快
                      </span>
                    ) : model.response_time < 5 ? (
                      <span className="text-yellow-400">中</span>
                    ) : (
                      <span className="text-red-400">慢</span>
                    )}
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    testSingleModel(model.provider, model.model)
                  }}
                  disabled={testing}
                  className="p-1.5 bg-[#252636] border border-[#2c2d3b] rounded text-[#6a6f85] hover:text-white hover:border-[#3a3b4f] disabled:opacity-50 transition-colors"
                  title={t('settings.models.testModel', '测试模型')}
                >
                  {testingModel === `${model.provider}/${model.model}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 测试结果 */}
      {testResults.length > 0 && (
        <div className="mt-4">
          <h4 className="text-sm font-medium text-white mb-3">
            {t('settings.models.testResults', '测试结果')}
          </h4>
          <div className="space-y-2 max-h-[250px] overflow-y-auto">
            {testResults.map((result, index) => (
              <div
                key={index}
                className="p-3 bg-[#252636] border border-[#2c2d3b] rounded-lg"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-white">
                    {result.provider}/{result.model}
                  </span>
                  <span className="text-xs text-[#6a6f85]">{result.time.toFixed(2)}s</span>
                </div>
                <div className="text-xs text-[#6a6f85] line-clamp-2">{result.output}</div>
                {result.error_msg && (
                  <div className="text-xs text-red-400 mt-1">{result.error_msg}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 模型详情弹窗 */}
      {showDetails && selectedModel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-[700px] max-h-[80vh] bg-[#1e1f2e] rounded-xl border border-[#2c2d3b] shadow-2xl overflow-hidden">
            {/* 头部 */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#2c2d3b]">
              <h3 className="text-base font-medium text-white">
                {selectedModel.provider}/{selectedModel.model}
              </h3>
              <button
                onClick={() => setShowDetails(false)}
                className="p-2 text-[#6a6f85] hover:text-white hover:bg-[#2c2d3b] rounded-lg transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* 内容 */}
            <div className="p-6 space-y-4 overflow-y-auto max-h-[65vh]">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-[#6a6f85] mb-1">{t('settings.models.provider', '提供商')}</div>
                  <div className="text-sm text-white">{selectedModel.provider}</div>
                </div>
                <div>
                  <div className="text-xs text-[#6a6f85] mb-1">{t('settings.models.model', '模型')}</div>
                  <div className="text-sm text-white">{selectedModel.model}</div>
                </div>
                <div>
                  <div className="text-xs text-[#6a6f85] mb-1">{t('settings.models.status', '状态')}</div>
                  <div className="flex items-center gap-2">
                    {getStatusIcon(selectedModel.status)}
                    <span className="text-sm text-white">{selectedModel.status}</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#6a6f85] mb-1">{t('settings.models.available', '可用')}</div>
                  <div className="text-sm text-white">
                    {selectedModel.available ? t('common.yes', '是') : t('common.no', '否')}
                  </div>
                </div>
                {selectedModel.tested && (
                  <>
                    <div>
                      <div className="text-xs text-[#6a6f85] mb-1">{t('settings.models.responseTime', '响应时间')}</div>
                      <div className="text-sm text-white">{formatTime(selectedModel.response_time)}</div>
                    </div>
                    {selectedModel.last_test_time && (
                      <div>
                        <div className="text-xs text-[#6a6f85] mb-1">
                          {t('settings.models.lastTest', '最后测试')}
                        </div>
                        <div className="text-sm text-white">
                          {new Date(selectedModel.last_test_time).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* 测试结果 */}
              {selectedModel.tested && testResults.find(
                (r) => r.provider === selectedModel.provider && r.model === selectedModel.model
              ) && (
                <div>
                  <div className="text-xs text-[#6a6f85] mb-2">{t('settings.models.testOutput', '测试输出')}</div>
                  <div className="p-3 bg-[#252636] border border-[#2c2d3b] rounded-lg">
                    <pre className="text-xs text-white whitespace-pre-wrap">
                      {testResults.find(
                        (r) => r.provider === selectedModel.provider && r.model === selectedModel.model
                      )?.output}
                    </pre>
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex gap-3 pt-4 border-t border-[#2c2d3b]">
                <button
                  onClick={() => {
                    testSingleModel(selectedModel.provider, selectedModel.model)
                  }}
                  disabled={testing}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#569cd6] hover:bg-[#4a8bc2] disabled:opacity-50 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {testingModel === `${selectedModel.provider}/${selectedModel.model}` ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  {t('settings.models.testModel', '测试模型')}
                </button>
                <button
                  onClick={() => {
                    // 在终端中打开 pi 命令
                    const command = `pi --provider ${selectedModel.provider} --model ${selectedModel.model}`
                    navigator.clipboard?.writeText(command)
                    alert(t('settings.models.commandCopied', '命令已复制到剪贴板'))
                  }}
                  className="flex items-center gap-2 px-4 py-2 bg-[#252636] border border-[#2c2d3b] hover:border-[#3a3b4f] text-white text-sm font-medium rounded-lg transition-colors"
                >
                  <ExternalLink className="h-4 w-4" />
                  {t('settings.models.openInTerminal', '打开终端')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 说明文字 */}
      <div className="text-xs text-[#6a6f85] bg-[#252636] p-3 rounded-lg">
        <p>{t('settings.models.help', '点击模型查看详情，点击播放按钮测试模型响应速度。')}</p>
      </div>
    </div>
  )
}