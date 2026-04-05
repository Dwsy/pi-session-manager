# 实时会话管理深度修复 (Mirror Sync Plan)

## 目标
解决实时会话中“历史消失”、“重复消息”和“数据竞态”问题。核心策略是：**在 Live 模式下完全抛弃磁盘读取，以 Pi CLI 内存状态为唯一真理来源。**

## 待变动组件

### 1. Backend Registry (`src-tauri/src/pi_agent_registry.rs`)
- [ ] `PiLiveSession` 结构体增加 `entries: Vec<serde_json::Value>`。
- [ ] `register` 方法支持接收初始 `entries`。
- [ ] 增加 `get_entries` 和 `set_entries` 方法。

### 2. Bridge Extension (`extensions/pi-session-bridge.ts`)
- [ ] 在 `register` 负载中包含 `entries: ctx.sessionManager.getEntries()`。
- [ ] 在 `session_start` 事件中触发全量同步。

### 3. Tauri Dispatcher/Commands (`src-tauri/src/lib.rs`)
- [ ] 暴露 `get_pi_agent_entries` 命令供前端调用。
- [ ] 修改 `pi_agent_registry` 消息处理逻辑，支持更新 entries 缓存。

### 4. Frontend Hook (`src/hooks/useSessionViewerData.ts`)
- [ ] `doLoad` 逻辑重写：如果是 `isLive`，优先调用 `get_pi_agent_entries`。
- [ ] 彻底禁用 Live 模式下的文件观察者 (`sessions-changed`)。
- [ ] 处理 `pi-agent:register` 事件，当 Bridge 重新连接时强制更新 entries 列表。

## 预期效果
- 直连渲染：打开 Live 会话瞬间看到完整历史，不依赖磁盘扫描。
- 数据单源：WebSocket 是唯一修改 entries 的地方，不会有重复和乱序。
- 零延迟：删除/修改消息在 CLI 中生效后，PSM 立即同步。
