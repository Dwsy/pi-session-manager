import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppSettings } from '@/components/settings/types'

const invokeMock = vi.fn()
const saveSessionSourceMock = vi.fn()
const isTauriMock = vi.fn(() => true)
const isStandaloneDatasetRuntimeMock = vi.fn(() => false)

const storage = new Map<string, string>()
const localStorageMock = {
  getItem: vi.fn((key: string) => storage.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => {
    storage.set(key, value)
  }),
  removeItem: vi.fn((key: string) => {
    storage.delete(key)
  }),
  clear: vi.fn(() => {
    storage.clear()
  }),
}

Object.defineProperty(globalThis, 'localStorage', {
  value: localStorageMock,
  configurable: true,
})

vi.mock('@/transport', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
  isTauri: () => isTauriMock(),
}))

vi.mock('@/utils/datasetApi', () => ({
  saveSessionSource: (...args: unknown[]) => saveSessionSourceMock(...args),
}))

vi.mock('@/browser-dataset', () => ({
  isStandaloneDatasetRuntime: () => isStandaloneDatasetRuntimeMock(),
}))

describe('saveAppSettings', () => {
  beforeEach(() => {
    vi.resetModules()
    invokeMock.mockReset()
    saveSessionSourceMock.mockReset()
    isStandaloneDatasetRuntimeMock.mockReset()
    isTauriMock.mockReset()
    isTauriMock.mockReturnValue(true)
    isStandaloneDatasetRuntimeMock.mockReturnValue(false)
    invokeMock.mockResolvedValue(undefined)
    saveSessionSourceMock.mockResolvedValue(undefined)
    localStorage.clear()
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
    })
  })

  it('skips heavy sync commands when settings are unchanged', async () => {
    const { saveAppSettings, getCachedSettings, loadAppSettings } = await import('./settingsApi')
    const defaults = getCachedSettings()
    const settings: AppSettings = {
      ...defaults,
      advanced: { ...defaults.advanced, sessionDirs: ['~/.pi/agent/sessions'] },
      session: {
        ...defaults.session,
        sourceMode: 'local',
        activeDatasetId: '',
        activeDatasetIds: [],
        scanOtherAgentJsonl: false,
        externalSessionProviders: [],
      },
    }

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'load_app_settings') {
        return settings
      }
      return undefined
    })

    await loadAppSettings()
    invokeMock.mockClear()
    saveSessionSourceMock.mockClear()

    await saveAppSettings(settings)
    await saveAppSettings({ ...settings })

    const commands = invokeMock.mock.calls.map((call) => call[0])
    expect(commands).toEqual([])
    expect(saveSessionSourceMock).not.toHaveBeenCalled()
  })

  it('syncs default Pi session directory changes', async () => {
    const { saveAppSettings, getCachedSettings, loadAppSettings } = await import('./settingsApi')
    const defaults = getCachedSettings()
    const base: AppSettings = {
      ...defaults,
      advanced: {
        ...defaults.advanced,
        sessionDirs: ['~/.pi/agent/sessions'],
        includeDefaultPiSessionDir: true,
      },
      session: {
        ...defaults.session,
        sourceMode: 'local',
        activeDatasetId: '',
        activeDatasetIds: [],
        scanOtherAgentJsonl: false,
        externalSessionProviders: [],
      },
    }

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'load_app_settings') {
        return base
      }
      return undefined
    })

    await loadAppSettings()
    invokeMock.mockClear()
    saveSessionSourceMock.mockClear()

    await saveAppSettings({
      ...base,
      advanced: {
        ...base.advanced,
        sessionDirs: [],
        includeDefaultPiSessionDir: false,
      },
    })

    expect(invokeMock.mock.calls.map((call) => call[0])).toEqual([
      'save_app_settings',
      'save_default_pi_session_dir_enabled',
    ])
    expect(invokeMock).toHaveBeenCalledWith('save_default_pi_session_dir_enabled', {
      enabled: false,
    })
  })

  it('syncs only changed heavy settings fields', async () => {
    const { saveAppSettings, getCachedSettings, loadAppSettings } = await import('./settingsApi')
    const defaults = getCachedSettings()
    const base: AppSettings = {
      ...defaults,
      advanced: { ...defaults.advanced, sessionDirs: ['~/.pi/agent/sessions'] },
      session: {
        ...defaults.session,
        sourceMode: 'local',
        activeDatasetId: '',
        activeDatasetIds: [],
        scanOtherAgentJsonl: false,
        externalSessionProviders: [],
      },
    }

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'load_app_settings') {
        return base
      }
      return undefined
    })

    await loadAppSettings()
    invokeMock.mockClear()
    saveSessionSourceMock.mockClear()

    const changed: AppSettings = {
      ...base,
      session: {
        ...base.session,
        externalSessionProviders: ['codex'],
        scanOtherAgentJsonl: true,
      },
    }

    await saveAppSettings(changed)

    const commands = invokeMock.mock.calls.map((call) => call[0])
    expect(commands).toEqual([
      'save_app_settings',
      'save_session_scan_other_agents',
      'save_external_session_providers',
    ])
    expect(saveSessionSourceMock).not.toHaveBeenCalled()
  })

  it('notifies standalone dataset runtime when dataset selection changes', async () => {
    const dispatchEventMock = vi.fn()
    Object.defineProperty(globalThis, 'window', {
      value: {
        dispatchEvent: dispatchEventMock,
      },
      configurable: true,
    })
    isTauriMock.mockReturnValue(false)
    isStandaloneDatasetRuntimeMock.mockReturnValue(true)

    const { saveAppSettings, getCachedSettings } = await import('./settingsApi')
    const defaults = getCachedSettings()
    const settings: AppSettings = {
      ...defaults,
      session: {
        ...defaults.session,
        sourceMode: 'dataset',
        activeDatasetId: 'owner/a',
        activeDatasetIds: ['owner/a'],
      },
    }

    await saveAppSettings(settings)

    expect(dispatchEventMock).toHaveBeenCalledTimes(1)
    const event = dispatchEventMock.mock.calls[0][0] as CustomEvent
    expect(event.type).toBe('browser-dataset:refreshed')
    expect(event.detail).toMatchObject({
      reason: 'selection-change',
      datasetId: 'owner/a',
      datasetIds: ['owner/a'],
    })
  })

  it('defaults conversation folding to tool-call groups when backend settings omit the mode', async () => {
    const { loadAppSettings } = await import('./settingsApi')

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'load_app_settings') {
        return {
          session: {
            sourceMode: 'local',
            activeDatasetId: '',
            activeDatasetIds: [],
            conversationModeEnabled: true,
          },
        }
      }
      return undefined
    })

    const settings = await loadAppSettings()

    expect(settings.session.conversationFoldMode).toBe('toolGroups')
  })

  it('preserves the legacy whole-turn conversation folding setting', async () => {
    const { loadAppSettings } = await import('./settingsApi')

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'load_app_settings') {
        return {
          session: {
            sourceMode: 'local',
            activeDatasetId: '',
            activeDatasetIds: [],
            conversationModeEnabled: true,
            conversationFoldMode: 'wholeTurn',
          },
        }
      }
      return undefined
    })

    const settings = await loadAppSettings()

    expect(settings.session.conversationFoldMode).toBe('wholeTurn')
  })

  it('merges default subagent compatibility settings when backend settings omit them', async () => {
    const { loadAppSettings } = await import('./settingsApi')

    invokeMock.mockImplementation(async (command: string) => {
      if (command === 'load_app_settings') {
        return {
          session: {
            sourceMode: 'local',
            activeDatasetId: '',
            activeDatasetIds: [],
          },
        }
      }
      return undefined
    })

    const settings = await loadAppSettings()

    expect(settings.subagents).toMatchObject({
      mode: 'smart',
      showProviderBadge: true,
      enableAsyncStatusProbe: true,
    })
    expect(settings.subagents.forcedProvider).toBeUndefined()
  })
})
