#!/usr/bin/env node
/**
 * Pi Session CLI Build Script
 * Supports: macOS (arm64/x64), Linux (x64), Windows (x64)
 * Usage: node scripts/build-cli.mjs [target]
 *        node scripts/build-cli.mjs --package  # Create distribution packages
 */

import { existsSync, statSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
process.chdir(rootDir)

// Target platforms
const TARGETS = {
  'macos-arm64': { target: 'aarch64-apple-darwin', binary: 'pi-session-cli' },
  'macos-x64': { target: 'x86_64-apple-darwin', binary: 'pi-session-cli' },
  'linux-x64': { target: 'x86_64-unknown-linux-gnu', binary: 'pi-session-cli' },
  'linux-arm64': { target: 'aarch64-unknown-linux-gnu', binary: 'pi-session-cli' },
  'windows-x64': { target: 'x86_64-pc-windows-msvc', binary: 'pi-session-cli.exe' },
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: false,
    ...options,
  })

  if (result.error) {
    throw result.error
  }
  if (typeof result.status === 'number' && result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
  return result
}

function runOutput(command, args) {
  const result = spawnSync(command, args, {
    encoding: 'utf-8',
    shell: false,
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Command failed: ${command} ${args.join(' ')}`)
  return result.stdout.trim()
}

function getFileHash(filePath) {
  const content = readFileSync(filePath)
  return createHash('sha256').update(content).digest('hex')
}

function getVersion() {
  const pkgJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf-8'))
  return pkgJson.version
}

async function buildFrontend() {
  console.log('→ Building frontend...')
  const usePnpm = existsSync(join(rootDir, 'pnpm-lock.yaml'))

  if (usePnpm) {
    run('pnpm', ['install', '--frozen-lockfile'])
    run('pnpm', ['run', 'build'])
  } else {
    run('npm', ['ci'])
    run('npm', ['run', 'build'])
  }
}

async function buildForTarget(targetKey) {
  const config = TARGETS[targetKey]
  if (!config) {
    throw new Error(`Unknown target: ${targetKey}. Available: ${Object.keys(TARGETS).join(', ')}`)
  }

  console.log(`\n🔨 Building for ${targetKey} (${config.target})...`)

  // Check if target is installed
  try {
    runOutput('rustup', ['target', 'list', '--installed'])
      .split('\n')
      .includes(config.target)
  } catch {
    console.log(`  Installing target ${config.target}...`)
    run('rustup', ['target', 'add', config.target])
  }

  // Build CLI binary
  run('cargo', [
    'build', '--release',
    '--target', config.target,
    '-p', 'pi-session-cli'
  ])

  const binaryPath = join(rootDir, 'target', config.target, 'release', config.binary)
  const sizeMb = (statSync(binaryPath).size / 1024 / 1024).toFixed(1)

  console.log(`  ✓ Binary: ${binaryPath} (${sizeMb}MB)`)

  return { binaryPath, sizeMb }
}

async function packageTarget(targetKey, version) {
  const config = TARGETS[targetKey]
  const { binaryPath } = await buildForTarget(targetKey)

  const distDir = join(rootDir, 'dist-cli')
  if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true })

  const outputName = `pi-session-cli-${targetKey}${targetKey.includes('windows') ? '.exe' : ''}`
  const outputPath = join(distDir, outputName)
  const shaPath = `${outputPath}.sha256`

  // Copy binary
  copyFileSync(binaryPath, outputPath)

  // Generate checksum
  const hash = getFileHash(outputPath)
  writeFileSync(shaPath, `${hash}  ${outputName}\n`)

  console.log(`  ✓ Packaged: ${outputPath}`)
  console.log(`  ✓ Checksum: ${shaPath}`)

  return { outputPath, shaPath }
}

async function buildAll() {
  console.log('📦 Building pi-session-cli for all platforms...')
  console.log('═══════════════════════════════════════')

  // Build frontend once (shared)
  await buildFrontend()

  const version = getVersion()
  const results = {}

  // Build for each target
  for (const targetKey of Object.keys(TARGETS)) {
    try {
      results[targetKey] = await packageTarget(targetKey, version)
    } catch (err) {
      console.error(`  ✗ Failed for ${targetKey}: ${err.message}`)
      results[targetKey] = { error: err.message }
    }
  }

  console.log('\n═══════════════════════════════════════')
  console.log('✅ Build Summary:')
  console.log('')

  for (const [target, result] of Object.entries(results)) {
    if (result.error) {
      console.log(`  ✗ ${target}: ${result.error}`)
    } else {
      const size = (statSync(result.outputPath).size / 1024 / 1024).toFixed(1)
      console.log(`  ✓ ${target}: ${size}MB`)
    }
  }

  console.log('')
  console.log(`Artifacts in: ${join(rootDir, 'dist-cli')}`)
}

async function buildLocal() {
  console.log('📦 Building pi-session-cli (local platform)...')
  console.log('═══════════════════════════════════════')

  await buildFrontend()

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
}

// Main
const args = process.argv.slice(2)

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Pi Session CLI Builder

USAGE:
    node scripts/build-cli.mjs [OPTIONS] [TARGET]

OPTIONS:
    --package    Build and package for all platforms
    --help       Show this help message

TARGETS:
    ${Object.keys(TARGETS).join(', ')}

EXAMPLES:
    # Build for local platform
    node scripts/build-cli.mjs

    # Build for specific target
    node scripts/build-cli.mjs macos-arm64

    # Package all platforms
    node scripts/build-cli.mjs --package
`)
  process.exit(0)
}

if (args.includes('--package')) {
  buildAll().catch(err => {
    console.error('Build failed:', err)
    process.exit(1)
  })
} else if (args.length > 0 && !args[0].startsWith('--')) {
  const target = args[0]
  buildFrontend()
    .then(() => packageTarget(target, getVersion()))
    .then(() => console.log('\n✅ Done'))
    .catch(err => {
      console.error('Build failed:', err)
      process.exit(1)
    })
} else {
  buildLocal().catch(err => {
    console.error('Build failed:', err)
    process.exit(1)
  })
}
