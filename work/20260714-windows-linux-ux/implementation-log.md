# Implementation Log

Chronological deliverables. Add a dated section after every Do/Check slice.

## 2026-07-14 — folder created

- **Scope:** 完成 ZIP 任务书中的 Windows/Linux 窗口、生命周期、快捷键、布局、终端、opener、CI 与发布门禁修复，并提交可审查 PR。
- **Files:** (none yet)
- **Behavior:** PDCA scaffold only
- **Verify:** n/a
- **Open:** complete P0 in task.md

## 2026-07-14 — 隔离工作树与任务基线

- **Scope:** 创建 `work/codex-windows-linux-ux` 分支和 `work/20260714-windows-linux-ux` PDCA 目录；读取 ZIP 任务书、仓库规则与设计/前后端开发文档。
- **Files:** `CODEX_START_HERE.md`（来自 ZIP，未复制到仓库）；`work/20260714-windows-linux-ux/*`
- **Behavior:** 主工作区未修改；目标工作树从 `e8a676e5` 创建且 clean。
- **Verify:** `git status --short && git diff --stat` → clean baseline。
- **Open:** 等待窗口/前端/终端三路代码审查，随后决定首批 vertical slice。

## 2026-07-14 — 任务拆分与依赖确认

- **Scope:** 将 ZIP 任务书拆为窗口/单实例、平台/快捷键/布局、终端/opener、CI/发布四个切片。
- **Files:** `src-tauri/src/main.rs`, `src-tauri/src/tray.rs`, `src/hooks/useKeyboardShortcuts.ts`, `src/utils/platformShortcuts.ts`, `src-tauri/src/domain/terminal/*`, `.github/workflows/*`
- **Behavior:** 确认工作树基线与 ZIP 的三项热修差异；确认官方插件版本和本地源码 API。
- **Verify:** `cargo search ...` 与本地 `$HOME/.cargo/registry/src` 检索 → API 可用；Context7 查询因配额耗尽未运行。
- **Open:** 先实现窗口/单实例切片，再按依赖推进其余切片。

## 2026-07-14 — 跨平台基础修复切片

- **Scope:** 完成窗口 native chrome/共享策略、Tauri opener/window-state/single-instance 接线、托盘与 ready 生命周期、统一平台检测、IME/AltGr 防护、compact layout mode、shell IPC 与 Linux/Windows 终端参数、CI/release signing wiring。
- **Files:** `src-tauri/src/{main,tray,lib,deep_link}.rs`, `src-tauri/src/domain/terminal/*`, `src/utils/platform.ts`, `src/hooks/useIsMobile.ts`, `.github/workflows/*`, `docs/windows-linux-release-smoke.md`
- **Behavior:** 非 macOS 初始/重建窗口均走 native decorations；CLI 不注册 single-instance；Linux lightweight close 隐藏窗口；外部打开使用 opener；终端接收 `shell`；Windows Authenticode 无凭据时 release 门禁失败。
- **Verify:** `pnpm exec tsc --noEmit` → pass；目标 Vitest 19 tests → pass；`pnpm exec vite build` → pass；`cargo check --lib` → pass；`cargo test --lib domain::terminal::utils::tests` → 1 passed；`node scripts/release-version.mjs check` → synchronized；workflow/config YAML/JSON parse → pass。
- **Open:** 全量 Vitest 仍有 4 个基线 suite 在收集阶段失败但 545 tests passed；本机未运行 Windows/Linux GUI smoke 与真实 Authenticode。
