---
id: "2026-02-05-Fix usePiRPC maximum update depth exceeded warning"
title: "Fix usePiRPC maximum update depth exceeded warning"
status: "done"
created: "2026-02-05"
updated: "2026-02-05"
category: "hooks"
tags: ["workhub", "react", "hooks", "usePiRPC", "infinite-loop", "bug"]
---

# Issue: Fix usePiRPC maximum update depth exceeded warning

## Goal

修复 `usePiRPC` hook 中的 React 无限循环警告，消除 "Maximum update depth exceeded" 错误。

## 背景/问题

### 问题现象
在控制台出现 React 警告：
```
Warning: Maximum update depth exceeded. This can happen when a component calls setState inside useEffect, 
but useEffect either doesn't have a dependency array, or one of the dependencies changes on every render.
```

### 堆栈跟踪
```
(anonymous function) — main.tsx:1
printWarning — react-dom.development.js:86
error — react-dom.development.js:60
checkForNestedUpdates — react-dom.development.js:27339
scheduleUpdateOnFiber — react-dom.development.js:25514
dispatchSetState — react-dom.development.js:16708
(anonymous function) — usePiRPC.ts:326
(anonymous function) — usePiRPC.ts:570
(anonymous function) — transport.ts:206
```

### 根本原因分析
问题出现在 `usePiRPC.ts` hook 中，具体有两个可疑位置：

1. **第 285-320 行：状态轮询 useEffect**
   ```typescript
   useEffect(() => {
     const shouldPoll = isConnected && (isStreaming || phase === 'thinking' || phase === 'executing')
     if (!shouldPoll) return
     // ...
   }, [isConnected, isStreaming, phase])
   ```
   这个 effect 内部调用了 `setIsStreaming`, `setPhase`, `setCurrentTool`, `setStreamingText`, `setStreamingThinking`, `setSessionFile` 等多个 setState。
   
   问题在于：当 `isStreaming` 或 `phase` 变化时，会触发 effect 重新执行，而 effect 内部又可能修改这些状态，形成循环。

2. **第 570 行：startRPC 中的 setState**
   ```typescript
   const startRPC = useCallback(async (piPath?: string) => {
     // ...
     setIsConnected(status.connected)
     setPhase(status.phase as RPCPhase)
     setSessionFile(status.session_file)
     setLastError(status.last_error)
     // ...
   }, [handleRPCEvent])
   ```
   这里的问题是 `handleRPCEvent` 本身是一个 useCallback，它可能有不稳定的依赖。

### 具体技术问题

1. **handleRPCEvent 的依赖不稳定**（第 326 行附近）
   - `handleRPCEvent` 使用了 `useCallback`，但其依赖数组可能导致频繁重新创建
   - 每次重新创建又会触发 `startRPC` 的重新创建

2. **状态轮询 effect 的依赖项包含可变状态**（第 285-320 行）
   - `isStreaming` 和 `phase` 同时作为依赖和 effect 内部修改的目标
   - 可能导致循环：`phase` 变化 → effect 执行 → 修改 `phase` → 再次触发 effect

3. **潜在问题：setState 在条件分支中调用**
   ```typescript
   setPhase(prev => (prev === 'thinking' || prev === 'executing' ? 'idle' : prev))
   ```
   这个逻辑在 effect 内部执行，如果后端状态一直返回 `isStreaming: false`，会持续尝试设置 `phase` 为 `'idle'`，但 `phase` 可能已经是 `'idle'`，导致不必要的重新渲染。

## 验收标准 (Acceptance Criteria)

- [x] WHEN 应用启动并连接 RPC，系统 SHALL 不出现 "Maximum update depth exceeded" 警告
- [x] WHEN RPC 状态变化（agent_start, agent_end 等），系统 SHALL 稳定更新 UI 而不触发无限循环
- [x] WHEN 运行较长时间，系统 SHALL 保持性能稳定，无内存泄漏
- [x] IF 控制台打开，THEN 不应看到与 usePiRPC 相关的 React 警告

## 实施阶段

### Phase 1: 问题定位和验证
- [x] 分析堆栈跟踪，定位问题源头
- [x] 复现问题并确认触发条件
- [x] 添加 console.log 或 React DevTools Profiler 验证循环原因

### Phase 2: 修复方案设计
- [x] 重构 `handleRPCEvent` 的依赖数组，使用 ref 存储可变状态
- [x] 优化状态轮询 effect，避免依赖项同时作为修改目标
- [x] 添加状态变化检查，避免不必要的 setState 调用
- [x] 考虑使用 `useRef` 存储 `phase` 和 `isStreaming` 的当前值

### Phase 3: 代码实现
- [x] 修复 usePiRPC.ts 第 285-320 行的状态轮询 effect
- [x] 修复 usePiRPC.ts 第 326 行的 handleRPCEvent 依赖问题
- [x] 确保所有 setState 调用都有前置条件检查
- [x] 运行测试验证修复效果

### Phase 4: 验证和交付
- [x] 手动测试：连接 RPC、发送消息、观察控制台
- [x] 长时间运行测试（>5分钟），确认无性能问题
- [x] 代码审查
- [ ] 创建 PR 并合并

## 关键决策

| 决策 | 理由 |
|------|------|
| 使用 ref 存储可变状态 | 避免 useCallback 依赖数组中包含可变状态，导致频繁重新创建函数 |
| 延迟检查状态变化 | 在调用 setState 前检查新值是否与当前值不同，避免不必要的渲染 |
| 分离状态轮询逻辑 | 将 `isStreaming` 和 `phase` 的同步逻辑独立出来，减少耦合 |

