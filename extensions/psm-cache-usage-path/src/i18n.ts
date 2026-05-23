import type { PsmPluginI18nResources } from '../../../packages/runtime-sdk/src'

export const cacheUsageI18n: PsmPluginI18nResources = {
  'en-US': {
    session: {
      cacheUsage: {
        title: 'Cache usage',
        shortLabel: 'Cache',
        activeBranch: 'Active branch',
        latestBranch: 'Latest branch',
        wholeTree: 'Whole tree',
        spread: 'Spread',
        formula: 'cacheRead / (input + cacheRead + cacheWrite)',
        activeBranchHint: 'Active branch follows the entry currently selected in the viewer.',
        branchHint: 'Latest branch is inferred from the newest message lineage in this session file.',
        loading: 'Loading cache usage...',
        empty: 'No assistant usage metrics found in this session.',
        tabs: {
          trend: 'Trend',
          stats: 'Stats',
          recent: 'Recent',
        },
        views: {
          perTurn: 'Per-turn %',
          cumulativePercent: 'Cum %',
          cumulativeTotal: 'Cum total',
        },
        summary: {
          assistantTurns: 'Assistant turns',
          latest: 'Latest',
          min: 'Min',
          max: 'Max',
          turns: 'Turns',
        },
        stats: {
          activeBranch: 'Latest branch',
          wholeTree: 'Whole tree',
          delta: 'Delta',
          input: 'Input (uncached)',
          output: 'Output',
          cacheRead: 'Cache hit',
          cacheWrite: 'Cache write',
          promptTotal: 'Prompt total',
          tokenTotal: 'Token total',
          assistantMessages: 'Assistant turns',
        },
        recentTurns: 'Recent {{count}} turns',
        noRecentTurns: 'No recent assistant turns.',
        branchBadge: 'Latest branch',
        sequence: '#{{value}}',
        modelFallback: 'assistant',
        close: 'Close cache usage panel',
        refresh: 'Refresh cache usage',
      },
    },
    plugins: {
      path: {
        example: {
          'cache-usage': {
            configuration: {
              title: 'Cache Usage',
              description: 'Show cache hit trends, branch vs tree totals, and recent assistant cache metrics.',
            },
            settings: {
              recentTurns: {
                title: 'Recent turns',
                description: 'How many recent assistant turns to show in the recent list.',
              },
            },
          },
        },
      },
    },
  },
  'zh-CN': {
    session: {
      cacheUsage: {
        title: '缓存使用',
        shortLabel: 'Cache',
        activeBranch: '当前分支',
        latestBranch: '最新分支',
        wholeTree: '整棵树',
        spread: '差值',
        formula: 'cacheRead / (input + cacheRead + cacheWrite)',
        activeBranchHint: '“当前分支”跟随会话查看器当前选中的节点。',
        branchHint: '“最新分支”依据当前会话文件中最新消息的父链推导。',
        loading: '正在加载缓存使用...',
        empty: '当前会话没有可用的 assistant usage 指标。',
        tabs: {
          trend: '趋势',
          stats: '统计',
          recent: '最近',
        },
        views: {
          perTurn: '单轮 %',
          cumulativePercent: '累计 %',
          cumulativeTotal: '累计量',
        },
        summary: {
          assistantTurns: '助手轮次',
          latest: '最新',
          min: '最小',
          max: '最大',
          turns: '轮次',
        },
        stats: {
          activeBranch: '最新分支',
          wholeTree: '整棵树',
          delta: '差值',
          input: '输入（未命中）',
          output: '输出',
          cacheRead: '缓存命中',
          cacheWrite: '缓存写入',
          promptTotal: 'Prompt 总量',
          tokenTotal: 'Token 总量',
          assistantMessages: '助手轮次',
        },
        recentTurns: '最近 {{count}} 轮',
        noRecentTurns: '暂无最近 assistant 轮次。',
        branchBadge: '最新分支',
        sequence: '#{{value}}',
        modelFallback: 'assistant',
        close: '关闭缓存面板',
        refresh: '刷新缓存使用',
      },
    },
    plugins: {
      path: {
        example: {
          'cache-usage': {
            configuration: {
              title: '缓存使用',
              description: '展示缓存命中趋势、分支/整树对比，以及最近 assistant 缓存指标。',
            },
            settings: {
              recentTurns: {
                title: '最近轮次',
                description: '最近列表里展示多少条 assistant 轮次。',
              },
            },
          },
        },
      },
    },
  },
}
