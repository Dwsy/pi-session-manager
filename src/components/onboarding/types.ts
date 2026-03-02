export interface ServerSettings {
  ws_enabled: boolean
  ws_port: number
  http_enabled: boolean
  http_port: number
  auth_enabled: boolean
  bind_addr: string
}

export type OpenPosition = 'top' | 'bottom'
