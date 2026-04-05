# Pi Live 功能重构计划

> **目标:** 将 Pi Live 功能开关化（默认关闭），重构架构使 PSM Rust 层轻量化，前端 TS 承担协议理解与业务逻辑。

> **架构原则:** Pi (TS) → WS → PSM Rust (透传) → 前端 TS (业务)

---

## 架构设计

### 当前问题

| 问题 | 位置 | 影响 |
|------|------|------|
| Rust 层协议解析过重 | `ws_adapter.rs` (270+ 行) | 维护困难，类型不一致 |
| 类型定义重复 | `pi_agent_registry.rs` / `pi_live.rs` / 前端 | 同步负担 |
| 无功能开关 | App.tsx 硬编码 `showPiLive` | 用户无法控制 |
| 业务逻辑错位 | Rust 承担状态缓存/事件转发 | 职责混乱 |

### 目标架构

```
┌─────────────────────────────────────────────────────────────────┐
│  前端 TS (业务智能层)                                            │
│  ├── src/types/pi-live.ts        # 统一类型定义                 │
│  ├── src/hooks/usePiLive.ts      # 会话状态 + 事件管理          │
│  ├── src/components/pi-live/     # UI 组件                      │
│  └── src/settings/sections/PiLiveSettings.tsx  # 设置界面       │
├─────────────────────────────────────────────────────────────────┤
│  PSM Rust (轻量透传层)                                           │
│  ├── pi_agent_registry.rs        # 内存表 + RPC 响应队列 (瘦)   │
│  ├── ws_adapter.rs              # WS 透传 + 命令路由 (瘦)      │
│  └── pi_live.rs                 # 命令注册表 (无业务逻辑)      │
├─────────────────────────────────────────────────────────────────┤
│  pi-session-bridge.ts (协议桥接层, 已存在)                       │
│  ├── 事件转换 (Pi Event ↔ PSM Protocol)                        │
│  └── 命令转换 (PSM Command → Pi API Call)                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 任务分解

### Phase 1: 前端类型与设置系统

#### Task 1.1: 创建统一类型定义

**文件:**
- 创建: `src/types/pi-live.ts`

```typescript
// 会话信息
export interface PiLiveSession {
  session_id: string
  session_path?: string
  pid?: number
  cwd?: string
  is_streaming: boolean
  entry_count: number
  last_seen: string
  model?: PiLiveModelInfo
  thinking_level?: string
  context_usage?: PiLiveContextUsage
  tags?: PiLiveTag[]
}

// 模型信息
export interface PiLiveModelInfo {
  provider: string
  id: string
  name?: string
}

// 上下文使用
export interface PiLiveContextUsage {
  used: number
  limit: number
  unit?: string
}

// 标签
export interface PiLiveTag {
  id: string
  name: string
  color: string
}

// 命令类型
export type PiLiveCommandType =
  | 'steer'
  | 'prompt'
  | 'set_model'
  | 'set_thinking'
  | 'abort'
  | 'get_state'

// 命令参数
export interface PiLiveCommand {
  type: PiLiveCommandType
  sessionId: string
  message?: string
  provider?: string
  modelId?: string
  level?: string
  deliverAs?: string
  streamingBehavior?: string
}

// 事件类型
export type PiLiveEventType =
  | 'pi-agent:register'
  | 'pi-agent:disconnect'
  | 'pi-agent:entry'
  | 'pi-agent:session_state'

// 连接状态
export type PiLiveConnectionState = 'connected' | 'reconnecting' | 'disconnected'

// 设置类型
export interface PiLiveSettings {
  enabled: boolean          // 功能开关，默认 false
  showInSidebar: boolean   // 侧边栏显示入口
  autoReconnect: boolean   // 自动重连
  maxEntries: number       // 最大条目缓存
  showModelInfo: boolean   // 显示模型信息
  showThinkingLevel: boolean // 显示思考级别
}
```

#### Task 1.2: 添加设置类型

**文件:**
- 修改: `src/components/settings/types.ts`

```typescript
// 在 AppSettings 中添加
export interface AppSettings {
  // ... 现有字段
  piLive: PiLiveSettings  // 新增
}

