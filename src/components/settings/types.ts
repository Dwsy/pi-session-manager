/**
 * 设置面板组件类型定义
 */

import type { AppSettings } from '../../types/settings'

export type SettingsSection =
  | 'terminal'
  | 'appearance'
  | 'language'
  | 'session'
  | 'search'
  | 'export'
  | 'pi-config'
  | 'advanced'

export interface SettingsPanelProps {
  isOpen: boolean
  onClose: () => void
}

export interface BaseSettingsProps<T extends SettingsSection> {
  settings: AppSettings
  onUpdate: (
    section: T,
    key: keyof AppSettings[T],
    value: AppSettings[T][keyof AppSettings[T]]
  ) => void
}

export interface TerminalSettingsProps extends BaseSettingsProps<'terminal'> {}

export interface AppearanceSettingsProps extends BaseSettingsProps<'appearance'> {}

export interface LanguageSettingsProps extends BaseSettingsProps<'language'> {}

export interface SessionSettingsProps extends BaseSettingsProps<'session'> {}

export interface SearchSettingsProps extends BaseSettingsProps<'search'> {}

export interface ExportSettingsProps extends BaseSettingsProps<'export'> {}

export interface AdvancedSettingsProps extends BaseSettingsProps<'advanced'> {}

export interface MenuSection {
  id: SettingsSection
  icon: React.ReactNode
  label: string
  badge?: string | number
}

export interface SettingItem {
  key: string
  label: string
  description?: string
  type: 'select' | 'toggle' | 'input' | 'range' | 'radio'
  value: unknown
  options?: Array<{ value: string; label: string }>
  min?: number
  max?: number
  step?: number
  placeholder?: string
  disabled?: boolean
  onChange: (value: unknown) => void
}

export interface SettingGroup {
  title: string
  items: SettingItem[]
  collapsible?: boolean
  defaultCollapsed?: boolean
}