import type { PsmPluginLoadEntry } from './types'

export const builtinPsmPluginEntries: PsmPluginLoadEntry[] = [
  {
    source: 'builtin',
    sourceId: 'extensions/psm-session-summary',
    load: () => import('../../../extensions/psm-session-summary/index'),
  },
  {
    source: 'builtin',
    sourceId: 'extensions/psm-sidechat',
    load: () => import('../../../extensions/psm-sidechat/index'),
  },
]
