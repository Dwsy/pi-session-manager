import type { PsmPluginLoadEntry } from './types'

export const builtinPsmPluginEntries: PsmPluginLoadEntry[] = [
  {
    source: 'builtin',
    sourceId: 'extensions/psm-ask-user-question-renderer',
    load: () => import('../../../extensions/psm-ask-user-question-renderer/index'),
  },
  {
    source: 'builtin',
    sourceId: 'extensions/psm-loop-renderer',
    load: () => import('../../../extensions/psm-loop-renderer/index'),
  },
  {
    source: 'builtin',
    sourceId: 'extensions/psm-subagent-renderer',
    load: () => import('../../../extensions/psm-subagent-renderer/index'),
  },
  {
    source: 'builtin',
    sourceId: 'extensions/psm-session-summary',
    load: () => import('../../../extensions/psm-session-summary/index'),
  },
  {
    source: 'builtin',
    sourceId: 'extensions/psm-session-graph',
    load: () => import('../../../extensions/psm-session-graph/index'),
  },
  {
    source: 'builtin',
    sourceId: 'extensions/psm-sidechat',
    load: () => import('../../../extensions/psm-sidechat/index'),
  },
  {
    source: 'builtin',
    sourceId: 'extensions/psm-trace',
    load: () => import('../../../extensions/psm-trace/index'),
  },
]
