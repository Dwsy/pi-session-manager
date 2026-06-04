import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { getPsmClientEnv, getPsmProxyTarget, resolvePsmProxyTarget } from './vite.config'

describe('vite psm proxy target', () => {
  afterEach(() => {
    delete process.env.PSM_URL
  })

  it('derives proxy targets from ws PSM_URL', () => {
    const target = resolvePsmProxyTarget('ws://127.0.0.1:5002/ws')

    expect(target).toEqual({
      httpTarget: 'http://127.0.0.1:5002',
      wsTarget: 'ws://127.0.0.1:5002/ws',
    })
  })

  it('derives proxy targets from http PSM_URL', () => {
    const target = resolvePsmProxyTarget('http://127.0.0.1:5002')

    expect(target).toEqual({
      httpTarget: 'http://127.0.0.1:5002',
      wsTarget: 'ws://127.0.0.1:5002/ws',
    })
  })

  it('prefers PSM_URL over config file', () => {
    process.env.PSM_URL = 'http://127.0.0.1:6001'

    const target = getPsmProxyTarget({ ...process.env, HOME: '/tmp/ignored-home' })

    expect(target).toEqual({
      httpTarget: 'http://127.0.0.1:6001',
      wsTarget: 'ws://127.0.0.1:6001/ws',
    })
  })

  it('reads http_port from ~/.pi/pi-session-manager/config.json', () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'psm-vite-config-'))
    const configDir = path.join(tempHome, '.pi', 'pi-session-manager')
    fs.mkdirSync(configDir, { recursive: true })
    fs.writeFileSync(
      path.join(configDir, 'config.json'),
      JSON.stringify({ server: { http_port: 43123 } })
    )

    const target = getPsmProxyTarget({ HOME: tempHome } as NodeJS.ProcessEnv)
    const clientEnv = getPsmClientEnv({ HOME: tempHome } as NodeJS.ProcessEnv)

    expect(target).toEqual({
      httpTarget: 'http://127.0.0.1:43123',
      wsTarget: 'ws://127.0.0.1:43123/ws',
    })
    expect(clientEnv).toEqual({
      httpBaseUrl: 'http://127.0.0.1:43123',
      wsUrl: 'ws://127.0.0.1:43123/ws',
    })
  })

  it('falls back to 52131 when no override exists', () => {
    const target = getPsmProxyTarget({ HOME: '/tmp/non-existent-psm-home' } as NodeJS.ProcessEnv)

    expect(target).toEqual({
      httpTarget: 'http://127.0.0.1:52131',
      wsTarget: 'ws://127.0.0.1:52131/ws',
    })
  })
})
