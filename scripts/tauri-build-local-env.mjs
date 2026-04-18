import { existsSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, isAbsolute, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const defaultEnvFile = '.env.tauri-signing.local'

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function parseEnvFile(filePath) {
  const content = readFileSync(filePath, 'utf8')
  const parsed = {}

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue

    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) continue

    const key = line.slice(0, separatorIndex).trim()
    const value = stripWrappingQuotes(line.slice(separatorIndex + 1).trim())

    if (key) {
      parsed[key] = value
    }
  }

  return parsed
}

function resolveLocalPath(value) {
  if (!value) return null
  return isAbsolute(value) ? value : resolve(rootDir, value)
}

function loadSigningEnv(envFile) {
  const envFilePath = resolveLocalPath(envFile)
  if (!envFilePath || !existsSync(envFilePath)) {
    console.error(`Missing local signing env file: ${envFilePath ?? envFile}`)
    console.error(`Create it from ${defaultEnvFile}.example and fill in your local secrets.`)
    process.exit(1)
  }

  const loaded = parseEnvFile(envFilePath)

  if (!loaded.TAURI_SIGNING_PRIVATE_KEY && loaded.TAURI_SIGNING_PRIVATE_KEY_PATH) {
    const keyPath = resolveLocalPath(loaded.TAURI_SIGNING_PRIVATE_KEY_PATH)
    if (!keyPath || !existsSync(keyPath)) {
      console.error(`Private key file does not exist: ${keyPath ?? loaded.TAURI_SIGNING_PRIVATE_KEY_PATH}`)
      process.exit(1)
    }
    loaded.TAURI_SIGNING_PRIVATE_KEY = readFileSync(keyPath, 'utf8')
  }

  if (!loaded.TAURI_SIGNING_PRIVATE_KEY) {
    console.error(
      'Local signing env must define TAURI_SIGNING_PRIVATE_KEY or TAURI_SIGNING_PRIVATE_KEY_PATH.',
    )
    process.exit(1)
  }

  return loaded
}

function findArgValue(args, name) {
  const index = args.indexOf(name)
  if (index === -1) return null
  if (index + 1 >= args.length) {
    console.error(`Missing value for ${name}`)
    process.exit(1)
  }
  return args[index + 1]
}

function omitArgPair(args, name) {
  const index = args.indexOf(name)
  if (index === -1) return args
  return args.filter((_, i) => i !== index && i !== index + 1)
}

const rawArgs = process.argv.slice(2)
const envFile = findArgValue(rawArgs, '--env-file') ?? defaultEnvFile
const passthroughArgs = omitArgPair(rawArgs, '--env-file')
const loadedEnv = loadSigningEnv(envFile)

const tauriBin = resolve(
  rootDir,
  'node_modules',
  '.bin',
  process.platform === 'win32' ? 'tauri.cmd' : 'tauri',
)

if (!existsSync(tauriBin)) {
  console.error(`Tauri CLI not found: ${tauriBin}`)
  console.error('Run your package manager install first.')
  process.exit(1)
}

const result = spawnSync(tauriBin, ['build', ...passthroughArgs], {
  cwd: rootDir,
  env: {
    ...process.env,
    ...loadedEnv,
  },
  stdio: 'inherit',
})

if (typeof result.status === 'number') {
  process.exit(result.status)
}

console.error(result.error?.message ?? 'Failed to run tauri build')
process.exit(1)
