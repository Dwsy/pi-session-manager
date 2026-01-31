# Pi Session Manager - 会话增强功能规划文档

## 概述

本文档规划了 pi-session-manager 的会话增强功能，核心目标是实现**在终端中打开会话**的功能，同时提供一系列相关的会话管理能力。

---

## 功能需求

### 1. 核心功能：在终端中打开会话

**需求描述**：
用户可以在 pi-session-manager 中选择一个会话，然后点击按钮或右键菜单，直接在终端中打开该会话并继续对话。

**实现方式**：
- 调用 `pi --session <path>` 命令在终端中打开指定会话
- 支持选择不同的终端应用程序（Terminal.app, iTerm2, VS Code 终端等）
- 支持自定义 pi 命令路径（如果 pi 不在默认 PATH 中）

**使用场景**：
1. 用户在 GUI 中浏览历史会话
2. 找到需要继续的对话
3. 点击"在终端中打开"按钮
4. 自动启动终端并加载该会话，可以继续对话

---

### 2. 快速恢复会话

**需求描述**：
提供快捷方式恢复最近的会话，类似于 `pi --resume` 和 `pi --continue`。

**功能列表**：
- **恢复上一个会话**：一键恢复最近使用的会话（`pi --continue`）
- **选择恢复会话**：显示最近会话列表，选择后恢复（`pi --resume`）
- **最近会话列表**：显示最近 10 个会话，点击快速打开

---

### 3. 会话快捷操作菜单

**需求描述**：
为每个会话提供右键菜单或操作按钮，快速执行常用操作。

**菜单项**：
| 操作 | 命令 | 说明 |
|------|------|------|
| 在终端中打开 | `pi --session <path>` | 在终端中继续此会话 |
| 在浏览器中打开 | `pi --export` + 打开文件 | 导出为 HTML 并在浏览器中打开 |
| 复制路径 | - | 复制会话文件路径到剪贴板 |
| 导出 | `pi --export` | 导出会话为 HTML |
| 重命名 | - | 修改会话名称 |
| 删除 | - | 删除会话文件 |
| 在新窗口打开 | - | 在新 GUI 窗口中查看 |

---

### 3.5 在浏览器中打开会话

**需求描述**：
用户可以在 pi-session-manager 中选择一个会话，点击"在浏览器中打开"按钮，系统会自动导出会话为 HTML 文件，然后使用默认浏览器打开该文件。

**实现方式**：
1. 调用现有的 `export_session` 函数导出会话为 HTML
2. 使用系统命令打开导出的 HTML 文件
3. 使用临时目录存储导出的文件，或保存到用户指定的位置

**流程**：
```
用户点击"在浏览器中打开"
    ↓
导出会话为 HTML 到临时目录
    ↓
使用系统默认程序打开 HTML 文件
    ↓
浏览器显示会话内容
```

**后端命令**：
```rust
#[tauri::command]
pub async fn open_session_in_browser(path: String) -> Result<(), String> {
    // 1. 导出会话为 HTML 到临时目录
    // 2. 使用系统命令打开 HTML 文件
    // macOS: open <file>
    // Linux: xdg-open <file>
    // Windows: start <file>
}
```

**前端组件**：
```typescript
// src/components/OpenInBrowserButton.tsx
interface OpenInBrowserButtonProps {
  session: SessionInfo
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'outline' | 'ghost'
}
```

---

### 4. 会话标签与分类

**需求描述**：
为会话添加标签，便于分类和筛选。

**功能列表**：
- **添加标签**：为会话添加自定义标签（如"工作"、"个人"、"重要"等）
- **标签筛选**：按标签筛选会话列表
- **标签管理**：创建、删除、重命名标签
- **颜色标记**：为不同标签设置颜色

---

### 5. 会话收藏

**需求描述**：
收藏重要会话，便于快速访问。

**功能列表**：
- **收藏/取消收藏**：点击星标收藏会话
- **收藏列表**：单独显示收藏的会话
- **置顶收藏**：收藏的会话显示在列表顶部

---

### 6. 会话预览增强

**需求描述**：
在不打开终端的情况下预览会话内容。

**功能列表**：
- **消息预览**：显示会话中的最近几条消息
- **代码块高亮**：预览中的代码块语法高亮
- **快速跳转**：点击消息跳转到对应位置

---

## 技术实现方案

### 后端（Rust）

#### 新增命令

