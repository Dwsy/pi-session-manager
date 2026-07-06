# Pi Session Manager

<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Pi Session Manager" />
</p>

<p align="center">
  Manage <a href="https://github.com/badlogic/pi-mono">Pi</a> coding sessions with a Tauri desktop app, browser-accessible server mode, and static demo pages.
</p>

<p align="center">
  <a href="https://github.com/Dwsy/pi-session-manager/releases/latest">Releases</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/">Documentation</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/cn/">zh</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/demo/">Demo</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/dataset/">Dataset</a> ·
  <a href="extensions/README.md">Extensions</a>
</p>

## UI Preview

| Home | Session Page |
|------|-------------|
| ![Home](website/public/screenshots/home.png) | ![Session Page](website/public/screenshots/session-page.png) |

| Session Tree | Kanban |
|-------------|--------|
| ![Session Tree](website/public/screenshots/session-tree.png) | ![Kanban](website/public/screenshots/kanban.png) |

## Features

Pi Session Manager is a focused workspace for browsing, searching, resuming, and extending Pi coding sessions.

- Browse sessions by list, project, tree, and kanban views.
- Search sessions and in-session messages with full-text indexing, inline highlights, and source filters.
- Resume sessions from the desktop app, browser-accessible server mode, or the standalone CLI.
- Manage tags, favorites, rename state, exports, and session metadata.
- Inspect activity through heatmaps, token trends, cost stats, and session trace views.
- Browse external agent sessions from tools such as Claude and OpenCode.
- Explore session datasets with local caching, search, tags, favorites, and statistics.
- Use built-in i18n packs: `en-US`, `zh-CN`, `ja-JP`, `de-DE`, `fr-FR`, `es-ES`.
- Try the app without local data through the static demo and dataset builds.

## CLI Install

macOS / Linux:

```bash
curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash
```

Windows PowerShell:

```powershell
iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.ps1 | iex
```

Non-interactive examples:

```bash
curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash -s -- --yes
```

```powershell
$env:PSM_INSTALL_YES="1"; iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.ps1 | iex
```

The installers detect platform, download the latest `pi-session-cli` release, verify SHA256 when available, guide install path selection, check `PATH`, and support Chinese/English output. macOS clears quarantine with `xattr`; Windows clears Mark-of-the-Web with `Unblock-File`.

## Extensibility

PSM has two extension layers:

| Layer | What it extends | Examples |
|------|------------------|----------|
| Pi Agent extensions | Pi runtime commands, tools, status, and session workflow | `pi-session-bridge`, `resume-x`, `rename-nag` |
| PSM browser plugins | App views, sidebars, session toolbar panels, tree views, tool renderers, commands, tools, records, search, and agent-powered workflows | `psm-sidechat`, `psm-session-summary`, `psm-semantic-search`, `psm-code-review`, `psm-kanban-board`, `psm-generative-ui-renderer`, `psm-word-cloud` |

PSM browser plugins can be loaded from built-in packages, npm packages, local `.js` / `.mjs` files, or local dev projects through Settings -> PSM Plugins. Plugin permissions are declared in the manifest and surfaced in Settings.

Start here:

- [extensions/README.md](extensions/README.md) - built-in extensions, plugin loading, SDK capability notes, and development workflow.
- [agent-docs/06-plugins.md](agent-docs/06-plugins.md) - plugin authoring boundaries and verification.
- [docs/PSM_PLUGIN_SDK.md](docs/PSM_PLUGIN_SDK.md) - public browser-plugin SDK contract.
- [docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md](docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md) - current SDK capabilities and remaining gaps.

## License

MIT

## macOS Installation Note

If macOS shows "App is damaged and can't be opened", run:

```bash
sudo xattr -rd com.apple.quarantine "/Applications/Pi Session Manager.app"
```

This is standard Gatekeeper behavior for non-App-Store apps. No certificate is required for personal use.
