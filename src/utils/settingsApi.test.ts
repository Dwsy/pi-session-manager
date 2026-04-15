import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AppSettings } from '@/components/settings/types'

const invokeMock = vi.fn()
const saveSessionSourceMock = vi.fn()
const isTauriMock = vi.fn(() => true)

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

describe('saveAppSettings', () => {
  beforeEach(() => {
    vi.resetModules()
    invokeMock.mockReset()
    saveSessionSourceMock.mockReset()
    isTauriMock.mockReset()
    isTauriMock.mockReturnValue(true)
    invokeMock.mockResolvedValue(undefined)
    saveSessionSourceMock.mockResolvedValue(undefined)
    localStorage.clear()
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
})
