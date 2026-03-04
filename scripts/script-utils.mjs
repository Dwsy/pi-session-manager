#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, platform as osPlatform } from 'node:os'
import crypto from 'node:crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
export const projectRoot = resolve(__dirname, '..')

export function resolveFromRoot(...parts) {
  return resolve(projectRoot, ...parts)
}

export function log(line = '') {
  console.log(line)
}

export function header(title) {
  log(title)
  log('='.repeat(Math.max(20, title.length)))
  log()
}

export function run(cmd, args = [], options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd ?? projectRoot,
    stdio: options.stdio ?? 'inherit',
    shell: false,
    encoding: options.encoding ?? 'utf8',
    env: options.env ?? process.env,
  })

  if (result.error) {
    throw result.error
  }
  return result
}

export function runChecked(cmd, args = [], options = {}) {
  const result = run(cmd, args, options)
  if (result.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with exit code ${result.status}`)
  }
  return result
}

export function runCapture(cmd, args = [], options = {}) {
  const result = run(cmd, args, { ...options, stdio: 'pipe' })
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function commandNameCandidates(name) {
  if (osPlatform() !== 'win32') return [name]
  if (/\.[A-Za-z0-9]+$/.test(name)) return [name]
  const pathExt = process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD'
  const exts = pathExt.split(';').map((item) => item.trim()).filter(Boolean)
  return [...exts.map((ext) => `${name}${ext}`), name]
}

export function commandExists(command) {
  if (!command) return false
  const explicit = command.includes('/') || command.includes('\\')
  if (explicit) return existsSync(command)

  const pathValue = process.env.PATH || ''
  const sep = osPlatform() === 'win32' ? ';' : ':'
  const dirs = pathValue.split(sep).filter(Boolean)
  const candidates = commandNameCandidates(command)

  return dirs.some((dir) => candidates.some((candidate) => existsSync(join(dir, candidate))))
}

export function checkFiles(files) {
  let ok = true
  for (const file of files) {
    const fullPath = resolveFromRoot(file)
    if (existsSync(fullPath)) {
      log(`✅ ${file}`)
    } else {
      log(`❌ ${file} (不存在)`)
      ok = false
    }
  }
  return ok
}

export function fileContains(file, needle) {
  const fullPath = resolveFromRoot(file)
  if (!existsSync(fullPath)) return false
  const content = readFileSync(fullPath, 'utf8')
  if (needle instanceof RegExp) return needle.test(content)
  return content.includes(needle)
}

export function checkContains(file, needle, okMessage, failMessage, options = {}) {
  const found = fileContains(file, needle)
  if (found) {
    log(`✅ ${okMessage}`)
  } else {
    log(`❌ ${failMessage}`)
    if (options.exitOnFail) {
      process.exit(1)
    }
  }
  return found
}

export function formatFileSize(size) {
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(1)} MB`
}

export function openFileInSystem(targetPath) {
  if (osPlatform() === 'darwin') {
    return run('open', [targetPath]).status === 0
  }
  if (osPlatform() === 'win32') {
    return run('cmd', ['/c', 'start', '', targetPath], { shell: true }).status === 0
  }
  return run('xdg-open', [targetPath]).status === 0
}

export function firstFileByExtension(rootDir, extension) {
  if (!existsSync(rootDir)) return null

  const stack = [rootDir]
  while (stack.length > 0) {
    const current = stack.pop()
    if (!current) continue

    const entries = readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const full = join(current, entry.name)
      if (entry.isDirectory()) {
        stack.push(full)
      } else if (entry.isFile() && extname(entry.name).toLowerCase() === extension.toLowerCase()) {
        return full
      }
    }
  }

  return null
}

export function nowUnixSeconds() {
  return Math.floor(Date.now() / 1000)
}

export function timestampForFilename(date = new Date()) {
  const pad = (num) => String(num).padStart(2, '0')
  const yyyy = date.getFullYear()
  const mm = pad(date.getMonth() + 1)
  const dd = pad(date.getDate())
  const hh = pad(date.getHours())
  const min = pad(date.getMinutes())
  const ss = pad(date.getSeconds())
  return `${yyyy}-${mm}-${dd}T${hh}-${min}-${ss}`
}

export function randomId() {
  return crypto.randomUUID()
}

export async function sleep(ms) {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

export async function ensureDir(dirPath) {
  await mkdir(dirPath, { recursive: true })
}

export async function writeTextFile(filePath, content) {
  await writeFile(filePath, content, 'utf8')
}

export async function removePath(pathToRemove) {
  await rm(pathToRemove, { recursive: true, force: true })
}

export function userHome() {
  return process.env.HOME || process.env.USERPROFILE || homedir()
}

export function fileSize(path) {
  return statSync(path).size
}
