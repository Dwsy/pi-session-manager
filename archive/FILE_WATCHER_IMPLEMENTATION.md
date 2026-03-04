# 文件监听自动刷新功能实现总结

## 问题背景

用户提出两个需求：
1. ❌ **不要使用 30 秒轮询**，改用文件系统监听（watch）
2. ✅ **添加 Badge 区分新增和更新的会话**（待实现）

## 解决方案

### 架构设计

```
┌─────────────────────────────────────────────────────────────┐
│                    文件系统监听架构                          │
├─────────────────────────────────────────────────────────────┤
│  ~/.pi/agent/sessions/                                      │
│  └── *.jsonl 文件变化                                       │
│         ↓                                                   │
│  notify (Rust) - 文件系统监听                               │
│         ↓                                                   │
│  notify-debouncer-full (1秒防抖)                           │
│         ↓                                                   │
│  file_watcher.rs - 过滤 .jsonl 文件                        │
│         ↓                                                   │
│  Tauri Event System                                         │
│         ↓                                                   │
│  emit("sessions-changed")                                   │
│         ↓                                                   │
│  前端 useFileWatcher Hook                                   │
│         ↓                                                   │
│  listen("sessions-changed")                                 │
│         ↓                                                   │
│  触发 loadSessions()                                        │
│         ↓                                                   │
│  自动刷新会话列表 ✅                                        │
└─────────────────────────────────────────────────────────────┘
```

## 实现细节

### 后端（Rust）

#### 1. 添加依赖 (`src-tauri/Cargo.toml`)
```toml
notify = "6.1"
notify-debouncer-full = "0.3"
```

#### 2. 创建文件监听器 (`src-tauri/src/file_watcher.rs`)
```rust
pub fn start_file_watcher(sessions_dir: PathBuf, app_handle: AppHandle) -> Result<(), String> {
    // 创建防抖动监听器（1秒防抖）
    let mut debouncer = new_debouncer(Duration::from_secs(1), ...);
    
    // 监听目录
    debouncer.watcher().watch(&sessions_dir, RecursiveMode::Recursive)?;
    
    // 后台线程处理事件
    std::thread::spawn(move || {
        while let Ok(result) = rx.recv() {
            // 过滤 .jsonl 文件
            if has_jsonl_changes {
                // 发送事件到前端
                app_handle.emit("sessions-changed", ())?;
            }
        }
    });
}
```

#### 3. 注册模块 (`src-tauri/src/lib.rs`)
```rust
pub mod file_watcher;
```

#### 4. 启动监听器 (`src-tauri/src/main.rs`)
```rust
.setup(|app| {
    if let Ok(sessions_dir) = pi_session_manager::scanner::get_sessions_dir() {
        let app_handle = app.handle().clone();
        pi_session_manager::file_watcher::start_file_watcher(
            sessions_dir,
            app_handle,
        )?;
    }
    Ok(())
})
```

### 前端（TypeScript）

#### 1. 创建监听 Hook (`src/hooks/useFileWatcher.ts`)
```typescript
export function useFileWatcher({
  enabled = true,
  onSessionsChanged,
}: UseFileWatcherOptions) {
  useEffect(() => {
    const setupListener = async () => {
      const unlisten = await listen('sessions-changed', () => {
        console.log('[FileWatcher] Sessions changed, triggering refresh...')
        onSessionsChanged()
      })
    }
    setupListener()
    return () => unlisten?.()
  }, [enabled, onSessionsChanged])
}
```

#### 2. 集成到 App (`src/App.tsx`)
```typescript
// 加载会话列表
const loadSessions = useCallback(async () => {
  const result = await invoke<SessionInfo[]>('scan_sessions')
  setSessions(result)
}, [t])

// 文件监听：自动刷新会话列表
useFileWatcher({
  enabled: true,
  onSessionsChanged: loadSessions,
})
```

## 关键技术点

### 1. 防抖动（Debouncing）
- **问题**：文件保存可能触发多次事件
- **解决**：使用 `notify-debouncer-full`，1 秒内的多次变化合并为一次
- **好处**：避免频繁刷新，提升性能

### 2. 事件过滤
- **问题**：目录下可能有其他文件变化
- **解决**：只处理 `.jsonl` 扩展名的文件
- **好处**：减少不必要的刷新

### 3. 生命周期管理
- **问题**：监听器需要持续运行
- **解决**：使用 `Box::leak` 将监听器泄漏到静态生命周期
- **好处**：监听器不会被销毁，持续工作

### 4. 循环依赖避免
- **问题**：`useFileWatcher` 需要 `loadSessions`，但 `loadSessions` 在后面定义
- **解决**：使用 `useCallback` 包装 `loadSessions`
- **好处**：避免 "Cannot access before initialization" 错误

## 性能对比

| 指标 | 30秒轮询 | 文件监听 |
|------|---------|---------|
| 响应时间 | 0-30秒 | <1秒（实时） |
| CPU 占用 | 持续扫描 | 事件驱动（几乎为0） |
| I/O 开销 | 每30秒全量扫描 | 仅在变化时触发 |
| 电池消耗 | 较高 | 极低 |
| 实时性 | ❌ 差 | ✅ 优秀 |

## 测试方法

### 自动化测试
```bash
node ./scripts/test-file-watcher.mjs
```

### 手动测试
1. 启动应用
2. 在终端创建新会话文件：
   ```bash
   echo '{"type":"session",...}' > ~/.pi/agent/sessions/--test--/test.jsonl
   ```
3. 观察应用界面是否自动刷新
4. 检查控制台日志：
   - 后端：`[FileWatcher]` 或 `File watcher`
   - 前端：`[FileWatcher] Sessions changed`

## 已知问题

### 1. ~~循环依赖错误~~ ✅ 已解决
- **错误**：`ReferenceError: Cannot access 'loadSessions' before initialization`
- **原因**：`useFileWatcher` 在 `loadSessions` 定义之前调用
- **解决**：使用 `useCallback` 包装 `loadSessions`

### 2. ~~Tauri 编译错误~~ ✅ 已解决
- **错误**：初次修改时可能遗漏文件
- **原因**：修改了 `main.rs` 但未正确保存
- **解决**：重新检查并正确修改所有文件

## 下一步计划

### Badge 功能（待实现）
1. 创建 `useSessionBadges` Hook
2. 对比前后两次 sessions 数组
3. 判断新增（首次出现）和更新（message_count 增加）
4. 在 SessionList 中显示 Badge
5. 查看后自动清除 Badge

### 优化方向
1. 添加配置选项：启用/禁用文件监听
2. 添加手动刷新按钮（保留 Cmd+R）
3. 显示最后刷新时间
4. 添加刷新动画效果

## 总结

✅ **成功实现**：
- 使用 `notify` 替代 30 秒轮询
- 实时响应文件变化
- 性能显著提升
- 用户体验改善

🎯 **核心优势**：
- **实时性**：文件变化立即刷新（<1秒）
- **高效性**：事件驱动，CPU 占用极低
- **可靠性**：防抖动机制，避免频繁刷新
- **可扩展性**：易于添加 Badge 等功能

📝 **技术亮点**：
- Rust 文件系统监听
- Tauri 事件系统
- React Hooks 最佳实践
- 防抖动优化

---

**实现时间**：2026-01-31  
**状态**：✅ 文件监听完成，⏳ Badge 功能待实现
