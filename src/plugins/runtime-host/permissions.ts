import type { PsmPermission } from '@dwsy/plugin-sdk'

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
  'live-agents:read': {
    label: 'Live agents',
    description: 'Read lightweight status summaries for online Pi Agent sessions',
  },
  'openbot:read': {
    label: 'OpenBot agents',
    description: 'Read local OpenBot agent names and avatars for project labels',
  },
  'projects:read': {
    label: 'Project detection',
    description: 'Detect project types from marker files in known project directories',
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
  'system-prompts:read': {
    label: 'System prompts',
    description: 'Read recorded Pi system prompt history',
  },
  'windows:open': {
    label: 'Windows',
    description: 'Open host-managed popup windows',
  },
  'usage:read': {
    label: 'Agent usage',
    description: 'Read local agent login credentials and fetch read-only subscription usage',
  },
  'terminal:read': {
    label: 'Terminal history',
    description: 'Read persisted PSM terminal transcripts',
  },
  'terminal:open': {
    label: 'Open terminal',
    description: 'Open a host-managed terminal at a selected working directory',
  },
  'mesh:read': {
    label: 'Mesh peers',
    description: 'Read peers from the existing backend-local Mesh Hub',
  },
  'mesh:control': {
    label: 'Mesh control',
    description: 'Send, cancel and follow only via the backend-local Mesh Hub',
  },
}

export function permissionLabel(permission: PsmPermission) {
  return PSM_PERMISSION_META[permission]?.label ?? permission
}

export function permissionDescription(permission: PsmPermission) {
  return PSM_PERMISSION_META[permission]?.description ?? permission
}

export function requiredRuntimeRequestPermissions(
  command: string,
  payload?: Record<string, unknown>,
  declaredPermissions: PsmPermission[] = [],
): PsmPermission[] {
  switch (command) {
    case 'plugin_fs_roots':
      return declaredPermissions.includes('system-prompts:read') && !declaredPermissions.includes('fs:read')
        ? ['system-prompts:read']
        : ['fs:read']
    case 'plugin_fs_list':
    case 'plugin_fs_read':
    case 'plugin_fs_stat':
      return [payload?.rootId === 'system-prompts' || payload?.root_id === 'system-prompts' ? 'system-prompts:read' : 'fs:read']
    case 'plugin_window_open':
    case 'plugin_window_close':
      return ['windows:open']
    case 'get_agent_usage_status':
      return ['usage:read']
    case 'plugin_terminal_history_list':
    case 'plugin_terminal_history_read':
      return ['terminal:read']
    case 'plugin_live_agents_list':
      return ['live-agents:read']
    case 'plugin_openbot_agents_list':
      return ['openbot:read']
    case 'plugin_project_detect':
      return ['projects:read']
    case 'plugin_terminal_open':
      return ['terminal:open']
    case 'plugin_mesh_peers':
    case 'plugin_mesh_herdr_agents':
      return ['mesh:read']
    case 'plugin_mesh_message':
    case 'plugin_mesh_cancel':
    case 'plugin_mesh_follow':
    case 'plugin_mesh_focus':
      return ['mesh:control']
    case 'get_session_by_path':
    case 'get_session_system_prompt_snapshots':
      return ['sessions:read']
    default:
      return []
  }
}
