# Pi Session Manager

<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Pi Session Manager" />
</p>

<h1 align="center">Pi Session Manager</h1>

<p align="center">
  基于 Tauri + Rust + React 的 Pi 会话管理工具，支持桌面端、浏览器可访问服务端，以及静态 Demo 页面。
</p>

<p align="center">
  <a href="https://github.com/Dwsy/pi-session-manager/releases/latest">Releases</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/">English</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/demo/">Demo</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/dataset/">数据集版</a> ·
  <a href="extensions/README.md">扩展</a>
</p>

## 界面预览

| 首页 | 会话页 |
|------|--------|
| ![首页](website/public/screenshots/home.png) | ![会话页](website/public/screenshots/session-page.png) |

| 会话树 | 看板 |
|--------|------|
| ![会话树](website/public/screenshots/session-tree.png) | ![看板](website/public/screenshots/kanban.png) |

## 功能

Pi Session Manager 是用于浏览、搜索、恢复和扩展 Pi 编程会话的工作台。

- 以列表、项目、树和看板视图浏览会话。
- 通过全文索引搜索会话和会话内消息，支持命中高亮与来源过滤。
- 从桌面端、浏览器可访问服务端或独立 CLI 恢复会话。
- 管理标签、收藏、命名状态、导出和会话元数据。
- 查看活动热力图、Token 趋势、成本统计和会话 trace。
- 扫描和浏览 Claude、OpenCode 等外部 Agent 会话。
- 浏览会话数据集，支持本地缓存、搜索、标签、收藏和统计。
- 内置多语言包：`en-US`、`zh-CN`、`ja-JP`、`de-DE`、`fr-FR`、`es-ES`。
- 通过静态 Demo 和数据集构建体验无本地数据版本。

## CLI 安装

macOS / Linux：

```bash
curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash
```

Windows PowerShell：

```powershell
iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.ps1 | iex
```

非交互示例：

```bash
curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash -s -- --yes
```

```powershell
$env:PSM_INSTALL_YES="1"; iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.ps1 | iex
```

安装器会检测平台、下载最新 `pi-session-cli` Release、校验 SHA256（如存在）、引导选择安装路径、检查 `PATH`，并支持中文/英文输出。macOS 使用 `xattr` 清理 quarantine；Windows 使用 `Unblock-File` 清理 Mark-of-the-Web。

## 扩展性

PSM 有两层扩展：

| 层级 | 扩展内容 | 示例 |
|------|----------|------|
| Pi Agent 扩展 | Pi 运行时命令、工具、状态和会话工作流 | `pi-session-bridge`、`resume-x`、`rename-nag` |
| PSM 浏览器插件 | 应用视图、侧边栏、会话工具栏面板、树视图、工具渲染器、命令、工具、记录、搜索和 Agent 工作流 | `psm-sidechat`、`psm-session-summary`、`psm-semantic-search`、`psm-code-review`、`psm-kanban-board`、`psm-generative-ui-renderer`、`psm-word-cloud` |

PSM 浏览器插件可以来自内置包、npm 包、本地 `.js` / `.mjs` 文件，或通过 Settings -> PSM Plugins 加载本地开发项目。插件权限在 manifest 中声明，并在设置页展示。

扩展入口：

- [extensions/README.md](extensions/README.md) - 内置扩展、插件加载方式、SDK 能力说明和开发流程。
- [agent-docs/06-plugins.md](agent-docs/06-plugins.md) - 插件边界、作者指南和验证方式。
- [docs/PSM_PLUGIN_SDK.md](docs/PSM_PLUGIN_SDK.md) - 浏览器插件 SDK 公共契约。
- [docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md](docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md) - 当前 SDK 能力与缺口。

## 许可证

MIT
