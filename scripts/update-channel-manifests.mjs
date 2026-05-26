#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const channelConfig = JSON.parse(readFileSync(join(rootDir, 'src/runtime-data/update-channels.json'), 'utf8'))

function parseArgs(argv) {
  const [command, sourcePath, outputDir, versionTag] = argv
  if (command !== 'prepare') {
    throw new Error('Usage: node scripts/update-channel-manifests.mjs prepare <source-latest.json> <output-dir> <tag>')
  }
  if (!sourcePath || !outputDir || !versionTag) {
    throw new Error('Missing required arguments: <source-latest.json> <output-dir> <tag>')
  }
  return { sourcePath, outputDir, versionTag }
}

function normalizeVersionTag(tag) {
  return tag.trim().replace(/^v/i, '')
}

function isPrereleaseVersion(tag) {
  const version = normalizeVersionTag(tag)
  return ['-alpha', '-beta', '-rc'].some((marker) => version.includes(marker))
}

function channelManifestPath(channel) {
  const entry = channelConfig.channels?.[channel]
  if (!entry?.manifestPath) {
    throw new Error(`Unknown channel: ${channel}`)
  }
  return entry.manifestPath
}

function ensureParentDir(outputPath) {
  mkdirSync(dirname(outputPath), { recursive: true })
}

function copyManifest(sourcePath, outputDir, channel) {
  const relativePath = channelManifestPath(channel)
  const targetPath = join(outputDir, relativePath)
  ensureParentDir(targetPath)
  cpSync(sourcePath, targetPath)
  return targetPath
}

function main() {
  const { sourcePath, outputDir, versionTag } = parseArgs(process.argv.slice(2))
  if (!existsSync(sourcePath)) {
    throw new Error(`Source manifest not found: ${sourcePath}`)
  }

  const outputs = []
  outputs.push(copyManifest(sourcePath, outputDir, 'beta'))

  if (!isPrereleaseVersion(versionTag)) {
    outputs.push(copyManifest(sourcePath, outputDir, 'stable'))
  }

  console.log(JSON.stringify({
    tag: versionTag,
    prerelease: isPrereleaseVersion(versionTag),
    outputs,
  }, null, 2))
}

main()
