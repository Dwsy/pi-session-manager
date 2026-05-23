import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import basicPackage from '../../../../templates/psm-plugin-basic/package.json'
import { manifest as basicManifest } from '../../../../templates/psm-plugin-basic/src/index'
import recordsPackage from '../../../../templates/psm-plugin-records/package.json'
import { manifest as recordsManifest } from '../../../../templates/psm-plugin-records/src/index'
import sidechatPackage from '../../../../templates/psm-plugin-sidechat/package.json'
import { manifest as sidechatManifest } from '../../../../templates/psm-plugin-sidechat/src/index'
import sdkPackage from '../../package.json'
import { validatePsmPackageManifest, validatePsmPluginManifest } from '../manifest'

function sourceAt(relativePath: string) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

describe('published plugin SDK boundary', () => {
  it('uses the canonical package name and only re-exports the public runtime SDK', () => {
    expect(sdkPackage.name).toBe('@pi-session-manager/plugin-sdk')

    const source = sourceAt('../index.ts')
    expect(source).toContain("export * from './types'")
    expect(source).toContain("export * from './manifest'")
    expect(source).toContain("export * from './client'")
    expect(source).not.toContain('appTransport')
    expect(source).not.toContain(['runtime', '-host'].join(''))
    expect(source).not.toContain(['@tauri', '-apps'].join(''))
  })
})

describe('PSM plugin templates', () => {
  it.each([
    ['basic', basicPackage, basicManifest],
    ['sidechat', sidechatPackage, sidechatManifest],
    ['records', recordsPackage, recordsManifest],
  ])('%s template declares a valid browser ESM plugin package', (_name, packageJson, manifest) => {
    expect(packageJson.type).toBe('module')
    expect(packageJson.psm).toEqual({ extensions: ['./dist/index.js'] })
    expect(validatePsmPackageManifest(packageJson.psm)).toEqual({ ok: true, errors: [] })
    expect(validatePsmPluginManifest(manifest)).toEqual({ ok: true, errors: [] })
  })
})
