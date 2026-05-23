export interface ServerSettings {
  ws_enabled: boolean;
  ws_port: number;
  http_enabled: boolean;
  http_port: number;
  auth_enabled: boolean;
  bind_addr: string;
}

export interface TokenInfo {
  name: string;
  key_preview: string;
  created_at: string;
  last_used: string | null;
}

export type AdvancedSettingsMode = "all" | "server-access";
export type AdvancedTab = "server" | "auth" | "storage";
