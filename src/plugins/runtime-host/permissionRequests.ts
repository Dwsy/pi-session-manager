import type { PsmPermission } from '@pi-session-manager/plugin-sdk'

export interface PsmPluginPermissionRequestInput {
  pluginId: string
  pluginName: string
  permission: PsmPermission
  reason?: string
}

export interface PsmPluginPermissionRequest extends PsmPluginPermissionRequestInput {
  id: string
}

interface PendingRequest {
  key: string
  request: PsmPluginPermissionRequest
  resolve: (allowed: boolean) => void
}

export class PsmPluginPermissionRequestCoordinator {
  private active: PendingRequest | null = null
  private queue: PendingRequest[] = []
  private pendingByKey = new Map<string, Promise<boolean>>()
  private listeners = new Set<() => void>()
  private nextId = 1

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  getSnapshot = (): PsmPluginPermissionRequest | null => this.active?.request ?? null

  request(input: PsmPluginPermissionRequestInput): Promise<boolean> {
    const key = `${input.pluginId}:${input.permission}`
    const existing = this.pendingByKey.get(key)
    if (existing) return existing

    const request: PsmPluginPermissionRequest = {
      ...input,
      id: `plugin-permission-${this.nextId++}`,
    }

    const promise = new Promise<boolean>((resolve) => {
      this.queue.push({ key, request, resolve })
      this.drain()
    })

    this.pendingByKey.set(key, promise)
    return promise.finally(() => {
      this.pendingByKey.delete(key)
    })
  }

  respond(id: string, allowed: boolean) {
    if (!this.active || this.active.request.id !== id) return
    const active = this.active
    this.active = null
    active.resolve(allowed)
    this.drain()
    this.notify()
  }

  reset() {
    const active = this.active
    this.active = null
    this.queue.splice(0)
    this.pendingByKey.clear()
    active?.resolve(false)
    this.notify()
  }

  private drain() {
    if (this.active || this.queue.length === 0) return
    this.active = this.queue.shift() ?? null
    this.notify()
  }

  private notify() {
    for (const listener of this.listeners) listener()
  }
}

export const psmPluginPermissionRequests = new PsmPluginPermissionRequestCoordinator()
