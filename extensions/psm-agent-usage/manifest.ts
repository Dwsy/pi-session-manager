import type { PsmPluginManifest } from '@pi-session-manager/plugin-sdk'

export const manifest: PsmPluginManifest = {
  manifestVersion: 1,
  id: 'builtin.agent-usage',
  name: 'Agent Usage',
  version: '0.1.0',
  defaultEnabled: false,
  runtime: {
    sdk: '^0.1.0',
    host: '>=0.6.3',
  },
  permissions: ['usage:read', 'config:read', 'config:write'],
  configuration: {
    title: 'Agent Usage',
    description: 'Local agent subscription usage status. Requires explicit usage:read grant.',
    properties: [
      {
        key: 'includeUnavailable',
        type: 'boolean',
        title: 'Show unavailable providers',
        description: 'Keep providers without credentials or data visible in the list.',
        default: true,
      },
    ],
  },
  i18n: {
    'en-US': {
      plugins: {
        agentUsage: {
          title: 'Agent Usage',
          refresh: 'Refresh',
          refreshing: 'Refreshing…',
          empty: 'No usage data yet. Click Refresh after granting usage:read.',
          plan: 'Plan',
          updated: 'Updated {{time}}',
          grantHint: 'Enable this plugin and grant the Agent usage permission in Settings → PSM Plugins.',
          sidebarTitle: 'Agent Usage List',
          mainHint: 'Provider usage is listed in the left sidebar. Select a provider to inspect quota details.',
          inactiveHint: 'Open this view to load agent subscription usage in the left sidebar.',
        },
      },
    },
    'zh-CN': {
      plugins: {
        agentUsage: {
          title: 'Agent 订阅用量',
          refresh: '刷新',
          refreshing: '刷新中…',
          empty: '暂无用量数据。授权 usage:read 后点击刷新。',
          plan: '套餐',
          updated: '更新于 {{time}}',
          grantHint: '请先启用插件，并在「设置 → PSM Plugins」中授予 Agent usage 权限。',
          sidebarTitle: 'Agent 用量列表',
          mainHint: '用量列表在左侧栏。选择提供商可查看额度明细。',
          inactiveHint: '打开此视图后，左侧栏会自动加载订阅用量。',
        },
      },
    },
  },
}
