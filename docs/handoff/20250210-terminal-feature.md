# Handoff: Side Terminal Feature Implementation
**生成时间**: 2025-02-10 20:35
**状态**: ✅ 已完成，待测试验证

---

## Mission
为 pi-session-manager 添加侧边内置终端功能，支持在 Tauri 桌面应用和 Web 端通过 WebSocket 使用终端。

**最终目标**: 用户可以在应用内打开终端面板（快捷键 Cmd+J），在选中的会话/项目目录下直接执行命令。

---

## Status

| 状态 | 内容 |
|------|------|
| ✅ 已完成 | Rust 后端: `terminal.rs` PTY 管理器、`commands/terminal.rs` Tauri 命令、AppState 集成 |
| ✅ 已完成 | 前端: `TerminalPanel.tsx` xterm.js 组件、`TerminalToggleButton.tsx`、App.tsx 集成 |
| ✅ 已完成 | WebSocket 适配器: `ws_adapter.rs` 添加终端命令支持 |
| ✅ 已完成 | i18n: 中英文翻译文件 `terminal.ts` |
| ✅ 已完成 | 编译修复: 添加 `use tauri::Manager`、修复类型问题 |
| 🚧 进行中 | 运行测试: `npm run tauri:dev` 验证终端功能 |
| 📋 下一步 | 1. 运行应用测试终端功能<br>2. 调整终端主题配色<br>3. 添加终端历史记录功能（可选） |

---

## Decisions

1. **使用 `portable-pty` crate**: 跨平台 PTY 实现
   - 原因: Tauri 生态中成熟的 PTY 方案，支持 macOS/Linux/Windows
   - 备选方案: 直接使用 `tokio::process`（放弃，无法提供完整终端体验）

2. **xterm.js 而非自定义实现**: 终端渲染
   - 原因: 成熟的终端模拟器，支持 ANSI 颜色、光标、滚动等
   - 使用 `@xterm/xterm` v5.x 和 `@xterm/addon-fit`

3. **AppState 共享 TerminalManager**: Tauri IPC 和 WebSocket 共用
   - 原因: 统一状态管理，支持两种访问方式
   - 权衡: 增加了 AppState 的复杂度

4. **每个会话独立终端**: 通过 `sessionId` 区分
   - 原因: 支持多标签页场景，每个会话有自己的终端状态
   - 当前实现: `sessionId` 默认为会话 ID 或 'global'

---

## Context

### 关键文件

**Rust 后端:**
- `/Users/dengwenyu/Dev/AI/pi-session-manager/src-tauri/Cargo.toml` - 添加 `portable-pty = "0.9"`
- `/Users/dengwenyu/Dev/AI/pi-session-manager/src-tauri/src/terminal.rs` - PTY 会话管理
- `/Users/dengwenyu/Dev/AI/pi-session-manager/src-tauri/src/commands/terminal.rs` - Tauri 命令
- `/Users/dengwenyu/Dev/AI/pi-session-manager/src-tauri/src/app_state.rs` - 集成 TerminalManager
- `/Users/dengwenyu/Dev/AI/pi-session-manager/src-tauri/src/lib.rs` - 命令注册
- `/Users/dengwenyu/Dev/AI/pi-session-manager/src-tauri/src/ws_adapter.rs` - WebSocket 终端命令

**前端:**
- `/Users/dengwenyu/Dev/AI/pi-session-manager/src/components/TerminalPanel.tsx` - 终端面板组件
- `/Users/dengwenyu/Dev/AI/pi-session-manager/src/components/TerminalToggleButton.tsx` - 切换按钮
- `/Users/dengwenyu/Dev/AI/pi-session-manager/src/App.tsx` - 集成终端面板和快捷键
- `/Users/dengwenyu/Dev/AI/pi-session-manager/src/i18n/locales/zh-CN/terminal.ts` - 中文翻译
- `/Users/dengwenyu/Dev/AI/pi-session-manager/src/i18n/locales/en-US/terminal.ts` - 英文翻译

### 关键代码

**Tauri 命令注册 (lib.rs):**
```rust
.invoke_handler(tauri::generate_handler![
    // ... 其他命令
    terminal_create,
    terminal_write,
    terminal_resize,
    terminal_close,
    get_default_shell
])
```

**前端调用示例:**
```typescript
// 创建终端
await invoke('terminal_create', {
  id: sessionId,
  cwd: '/path/to/project',
  shell: '/bin/zsh'
})

// 监听输出
listen('terminal-output', (event) => {
  term.write(event.payload)
})

// 发送输入
term.onData((data) => {
  invoke('terminal_write', { id: sessionId, data })
})
```

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Cmd+J` | 打开/关闭终端面板 |
| `Escape` | 关闭终端面板（当面板打开时） |

---

## Tradeoffs

- **WebSocket 终端性能**: WebSocket 传输相比 Tauri IPC 有延迟，大量输出时可能卡顿
  - 后续优化: 添加输出缓冲或压缩

- **单进程限制**: 当前每个会话只有一个终端实例
  - 后续扩展: 支持多标签终端

- **安全性**: PTY 执行任意命令，没有沙箱限制
  - 当前接受: 这是本地开发工具的预期行为

---

## Unknowns

- **Windows 兼容性**: 只在 macOS 上测试，Windows PowerShell 路径可能需要调整
- **复杂终端应用**: vim、tmux 等全屏应用未测试
- **中文输入**: 需要验证 IME 输入是否正常

---

## 运行指令

```bash
cd /Users/dengwenyu/Dev/AI/pi-session-manager
npm run tauri:dev
```

然后点击工具栏的终端图标或使用 `Cmd+J` 打开终端。

---

## 参考

- 参考项目: https://github.com/aiclientproxy/proxycast
- xterm.js 文档: https://xtermjs.org/
- portable-pty: https://docs.rs/portable-pty/
