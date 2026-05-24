import type { PsmPluginLoadEntry } from './types'

const builtinModules = import.meta.glob([
  '../../../extensions/psm-*/index.{ts,tsx}',
  '!../../../extensions/psm-word-cloud/index.{ts,tsx}',
])

function sourceIdFromModulePath(modulePath: string) {
  const match = modulePath.match(/(?:^|\/)(extensions\/psm-[^/]+)\/index\.(?:ts|tsx)$/)
  return match?.[1] ?? modulePath
}

export const builtinPsmPluginEntries: PsmPluginLoadEntry[] = Object.entries(builtinModules)
  .map(([modulePath, load]): PsmPluginLoadEntry => ({
    source: 'builtin',
    sourceId: sourceIdFromModulePath(modulePath),
    load,
  }))
  .sort((a, b) => a.sourceId.localeCompare(b.sourceId))
