# Pi Session Manager Extensions

This directory contains Pi Agent extensions and PSM browser-plugin examples.

For plugin authoring workflow, see [`agent-docs/06-plugins.md`](../agent-docs/06-plugins.md).
For the PSM plugin SDK, see [`docs/PSM_PLUGIN_SDK.md`](../docs/PSM_PLUGIN_SDK.md).
For the current SDK capability audit and contract gaps, see [`docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md`](../docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md).

The Settings -> PSM Plugins page is a source-grouped list:

| Source | Shown as | Where it comes from |
| --- | --- | --- |
| `builtin` | Built-in | `extensions/psm-*` in this repo |
| `npm` | npm | managed workspace under `~/.pi/pi-session-manager/extensions/npm` |
| `path` | Local | explicit `.js` / `.mjs` entries in `plugins.json#customPaths` |

Built-in PSM plugins live under `extensions/psm-*`. They are discovered at startup and can be disabled through the Settings UI or `~/.pi/pi-session-manager/plugins.json`.

External PSM plugins are loaded in two ways:

- install an npm package into the managed npm workspace
- add an explicit local `.js` or `.mjs` entry path through Settings -> PSM Plugins

```bash
npm install --prefix ~/.pi/pi-session-manager/extensions/npm <package>
```

A plugin package declares browser-compatible ESM entries through `package.json#psm.extensions`.
A path plugin points directly to a built browser-compatible ESM file such as
`/absolute/path/to/my-psm-plugin/dist/index.mjs`.
If the plugin renders React UI, follow the host React pattern used by
`extensions/psm-cache-usage-path`: read `globalThis.__PSM_HOST_REACT__` through a
small `hostReact()` helper instead of importing a separate React runtime.

---

## PSM Plugins

| Plugin | Purpose | Permissions |
| --- | --- | --- |
| [psm-kanban-board](./psm-kanban-board/) | Provides an app-level board view plus a sidebar bound with `appViewId` through `ctx.ui.registerAppView(...)` / `ctx.ui.registerAppSidebarView(...)` | `sessions:read`, `tags:read`, `tags:write`, `config:read`, `config:write` |
| [psm-session-summary](./psm-session-summary/) | Generates session intelligence and writes `session.intelligence` plugin records | `sessions:read`, `records:read`, `records:write`, `model:invoke` |
| [psm-sidechat](./psm-sidechat/) | Session Q&A command/tool and toolbar panel example | `sessions:read`, `model:invoke`, `records:read`, `records:write` |
| [psm-trace](./psm-trace/) | Session trace analytics main view parsed in the plugin runtime | `sessions:read` |
| [psm-word-cloud](./psm-word-cloud/) | Demonstrates Cmd+K plugin commands plus global/project user-message word cloud app views from session-list preview fields | `config:read`, `config:write` |

### SDK Capability Notes

The public SDK package is `@pi-session-manager/plugin-sdk`. It intentionally exposes only the stable browser-plugin contract:

- manifest and package validation helpers
- plugin host context and activation types
- command/tool registration
- app-view, app-sidebar, session toolbar, main-view, and right-panel UI contributions
- plugin settings and i18n clients
- the `ctx.psm` capability client for selected plugin-safe PSM operations

It does not export the runtime host, app transport, Tauri APIs, npm plugin installation internals, or desktop-private implementation.

Current `ctx.psm` namespaces:

| Namespace | Methods |
| --- | --- |
| `records` | `search`, `listForScope`, `upsert`, `refreshSessionIntelligence` |
| `sessions` | `scan`, `list`, `readEntries`, `readFileChunk`, `getLabels`, `open` |
| `search` | `fulltext`, `pluginRecords` |
| `sidechat` | `ask` |
| `models` | `listOptions` |
| `tags` | `listTags`, `createTag`, `assignTag`, `removeTag`, `listSessionTags` |
| `config` | `read`, `write` |

The SDK is not intended to expose every backend dispatch command. Commands such as database reset, API key management, raw terminal I/O, app settings, devtools, and plugin installation remain host-internal or privileged.

---

## Pi Agent Extensions Overview

The following extensions follow the Pi package convention and are loaded from `~/.pi/agent/extensions/`.

| Extension | Purpose | Dependency |
| --- | --- | --- |
| [pi-session-bridge](./pi-session-bridge/) | Session sync, search, tags, and context recall | `better-sqlite3` |
| [resume-x](./resume-x/) | Enhanced session resume with a SQLite fast path | `better-sqlite3` |
| [rename-nag](./rename-nag/) | Smart session naming reminders | none |

`pi-session-bridge` and `resume-x` share the same SQLite database at `~/.pi/agent/sessions/sessions.db`. They load independently and do not depend on each other. `rename-nag` manages session names through the Pi API and does not access SQLite directly.

