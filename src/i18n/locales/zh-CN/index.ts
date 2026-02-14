import { common } from './common'
import { app } from './app'
import { session } from './session'
import { project } from './project'
import { search } from './search'
import { exportModule } from './export'
import { stats } from './stats'
import { dashboard } from './dashboard'
import { languageSwitcher } from './languageSwitcher'
import { settings } from './settings'
import { components } from './components'
import { command } from './command'
import { role } from './role'
import { favorites } from './favorites'
import { onboarding } from './onboarding'
import terminal from './terminal'
import { tags } from './tags'
import { plugins } from './plugins'
import { time } from './time'

export const zhCN = {
  common,
  app,
  session,
  project,
  search,
  export: exportModule,
  stats,
  dashboard,
  languageSwitcher,
  settings,
  components,
  command,
  role,
  favorites,
  onboarding,
  terminal,
  tags,
  plugins,
  time,
  connection: {
    disconnected: '无法连接到服务，请检查应用是否运行',
    connecting: '正在重新连接…',
    reconnected: '已重新连接',
  },
} as const

export type Translations = typeof zhCN