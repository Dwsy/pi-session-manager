/**
 * Single source of truth for update checking and background installation.
 *
 * The desktop updater replaces the installed bundle in place while the old
 * build keeps running, so a completed install latches the service into
 * `pending-restart` and halts further checks. Without that latch every
 * scheduled tick would re-download the same build, because the running
 * process still reports the pre-update version.
 */

import { useSyncExternalStore } from 'react'

import { isTauri } from '@/transport'
import { checkAppUpdate, downloadAndInstallAppUpdate, restartApp } from './appUpdater'
import {
  compareVersions,
  getCurrentAppVersion,
  getLastUpdateCheckAt,
  type AvailableUpdateInfo,
} from './updateChecker'
import { normalizeUpdateChannel, type UpdateChannel } from './updateChannel'

export const UPDATE_CHECK_INTERVAL_MS = 30 * 60 * 1000
const MIN_AUTO_CHECK_GAP_MS = 10 * 60 * 1000
const PENDING_RESTART_KEY = 'psm.update.pendingRestart'

export type UpdateStatus =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date'; currentVersion: string }
  | { kind: 'available'; update: AvailableUpdateInfo }
  | { kind: 'installing'; update: AvailableUpdateInfo; progress: number }
  | { kind: 'pending-restart'; channel: UpdateChannel; version: string }
  | { kind: 'error'; message: string }

export interface UpdateSnapshot {
  status: UpdateStatus
  lastCheckedAt: string | null
}

/** What the update toast should surface, if anything. */
export type UpdateNotice =
  | { kind: 'available'; update: AvailableUpdateInfo }
  | { kind: 'ready'; channel: UpdateChannel; version: string }

export interface UpdateServiceConfig {
  channel: UpdateChannel
  autoCheck: boolean
}

interface PendingRestart {
  channel: UpdateChannel
  version: string
}

const listeners = new Set<() => void>()

let config: UpdateServiceConfig | null = null
let snapshot: UpdateSnapshot = { status: restorePendingRestart(), lastCheckedAt: null }
let intervalId: ReturnType<typeof setInterval> | null = null
let runtimeListenersBound = false
let inFlight: Promise<void> | null = null

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Ignore localStorage errors.
  }
}

function removeKey(key: string): void {
  try {
    localStorage.removeItem(key)
  } catch {
    // Ignore localStorage errors.
  }
}

function restorePendingRestart(): UpdateStatus {
  const stored = readJson<Partial<PendingRestart>>(PENDING_RESTART_KEY)
  if (!stored?.version) return { kind: 'idle' }

  // Already running the installed build, so the reminder is stale.
  if (compareVersions(getCurrentAppVersion(), stored.version) >= 0) {
    removeKey(PENDING_RESTART_KEY)
    return { kind: 'idle' }
  }

  return {
    kind: 'pending-restart',
    channel: normalizeUpdateChannel(stored.channel),
    version: stored.version,
  }
}

function emit(): void {
  for (const listener of listeners) {
    listener()
  }
}

function patch(next: Partial<UpdateSnapshot>): void {
  snapshot = { ...snapshot, ...next }
  emit()
}

function setStatus(status: UpdateStatus): void {
  patch({ status })
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): UpdateSnapshot {
  return snapshot
}

export function useUpdateSnapshot(): UpdateSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

function isWindowsRuntime(): boolean {
  if (typeof navigator === 'undefined') return false
  // Anchored on full tokens: a bare /win/i also matches "darwin".
  return /Windows|Win32|Win64/i.test(`${navigator.userAgent || ''} ${navigator.platform || ''}`)
}

/** In-app download and install is only wired up for the desktop runtime. */
export function canInstallInApp(): boolean {
  return isTauri()
}

// Windows installers terminate the running process, so an unattended install
// is indistinguishable from a crash. Require an explicit click there.
function canInstallSilently(): boolean {
  return canInstallInApp() && !isWindowsRuntime()
}

function isWithinAutoCheckGap(channel: UpdateChannel): boolean {
  const lastCheckedAt = getLastUpdateCheckAt(channel)
  if (!lastCheckedAt) return false
  const lastTime = new Date(lastCheckedAt).getTime()
  if (Number.isNaN(lastTime)) return false
  return Date.now() - lastTime < MIN_AUTO_CHECK_GAP_MS
}

function toMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'string' && error) return error
  return fallback
}

async function installUpdate(channel: UpdateChannel, update: AvailableUpdateInfo): Promise<void> {
  setStatus({ kind: 'installing', update, progress: 0 })

  try {
    await downloadAndInstallAppUpdate(channel, ({ progress }) => {
      if (snapshot.status.kind !== 'installing') return
      setStatus({ kind: 'installing', update, progress })
    })
  } catch (error) {
    setStatus({ kind: 'error', message: toMessage(error, 'Update installation failed') })
    return
  }

  const pending: PendingRestart = { channel, version: update.latestVersion }
  writeJson(PENDING_RESTART_KEY, pending)
  setStatus({ kind: 'pending-restart', ...pending })
}

async function executeCheck(channel: UpdateChannel): Promise<void> {
  setStatus({ kind: 'checking' })

  let update: AvailableUpdateInfo | null
  try {
    update = await checkAppUpdate(channel)
  } catch (error) {
    patch({
      status: { kind: 'error', message: toMessage(error, 'Update check failed') },
      lastCheckedAt: getLastUpdateCheckAt(channel),
    })
    return
  }

  patch({ lastCheckedAt: getLastUpdateCheckAt(channel) })

  if (!update) {
    setStatus({ kind: 'up-to-date', currentVersion: getCurrentAppVersion() })
    return
  }

  if (!canInstallSilently()) {
    setStatus({ kind: 'available', update })
    return
  }

  await installUpdate(channel, update)
}

export function runUpdateCheck(options: { manual?: boolean } = {}): Promise<void> {
  const manual = options.manual === true
  const active = config
  if (!active) return Promise.resolve()
  if (snapshot.status.kind === 'pending-restart') return Promise.resolve()
  if (inFlight) return inFlight
  if (!manual && (!active.autoCheck || isWithinAutoCheckGap(active.channel))) {
    return Promise.resolve()
  }

  const run = executeCheck(active.channel).finally(() => {
    inFlight = null
  })
  inFlight = run
  return run
}

export function installAvailableUpdate(): Promise<void> {
  const active = config
  const { status } = snapshot
  if (!active || status.kind !== 'available') return Promise.resolve()
  if (inFlight) return inFlight

  const run = installUpdate(active.channel, status.update).finally(() => {
    inFlight = null
  })
  inFlight = run
  return run
}

export async function restartForUpdate(): Promise<void> {
  try {
    await restartApp()
  } catch (error) {
    setStatus({ kind: 'error', message: toMessage(error, 'Restart failed') })
  }
}

function handleRuntimeActive(): void {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
  void runUpdateCheck()
}

function bindRuntimeListeners(): void {
  if (runtimeListenersBound) return
  runtimeListenersBound = true
  window.addEventListener('focus', handleRuntimeActive)
  window.addEventListener('online', handleRuntimeActive)
  document.addEventListener('visibilitychange', handleRuntimeActive)
}

function rearmSchedule(): void {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
  if (typeof window === 'undefined') return
  if (!config?.autoCheck) return

  intervalId = setInterval(() => {
    void runUpdateCheck()
  }, UPDATE_CHECK_INTERVAL_MS)
  bindRuntimeListeners()
}

export function configureUpdateService(next: UpdateServiceConfig): void {
  const previous = config
  config = next
  if (previous && previous.channel === next.channel && previous.autoCheck === next.autoCheck) {
    return
  }

  const channelSwitched = previous !== null && previous.channel !== next.channel
  if (!previous || channelSwitched) {
    // A discovered update only describes the channel it came from.
    const status: UpdateStatus =
      channelSwitched && snapshot.status.kind !== 'pending-restart'
        ? { kind: 'idle' }
        : snapshot.status
    patch({ status, lastCheckedAt: getLastUpdateCheckAt(next.channel) })
  }

  rearmSchedule()
  void runUpdateCheck()
}

/** Test-only: drop scheduling and state so each case starts from a clean store. */
export function resetUpdateService(): void {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
  config = null
  inFlight = null
  removeKey(PENDING_RESTART_KEY)
  snapshot = { status: { kind: 'idle' }, lastCheckedAt: null }
  emit()
}