```rust
// 在终端中打开会话
#[tauri::command]
pub async fn open_session_in_terminal(
    path: String,
    terminal: String,  // "default", "terminal", "iterm2", "vscode"
    pi_path: String,   // pi 命令路径，默认为 "pi"
) -> Result<(), String> {
    // 根据终端类型执行不同的打开命令
    // macOS: osascript 或 open 命令
    // Linux: x-terminal-emulator 或具体终端命令
    // Windows: start 命令
}

// 获取可用的终端列表
#[tauri::command]
pub async fn get_available_terminals() -> Result<Vec<TerminalInfo>, String> {
    // 检测系统上安装的终端应用程序
}

// 恢复上一个会话
#[tauri::command]
pub async fn continue_last_session(
    terminal: String,
    pi_path: String,
) -> Result<(), String> {
    // 执行 `pi --continue`
}

// 获取最近会话列表
#[tauri::command]
pub async fn get_recent_sessions(limit: usize) -> Result<Vec<SessionInfo>, String> {
    // 按修改时间排序，返回最近的 N 个会话
}

// 添加/移除会话标签
#[tauri::command]
pub async fn add_session_tag(path: String, tag: String) -> Result<(), String> {
    // 在会话文件中添加标签信息
}

#[tauri::command]
pub async fn remove_session_tag(path: String, tag: String) -> Result<(), String> {
    // 从会话文件中移除标签
}

// 收藏/取消收藏会话
#[tauri::command]
pub async fn toggle_session_favorite(path: String) -> Result<bool, String> {
    // 切换会话的收藏状态
}
```

#### 数据模型扩展

```rust
// src-tauri/src/models.rs

pub struct SessionInfo {
    pub path: String,
    pub id: String,
    pub cwd: String,
    pub name: Option<String>,
    pub created: String,
    pub modified: String,
    pub message_count: usize,
    pub first_message: String,
    pub all_messages_text: String,
    pub last_message: String,
    pub last_message_role: String,
    // 新增字段
    pub tags: Vec<String>,           // 标签列表
    pub is_favorite: bool,           // 是否收藏
    pub preview_messages: Vec<MessagePreview>, // 预览消息
}

pub struct TerminalInfo {
    pub id: String,      // 终端标识符
    pub name: String,    // 显示名称
    pub path: String,    // 可执行文件路径
    pub icon: String,    // 图标名称
}

pub struct MessagePreview {
    pub role: String,
    pub content: String,
    pub timestamp: String,
}
```

### 前端（React）

#### 新增组件

```typescript
// src/components/SessionContextMenu.tsx
// 会话右键菜单组件

interface SessionContextMenuProps {
  session: SessionInfo
  onOpenInTerminal: () => void
  onOpenInBrowser: () => void  // 新增：在浏览器中打开
  onCopyPath: () => void
  onExport: () => void
  onRename: () => void
  onDelete: () => void
  onToggleFavorite: () => void
  onAddTag: (tag: string) => void
}
```

```typescript
// src/components/OpenInTerminalButton.tsx
// 在终端中打开按钮

interface OpenInTerminalButtonProps {
  session: SessionInfo
  terminal?: string  // 指定终端，默认使用设置中的默认终端
  size?: 'sm' | 'md' | 'lg'
  variant?: 'default' | 'outline' | 'ghost'
}
```

```typescript
// src/components/SessionTags.tsx
// 会话标签组件

interface SessionTagsProps {
  tags: string[]
  onAddTag: (tag: string) => void
  onRemoveTag: (tag: string) => void
  availableTags: string[]
}
```

```typescript
// src/components/FavoriteButton.tsx
// 收藏按钮

interface FavoriteButtonProps {
  isFavorite: boolean
  onToggle: () => void
  size?: 'sm' | 'md' | 'lg'
}
```

```typescript
// src/components/RecentSessions.tsx
// 最近会话列表

interface RecentSessionsProps {
  limit?: number
  onSelectSession: (session: SessionInfo) => void
  onOpenInTerminal: (session: SessionInfo) => void
}
```

#### 设置面板扩展

```typescript
// src/components/settings/TerminalSettings.tsx
// 终端设置

interface TerminalSettings {
  defaultTerminal: string           // 默认终端
  piCommandPath: string            // pi 命令路径
  customTerminalCommand?: string   // 自定义终端命令
}
```

### UI 设计

#### 会话列表项增强

```
┌─────────────────────────────────────────────────────────────┐
│ [图标] 会话标题                                    [★] [⋯] │
│ 最后一条消息预览...                                         │
│ 📁 项目路径                          🏷️ 标签1 标签2         │
│ ⏱️ 2小时前  •  15条消息                                     │
└─────────────────────────────────────────────────────────────┘
```

- **★** - 收藏按钮
- **⋯** - 更多操作菜单
- **🏷️** - 标签显示

#### 右键菜单

```
┌──────────────────────────────┐
│ 在终端中打开        ⌘+Enter  │
│ 在浏览器中打开    ⌘+Shift+O  │
│ 在新窗口打开                 │
├──────────────────────────────┤
│ 复制路径            ⌘+C      │
│ 导出...                      │
├──────────────────────────────┤
│ 添加到收藏                   │
│ 添加标签          ▶          │
├──────────────────────────────┤
│ 重命名...                    │
│ 删除              ⌫          │
└──────────────────────────────┘
```

