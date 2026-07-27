# Pi Session Manager

<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Pi Session Manager" />
</p>

<p align="center">
  <strong>A local-first workbench for the sessions coding agents leave behind.</strong>
</p>

<p align="center">
  Browse, search, understand, and continue work across Pi and other coding agents -- without putting another Agent GUI between you and them.
</p>

<p align="center">
  <a href="https://github.com/Dwsy/pi-session-manager/releases/latest">Releases</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/">Documentation</a> ·
  <a href="README.zh.md">中文</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/demo/">Demo</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/dataset/">Dataset</a> ·
  <a href="extensions/README.md">Extensions</a>
</p>

## UI Preview

## UI Preview

| Home | Session Page |
|------|--------------|
| ![Home](https://github.com/user-attachments/assets/d28aefb4-beed-4228-ac55-4d11164bc2f1) | ![Session Page](https://github.com/user-attachments/assets/b4b645a8-c58e-4568-b0e7-567f4e34ba7a) |

| Session Tree | Kanban |
|--------------|--------|
| ![Session Tree](https://github.com/user-attachments/assets/fd026277-2de2-4e41-ac27-37a68d8c8322) | ![Kanban](https://github.com/user-attachments/assets/fc7d3adc-ab0d-475a-827c-9acb8ca4498e) |


## Install

### Desktop App

Download the latest build for macOS, Windows, or Linux from [GitHub Releases](https://github.com/Dwsy/pi-session-manager/releases/latest).

### CLI / Headless Server

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash
```

Windows PowerShell:

```powershell
iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.ps1 | iex
```

The installers download the latest `pi-session-cli`, verify SHA256 when available, configure the install path, and handle platform quarantine metadata.

## Core Capabilities

- Scan and index sessions from Pi and external sources including Claude Code, Codex, OpenCode, Gemini CLI, Cursor, and Antigravity.
- Browse by list, project, tree, and kanban views; organize with tags, favorites, names, and metadata.
- Search across sessions and in-session messages with full-text indexing, highlights, labels, and source filters.
- Reconstruct work through conversation trees, Branch Atlas, tool-call rendering, compaction context, and trace views.
- Resume, convert, or export sessions and hand work back to the original terminal or agent workflow.
- Review activity through heatmaps, token trends, model usage, cost statistics, and session datasets.
- Run as a Tauri desktop app, a browser-accessible headless server with HTTP/WebSocket APIs, or static demo and dataset builds.
- Use the built-in `en-US`, `zh-CN`, `ja-JP`, `de-DE`, `fr-FR`, and `es-ES` language packs.



## The Idea

Coding agent sessions are more than disposable chat logs. They contain decisions, commands, failed attempts, tool traces, and the context needed to continue unfinished work.

Pi Session Manager treats those sessions as durable, inspectable project artifacts. It indexes and organizes existing session sources while leaving execution to the agents and terminals that created them.

> PSM manages the work around the agent, not the agent itself.

| Session workspace | Knowledge layer | Observability layer |
|-------------------|-----------------|---------------------|
| Organize, tag, search, export, and resume past work. | Find decisions and context across sessions and datasets. | Inspect branches, tool calls, traces, activity, tokens, and cost. |

## What PSM Is -- and Is Not

| PSM is | PSM is not |
|--------|------------|
| A local-first library for coding-session history | Another Codex-style agent GUI |
| A cross-agent index, viewer, and continuity layer | A replacement for Pi, Claude Code, Codex, or their native workflows |
| An extensible surface for understanding session artifacts | A chat shell that requires AI features for basic session management |



## Extension Boundaries

PSM keeps agent execution and session management separate through two extension layers:

| Layer | Purpose |
|------|---------|
| Pi Agent extensions | Connect Pi runtime commands, status, naming, search, and resume workflows to the session library. |
| PSM browser plugins | Add views, renderers, search, analysis, records, commands, and optional agent-assisted workflows around existing sessions. |

Agent-assisted summaries, semantic search, review, and side chat are optional plugins. The core product remains useful without them: sessions can still be browsed, searched, understood, organized, and resumed.

PSM browser plugins can come from built-in packages, npm packages, local `.js` / `.mjs` files, or local development projects. Permissions are declared in each manifest and surfaced in Settings -> PSM Plugins.

Start here:

- [extensions/README.md](extensions/README.md) - extension overview and development workflow.
- [agent-docs/06-plugins.md](agent-docs/06-plugins.md) - plugin authoring boundaries and verification.
- [docs/PSM_PLUGIN_SDK.md](docs/PSM_PLUGIN_SDK.md) - public browser-plugin SDK contract.
- [docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md](docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md) - current capabilities and remaining gaps.

## License

MIT

## macOS Installation Note

If macOS shows "App is damaged and can't be opened", run:

```bash
sudo xattr -rd com.apple.quarantine "/Applications/Pi Session Manager.app"
```

This is standard Gatekeeper behavior for non-App-Store apps. No certificate is required for personal use.
