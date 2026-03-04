#!/usr/bin/env node

import { existsSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(rootDir)

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    throw result.error
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

console.log('📦 Building pi-session-cli...')
console.log('═══════════════════════════════════════')

const usePnpm = existsSync(join(rootDir, 'pnpm-lock.yaml'))

console.log('→ Building frontend...')
if (usePnpm) {
  run('pnpm', ['install', '--frozen-lockfile'])
  run('pnpm', ['run', 'build'])
} else {
  run('npm', ['ci'])
  run('npm', ['run', 'build'])
}

console.log('→ Building CLI binary...')
run('cargo', ['build', '--release', '-p', 'pi-session-cli'])

const binaryName = process.platform === 'win32' ? 'pi-session-cli.exe' : 'pi-session-cli'
const binaryPath = join(rootDir, 'target', 'release', binaryName)
const sizeMb = (statSync(binaryPath).size / 1024 / 1024).toFixed(1)

console.log('')
console.log('═══════════════════════════════════════')
console.log('✅ Build successful!')
console.log(`   Binary: ${binaryPath} (${sizeMb}MB)`)
console.log('')
console.log('Run locally:')
console.log(`   ${binaryPath}`)