// 默认值
export const defaultSettings: AppSettings = {
  // ... 现有
  piLive: {
    enabled: false,
    showInSidebar: true,
    autoReconnect: true,
    maxEntries: 200,
    showModelInfo: true,
    showThinkingLevel: true,
  }
}
```

#### Task 1.3: 创建设置界面

**文件:**
- 创建: `src/components/settings/sections/PiLiveSettings.tsx`

```typescript
// 约 80 行，设置界面组件
// 使用 SettingsToggleRow, SettingsSliderField 等现有组件
// 包含: 开关、最大条目滑块、显示选项复选框
```

#### Task 1.4: 注册设置入口

**文件:**
- 修改: `src/components/settings/SettingsPanel.tsx`
- 添加 Pi Live 设置卡片入口

---

### Phase 2: 前端 Hook 重构

#### Task 2.1: 创建统一 Hook

**文件:**
- 创建: `src/hooks/usePiLive.ts`
- 废弃: `src/hooks/usePiLiveSessions.ts` (合并)

```typescript
// 功能:
1. 从后端获取会话列表
2. 监听 WS 事件 (pi-agent:register/disconnect/entry/session_state)
3. 管理连接状态
4. 提供 CRUD 方法 (refresh, disconnect, reconnect)
5. 读取设置决定是否启用
```

#### Task 2.2: 迁移现有组件

**文件:**
- 修改: `src/hooks/usePiLiveSessions.ts` → 重新导出 `usePiLive`
- 修改: `src/components/PiLivePanel.tsx` → 使用 `usePiLive`
- 修改: `src/components/SessionViewer.tsx` → 使用 `usePiLive`
- 修改: `src/components/SessionViewerOnlineStatusBar.tsx` → 使用 `usePiLive`
- 修改: `src/components/session-viewer/SessionViewerModelControls.tsx` → 使用 `usePiLive`
- 修改: `src/App.tsx` → 使用设置系统控制功能

---

### Phase 3: 前端 UI 组件重构

#### Task 3.1: 重组组件目录

**文件:**
- 创建: `src/components/pi-live/index.ts`
- 移动+重命名: `src/components/PiLivePanel.tsx` → `src/components/pi-live/PiLivePanel.tsx`
- 移动+重命名: `src/components/ChatInput.tsx` → `src/components/pi-live/PiLiveChatInput.tsx`

#### Task 3.2: 增强会话卡片

**文件:**
- 创建: `src/components/pi-live/PiLiveSessionCard.tsx`

```typescript
// 功能:
1. 显示会话信息 (ID, PID, CWD)
2. 显示流状态 (Live 指示器)
3. 显示模型信息 (可选)
4. 显示思考级别 (可选)
5. 显示上下文使用 (可选)
6. 操作按钮 (Steer, Abort)
```

#### Task 3.3: 增强状态栏

**文件:**
- 创建: `src/components/pi-live/PiLiveStatusBar.tsx`

```typescript
// 功能:
1. 连接状态指示 (🟢/⏳/❌)
2. 会话数量
3. 自动刷新开关
```

---

### Phase 4: PSM Rust 瘦化

#### Task 4.1: 瘦化 pi_agent_registry.rs

**文件:**
- 修改: `src-tauri/src/pi_agent_registry.rs`

```rust
// 移除职责:
- 协议解析
- 事件类型判断
- 业务状态转换

// 保留职责:
- 内存会话表 (HashMap<session_id, PiLiveSession>)
- RPC 响应通道注册
- 响应转发 (forward_response)
- 基础 CRUD (register, remove, list, get_live_session)
```

**类型迁移到前端:**
- `PiLiveSession` 结构体 → `src/types/pi-live.ts`
- `PiAgentConnection` → 内部私有

#### Task 4.2: 瘦化 ws_adapter.rs

**文件:**
- 修改: `src-tauri/src/ws_adapter.rs`

```rust
// 移除:
- pi-agent:register 消息解析 (注册逻辑提取)
- pi-agent:entry 消息解析 (entry_count 更新提取)
- session_state 消息解析
- 硬编码的事件类型判断

// 保留:
- WebSocket 连接管理
- 消息透传 (raw passthrough)
- 事件广播到前端
- 心跳 (ping/pong)
```

**新流程:**
```
WS 消息 → 检查 type 字段 →
  如果 type 以 "pi-agent:" 开头 → 直接转发到前端
  如果 type 是 "response" → 转发到 pi_agent_registry
  其他 → 原有逻辑
```

#### Task 4.3: 瘦化 pi_live.rs

**文件:**
- 修改: `src-tauri/src/commands/pi_live.rs`

```rust
// 移除:
- 复杂的命令构建逻辑

