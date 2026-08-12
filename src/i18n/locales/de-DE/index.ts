import { common } from './common'
import { app } from './app'
import { session } from './session'
import { project } from './project'
import { explorer } from './explorer'
import { search } from './search'
import { exportModule } from './export'
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
import { auth } from './auth'
import { piAgent } from './piAgent'

export const deDE = {
  common,
  app,
  session,
  project,
  explorer,
  search,
  export: exportModule,
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
  auth,
  piAgent,
  connection: {
    disconnected: 'Keine Verbindung zum Server — läuft die App?',
    connecting: 'Verbindung wird wiederhergestellt…',
    reconnected: 'Wieder verbunden',
  },
} as const

export type Translations = typeof deDE
