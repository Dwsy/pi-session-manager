import type { PsmPluginConfiguration } from '@pi-session-manager/plugin-sdk'

export const sessionSummaryConfiguration: PsmPluginConfiguration = {
  title: 'AI Session Summary Settings',
  description: 'Controls generation defaults and what the toolbar popover displays.',
  properties: [
    { key: 'provider', title: 'Default provider', description: 'Optional provider override. Leave empty for host auto selection.', type: 'string', default: '' },
    { key: 'model', title: 'Default model', description: 'Optional model override. Leave empty for host auto selection.', type: 'string', default: '' },
    {
      key: 'language',
      title: 'Summary language',
      type: 'select',
      default: 'auto',
      options: [
        { label: 'Auto', value: 'auto' },
        { label: 'English', value: 'en-US' },
        { label: '简体中文', value: 'zh-CN' },
        { label: '日本語', value: 'ja-JP' },
      ],
    },
    { key: 'autoOpenAfterRefresh', title: 'Open result after refresh', type: 'boolean', default: true },
    { key: 'showMetadata', title: 'Show metadata tiles', type: 'boolean', default: true },
    { key: 'showTopics', title: 'Show topics', type: 'boolean', default: true },
    { key: 'showNextSteps', title: 'Show next steps', type: 'boolean', default: true },
    { key: 'showUnresolved', title: 'Show unresolved tasks', type: 'boolean', default: true },
  ],
}