---

## 实现优先级

### Phase 1: 核心功能（高优先级）
1. **在终端中打开会话**
   - 后端命令实现
   - 前端按钮和菜单
   - 终端检测和配置

2. **在浏览器中打开会话** ⭐
   - 后端命令实现 (`open_session_in_browser`)
   - 复用现有的 `export_session` 功能
   - 前端按钮和菜单
   - 系统命令打开 HTML 文件

3. **会话快捷操作菜单**
   - 右键菜单组件
   - 复制路径功能
   - 导出功能集成

### Phase 2: 体验优化（中优先级）
3. **快速恢复会话**
   - 继续上一个会话按钮
   - 最近会话列表

4. **会话收藏**
   - 收藏按钮
   - 收藏列表筛选

### Phase 3: 高级功能（低优先级）
5. **会话标签**
   - 标签管理
   - 标签筛选

6. **会话预览增强**
   - 更多消息预览
   - 代码高亮

---

## 配置文件

新增配置文件存储用户偏好设置：

```json
// ~/.pi/session-manager/settings.json
{
  "terminal": {
    "default": "terminal",
    "piPath": "pi",
    "customCommand": null
  },
  "tags": [
    { "name": "工作", "color": "#3b82f6" },
    { "name": "个人", "color": "#10b981" },
    { "name": "重要", "color": "#f59e0b" }
  ],
  "ui": {
    "showPreviewMessages": true,
    "favoriteSessionsOnTop": true
  }
}
```

---

## API 接口汇总

### 后端命令

| 命令 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `open_session_in_terminal` | path, terminal, pi_path | Result<(), String> | 在终端打开会话 |
| `open_session_in_browser` | path | Result<(), String> | 在浏览器打开会话（导出HTML并打开） |
| `get_available_terminals` | - | Vec<TerminalInfo> | 获取可用终端列表 |
| `continue_last_session` | terminal, pi_path | Result<(), String> | 继续上一个会话 |
| `get_recent_sessions` | limit | Vec<SessionInfo> | 获取最近会话 |
| `add_session_tag` | path, tag | Result<(), String> | 添加标签 |
| `remove_session_tag` | path, tag | Result<(), String> | 移除标签 |
| `toggle_session_favorite` | path | Result<bool, String> | 切换收藏状态 |
| `get_session_tags` | path | Vec<String> | 获取会话标签 |

---

## 依赖项

### 新增 Rust 依赖

```toml
# src-tauri/Cargo.toml
[dependencies]
# 终端检测
which = "6.0"
# 执行外部命令
command-group = "5.0"
```

### 新增 TypeScript 依赖

无需新增依赖，使用现有 UI 组件库。

---

## 测试计划

1. **单元测试**
   - 终端检测逻辑
   - 命令构建函数
   - 标签管理功能

2. **集成测试**
   - 在终端中打开会话
   - 收藏功能持久化
   - 设置保存和读取

3. **手动测试**
   - 不同终端的兼容性
   - UI 交互流畅性
   - 键盘快捷键

---

## 下一步行动

1. 实现 `open_session_in_terminal` 后端命令
2. 实现 `open_session_in_browser` 后端命令 ⭐
   - 复用 `export.rs` 中的导出逻辑
   - 使用系统命令打开 HTML 文件
3. 创建 `OpenInTerminalButton` 前端组件
4. 创建 `OpenInBrowserButton` 前端组件 ⭐
5. 添加终端设置面板
6. 实现右键菜单组件
7. 添加键盘快捷键支持

---

## 附录

### 终端打开命令参考

**macOS:**
- Terminal.app: `osascript -e 'tell app "Terminal" to do script "pi --session <path>"'`
- iTerm2: `osascript -e 'tell app "iTerm" to create window with default profile command "pi --session <path>"'`
- VS Code: `code -n --exec "pi --session <path>"`

**Linux:**
- GNOME Terminal: `gnome-terminal -- bash -c "pi --session <path>; exec bash"`
- Konsole: `konsole -e "pi --session <path>"`
- Alacritty: `alacritty -e pi --session <path>`

**Windows:**
- CMD: `start cmd /k "pi --session <path>"`
- PowerShell: `start powershell -Command "pi --session <path>"`

### 浏览器打开命令参考

**macOS:**
```bash
# 导出并打开
pi --export <session_path> /tmp/session.html
open /tmp/session.html
```

**Linux:**
```bash
# 导出并打开
pi --export <session_path> /tmp/session.html
xdg-open /tmp/session.html
```

**Windows:**
```bash
# 导出并打开
pi --export <session_path> %TEMP%\session.html
start %TEMP%\session.html
```