// 保留:
- 命令函数签名
- 简单的状态读取/写入
```

---

### Phase 5: 后端命令统一

#### Task 5.1: 统一命令路径

**文件:**
- 修改: `src-tauri/src/commands/mod.rs`
- 修改: `src-tauri/src/dispatch.rs`

```rust
// 命令统一前缀: pi_live_*
// pi_agent_steering → pi_live_steer
// pi_agent_send_message → pi_live_send_message
// pi_agent_set_model → pi_live_set_model
// pi_agent_set_thinking → pi_live_set_thinking
// pi_agent_abort → pi_live_abort
// pi_agent_get_state → pi_live_get_state
```

#### Task 5.2: 前端命令调用更新

**文件:**
- 修改: `src/transport.ts` 或命令调用处
- 更新所有 `pi_agent_*` 调用为 `pi_live_*`

---

### Phase 6: 事件系统优化

#### Task 6.1: 统一事件前缀

**事件前缀:** `pi-live:*`

```typescript
// 现有 → 新
'pi-agent:register'    → 'pi-live:session_registered'
'pi-agent:disconnect'  → 'pi-live:session_disconnected'
'pi-agent:entry'       → 'pi-live:entry_received'
'pi-agent:session_state' → 'pi-live:state_updated'
```

#### Task 6.2: 更新事件监听

**文件:**
- 修改: `src/hooks/usePiLive.ts`
- 修改: `pi-session-bridge.ts` (扩展，发送事件)

---

### Phase 7: 测试与文档

#### Task 7.1: 添加集成测试

**文件:**
- 创建: `src-tauri/tests/pi_live_test.rs`

```rust
// 测试:
1. get_pi_live_sessions 返回空列表
2. 注册后会话出现在列表
3. 断开后会话从列表移除
4. RPC 命令发送成功
```

#### Task 7.2: 更新文档

**文件:**
- 修改: `docs/PI_LIVE_ARCHITECTURE.md` (新建)
- 修改: `README.md` (添加功能说明)

---

## 文件变更清单

### 新建文件
- `src/types/pi-live.ts`
- `src/components/settings/sections/PiLiveSettings.tsx`
- `src/components/pi-live/index.ts`
- `src/components/pi-live/PiLivePanel.tsx`
- `src/components/pi-live/PiLiveSessionCard.tsx`
- `src/components/pi-live/PiLiveChatInput.tsx`
- `src/components/pi-live/PiLiveStatusBar.tsx`
- `src-tauri/tests/pi_live_test.rs`
- `docs/PI_LIVE_ARCHITECTURE.md`

### 修改文件
- `src/components/settings/types.ts`
- `src/components/settings/SettingsPanel.tsx`
- `src/hooks/usePiLiveSessions.ts` → 重新导出
- `src/hooks/usePiLive.ts` → 新主 Hook
- `src/components/SessionViewer.tsx`
- `src/components/app/AppDesktopSidebar.tsx`
- `src/components/session-viewer/SessionViewerOnlineStatusBar.tsx`
- `src/components/session-viewer/SessionViewerModelControls.tsx`
- `src/App.tsx`
- `src-tauri/src/pi_agent_registry.rs`
- `src-tauri/src/ws_adapter.rs`
- `src-tauri/src/commands/pi_live.rs`
- `src-tauri/src/commands/mod.rs`
- `src-tauri/src/dispatch.rs`

### 删除文件
- `src/components/PiLivePanel.tsx` (移动到 pi-live/)
- `src/components/ChatInput.tsx` (移动到 pi-live/)

---

## 实施顺序

```
Phase 1 (前端类型与设置)
  └─ Task 1.1 → 1.2 → 1.3 → 1.4

Phase 2 (前端 Hook 重构)
  └─ Task 2.1 → 2.2

Phase 3 (前端 UI 重构)
  └─ Task 3.1 → 3.2 → 3.3

Phase 4 (Rust 瘦化) [可与 Phase 2-3 并行]
  └─ Task 4.1 → 4.2 → 4.3

Phase 5 (命令统一)
  └─ Task 5.1 → 5.2

Phase 6 (事件系统)
  └─ Task 6.1 → 6.2

Phase 7 (测试与文档)
  └─ Task 7.1 → 7.2
```

---

## 关键设计决策

### 1. 为什么不删除 pi_session_bridge.ts?
- 它负责 Pi (TS) ↔ PSM (Rust) 的协议转换
- 修改它会增加复杂度
- 当前任务是瘦化 PSM Rust，不是修改协议

### 2. 为什么事件前缀改为 pi-live:*?
- 避免与 Pi 内部事件混淆
- 明确这是 PSM 前端的职责

### 3. 为什么废弃 usePiLiveSessions 而创建 usePiLive?
- 新 Hook 包含完整功能 (状态管理+事件监听+设置读取)
- 单一职责原则
- 更容易测试和维护

### 4. Rust 层为什么保留内存表?
- 前端需要快速查询会话列表
- 避免每次都通过 WS 获取
- 但状态缓存移到前端

---

## 验证标准

1. ✅ 设置界面可以开关 Pi Live 功能
2. ✅ 关闭后侧边栏不显示 Pi Live 入口
3. ✅ 开启后可正常连接 Pi 会话
4. ✅ 模型/思考级别正确显示
5. ✅ Steering 消息发送成功
6. ✅ Rust 代码行数减少 ≥ 30%
7. ✅ 前端类型统一，无重复定义
8. ✅ 现有功能不受影响
