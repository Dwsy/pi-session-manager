// @vitest-environment jsdom
import React from 'react'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { invoke, isTauri } from '@/transport'
import { getReleasesPageUrl } from '@/utils/updateChannel'
import type { UpdateSettingsProps } from '../types'
import UpdateSettings from './UpdateSettings'

vi.mock('@/transport', () => ({ invoke: vi.fn(), isTauri: vi.fn() }))
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (_key: string, fallback: string) => fallback }) }))
vi.mock('@/utils/appUpdater', () => ({ getFallbackCurrentVersion: () => '0.9.1' }))
vi.mock('@/utils/updateService', () => ({
  canInstallInApp: () => isTauri(),
  useUpdateSnapshot: () => ({ status: { kind: 'up-to-date', currentVersion: '0.9.1' }, lastCheckedAt: null }),
  installAvailableUpdate: vi.fn(), restartForUpdate: vi.fn(), runUpdateCheck: vi.fn(),
}))
vi.mock('@/components/ui/MarkdownContent', () => ({ default: () => null }))
const settings = { update: { channel: 'stable', autoCheck: true } } as UpdateSettingsProps['settings']
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.resetAllMocks() })

describe('UpdateSettings release links', () => {
  it('uses the system browser on desktop', () => {
    vi.mocked(isTauri).mockReturnValue(true)
    vi.mocked(invoke).mockResolvedValue(undefined)
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const view = render(<UpdateSettings settings={settings} onUpdate={vi.fn()} />)
    fireEvent.click(view.getByRole('button', { name: 'View Releases' }))
    expect(invoke).toHaveBeenCalledWith('open_url_in_system', { url: getReleasesPageUrl() })
    expect(open).not.toHaveBeenCalled()
  })
  it('opens a new tab in a browser', () => {
    vi.mocked(isTauri).mockReturnValue(false)
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const view = render(<UpdateSettings settings={settings} onUpdate={vi.fn()} />)
    fireEvent.click(view.getByRole('button', { name: 'View Releases' }))
    expect(open).toHaveBeenCalledWith(getReleasesPageUrl(), '_blank', 'noopener,noreferrer')
    expect(invoke).not.toHaveBeenCalled()
  })
  it('shows system browser errors', async () => {
    vi.mocked(isTauri).mockReturnValue(true)
    vi.mocked(invoke).mockRejectedValue(new Error('Unable to open browser'))
    const view = render(<UpdateSettings settings={settings} onUpdate={vi.fn()} />)
    fireEvent.click(view.getByRole('button', { name: 'View Releases' }))
    expect((await view.findByRole('alert')).textContent).toBe('Unable to open browser')
  })
})
