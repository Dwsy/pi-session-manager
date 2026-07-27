# Pi Session Manager

<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Pi Session Manager" />
</p>

<p align="center">
  <strong>面向 Coding Agent 会话的本地优先工作台。</strong>
</p>

<p align="center">
  统一归档、检索、理解、追踪和继续 Pi 及其他 Coding Agent 留下的工作，而不是在你和 Agent 之间再加一层 GUI。
</p>

<p align="center">
  <a href="https://github.com/Dwsy/pi-session-manager/releases/latest">Releases</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/cn/">文档</a> ·
  <a href="README.md">English</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/demo/">Demo</a> ·
  <a href="https://dwsy.github.io/pi-session-manager/dataset/">数据集版</a> ·
  <a href="extensions/README.md">扩展</a>
</p>

## 核心理念

Coding Agent 会话不是一次性的聊天记录。它们保存了决策、命令、失败尝试、工具轨迹，以及继续未完成工作所需的上下文。

Pi Session Manager 将这些会话视为持久、可检查的工程资产。它索引并组织已有会话来源，但把实际执行留给创建这些会话的 Agent 和终端。

> PSM 管理 Agent 周围的工作，而不是接管 Agent 本身。

| 会话工作台 | 知识层 | 观测层 |
|------------|--------|--------|
| 组织、标记、搜索、导出和恢复既有工作。 | 跨会话与数据集找回决策和上下文。 | 检查分支、工具调用、Trace、活动、Token 与成本。 |

## PSM 是什么 / 不是什么

| PSM 是 | PSM 不是 |
|--------|----------|
| 本地优先的 Coding Agent 会话档案库 | 另一个 Codex 式 Agent GUI |
| 跨 Agent 的索引、查看与工作延续层 | Pi、Claude Code、Codex 或其原生工作流的替代品 |
| 用于理解会话产物的可扩展界面 | 依赖 AI 功能才能管理会话的聊天外壳 |

## 界面预览

## UI Preview

| Home | Session Page |
|------|--------------|
| ![Home](https://github.com/user-attachments/assets/d28aefb4-beed-4228-ac55-4d11164bc2f1) | ![Session Page](https://github.com/user-attachments/assets/b4b645a8-c58e-4568-b0e7-567f4e34ba7a) |

| Session Tree | Kanban |
|--------------|--------|
| ![Session Tree](https://github.com/user-attachments/assets/fd026277-2de2-4e41-ac27-37a68d8c8322) | ![Kanban](https://github.com/user-attachments/assets/fc7d3adc-ab0d-475a-827c-9acb8ca4498e) |

## 核心能力

- 扫描并索引 Pi 以及 Claude Code、Codex、OpenCode、Gemini CLI、Cursor、Antigravity 等外部来源的会话。
- 通过列表、项目、树和看板视图浏览会话，并使用标签、收藏、命名和元数据进行组织。
- 使用全文索引、命中高亮、节点标签和来源过滤，搜索跨会话及会话内消息。
- 通过对话树、Branch Atlas、工具调用渲染、Compaction 上下文和 Trace 还原工作过程。
- 恢复、转换或导出会话，并将工作交还给原本的终端或 Agent 工作流。
- 通过活动热力图、Token 趋势、模型用量、成本统计和会话数据集回顾工作。
- 以 Tauri 桌面应用、提供 HTTP/WebSocket API 的浏览器无头服务器，或静态 Demo / 数据集版本运行。
- 使用内置语言包：`en-US`、`zh-CN`、`ja-JP`、`de-DE`、`fr-FR`、`es-ES`。

## 安装

### 桌面应用

从 [GitHub Releases](https://github.com/Dwsy/pi-session-manager/releases/latest) 下载适用于 macOS、Windows 或 Linux 的最新版本。

### CLI / 无头服务器

macOS / Linux：

```bash
curl -fsSL https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.sh | bash
```

Windows PowerShell：

```powershell
iwr -useb https://raw.githubusercontent.com/dwsy/pi-session-manager/main/scripts/install-cli.ps1 | iex
```

安装器会下载最新 `pi-session-cli`、在可用时校验 SHA256、配置安装路径，并处理平台隔离标记。

## 扩展边界

PSM 通过两层扩展保持 Agent 执行与会话管理的边界：

| 层级 | 用途 |
|------|------|
| Pi Agent 扩展 | 将 Pi 的运行时命令、状态、命名、搜索和恢复工作流连接到会话档案库。 |
| PSM 浏览器插件 | 围绕已有会话增加视图、渲染器、搜索、分析、记录、命令和可选的 Agent 辅助工作流。 |

Agent 辅助的摘要、语义搜索、审查和 Side Chat 都是可选插件。即使不启用它们，核心产品仍可完成会话浏览、搜索、理解、组织和恢复。

PSM 浏览器插件可以来自内置包、npm 包、本地 `.js` / `.mjs` 文件或本地开发项目。每个插件在 manifest 中声明权限，并在 Settings -> PSM Plugins 中展示。

扩展入口：

- [extensions/README.md](extensions/README.md) - 扩展概览和开发流程。
- [agent-docs/06-plugins.md](agent-docs/06-plugins.md) - 插件边界、作者指南和验证方式。
- [docs/PSM_PLUGIN_SDK.md](docs/PSM_PLUGIN_SDK.md) - 浏览器插件 SDK 公共契约。
- [docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md](docs/PSM_PLUGIN_SDK_CAPABILITY_AUDIT.md) - 当前能力与剩余缺口。

## 许可证

MIT

## macOS 安装说明

如果 macOS 显示“App 已损坏，无法打开”，请运行：

```bash
sudo xattr -rd com.apple.quarantine "/Applications/Pi Session Manager.app"
```

这是非 App Store 应用常见的 Gatekeeper 行为，个人使用不需要证书。
