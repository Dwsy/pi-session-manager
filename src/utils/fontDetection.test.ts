/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const invokeMock = vi.hoisted(() => vi.fn())

vi.mock('@tauri-apps/api/core', () => ({
  invoke: invokeMock,
}))

async function loadModule() {
  vi.resetModules()
  return import('./fontDetection')
}

describe('fontDetection cache', () => {
  beforeEach(() => {
    invokeMock.mockReset()
    Object.defineProperty(window, '__TAURI_INTERNALS__', {
      value: {},
      configurable: true,
    })
  })

  it('caches sequential monospace font detection', async () => {
    invokeMock.mockResolvedValue([{ family: 'Menlo', postscript_name: null }])
    const { listSystemMonospaceFonts } = await loadModule()

    await listSystemMonospaceFonts()
    await listSystemMonospaceFonts()

    expect(invokeMock).toHaveBeenCalledTimes(1)
    expect(invokeMock).toHaveBeenCalledWith('list_monospace_fonts')
  })

  it('shares one in-flight monospace font detection request', async () => {
    invokeMock.mockResolvedValue([{ family: 'Cascadia Code', postscript_name: null }])
    const { listSystemMonospaceFonts } = await loadModule()

    await Promise.all([listSystemMonospaceFonts(), listSystemMonospaceFonts()])

    expect(invokeMock).toHaveBeenCalledTimes(1)
  })

  it('keeps all-font and monospace caches separate', async () => {
    invokeMock.mockResolvedValue([{ family: 'SF Pro Text', postscript_name: null }])
    const { listAllSystemFonts, listSystemMonospaceFonts } = await loadModule()

    await listAllSystemFonts()
    await listSystemMonospaceFonts()

    expect(invokeMock).toHaveBeenCalledTimes(2)
    expect(invokeMock).toHaveBeenNthCalledWith(1, 'list_system_fonts')
    expect(invokeMock).toHaveBeenNthCalledWith(2, 'list_monospace_fonts')
  })
})
