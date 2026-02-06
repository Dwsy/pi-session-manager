# 下一步行动清单

## 立即可开始（本周）

### 1. 实时消息显示优化
**优先级**: P0
**预计时间**: 2-3 天
**文件**:
- `src/utils/rpcMessageParser.ts` (新建)
- `src/components/SessionViewer.tsx` (修改)

**具体步骤**:
1. 创建消息解析工具函数
   ```typescript
   export function parseRPCToSessionEntry(
     event: RPCEvent,
     existingEntries: SessionEntry[]
   ): { entry: SessionEntry | null; isUpdate: boolean }
   ```

2. 在 SessionViewer 中集成 RPC 消息
   - 监听 `streamingText` 变化
   - 实时追加到消息列表
   - 处理消息去重

3. 添加流式消息视觉反馈
   - 输入光标动画
   - 生成中状态指示

### 2. 消息发送 UI
**优先级**: P0
**预计时间**: 2-3 天
**文件**:
- `src/components/MessageInput.tsx` (新建)
- `src/components/SessionViewer.tsx` (修改)

**具体步骤**:
1. 创建输入组件
   - 多行文本框
   - 快捷键处理
   - 发送按钮

2. 集成到 SessionViewer
   - 底部固定输入栏
   - 发送状态显示
   - 错误处理

3. 样式调整
   - 与现有主题一致
   - 响应式布局

## 下周开始

### 3. 工具执行可视化
**优先级**: P1
**预计时间**: 3-4 天
**文件**:
- `src/components/ToolExecutionCard.tsx` (新建)
- `src/hooks/usePiRPC.ts` (修改)

**具体步骤**:
1. 创建工具执行卡片组件
   - 工具图标和名称
   - 参数显示
   - 状态指示器
   - 实时输出

2. 处理工具执行事件
   - `tool_execution_start`
   - `tool_execution_update`
   - `tool_execution_end`

3. 添加到消息流
   - 作为特殊消息类型
   - 可折叠/展开

### 4. 模型切换 UI
**优先级**: P1
**预计时间**: 1-2 天
**文件**:
- `src/components/ModelSelector.tsx` (新建)
- `src/components/SessionViewer.tsx` (修改)

**具体步骤**:
1. 创建模型选择器
   - 下拉菜单
   - 模型信息展示
   - 切换命令调用

2. 集成到 Header
   - 当前模型显示
   - 快速切换按钮

## 待讨论决策

### 1. 消息存储策略
**问题**: RPC 消息是否需要实时写入 SQLite？

**选项**:
- A: 实时写入（保证搜索可用，但可能影响性能）
- B: 延迟写入（批量写入，性能更好，但搜索有延迟）
- C: 仅写入文件（依赖文件监听，最简单）

**建议**: 先实现 C，后续根据性能测试选择 A 或 B

### 2. 多会话支持范围
**问题**: 是否支持同时显示多个会话？

**选项**:
- A: 单会话聚焦（类似现在，切换时更换）
- B: 标签页模式（类似浏览器，同时打开多个）
- C: 分屏模式（左右/上下对比）

**建议**: 先保持 A，在 Phase 4 考虑 B

### 3. 消息编辑功能
**问题**: 是否支持编辑已发送的消息？

**选项**:
- A: 不支持（保持简单）
- B: 支持编辑并重新生成
- C: 支持删除消息

**建议**: 先实现 A，根据用户反馈决定

## 技术准备

### 需要调研的技术点

1. **Web Worker 解析**
   - 大文件解析性能优化
   - 不阻塞主线程

2. **IndexedDB 缓存**
   - 客户端消息缓存
   - 减少重复解析

3. **虚拟列表优化**
   - @tanstack/react-virtual 高级用法
   - 动态高度处理

### 需要准备的测试数据

1. **大会话文件**
   - 1000+ 消息的会话
   - 用于性能测试

2. **包含各种事件的会话**
   - 工具调用
   - 模型切换
   - 压缩事件

3. **边缘情况**
   - 空会话
   - 损坏的 JSON
   - 超大消息内容

## 代码审查清单

### 提交前检查
- [ ] TypeScript 类型完整
- [ ] 没有 console.log（使用 logger）
- [ ] 错误处理完善
- [ ] 组件有 Props 类型定义
- [ ] Hook 有返回值类型定义

### 测试要求
- [ ] 新函数有单元测试
- [ ] 组件有基本渲染测试
- [ ] 手动测试通过

### 文档要求
- [ ] 复杂函数有 JSDoc 注释
- [ ] 新增组件有使用示例
- [ ] 更新 CHANGELOG.md

## 快速开始模板

### 创建新组件
```typescript
// src/components/ComponentName.tsx
import { useState } from 'react'

interface ComponentNameProps {
  // Props 定义
}

export function ComponentName({}: ComponentNameProps) {
  const [state, setState] = useState()

  return (
    <div>
      {/* 组件内容 */}
    </div>
  )
}
```

### 创建新 Hook
```typescript
// src/hooks/useHookName.ts
import { useState, useEffect } from 'react'

export interface UseHookNameReturn {
  // 返回值类型
}

export function useHookName(): UseHookNameReturn {
  const [state, setState] = useState()

  useEffect(() => {
    // 副作用
  }, [])

  return {
    // 返回值
  }
}
```

## 参考资源

### Pi Island 参考代码
- `pi-island-ref/Sources/PiIsland/RPC/RPCChatView.swift` - 聊天界面
- `pi-island-ref/Sources/PiIsland/RPC/SessionManager.swift` - 会话管理

### 相关文档
- `docs/architecture/pi-island-comparison-analysis.md` - 架构对比
- `docs/architecture/RPC_IMPLEMENTATION_SUMMARY.md` - 实现总结
- `docs/architecture/RPC_ROADMAP.md` - 完整路线图

### 外部资源
- [Tauri Events](https://tauri.app/develop/calling-frontend/#event-system)
- [React Virtual](https://tanstack.com/virtual/latest)
- [Pi CLI Documentation](https://github.com/pi/pi-cli) (如果有)
