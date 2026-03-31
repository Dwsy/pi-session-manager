/**
 * Advanced settings component
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Plus, X, Copy, Trash2, Key, Shield, Server, FolderOpen, Settings2 } from 'lucide-react'
import { invoke } from '../../../transport'
import SettingsCard from '../SettingsCard'
import SettingsField from '../SettingsField'
import SettingsInput from '../SettingsInput'
import SettingsSelect from '../SettingsSelect'
import SettingsSliderField from '../SettingsSliderField'
import SettingsToggleRow from '../SettingsToggleRow'
import type { AdvancedSettingsProps } from '../types'
import { useClipboard } from '../../../hooks/useClipboard'

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
  const [keyMode, setKeyMode] = useState<'auto' | 'manual'>('auto')
  const [manualKey, setManualKey] = useState('')
  const [manualValue, setManualValue] = useState('')
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const { copyText } = useClipboard()

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
    const name = newKeyName.trim() || undefined
    const key = manualKey.trim()
    const value = manualValue.trim()
    const isManual = keyMode === 'manual'

    if (isManual && (!key || !value)) {
      alert(t('settings.advanced.manualKeyValidation', '手动创建时，Key 和 Value 必须同时填写'))
      return
    }

    setCreating(true)
    try {
      const created = await invoke<string>('create_api_key', {
        name,
        key: isManual ? key : undefined,
        value: isManual ? value : undefined,
      })
      setNewKeyValue(created)
      setNewKeyName('')
      setManualKey('')
      setManualValue('')
      await loadApiKeys()
    } catch (e) {
      console.error('Failed to create API key:', e)
      alert(t('settings.advanced.createKeyFailed', '创建密钥失败'))
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
    copyText(text).catch(console.error)
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

  const inputAccentClass =
    'placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-info/40'
  const selectAccentClass =
    'focus:ring-2 focus:ring-info/40'

  return (
    <div className="space-y-6">
      {/* Server Settings */}
      {serverSettings && (
        <SettingsCard
          title={t('settings.advanced.serverSection', '服务设置')}
          description={t('settings.advanced.serverSectionDesc', 'WebSocket、HTTP API 及认证配置')}
          icon={<Server className="h-4 w-4" />}
        >
          <div className="space-y-5">
            {/* Bind Address */}
            <SettingsField
              label={t('settings.advanced.bindAddr', '绑定地址')}
              description={t('settings.advanced.bindAddrHelp', '127.0.0.1 仅本地访问，0.0.0.0 允许远程连接')}
              className="space-y-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <SettingsSelect
                  value={serverSettings.bind_addr}
                  onChange={(e) => updateServer('bind_addr', e.target.value)}
                  className={`w-auto ${selectAccentClass}`}
                >
                  <option value="127.0.0.1">{t('settings.advanced.bindAddrLocal')}</option>
                  <option value="0.0.0.0">{t('settings.advanced.bindAddrAll')}</option>
                </SettingsSelect>
                {isRemoteBind && (
                  <span className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-2.5 py-1 rounded-lg">
                    <Shield className="h-3.5 w-3.5 flex-shrink-0" />
                    {t('settings.advanced.remoteWarning', '远程访问已开启，请确保认证已启用')}
                  </span>
                )}
              </div>
            </SettingsField>

            {/* WebSocket */}
            <SettingsToggleRow
              title="WebSocket"
              description={`ws://${serverSettings.bind_addr}:${serverSettings.ws_port}`}
              checked={serverSettings.ws_enabled}
              onChange={(checked) => updateServer('ws_enabled', checked)}
              className="items-start pt-4 border-t border-border/60"
              descriptionClassName="text-xs text-muted-foreground mt-0.5 font-mono"
            />
            {serverSettings.ws_enabled && (
              <SettingsField
                label={t('settings.advanced.wsPort', 'WebSocket 端口')}
                className="space-y-1 pl-0"
                labelClassName="text-xs text-muted-foreground"
              >
                <SettingsInput
                  type="number"
                  min="1024"
                  max="65535"
                  value={serverSettings.ws_port}
                  onChange={(e) => updateServer('ws_port', parseInt(e.target.value) || 52131)}  // Single-port: same as HTTP
                  className={`w-28 ${inputAccentClass}`}
                />
              </SettingsField>
            )}

            {/* HTTP API */}
            <SettingsToggleRow
              title="HTTP API"
              description={`http://${serverSettings.bind_addr}:${serverSettings.http_port}/api`}
              checked={serverSettings.http_enabled}
              onChange={(checked) => updateServer('http_enabled', checked)}
              className="items-start py-2 border-t border-border/60"
              descriptionClassName="text-xs text-muted-foreground mt-0.5 font-mono"
            />
            {serverSettings.http_enabled && (
              <SettingsField
                label={t('settings.advanced.httpPort', 'HTTP 端口')}
                className="space-y-1"
                labelClassName="text-xs text-muted-foreground"
              >
                <SettingsInput
                  type="number"
                  min="1024"
                  max="65535"
                  value={serverSettings.http_port}
                  onChange={(e) => updateServer('http_port', parseInt(e.target.value) || 52131)}
                  className={`w-28 ${inputAccentClass}`}
                />
              </SettingsField>
            )}

            {/* Auth */}
            <SettingsToggleRow
              title={t('settings.advanced.auth', '认证')}
              description={t('settings.advanced.authHelp', '非本地连接需要 Token 认证')}
              checked={serverSettings.auth_enabled}
              onChange={(checked) => updateServer('auth_enabled', checked)}
              className="items-start py-2 border-t border-border/60"
              descriptionClassName="text-xs text-muted-foreground mt-0.5"
            />

            {serverDirty && (
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={saveServerSettings}
                  className="px-4 py-2 bg-info hover:bg-info/90 text-white text-sm font-medium rounded-lg motion-color motion-press focus-ring shadow-sm"
                >
                  {t('settings.advanced.saveServer', '保存服务设置')}
                </button>
                <span className="flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  {t('settings.advanced.restartRequired', '需重启应用生效')}
                </span>
              </div>
            )}
          </div>
        </SettingsCard>
      )}

      {/* API Keys */}
      <SettingsCard
        title={t('settings.advanced.apiKeys', 'API 密钥')}
        description={t('settings.advanced.apiKeysHelp', '用于远程连接认证，通过 Authorization: Bearer <key> 使用')}
        icon={<Key className="h-4 w-4" />}
      >
        <div className="space-y-4">
          {apiKeys.length > 0 && (
            <div className="space-y-2">
              {apiKeys.map((k) => (
                <div
                  key={k.key_preview}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 bg-background/50 border border-border rounded-lg hover:border-border-hover/50 motion-surface motion-color"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-foreground">{k.name}</span>
                      <code className="text-xs text-muted-foreground font-mono truncate">{k.key_preview}</code>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {t('settings.advanced.keyCreated', '创建')}: {new Date(k.created_at).toLocaleDateString()}
                      {k.last_used && (
                        <> · {t('settings.advanced.keyLastUsed', '最后使用')}: {new Date(k.last_used).toLocaleDateString()}</>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevokeKey(k.key_preview)}
                    className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg motion-color motion-press focus-ring flex-shrink-0"
                    title={t('settings.advanced.revokeKey', '吊销')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {newKeyValue && (
            <div className="p-4 bg-green-500/10 border border-green-500/20 rounded-lg space-y-3">
              <p className="text-sm text-green-400">
                {t('settings.advanced.newKeyCreated', '密钥已创建，请立即复制保存，此后不再显示完整密钥。')}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono text-foreground bg-surface px-3 py-2 rounded-lg break-all select-all border border-border">
                  {newKeyValue}
                </code>
                <button
                  onClick={() => { copyToClipboard(newKeyValue); setNewKeyValue(null) }}
                  className="p-2 text-info hover:bg-info/10 rounded-lg motion-color motion-press focus-ring flex-shrink-0"
                  title={t('settings.advanced.copyKey', '复制')}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">
              {t('settings.advanced.keyMode', '创建模式')}
            </label>
            <div className="inline-flex rounded-lg border border-border p-1 bg-surface/60">
              <button
                type="button"
                onClick={() => {
                  setKeyMode('auto')
                  setManualKey('')
                  setManualValue('')
                }}
                className={`px-3 py-1.5 text-xs rounded-md motion-color motion-press focus-ring ${keyMode === 'auto' ? 'bg-info text-white' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t('settings.advanced.keyModeAuto', '自动生成')}
              </button>
              <button
                type="button"
                onClick={() => setKeyMode('manual')}
                className={`px-3 py-1.5 text-xs rounded-md motion-color motion-press focus-ring ${keyMode === 'manual' ? 'bg-info text-white' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t('settings.advanced.keyModeManual', '手动设置')}
              </button>
            </div>
          </div>

          <div className={`grid grid-cols-1 ${keyMode === 'manual' ? 'md:grid-cols-3' : 'md:grid-cols-1'} gap-2`}>
            <SettingsInput
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder={t('settings.advanced.keyNamePlaceholder', '密钥名称（可选）')}
              className={inputAccentClass}
            />
            {keyMode === 'manual' && (
              <>
                <SettingsInput
                  type="text"
                  value={manualKey}
                  onChange={(e) => setManualKey(e.target.value)}
                  placeholder={t('settings.advanced.manualKeyPlaceholder', '手动 Key（可选）')}
                  className={inputAccentClass}
                />
                <SettingsInput
                  type="text"
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  placeholder={t('settings.advanced.manualValuePlaceholder', '手动 Value（可选）')}
                  className={inputAccentClass}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateKey()}
                />
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {keyMode === 'manual'
              ? t('settings.advanced.manualKeyHint', '手动模式下需要同时填写 Key 和 Value。')
              : t('settings.advanced.autoKeyHint', '自动模式将随机生成安全密钥。')}
          </p>

          <div>
            <button
              onClick={handleCreateKey}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-info hover:bg-info/90 text-white rounded-lg motion-color motion-press focus-ring disabled:opacity-50 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              {t('settings.advanced.createKey', '创建密钥')}
            </button>
          </div>
        </div>
      </SettingsCard>

      {/* Session Dirs */}
      <SettingsCard
        title={t('settings.advanced.sessionDir', '会话目录')}
        description={t('settings.advanced.sessionDirHelp', 'Pi 会话文件的存储位置，默认路径始终包含在内')}
        icon={<FolderOpen className="h-4 w-4" />}
      >
        <div className="space-y-3">
          <div className="flex gap-2 items-center">
            <SettingsInput
              type="text"
              value="~/.pi/agent/sessions"
              disabled
              className={`flex-1 w-auto ${inputAccentClass} opacity-80 cursor-not-allowed`}
            />
            <span className="text-xs text-muted-foreground whitespace-nowrap px-2 py-1 bg-secondary/50 rounded">
              {t('settings.advanced.defaultSessionDir', '默认')}
            </span>
          </div>
          {(settings.advanced.sessionDirs || [])
            .filter((d: string) => d !== '~/.pi/agent/sessions')
            .map((dir: string, index: number) => (
              <div key={index} className="flex gap-2 items-center">
                <SettingsInput
                  type="text"
                  value={dir}
                  onChange={(e) => {
                    const extraDirs = (settings.advanced.sessionDirs || []).filter(
                      (d: string) => d !== '~/.pi/agent/sessions'
                    )
                    extraDirs[index] = e.target.value
                    onUpdate('advanced', 'sessionDirs', ['~/.pi/agent/sessions', ...extraDirs])
                  }}
                  className={`flex-1 w-auto ${inputAccentClass}`}
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
                  className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg motion-color motion-press focus-ring"
                  title={t('settings.advanced.removeSessionDir', '移除')}
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          <button
            onClick={() => {
              const current = settings.advanced.sessionDirs || ['~/.pi/agent/sessions']
              onUpdate('advanced', 'sessionDirs', [...current, ''])
            }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-info hover:bg-info/10 rounded-lg motion-color motion-press focus-ring"
          >
            <Plus className="h-4 w-4" />
            {t('settings.advanced.addSessionDir', '添加路径')}
          </button>
        </div>
      </SettingsCard>

      {/* General options card */}
      <SettingsCard
        title={t('settings.advanced.generalTitle', '常规选项')}
        icon={<Settings2 className="h-4 w-4" />}
      >
        <div className="space-y-4">
          <SettingsToggleRow
            title={t('settings.advanced.cacheEnabled', '启用缓存')}
            description={t('settings.advanced.cacheEnabledHelp', '缓存会话数据以提高性能')}
            checked={settings.advanced.cacheEnabled}
            onChange={(checked) => onUpdate('advanced', 'cacheEnabled', checked)}
            className="items-start py-2"
            descriptionClassName="text-xs text-muted-foreground mt-0.5"
          />
          {settings.advanced.cacheEnabled && (
            <div className="pl-0 pt-2 border-t border-border/60">
              <SettingsSliderField
                label={t('settings.advanced.maxCacheSize', '最大缓存大小')}
                value={settings.advanced.maxCacheSize}
                min={10}
                max={1000}
                step={10}
                onChange={(value) => onUpdate('advanced', 'maxCacheSize', value)}
                valueText={`${settings.advanced.maxCacheSize} MB`}
                sliderClassName="rounded-full"
                valueClassName="w-16 font-mono"
                fieldClassName="space-y-2"
              />
            </div>
          )}

          <SettingsToggleRow
            title={t('settings.advanced.debugMode', '调试模式')}
            description={t('settings.advanced.debugModeHelp', '启用详细日志记录')}
            checked={settings.advanced.debugMode}
            onChange={(checked) => onUpdate('advanced', 'debugMode', checked)}
            className="items-start py-2 border-t border-border/60"
            descriptionClassName="text-xs text-muted-foreground mt-0.5"
          />

          <SettingsToggleRow
            title={t('app.demoMode', '演示模式')}
            description={t('app.demoModeDescription', '查看演示数据以探索所有功能')}
            checked={settings.advanced.demoMode}
            onChange={(checked) => onUpdate('advanced', 'demoMode', checked)}
            className="items-start py-2 border-t border-border/60"
            descriptionClassName="text-xs text-muted-foreground mt-0.5"
          />
        </div>
      </SettingsCard>

      {/* Actions */}
      <SettingsCard>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => {
              localStorage.removeItem('onboarding-completed')
              alert(t('settings.advanced.onboardingReset', '下次打开应用时将显示引导'))
            }}
            className="px-4 py-2 bg-info/10 text-info hover:bg-info/20 rounded-lg text-sm font-medium motion-color motion-press focus-ring"
          >
            {t('settings.advanced.showOnboarding', '重新显示新手引导')}
          </button>
          <button
            onClick={handleClearCache}
            className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium motion-color motion-press focus-ring"
          >
            {t('settings.advanced.clearCache', '清除缓存')}
          </button>
        </div>
      </SettingsCard>
    </div>
  )
}
