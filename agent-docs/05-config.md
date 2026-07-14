# Config

> Paths written as `~/.pi/...` are logical home-relative paths. Runtime code resolves them from the current user's home directory on macOS/Linux/Windows.

## Paths

| Type | Path |
|------|------|
| Session directory | `~/.pi/agent/sessions/` |
| SQLite DB | `~/.pi/agent/sessions/sessions.db` |
| Unified config | `~/.pi/pi-session-manager/config.json` |
| Tags config | `~/.pi/pi-session-manager/tags_config.json` |
| Session marks | `~/.pi/pi-session-manager/session_mark.json` |
| Favorites | `~/.pi/pi-session-manager/favorites.json` |
| Auth tokens | `~/.pi/pi-session-manager/auth_tokens.json` |
| Pi model config | `~/.pi/agent/models.json` |
| Pi settings | `~/.pi/agent/settings.json` |
| Config snapshots | `~/.pi/pi-session-manager/history/config-versions/*.json` |
| Plugin JSON config | `~/.pi/pi-session-manager/plugin-config/<pluginId>/<key>.json` |

## Tech Stack

**Frontend**: React 18, TypeScript 5, Vite 5, Tailwind CSS, i18next, cmdk, @dnd-kit, recharts, @xterm/xterm

**Backend**: Rust 2021, Tauri 2, Tokio, Axum, rusqlite, SQLite FTS5, notify, portable-pty

**Protocol**: Tauri IPC | WebSocket (/ws) | HTTP (/api, /v1/*) | SSE (/api/events, /v1/events)

## Security

1. Auth only for non-loopback IPs (`auth::is_auth_required`)
2. CORS: `access-control-allow-origin: *`
3. `/metrics` has no extra auth
4. Tauri CSP: `null`
5. File access: `~/.pi/pi-session-manager/*`
