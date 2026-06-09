// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

import RemoteConnectionTab from './RemoteConnectionTab'

describe('RemoteConnectionTab', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
    localStorage.clear()
  })

  it('shows apply and reload prompt after turning off an active remote mode', () => {
    localStorage.setItem('psm.remoteMode', 'true')
    localStorage.setItem('psm.remoteServerUrl', '192.168.1.100:52131')
    localStorage.setItem('psm.remoteTransport', 'auto')

    render(<RemoteConnectionTab />)

    const remoteModeToggle = screen.getByRole('checkbox') as HTMLInputElement
    expect(remoteModeToggle.checked).toBe(true)
    expect(screen.queryByRole('button', { name: 'Apply & Reload' })).toBeNull()

    fireEvent.click(remoteModeToggle)

    expect(remoteModeToggle.checked).toBe(false)
    expect(localStorage.getItem('psm.remoteMode')).toBeNull()
    expect(localStorage.getItem('psm.remoteServerUrl')).toBeNull()
    expect(screen.getByRole('button', { name: 'Apply & Reload' })).not.toBeNull()
    expect(screen.getByText('The app will reload to switch transport layer')).not.toBeNull()
  })

  it('restores persisted remote config when turning remote mode back on before reload', () => {
    localStorage.setItem('psm.remoteMode', 'true')
    localStorage.setItem('psm.remoteServerUrl', '192.168.1.100:52131')
    localStorage.setItem('psm.remoteApiToken', 'token-1')
    localStorage.setItem('psm.remoteTransport', 'ws')

    render(<RemoteConnectionTab />)

    const remoteModeToggle = screen.getByRole('checkbox') as HTMLInputElement
    fireEvent.click(remoteModeToggle)
    fireEvent.click(remoteModeToggle)

    expect(remoteModeToggle.checked).toBe(true)
    expect(localStorage.getItem('psm.remoteMode')).toBe('true')
    expect(localStorage.getItem('psm.remoteServerUrl')).toBe('192.168.1.100:52131')
    expect(localStorage.getItem('psm.remoteApiToken')).toBe('token-1')
    expect(localStorage.getItem('psm.remoteTransport')).toBe('ws')
  })
})
