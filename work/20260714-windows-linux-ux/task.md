# Windows/Linux 原生体验修复

<!-- pdca:gen -->
> **status:** in_progress  ·  **phase:** P3  ·  **pdca:** act
> **validation:** passed  ·  **open decisions:** D2
> **next:** 等待 PR #42 新一轮 CI；lint/check 均通过后再向用户报告可合并状态
<!-- /pdca:gen -->

## Objective

完成 ZIP 任务书中的 Windows/Linux 窗口、生命周期、快捷键、布局、终端、opener、CI 与发布门禁修复，并提交可审查 PR。

## Scope

- WUX A/B/F：原生窗口框架、窗口状态、GUI 单实例、托盘 ready 生命周期、opener、CI 与发布门禁。
- WUX C/D：统一平台服务、快捷键输入保护和三态响应式布局。
- WUX E/WUX-020：外部终端 shell 传递、结构化启动参数、系统打开与跨平台路径。

## Out Of Scope

- 未具备 Windows/Linux GUI 环境的手工矩阵不伪造为通过。
- 无真实签名凭据时不声称 Authenticode 已验证。
- 不进行与任务书无关的应用架构重写。

## Acceptance

- [ ] 非 macOS 初始/重建主窗口使用原生 decorations；macOS overlay 行为保持不变。
- [ ] 窗口位置/尺寸/最大化状态可恢复，第二实例只聚焦已有 GUI，ready listener 不累积。
- [ ] 平台检测统一输出 macos/windows/linux；快捷键覆盖 IME、229、AltGr 与 F5/Tool Review/devtools 冲突。
- [ ] 768/911/1093/1119/1120 边界有 LayoutMode 测试，compact 核心操作保持可达。
- [ ] 外部终端接收 defaultShell；系统 URL/路径打开不经 cmd /C start 或 xdg-open 手写 shell 包装。
- [ ] CI 运行 Vitest、tsc、Vite build、Rust fmt/clippy/test；发布链包含 Authenticode fail-closed 校验接线。
- [ ] 运行验证后创建提交并通过 GitHub PR 流程；未运行的跨平台 GUI/签名验证如实记录。

## SSOT / Links

- `CODEX_WINDOWS_LINUX_UX_REMEDIATION_TASK.md`（ZIP 任务书，外部输入）
- `src-tauri/src/main.rs`, `src-tauri/src/tray.rs`, `src-tauri/src/lib.rs`
- `src/hooks/useKeyboardShortcuts.ts`, `src/hooks/app/useAppBootstrap.ts`, `src/utils/platformShortcuts.ts`
- `src-tauri/src/domain/terminal/{api,launch,utils}.rs`
- `.github/workflows/ci.yml`, `.github/workflows/release.yml`
- `docs/issues/` 与本目录 `work/20260714-windows-linux-ux/`
