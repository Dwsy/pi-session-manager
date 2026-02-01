# Repository Guidelines

本文档为 AI 编程助手提供本仓库的构建命令、代码风格与开发规范指引。

## 项目结构

```
src/                    # 前端（React + TypeScript + Vite）
src-tauri/              # 后端（Tauri + Rust）
src-tauri/src/          # Rust 源码
src-tauri/tests/        # Rust 集成测试
docs/                   # 设计文档
scripts/                # 辅助脚本
archive/                # 历史归档
```

## 构建、测试与开发命令

### 前端（TypeScript/React）

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

### 后端（Rust）

```bash
# 检查代码（不编译）
cd src-tauri && cargo check

# 构建
npm run tauri:build

# 开发模式（前端+Rust）
npm run tauri:dev
```

### 测试命令

**运行单个 Rust 测试：**
```bash
cd src-tauri && cargo test test_name_here
```

**运行特定测试文件：**
```bash
cd src-tauri && cargo test --test search_test
cd src-tauri && cargo test --test export_test
cd src-tauri && cargo test --test integration_test
```

**查看测试输出：**
```bash
cd src-tauri && cargo test -- --nocapture
```

**注意：前端暂无测试框架，如需添加测试请使用 Vitest 或 Jest。**

### 代码检查与格式化

**Rust（强制）：**
```bash
cd src-tauri && cargo fmt --check    # 检查格式
cd src-tauri && cargo fmt            # 自动格式化
cd src-tauri && cargo clippy         # 静态检查
```

**前端（暂无 ESLint/Prettier 配置，建议保持一致风格）：**
```bash
# 如需添加，建议配置：
# npm install -D eslint prettier @typescript-eslint/parser @typescript-eslint/eslint-plugin
```

## 代码风格指南

### TypeScript/React 规范

**导入顺序（必须遵循）：**
```typescript
// 1. React 核心
import { useState, useEffect, useMemo, useCallback } from 'react'

// 2. 第三方库
import { useTranslation } from 'react-i18next'
import { invoke } from '@tauri-apps/api/core'

// 3. 内部组件（默认导入）
import SessionList from './components/SessionList'

// 4. 自定义 Hooks
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'

// 5. 工具函数
import { formatDate } from './utils/date'

// 6. 类型（使用 import type）
import type { SessionInfo, SearchResult } from './types'
```

**命名规范：**

| 类型 | 规范 | 示例 |
|------|------|------|
| 组件 | PascalCase | `SessionList`, `DashboardPanel` |
| 函数 | camelCase | `handleClick`, `loadSessions` |
| 变量 | camelCase | `selectedSession`, `isLoading` |
| 常量 | UPPER_SNAKE_CASE | `MAX_ITEMS`, `DEFAULT_TIMEOUT` |
| 接口 | PascalCase | `SessionInfo`, `SearchResult` |
| Props | ComponentNameProps | `SessionListProps` |

**组件结构：**
```typescript
// 函数式组件 + Hooks，一个文件一个组件
function ComponentName({ prop1, prop2 }: ComponentNameProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<string>('')
  
  useEffect(() => {
    // 副作用
  }, [deps])
  
  const handler = useCallback(() => {
    // 事件处理
  }, [deps])
  
  return <div>...</div>
}

export default ComponentName
```

**错误处理：**
```typescript
try {
  const result = await invoke<SessionInfo>('scan_sessions')
  setSessions(result)
} catch (error) {
  console.error('Failed to load sessions:', error)
  setError(error instanceof Error ? error.message : 'Unknown error')
}
```

### Rust 规范

**命名规范：**
- 函数：snake_case（`scan_sessions`, `parse_file`）
- 类型：PascalCase（`SessionInfo`, `SearchResult`）
- 常量：SCREAMING_SNAKE_CASE（`MAX_RETRIES`）

**错误处理（强制使用 Result<T, String>）：**
```rust
pub async fn scan_sessions() -> Result<Vec<SessionInfo>, String> {
    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    
    parse_session(&content)
        .map_err(|e| format!("Parse error: {}", e))
}
```

**Tauri 命令模式：**
```rust
/// 文档注释：说明函数用途和参数
/// `path`: 文件路径
/// 返回: 会话内容
#[tauri::command]
pub async fn read_session_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read: {}", e))
}
```

**模块组织：**
- `lib.rs`：模块声明，Tauri 命令注册
- `commands.rs`：Tauri IPC 命令（瘦层）
- 功能模块（`scanner.rs`, `search.rs` 等）：业务逻辑

## 提交规范

使用 Conventional Commits：

```
feat: add session export to markdown
fix: resolve search not returning results
docs: update API documentation
refactor: simplify scanner logic
test: add unit tests for export module
chore: update dependencies
```

## 重要提示

1. **TypeScript 严格模式已启用**：`strict: true`，禁止使用 `any`
2. **Rust 错误处理**：所有公共函数必须返回 `Result<T, String>`，禁止 panic
3. **文档**：Rust 公共函数必须添加 `///` 文档注释
4. **测试**：修改 Rust 代码时，同步更新或添加测试（`src-tauri/tests/`）
5. **配置文件**：本地配置在 `~/.pi/agent/session-manager.json`

## 技术栈参考

- **前端**：React 18 + TypeScript + Vite + Tailwind CSS + i18next
- **后端**：Tauri 2 + Rust + Tokio + SQLite + Regex
- **构建**：Vite（前端）+ Cargo（Rust）
