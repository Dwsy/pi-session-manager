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

export const esES = {
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
    disconnected: 'No se puede conectar al servidor — ¿está la aplicación en ejecución?',
    connecting: 'Reconectando…',
    reconnected: 'Reconectado',
  },
} as const
