import type { PsmSessionEntryTransformerRegistration } from '@pi-session-manager/plugin-sdk'

export interface PsmSessionEntryTransformerRuntimeRegistration extends PsmSessionEntryTransformerRegistration {
  pluginId: string
}

class PsmSessionEntryTransformerRegistry {
  private transformers = new Map<string, PsmSessionEntryTransformerRuntimeRegistration>()
  private sortedCache: PsmSessionEntryTransformerRuntimeRegistration[] | null = null

  register(transformer: PsmSessionEntryTransformerRuntimeRegistration): void {
    if (this.transformers.has(transformer.id)) return
    this.transformers.set(transformer.id, transformer)
    this.sortedCache = null
  }

  unregister(id: string): void {
    if (!this.transformers.delete(id)) return
    this.sortedCache = null
  }

  apply<TEntry>(entries: TEntry[]): TEntry[] {
    let current: unknown[] = entries as unknown[]

    for (const transformer of this.sorted()) {
      try {
        current = transformer.transform(current)
      } catch (error) {
        console.warn(`[PSM] Session entry transformer failed: ${transformer.id}`, error)
      }
    }

    return current as TEntry[]
  }

  private sorted(): PsmSessionEntryTransformerRuntimeRegistration[] {
    if (!this.sortedCache) {
      this.sortedCache = Array.from(this.transformers.values())
        .sort((a, b) => (b.priority ?? 50) - (a.priority ?? 50))
    }

    return this.sortedCache
  }
}

export const sessionEntryTransformers = new PsmSessionEntryTransformerRegistry()

export function applySessionEntryTransformers<TEntry>(entries: TEntry[]): TEntry[] {
  return sessionEntryTransformers.apply(entries)
}
