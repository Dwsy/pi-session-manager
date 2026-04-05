/**
 * Advanced settings component
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, Plus, X, Copy, Trash2, Key, Shield, Server, FolderOpen, Settings2 } from 'lucide-react'
import { invoke } from '@/transport'
import SettingsCard from '@/components/settings/SettingsCard'
import SettingsField from '@/components/settings/SettingsField'
import SettingsInput from '@/components/settings/SettingsInput'
import SettingsSelect from '@/components/settings/SettingsSelect'
import SettingsSliderField from '@/components/settings/SettingsSliderField'
import SettingsToggleRow from '@/components/settings/SettingsToggleRow'
import type { AdvancedSettingsProps } from '@/components/settings/types'
import { useClipboard } from '@/hooks/useClipboard'

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
      alert(t('settings.advanced.manualKeyValidation', 'When creating manually, both Key and Value must be filled'))
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
      alert(t('settings.advanced.createKeyFailed', 'Failed to create key'))
    } finally {
      setCreating(false)
    }
  }

  const handleRevokeKey = async (keyPreview: string) => {
    if (!confirm(t('settings.advanced.revokeKeyConfirm', 'Are you sure you want to revoke this key? This action cannot be undone.'))) return
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
    if (!confirm(t('settings.advanced.clearCacheConfirm', 'Are you sure you want to clear all cache data? This will delete all session cache but keep favorites.'))) {
      return
    }
    try {
      const result = await invoke<ClearCacheResult>('clear_cache')
      alert(t('settings.advanced.cacheClearedDetail', 'Cache cleared: {{sessions}} sessions, {{details}} details cache', {
        sessions: result.sessions_deleted,
        details: result.details_deleted
      }))
    } catch (error) {
      console.error('Failed to clear cache:', error)
      alert(t('settings.advanced.cacheClearFailed', 'Failed to clear cache'))
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
          title={t('settings.advanced.serverSection', 'Server Settings')}
          description={t('settings.advanced.serverSectionDesc', 'WebSocket, HTTP API and authentication configuration')}
          icon={<Server className="h-4 w-4" />}
        >
          <div className="space-y-5">
            {/* Bind Address */}
            <SettingsField
              label={t('settings.advanced.bindAddr', 'Bind Address')}
              description={t('settings.advanced.bindAddrHelp', '127.0.0.1 for local access only, 0.0.0.0 allows remote connections')}
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
                    {t('settings.advanced.remoteWarning', 'Remote access is enabled, please ensure authentication is enabled')}
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
                label={t('settings.advanced.wsPort', 'WebSocket Port')}
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
                label={t('settings.advanced.httpPort', 'HTTP Port')}
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
              title={t('settings.advanced.auth', 'Authentication')}
              description={t('settings.advanced.authHelp', 'Non-local connections require token authentication')}
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
                  {t('settings.advanced.saveServer', 'Save server settings')}
                </button>
                <span className="flex items-center gap-1.5 text-xs text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
                  {t('settings.advanced.restartRequired', 'Requires app restart to take effect')}
                </span>
              </div>
            )}
          </div>
        </SettingsCard>
      )}

      {/* API Keys */}
      <SettingsCard
        title={t('settings.advanced.apiKeys', 'API Keys')}
        description={t('settings.advanced.apiKeysHelp', 'Used for remote connection authentication via Authorization: Bearer <key>')}
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
                      {t('settings.advanced.keyCreated', 'Create')}: {new Date(k.created_at).toLocaleDateString()}
                      {k.last_used && (
                        <> · {t('settings.advanced.keyLastUsed', 'Last used')}: {new Date(k.last_used).toLocaleDateString()}</>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleRevokeKey(k.key_preview)}
                    className="p-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg motion-color motion-press focus-ring flex-shrink-0"
                    title={t('settings.advanced.revokeKey', 'Revoke')}
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
                {t('settings.advanced.newKeyCreated', 'Key created, please copy and save it now, the full key will not be shown again.')}
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono text-foreground bg-surface px-3 py-2 rounded-lg break-all select-all border border-border">
                  {newKeyValue}
                </code>
                <button
                  onClick={() => { copyToClipboard(newKeyValue); setNewKeyValue(null) }}
                  className="p-2 text-info hover:bg-info/10 rounded-lg motion-color motion-press focus-ring flex-shrink-0"
                  title={t('settings.advanced.copyKey', 'Copy')}
                >
                  <Copy className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-xs text-muted-foreground">
              {t('settings.advanced.keyMode', 'Creation Mode')}
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
                {t('settings.advanced.keyModeAuto', 'Auto generate')}
              </button>
              <button
                type="button"
                onClick={() => setKeyMode('manual')}
                className={`px-3 py-1.5 text-xs rounded-md motion-color motion-press focus-ring ${keyMode === 'manual' ? 'bg-info text-white' : 'text-muted-foreground hover:text-foreground'}`}
              >
                {t('settings.advanced.keyModeManual', 'Manual Setup')}
              </button>
            </div>
          </div>

          <div className={`grid grid-cols-1 ${keyMode === 'manual' ? 'md:grid-cols-3' : 'md:grid-cols-1'} gap-2`}>
            <SettingsInput
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder={t('settings.advanced.keyNamePlaceholder', 'Key name (optional)')}
              className={inputAccentClass}
            />
            {keyMode === 'manual' && (
              <>
                <SettingsInput
                  type="text"
                  value={manualKey}
                  onChange={(e) => setManualKey(e.target.value)}
                  placeholder={t('settings.advanced.manualKeyPlaceholder', 'Manual Key (optional)')}
                  className={inputAccentClass}
                />
                <SettingsInput
                  type="text"
                  value={manualValue}
                  onChange={(e) => setManualValue(e.target.value)}
                  placeholder={t('settings.advanced.manualValuePlaceholder', 'Manual Value (optional)')}
                  className={inputAccentClass}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreateKey()}
                />
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {keyMode === 'manual'
              ? t('settings.advanced.manualKeyHint', 'Both Key and Value must be filled in manual mode.')
              : t('settings.advanced.autoKeyHint', 'Auto mode will randomly generate a secure key.')}
          </p>

          <div>
            <button
              onClick={handleCreateKey}
              disabled={creating}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-info hover:bg-info/90 text-white rounded-lg motion-color motion-press focus-ring disabled:opacity-50 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              {t('settings.advanced.createKey', 'Create Key')}
            </button>
          </div>
        </div>
      </SettingsCard>

      {/* Session Dirs */}
      <SettingsCard
        title={t('settings.advanced.sessionDir', 'Session directories')}
        description={t('settings.advanced.sessionDirHelp', 'Storage location for Pi session files, default path is always included')}
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
              {t('settings.advanced.defaultSessionDir', 'Default')}
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
                  title={t('settings.advanced.removeSessionDir', 'Remove')}
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
            {t('settings.advanced.addSessionDir', 'Add path')}
          </button>
        </div>
      </SettingsCard>

      {/* General options card */}
      <SettingsCard
        title={t('settings.advanced.generalTitle', 'General options')}
        icon={<Settings2 className="h-4 w-4" />}
      >
        <div className="space-y-4">
          <SettingsToggleRow
            title={t('settings.advanced.cacheEnabled', 'Enable cache')}
            description={t('settings.advanced.cacheEnabledHelp', 'Cache session data to improve performance')}
            checked={settings.advanced.cacheEnabled}
            onChange={(checked) => onUpdate('advanced', 'cacheEnabled', checked)}
            className="items-start py-2"
            descriptionClassName="text-xs text-muted-foreground mt-0.5"
          />
          {settings.advanced.cacheEnabled && (
            <div className="pl-0 pt-2 border-t border-border/60">
              <SettingsSliderField
                label={t('settings.advanced.maxCacheSize', 'Max cache size')}
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
            title={t('settings.advanced.debugMode', 'Debug mode')}
            description={t('settings.advanced.debugModeHelp', 'Enable verbose logging')}
            checked={settings.advanced.debugMode}
            onChange={(checked) => onUpdate('advanced', 'debugMode', checked)}
            className="items-start py-2 border-t border-border/60"
            descriptionClassName="text-xs text-muted-foreground mt-0.5"
          />

          <SettingsToggleRow
            title={t('app.demoMode', 'Demo mode')}
            description={t('app.demoModeDescription', 'View demo data to explore all features')}
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
              alert(t('settings.advanced.onboardingReset', 'Onboarding will be shown next time the app opens'))
            }}
            className="px-4 py-2 bg-info/10 text-info hover:bg-info/20 rounded-lg text-sm font-medium motion-color motion-press focus-ring"
          >
            {t('settings.advanced.showOnboarding', 'Show onboarding again')}
          </button>
          <button
            onClick={handleClearCache}
            className="px-4 py-2 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-lg text-sm font-medium motion-color motion-press focus-ring"
          >
            {t('settings.advanced.clearCache', 'Clear cache')}
          </button>
        </div>
      </SettingsCard>
    </div>
  )
}
