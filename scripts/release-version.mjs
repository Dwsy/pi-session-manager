#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')

function normalizeVersion(value) {
  return value.trim().replace(/^v/i, '')
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(join(rootDir, relativePath), 'utf8'))
}

function writeJson(relativePath, value) {
  writeFileSync(join(rootDir, relativePath), JSON.stringify(value, null, 2) + '\n')
}

function readText(relativePath) {
  return readFileSync(join(rootDir, relativePath), 'utf8')
}

function writeText(relativePath, value) {
  writeFileSync(join(rootDir, relativePath), value)
}

function replaceCargoVersion(source, version) {
  return source.replace(/(\[package\][\s\S]*?^version = )"[^"]+"/m, `$1"${version}"`)
}

function extractCargoVersion(source, file) {
  const match = source.match(/\[package\][\s\S]*?^version = "([^"]+)"/m)
  if (!match) {
    throw new Error(`Unable to find package version in ${file}`)
  }
  return match[1]
}

function collectVersions() {
  const packageJson = readJson('package.json')
  const packageLock = readJson('package-lock.json')
  const tauriConfig = readJson('src-tauri/tauri.conf.json')
  const desktopCargoText = readText('src-tauri/Cargo.toml')
  const cliCargoText = readText('src-tauri-cli/Cargo.toml')

  return {
    'package.json': packageJson.version,
    'package-lock.json': packageLock.version,
    'package-lock.json#packages[""]': packageLock.packages?.['']?.version ?? '',
    'src-tauri/Cargo.toml': extractCargoVersion(desktopCargoText, 'src-tauri/Cargo.toml'),
    'src-tauri-cli/Cargo.toml': extractCargoVersion(cliCargoText, 'src-tauri-cli/Cargo.toml'),
    'src-tauri/tauri.conf.json': tauriConfig.version,
  }
}

function syncToVersion(rawVersion) {
  const version = normalizeVersion(rawVersion)
  const packageJson = readJson('package.json')
  packageJson.version = version
  writeJson('package.json', packageJson)

  const packageLock = readJson('package-lock.json')
  packageLock.version = version
  if (!packageLock.packages) {
    packageLock.packages = {}
  }
  if (!packageLock.packages['']) {
    packageLock.packages[''] = {}
  }
  packageLock.packages[''].version = version
  writeJson('package-lock.json', packageLock)

  const desktopCargoText = readText('src-tauri/Cargo.toml')
  writeText('src-tauri/Cargo.toml', replaceCargoVersion(desktopCargoText, version))

  const cliCargoText = readText('src-tauri-cli/Cargo.toml')
  writeText('src-tauri-cli/Cargo.toml', replaceCargoVersion(cliCargoText, version))

  const tauriConfigText = readText('src-tauri/tauri.conf.json')
  writeText(
    'src-tauri/tauri.conf.json',
    tauriConfigText.replace(/("version":\s*")([^"]+)(")/, `$1${version}$3`)
  )
}

function printVersions(versions) {
  const rows = Object.entries(versions)
  const width = Math.max(...rows.map(([name]) => name.length))
  for (const [name, version] of rows) {
    console.log(`${name.padEnd(width)}  ${version}`)
  }
}

function main() {
  const [command = 'check', maybeVersion] = process.argv.slice(2)

  if (command === 'sync') {
    const targetVersion = maybeVersion ? normalizeVersion(maybeVersion) : normalizeVersion(readJson('package.json').version)
    syncToVersion(targetVersion)
    console.log(`Synchronized release metadata to ${targetVersion}`)
    return
  }

  if (command === 'current') {
    console.log(normalizeVersion(readJson('package.json').version))
    return
  }

  if (command !== 'check') {
    throw new Error(`Unknown command: ${command}`)
  }

  const versions = collectVersions()
  const expectedVersion = maybeVersion ? normalizeVersion(maybeVersion) : normalizeVersion(readJson('package.json').version)
  const mismatches = Object.entries(versions).filter(([, version]) => normalizeVersion(version) !== expectedVersion)

  printVersions(versions)

  if (mismatches.length > 0) {
    console.error(`\nVersion mismatch detected. Expected ${expectedVersion}.`)
    process.exitCode = 1
    return
  }

  console.log(`\nAll release version sources are synchronized at ${expectedVersion}.`)
}

main()
