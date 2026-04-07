# Config

## Paths

| Type | Path |
|------|------|
| Session directory | `~/.pi/agent/sessions/` |
| SQLite DB | `~/.pi/agent/sessions/sessions.db` |
| Model config | `~/.pi/agent/models.json` |
| Model backups | `~/.pi/agent/backups/models/*.json` |
| Scan config | `~/.pi/agent/session-manager-config.toml` |
| App settings | SQLite `settings` table |
| CLI config | `dirs::config_dir()/pi-session-manager.json` |

## Tech Stack

**Frontend**: React 18, TypeScript 5, Vite 5, Tailwind CSS, i18next, cmdk, @dnd-kit, @xyflow/react, recharts, @xterm/xterm

**Backend**: Rust 2021, Tauri 2, Tokio, Axum, rusqlite, Tantivy, notify, portable-pty

**Protocol**: Tauri IPC | WebSocket (/ws) | HTTP (/api, /v1/*) | SSE (/api/events, /v1/events)

## Security

1. Auth only for non-loopback IPs (`auth::is_auth_required`)
2. CORS: `access-control-allow-origin: *`
3. `/metrics` has no extra auth
4. Tauri CSP: `null`
5. File access: `~/.pi/agent/*`
