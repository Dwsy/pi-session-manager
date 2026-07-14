# Agent Usage

Default-off built-in plugin that shows subscription / quota status for local AI coding agents.

## Permissions

- `usage:read` (opt-in): read existing local agent credentials and call fixed official usage endpoints
- `config:read` / `config:write`: plugin settings only

Tokens are never returned to the UI, never logged by the plugin, and never written back to credential files.

## Entry points

- App view route: `/agent-usage`
- Command palette: `Agent Usage`

## Providers

Antigravity, Amp, Claude Code, Codex, Copilot, Cursor, Devin, Factory, Grok, OpenRouter, OpenCode Go, Kimi, MiniMax, Z.ai.

## Local cache

- Last successful refresh is stored at `~/.pi/pi-session-manager/plugin-config/builtin.agent-usage/status-cache.json` (via `config:write`).
- Do not place `status-cache.json` in the repository root.

## Security notes

- Plugin is `defaultEnabled: false`
- `usage:read` requires explicit grant in Settings → PSM Plugins
- Refresh is manual
- Backend collector uses allowlisted HTTPS endpoints only