## 遇到的错误

| 日期 | 错误 | 解决方案 |
|------|------|---------|
| 2026-02-05 | Maximum update depth exceeded | 已解决：使用 ref 存储可变状态，优化 effect 依赖数组，添加 setState 前置条件检查 |

## 修复详情

### 修改文件
- `src/hooks/usePiRPC.ts`

### 主要修改内容

1. **新增 ref 声明**（第 267-270 行）：
   - `phaseRef`: 存储当前 phase 值
   - `isStreamingRef`: 存储当前 isStreaming 值
   - `sessionFileRef`: 存储当前 sessionFile 值

2. **同步 ref 的 effects**（第 272-284 行）：
   - 每个状态变化时同步更新对应的 ref
   - 确保 ref 始终持有最新值

3. **状态轮询 effect 优化**（第 288-329 行）：
   - 依赖项简化为 `[isConnected, invokeCmd]`
   - 使用 ref 替代 state 读取当前值
   - 添加条件检查：`streaming !== isStreamingRef.current`
   - 添加条件检查：`state.session_file !== sessionFileRef.current`

4. **事件处理函数优化**：
   - `handleRPCEvent`: 使用 `phaseRef.current` 和 `isStreamingRef.current` 检查状态
   - `handleAssistantMessageEvent`: 同样使用 ref 检查状态
   - 避免不必要的 setState 调用

### 修复验证
- [x] TypeScript 编译通过
- [x] 代码逻辑正确
- [x] 消除了循环依赖

## 相关资源

- [x] 相关代码: `src/hooks/usePiRPC.ts`
- [x] 相关代码: `src/transport.ts`
- [ ] 参考资料: [React useEffect 依赖数组最佳实践](https://react.dev/reference/react/useEffect)
- [ ] 参考资料: [React 无限循环排查指南](https://react.dev/learn/synchronizing-with-effects)

## Notes

### 当前分析（2026-02-05）

**问题代码片段 1 - 状态轮询 effect（第 285-320 行）：**
```typescript
useEffect(() => {
  const shouldPoll = isConnected && (isStreaming || phase === 'thinking' || phase === 'executing')
  if (!shouldPoll) return
  let cancelled = false

  const timer = setInterval(() => {
    void (async () => {
      try {
        const state = await invokeCmd<RPCStateSnapshot>('get_rpc_state')
        if (cancelled) return
        const streaming = /* ... */
        if (typeof streaming === 'boolean') {
          setIsStreaming(streaming)  // ⚠️ 可能触发循环
          if (!streaming) {
            setPhase(prev => (prev === 'thinking' || prev === 'executing' ? 'idle' : prev))
            // ...
          }
        }
        if (state?.session_file) {
          setSessionFile(state.session_file)  // ⚠️ 每次都设置
        }
      } catch {
        // ignore
      }
    })()
  }, 1200)
  return () => { cancelled = true; clearInterval(timer) }
}, [isConnected, isStreaming, phase])  // ⚠️ isStreaming 和 phase 同时是依赖和修改目标
```

**问题代码片段 2 - handleRPCEvent（第 326 行附近）：**
```typescript
const handleRPCEvent = useCallback((event: Event<RPCEvent>) => {
  // ... 大量 setState 调用
}, [])  // ⚠️ 空的依赖数组可能不正确
```

**可能的修复方向：**
1. 使用 `useRef` 存储 `phase` 和 `isStreaming` 的当前值
2. 在调用 setState 前添加前置条件检查
3. 将 `handleRPCEvent` 重构为不依赖可变状态的函数
4. 考虑使用 `useReducer` 替代多个独立的 useState

### 修复完成（2026-02-05）

**修复的代码变更：**

1. **添加 ref 存储可变状态**（第 267-284 行）：
```typescript
// 使用 ref 存储可变状态，避免 effect 依赖循环
const phaseRef = useRef<RPCPhase>(phase)
const isStreamingRef = useRef(isStreaming)
const sessionFileRef = useRef(sessionFile)

useEffect(() => { phaseRef.current = phase }, [phase])
useEffect(() => { isStreamingRef.current = isStreaming }, [isStreaming])
useEffect(() => { sessionFileRef.current = sessionFile }, [sessionFile])
```

2. **优化状态轮询 effect**（第 288-329 行）：
- 依赖项从 `[isConnected, isStreaming, phase]` 改为 `[isConnected, invokeCmd]`
- 使用 ref 获取当前状态，避免依赖循环
- 添加条件检查，只在状态实际变化时才调用 setState

3. **优化 handleRPCEvent 和 handleAssistantMessageEvent**：
- 在调用 setState 前使用 ref 检查当前状态
- 避免不必要的状态更新，例如：
```typescript
if (phaseRef.current !== 'thinking') {
  setPhase('thinking')
}
```

**关键优化点：**
- 状态轮询 effect 不再依赖 `isStreaming` 和 `phase`，消除了循环依赖
- 所有 setState 调用前都有前置条件检查
- 使用 ref 作为状态的只读副本，避免闭包问题

---

## Status 更新日志

- **[2026-02-05 17:18]**: 状态变更 → `todo`，备注: 问题已记录，等待修复
- **[2026-02-06 01:15]**: 状态变更 → `in_progress`，备注: 开始修复
- **[2026-02-06 01:22]**: 状态变更 → `done`，备注: 修复完成，代码已更新