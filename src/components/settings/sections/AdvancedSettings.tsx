/**
 * 高级设置组件
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Plus, X, Copy, Trash2, Key, Shield } from 'lucide-react'
import { invoke } from '../../../transport'
import type { AdvancedSettingsProps } from '../types'

interface ClearCacheResult {
  sessions_deleted: number
  details_deleted: number
}

interface ServerSettings {
  ws_enabled: boolean
  ws_port: number
  http_enabled: boolean
  http_port: number
  auth_enabled: boolean
  bind_addr: string
}

interface TokenInfo {
  name: string
  key_preview: string
  created_at: string
  last_used: string | null
}

export default function AdvancedSettings({ settings, onUpdate }: AdvancedSettingsProps) {
  const { t } = useTranslation()
  const [serverSettings, setServerSettings] = useState<ServerSettings | null>(null)
  const [serverDirty, setServerDirty] = useState(false)
  const [apiKeys, setApiKeys] = useState<TokenInfo[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    invoke<ServerSettings>('load_server_settings').then(setServerSettings).catch(console.error)
  }, [])

  const loadApiKeys = useCallback(async () => {
    try {
      const keys = await invoke<TokenInfo[]>('list_api_keys')
      setApiKeys(keys)
    } catch (e) {
      console.error('Failed to load API keys:', e)
    }
  }, [])

  useEffect(() => { loadApiKeys() }, [loadApiKeys])

  const updateServer = <K extends keyof ServerSettings>(key: K, value: ServerSettings[K]) => {
    setServerSettings((prev) => prev ? { ...prev, [key]: value } : prev)
    setServerDirty(true)
  }

  const saveServerSettings = async () => {
    if (!serverSettings) return
    try {
      await invoke('save_server_settings', { settings: serverSettings })
      setServerDirty(false)
    } catch (error) {
      console.error('Failed to save server settings:', error)
    }
  }

  const handleCreateKey = async () => {
    const name = newKeyName.trim() || 'unnamed'
    setCreating(true)
    try {
      const key = await invoke<string>('create_api_key', { name })
      setNewKeyValue(key)
      setNewKeyName('')
      await loadApiKeys()
    } catch (e) {
      console.error('Failed to create API key:', e)
    } finally {
      setCreating(false)
    }
  }

  const handleRevokeKey = async (keyPreview: string) => {
    if (!confirm(t('settings.advanced.revokeKeyConfirm', '确定要吊销此密钥？此操作不可撤销。'))) return
    try {
      await invoke('revoke_api_key', { keyPreview })
      await loadApiKeys()
    } catch (e) {
      console.error('Failed to revoke key:', e)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).catch(console.error)
  }

  const handleClearCache = async () => {
    if (!confirm(t('settings.advanced.clearCacheConfirm', '确定要清除所有缓存数据吗？这将删除所有会话缓存，但保留收藏夹。'))) {
      return
    }
    try {
      const result = await invoke<ClearCacheResult>('clear_cache')
      alert(t('settings.advanced.cacheClearedDetail', '缓存已清除：{{sessions}} 个会话，{{details}} 个详情缓存', {
        sessions: result.sessions_deleted,
        details: result.details_deleted
      }))
    } catch (error) {
      console.error('Failed to clear cache:', error)
      alert(t('settings.advanced.cacheClearFailed', '清除缓存失败'))
    }
  }

  const isRemoteBind = serverSettings?.bind_addr === '0.0.0.0'

  return (
    <div className="space-y-6">
      {/* Server Settings */}
      {serverSettings && (
        <div className="space-y-4">
          <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            {t('settings.advanced.serverSection', '服务设置')}
          </h4>

          {/* Bind Address */}
          <div className="space-y-1">
            <label className="text-sm font-medium text-foreground">
              {t('settings.advanced.bindAddr', '绑定地址')}
            </label>
            <p className="text-xs text-muted-foreground">
              {t('settings.advanced.bindAddrHelp', '127.0.0.1 仅本地访问，0.0.0.0 允许远程连接')}
            </p>
            <div className="flex items-center gap-2">
              <select
                value={serverSettings.bind_addr}
                onChange={(e) => updateServer('bind_addr', e.target.value)}
                className="px-3 py-1.5 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-info"
              >
                <option value="127.0.0.1">{t('settings.advanced.bindAddrLocal')}</option>
                <option value="0.0.0.0">{t('settings.advanced.bindAddrAll')}</option>
              </select>
              {isRemoteBind && (
                <span className="flex items-center gap-1 text-xs text-amber-400">
                  <Shield className="h-3 w-3" />
                  {t('settings.advanced.remoteWarning', '远程访问已开启，请确保认证已启用')}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-foreground">WebSocket</label>
              <p className="text-xs text-muted-foreground">ws://{serverSettings.bind_addr}:{serverSettings.ws_port}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={serverSettings.ws_enabled}
                onChange={(e) => updateServer('ws_enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-info"></div>
            </label>
          </div>

          {serverSettings.ws_enabled && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('settings.advanced.wsPort', 'WebSocket 端口')}</label>
              <input
                type="number"
                min="1024"
                max="65535"
                value={serverSettings.ws_port}
                onChange={(e) => updateServer('ws_port', parseInt(e.target.value) || 52130)}
                className="w-32 px-3 py-1.5 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-info"
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-foreground">HTTP API</label>
              <p className="text-xs text-muted-foreground">http://{serverSettings.bind_addr}:{serverSettings.http_port}/api</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={serverSettings.http_enabled}
                onChange={(e) => updateServer('http_enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-info"></div>
            </label>
          </div>

          {serverSettings.http_enabled && (
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">{t('settings.advanced.httpPort', 'HTTP 端口')}</label>
              <input
                type="number"
                min="1024"
                max="65535"
                value={serverSettings.http_port}
                onChange={(e) => updateServer('http_port', parseInt(e.target.value) || 52131)}
                className="w-32 px-3 py-1.5 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-info"
              />
            </div>
          )}

          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-foreground">{t('settings.advanced.auth', '认证')}</label>
              <p className="text-xs text-muted-foreground">{t('settings.advanced.authHelp', '非本地连接需要 Token 认证')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={serverSettings.auth_enabled}
                onChange={(e) => updateServer('auth_enabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-info"></div>
            </label>
          </div>

          {serverDirty && (
            <div className="flex items-center gap-2">
              <button
                onClick={saveServerSettings}
                className="px-4 py-1.5 bg-info hover:bg-info/80 text-white text-sm rounded-lg transition-colors"
              >
                {t('settings.advanced.saveServer', '保存服务设置')}
              </button>
              <span className="flex items-center gap-1 text-xs text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {t('settings.advanced.restartRequired', '需重启应用生效')}
              </span>
            </div>
          )}

          <div className="border-b border-border" />
        </div>
      )}

      {/* API Keys */}
      <div className="space-y-4">
        <h4 className="text-sm font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Key className="h-3.5 w-3.5" />
          {t('settings.advanced.apiKeys', 'API 密钥')}
        </h4>
        <p className="text-xs text-muted-foreground">
          {t('settings.advanced.apiKeysHelp', '用于远程连接认证，通过 Authorization: Bearer <key> 使用')}
        </p>

        {/* Key list */}
        {apiKeys.length > 0 && (
          <div className="space-y-2">
            {apiKeys.map((k) => (
              <div key={k.key_preview} className="flex items-center justify-between px-3 py-2 bg-surface border border-border rounded-lg">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{k.name}</span>
                    <code className="text-xs text-muted-foreground font-mono">{k.key_preview}</code>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {t('settings.advanced.keyCreated', '创建')}: {new Date(k.created_at).toLocaleDateString()}
                    {k.last_used && (
                      <> · {t('settings.advanced.keyLastUsed', '最后使用')}: {new Date(k.last_used).toLocaleDateString()}</>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => handleRevokeKey(k.key_preview)}
                  className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                  title={t('settings.advanced.revokeKey', '吊销')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* New key created - show once */}
        {newKeyValue && (
          <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg space-y-2">
            <p className="text-xs text-green-400">
              {t('settings.advanced.newKeyCreated', '密钥已创建，请立即复制保存，此后不再显示完整密钥。')}
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs font-mono text-foreground bg-surface px-2 py-1 rounded break-all select-all">
                {newKeyValue}
              </code>
              <button
                onClick={() => { copyToClipboard(newKeyValue); setNewKeyValue(null) }}
                className="p-1.5 text-info hover:bg-info/10 rounded-lg transition-colors"
                title={t('settings.advanced.copyKey', '复制')}
              >
                <Copy className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Create new key */}
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={newKeyName}
            onChange={(e) => setNewKeyName(e.target.value)}
            placeholder={t('settings.advanced.keyNamePlaceholder', '密钥名称（可选）')}
            className="flex-1 px-3 py-1.5 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-info"
            onKeyDown={(e) => e.key === 'Enter' && handleCreateKey()}
          />
          <button
            onClick={handleCreateKey}
            disabled={creating}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-info hover:bg-info/80 text-white rounded-lg transition-colors disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {t('settings.advanced.createKey', '创建密钥')}
          </button>
        </div>

        <div className="border-b border-border" />
      </div>

      <div className="space-y-3">
        <label className="text-sm font-medium text-foreground">
          {t('settings.advanced.sessionDir', '会话目录')}
        </label>
        <p className="text-xs text-muted-foreground mb-2">
          {t('settings.advanced.sessionDirHelp', 'Pi 会话文件的存储位置，默认路径始终包含在内')}
        </p>

        <div className="space-y-2">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              value="~/.pi/agent/sessions"
              disabled
              className="flex-1 px-3 py-2 bg-surface/50 border border-border rounded-lg text-sm text-muted-foreground cursor-not-allowed"
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap px-2">
              {t('settings.advanced.defaultSessionDir', '默认')}
            </span>
          </div>

          {(settings.advanced.sessionDirs || [])
            .filter((d: string) => d !== '~/.pi/agent/sessions')
            .map((dir: string, index: number) => (
              <div key={index} className="flex gap-2 items-center">
                <input
                  type="text"
                  value={dir}
                  onChange={(e) => {
                    const extraDirs = (settings.advanced.sessionDirs || []).filter(
                      (d: string) => d !== '~/.pi/agent/sessions'
                    )
                    extraDirs[index] = e.target.value
                    onUpdate('advanced', 'sessionDirs', ['~/.pi/agent/sessions', ...extraDirs])
                  }}
                  className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-foreground focus:outline-none focus:border-info"
                  placeholder="/path/to/sessions"
                />
                <button
                  onClick={() => {
                    const extraDirs = (settings.advanced.sessionDirs || []).filter(
                      (d: string) => d !== '~/.pi/agent/sessions'
                    )
                    extraDirs.splice(index, 1)
                    onUpdate('advanced', 'sessionDirs', ['~/.pi/agent/sessions', ...extraDirs])
                  }}
                  className="p-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors"
                  title={t('settings.advanced.removeSessionDir', '移除')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
        </div>

        <button
          onClick={() => {
            const current = settings.advanced.sessionDirs || ['~/.pi/agent/sessions']
            onUpdate('advanced', 'sessionDirs', [...current, ''])
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-info hover:bg-info/10 rounded-lg transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          {t('settings.advanced.addSessionDir', '添加路径')}
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-foreground">
            {t('settings.advanced.cacheEnabled', '启用缓存')}
          </label>
          <p className="text-xs text-muted-foreground">
            {t('settings.advanced.cacheEnabledHelp', '缓存会话数据以提高性能')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.advanced.cacheEnabled}
            onChange={(e) => onUpdate('advanced', 'cacheEnabled', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-info"></div>
        </label>
      </div>

      {settings.advanced.cacheEnabled && (
        <div className="space-y-2">
          <label className="text-sm font-medium text-foreground">
            {t('settings.advanced.maxCacheSize', '最大缓存大小')}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="10"
              max="1000"
              step="10"
              value={settings.advanced.maxCacheSize}
              onChange={(e) => onUpdate('advanced', 'maxCacheSize', parseInt(e.target.value))}
              className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-info"
            />
            <span className="text-sm text-muted-foreground w-20 text-right">
              {settings.advanced.maxCacheSize} MB
            </span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-foreground">
            {t('settings.advanced.debugMode', '调试模式')}
          </label>
          <p className="text-xs text-muted-foreground">
            {t('settings.advanced.debugModeHelp', '启用详细日志记录')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.advanced.debugMode}
            onChange={(e) => onUpdate('advanced', 'debugMode', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-info"></div>
        </label>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <label className="text-sm font-medium text-foreground">
            {t('app.demoMode', '演示模式')}
          </label>
          <p className="text-xs text-muted-foreground">
            {t('app.demoModeDescription', '查看演示数据以探索所有功能')}
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={settings.advanced.demoMode}
            onChange={(e) => onUpdate('advanced', 'demoMode', e.target.checked)}
            className="sr-only peer"
          />
          <div className="w-11 h-6 bg-secondary peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-info"></div>
        </label>
      </div>

      <div className="pt-4 border-t border-border space-y-3">
        <button
          onClick={() => {
            localStorage.removeItem('onboarding-completed')
            alert(t('settings.advanced.onboardingReset', '下次打开应用时将显示引导'))
          }}
          className="px-4 py-2 bg-info/10 text-info hover:bg-info/20 rounded-lg text-sm transition-colors"
        >
          {t('settings.advanced.showOnboarding', '重新显示新手引导')}
        </button>
        <button
          onClick={handleClearCache}
          className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm transition-colors"
        >
          {t('settings.advanced.clearCache', '清除缓存')}
        </button>
      </div>
    </div>
  )
}
