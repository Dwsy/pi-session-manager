import type { PsmPermission } from '@pi-session-manager/plugin-sdk'

export const PSM_PERMISSION_META: Record<PsmPermission, { label: string; description: string }> = {
  'sessions:read': {
    label: 'Sessions',
    description: 'Read session metadata and entries',
  },
  'records:read': {
    label: 'Read records',
    description: 'Read plugin-owned records',
  },
  'records:write': {
    label: 'Write records',
    description: 'Create or update plugin records',
  },
  'search:read': {
    label: 'Search',
    description: 'Run full-text search through PSM',
  },
  'tags:read': {
    label: 'Read tags',
    description: 'Read tags and session tag links',
  },
  'tags:write': {
    label: 'Write tags',
    description: 'Create tags and assign them to sessions',
  },
  'config:read': {
    label: 'Read config',
    description: 'Read plugin-scoped JSON config',
  },
  'config:write': {
    label: 'Write config',
    description: 'Write plugin-scoped JSON config',
  },
  'events:read': {
    label: 'Events',
    description: 'Subscribe to host runtime events',
  },
  'model:invoke': {
    label: 'Models',
    description: 'Invoke host-managed model calls',
  },
  'agent:invoke': {
    label: 'Agent',
    description: 'Create and run host-managed agent sessions',
  },
  'fs:read': {
    label: 'Files',
    description: 'Read files through declared restricted roots',
  },
  'windows:open': {
    label: 'Windows',
    description: 'Open host-managed popup windows',
  },
}

export function permissionLabel(permission: PsmPermission) {
  return PSM_PERMISSION_META[permission]?.label ?? permission
}

export function permissionDescription(permission: PsmPermission) {
  return PSM_PERMISSION_META[permission]?.description ?? permission
}

export function requiredRuntimeRequestPermissions(command: string): PsmPermission[] {
  switch (command) {
    case 'plugin_fs_roots':
    case 'plugin_fs_list':
    case 'plugin_fs_read':
    case 'plugin_fs_stat':
      return ['fs:read']
    case 'plugin_window_open':
    case 'plugin_window_close':
      return ['windows:open']
    default:
      return []
  }
}