Package API note: `pi-session-bridge` uses the older `@mariozechner/pi-coding-agent` package, while `resume-x` and `rename-nag` use the newer `@earendil-works/pi-coding-agent` / `@earendil-works/pi-tui` APIs injected by the Pi runtime.

---

## pi-session-bridge

**Core bridge between Pi Agent and Pi Session Manager.**

Features:

- **Live Mode** — streams session events to PSM over WebSocket
- **Search** — searches historical sessions through the PSM HTTP API
- **Tags** — manages session tags through the shared SQLite database
- **Context Recall** — retrieves relevant context from previous sessions
- **Config** — exposes `/psm-config` for bridge configuration

```bash
# Install
pi install npm:Dwsy/psm-bridge

# Live mode
/psm-live on
/psm-live off

# Search
/session_search query="rust async traits"

# Tags
/state           # show current tag
/state-set wip   # set tag
/flow start      # quick workflow transition

# Context recall
/session_recall query="how to fix the bug"
```

### Tools

| Tool | Description |
| --- | --- |
| `session_search` | Full-text search over historical sessions |
| `session_recall` | Search plus contextual recall |
| `session_context` | Fetch messages around a target session hit |
| `session_tag` | Manage tags (`list`, `set`, `remove`) |

Note: `session_rename` has moved to [rename-nag](#rename-nag).

### Commands

| Command | Description |
| --- | --- |
| `/psm` | Show bridge status |
| `/psm-live on/off` | Toggle live mode |
| `/psm-connect` / `/psm-disconnect` | Manually connect or disconnect |
| `/state` `/state-set` `/state-list` `/state-clear` | Manage session tags |
| `/flow <action>` | Quick workflow transition |
| `/open-in-pms` / `/open-in-psm` | Open the current session in PSM. Pass `web` to force the web UI. |
| `/psm-config` | Manage bridge configuration |

### Status Indicator

```text
[psm]         - connected
[retry N]     - reconnecting, attempt N
[timeout]     - disconnected after timeout
[psm: off]    - live mode disabled
```

---

## resume-x

**Enhanced session resume that bypasses disk scanning and reads SQLite directly.**

Features:

- SQLite fast path without rescanning session files
- cwd filtering for the current project
- details panel with model, token usage, and cost
- message preview with left/right navigation
- Session tag display

```bash
# Use
/resume-x
```

### Features

| Feature | Description |
| --- | --- |
| Fast load | Reads SQLite directly and skips disk scanning |
| cwd filter | Shows sessions from the current project directory |
| Details panel | Displays model, input/output tokens, and cost |
| Message preview | Browse conversation preview with left/right keys |
| Session tags | Shows session tags |

---

## rename-nag

**Smart session naming reminder that nudges agents to name sessions.**

Features:

- registers the `session_rename` tool, moved out of the bridge extension
- tracks conversation entries and tool-call count
- injects hidden reminders (`display: false`) when naming conditions are met
- stops reminding after the agent renames the session

### Trigger Conditions

| Turn | Condition | Reminder |
| --- | --- | --- |
| First reminder | tool calls > 6 and session still unnamed | Full reminder with available tool and naming guidance |
| Later reminders | every 40 tool calls (40, 80, 120...) after the session has a name | Ask the agent to check whether the name still matches the current topic |

An unnamed session is one whose name is null or matches a default timestamp format such as `YYYY-MM-DDTHH:MM:SS` or `YYYY-MM-DDTHH-MM-SS`.

### How It Works

```text
session_start (including resume)
  -> scan existing entries and count tool calls
  -> if already named or tool calls > 6, mark firstNagSent

tool_call (any tool)
  -> increment toolCallCount

before_agent_start (each user message)
  |- unnamed + toolCallCount > 6 + first reminder not sent -> full reminder
  `- named + toolCallCount is a multiple of 40 -> topic-drift naming check
```

### Tools

| Tool | Description |
| --- | --- |
| `session_rename` | Rename the current session |

---

## Development

### Install Locally

```bash
# Symlink into the Pi extension directory
ln -sf $(pwd)/extensions/pi-session-bridge ~/.pi/agent/extensions/pi-session-bridge
ln -sf $(pwd)/extensions/resume-x ~/.pi/agent/extensions/resume-x
ln -sf $(pwd)/extensions/rename-nag ~/.pi/agent/extensions/rename-nag
```

### Temporary Testing

```bash
pi -e extensions/rename-nag/index.ts
```

### Dependencies

- **better-sqlite3** (`^12.9.0`): used by `pi-session-bridge` and `resume-x` for SQLite access, resolved from the project root `node_modules`
- **@mariozechner/pi-coding-agent**: older Pi extension API used by `pi-session-bridge`
- **@earendil-works/pi-coding-agent** / **@earendil-works/pi-tui**: newer Pi extension APIs used by `resume-x` and `rename-nag`; injected by the Pi runtime and not declared by these packages
