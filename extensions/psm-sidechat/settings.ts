import type { PsmPluginConfiguration } from '@pi-session-manager/plugin-sdk'

export const sidechatConfiguration: PsmPluginConfiguration = {
  title: 'Sidechat Settings',
  description: 'Defaults used by the session sidechat panel and sidechat command.',
  properties: [
    { key: 'provider', title: 'Default provider', description: 'Optional provider override. Leave empty for host auto selection.', type: 'string', default: '' },
    { key: 'model', title: 'Default model', description: 'Optional model override. Leave empty for host auto selection.', type: 'string', default: '' },
    {
      key: 'thinkingLevel',
      title: 'Thinking level',
      type: 'select',
      default: 'medium',
      options: [
        { label: 'Off', value: 'off' },
        { label: 'Minimal', value: 'minimal' },
        { label: 'Low', value: 'low' },
        { label: 'Medium', value: 'medium' },
        { label: 'High', value: 'high' },
        { label: 'X High', value: 'xhigh' },
      ],
    },
    { key: 'snippetLimit', title: 'Snippet limit', description: 'How many citations/snippets to retrieve for each answer.', type: 'number', default: 8, min: 4, max: 12, step: 1 },
    { key: 'panelWidth', title: 'Panel width', description: 'Default right panel width in pixels.', type: 'number', default: 380, min: 320, max: 640, step: 20 },
    { key: 'optionsExpanded', title: 'Show options by default', type: 'boolean', default: false },
    { key: 'showQuickPrompts', title: 'Show quick prompts', type: 'boolean', default: true },
  ],
}
