// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

describe('update-channel-manifests script', () => {
  it('writes stable and beta manifests for stable tags', () => {
    const dir = mkdtempSync(join(tmpdir(), 'psm-update-channel-stable-'))
    const source = join(dir, 'latest.json')
    const output = join(dir, 'out')
    writeFileSync(source, JSON.stringify({ version: '0.6.4', platforms: {} }))

    const stdout = execFileSync('node', [
      'scripts/update-channel-manifests.mjs',
      'prepare',
      source,
      output,
      'v0.6.4',
    ], { encoding: 'utf8' })

    const result = JSON.parse(stdout) as { prerelease: boolean; outputs: string[] }
    expect(result.prerelease).toBe(false)
    expect(result.outputs).toHaveLength(2)
    expect(readFileSync(join(output, 'stable/latest.json'), 'utf8')).toContain('0.6.4')
    expect(readFileSync(join(output, 'beta/latest.json'), 'utf8')).toContain('0.6.4')
  })

  it('writes only beta manifest for prerelease tags', () => {
    const dir = mkdtempSync(join(tmpdir(), 'psm-update-channel-beta-'))
    const source = join(dir, 'latest.json')
    const output = join(dir, 'out')
    writeFileSync(source, JSON.stringify({ version: '0.7.0-beta.2', platforms: {} }))

    const stdout = execFileSync('node', [
      'scripts/update-channel-manifests.mjs',
      'prepare',
      source,
      output,
      'v0.7.0-beta.2',
    ], { encoding: 'utf8' })

    const result = JSON.parse(stdout) as { prerelease: boolean; outputs: string[] }
    expect(result.prerelease).toBe(true)
    expect(result.outputs).toHaveLength(1)
    expect(result.outputs[0].endsWith('beta/latest.json')).toBe(true)
    expect(readFileSync(join(output, 'beta/latest.json'), 'utf8')).toContain('0.7.0-beta.2')
  })
})
