# Task for crew-planner

Create a task breakdown for implementing this PRD.

## PRD: docs/issues/20260214-pi-config-tui-refactor.md

# Pi Config TUI 对齐重构

> Status: PLANNING
> Priority: P1
> Assignees: π-zero (coordinator), ZenIce (implementer)
> Created: 2026-02-14

---

## 1. 背景与目标

当前 `PiConfigSettings.tsx` 是一个半成品：只扫描 user skills/prompts，缺少 extensions/themes/packages，分组逻辑缺失，保存功能是空 TODO。

目标：**对齐 pi 源码的 config TUI 架构**，实现完整的资源管理 + Pi 设置项管理，保持与 `pi config` 命令一致的体验。

### 参考源码

| Pi 源码文件 | 职责 |
|---|---|
| `settings-manager.js` | 双层配置（global + project），deep merge，安全写入 |
| `package-manager.js` | 解析 npm/git 包，收集四类资源，生成 ResolvedPaths |
| `config-selector.js` | 资源管理 TUI（分组、搜索、toggle） |
| `settings-selector.js` | 设置项管理 TUI（boolean/enum/submenu） |

### 核心设计原则

1. **`+/-` 前缀机制**：`+path` 启用，`-path` 禁用，写入 settings.json
2. **三维分组**：origin（package/top-level）× scope（user/project）× resourceType（extensions/skills/prompts/themes）
3. **安全写入**：读-合并-写，只覆盖修改的字段，不破坏外部编辑
4. **双层合并**：global `~/.pi/agent/settings.json` + project `.pi/settings.json`

---

## 2. 现状分析

### 2.1 后端（Rust）现有能力

| 命令 | 状态 | 问题 |
|---|---|---|
| `scan_skills` | ✅ 可用 | 只扫描 user skills，无 project/package |
| `scan_prompts` | ✅ 可用 | 只扫描 user prompts，无 project/package |
| `load_pi_settings` | ✅ 可用 | 只返回 skills/prompts/extensions 数组 |
| `save_pi_settings` | ✅ 可用 | 直接覆盖写入，不做字段级合并 |
| `scan_extensions` | ❌ 缺失 | — |
| `scan_themes` | ❌ 缺失 | — |
| `scan_packages` | ❌ 缺失 | — |

### 2.2 前端现有能力

| 组件 | 状态 | 问题 |
|---|---|---|
| `PiConfigSettings.tsx` | ⚠️ 半成品 | 只有 skills/prompts tab，无分组，保存是 TODO |
| `SettingsPanel.tsx` | ✅ 框架完整 | 已有 section 路由，可扩展 |
| `types.ts` | ⚠️ 不完整 | SkillInfo/PromptInfo 缺少 metadata |

---

## 3. 任务拆分

### T1: 后端 — 资源扫描增强 [ZenIce]

**文件：** `src-tauri/src/commands/skills.rs`（重命名为 `pi_resources.rs`）

**改动：**

1. 新增 `ResourceMetadata` 结构体：
```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ResourceMetadata {
    pub source: String,       // "auto" | package name
    pub scope: String,        // "user" | "project"
    pub origin: String,       // "package" | "top-level"
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ResourceInfo {
    pub name: String,
    pub path: String,
    pub description: String,
    pub enabled: bool,
    pub resource_type: String, // "skills" | "extensions" | "prompts" | "themes"
    pub metadata: ResourceMetadata,
}
```

2. `scan_all_resources` 统一扫描接口：
   - 扫描 user skills: `~/.pi/agent/skills/`
   - 扫描 project skills: `.pi/skills/`（基于 cwd 参数）
   - 扫描 user extensions: `~/.pi/agent/extensions/`
   - 扫描 project extensions: `.pi/extensions/`
   - 扫描 user prompts: `~/.pi/agent/prompts/`
   - 扫描 project prompts: `.pi/prompts/`
   - 扫描 user themes: `~/.pi/agent/themes/`
   - 扫描 project themes: `.pi/themes/`
   - 读取 settings.json 的 `+/-` 前缀判断 enabled 状态
   - 读取 packages 列表，扫描已安装包的资源

3. 保留旧的 `scan_skills` / `scan_prompts` 兼容接口

**验收标准：**
- `scan_all_resources` 返回完整的 `Vec<ResourceInfo>`
- 每个资源带正确的 metadata（scope, origin, source）
- enabled 状态正确反映 settings.json 的 `+/-` 配置
- `cargo test` 通过

### T2: 后端 — Pi Settings 读写增强 [ZenIce]

**文件：** `src-tauri/src/commands/skills.rs`（或新文件 `pi_settings.rs`）

**改动：**

1. `load_pi_settings_full` 返回完整 settings.json 结构：
```rust
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct PiSettingsFull {
    pub default_provider: Option<String>,
    pub default_model: Option<String>,
    pub default_thinking_level: Option<String>,
    pub theme: Option<String>,
    pub steering_mode: Option<String>,
    pub follow_up_mode: Option<String>,
    pub hide_thinking_block: Option<bool>,
    pub quiet_startup: Option<bool>,
    pub collapse_changelog: Option<bool>,
    pub enable_skill_commands: Option<bool>,
    pub auto_compact: Option<bool>,
    pub shell_path: Option<String>,
    pub packages: Vec<serde_json::Value>,
    pub extensions: Vec<String>,
    pub skills: Vec<String>,
    pub prompts: Vec<String>,
    pub themes: Vec<String>,
}
```

2. `save_pi_setting` 单字段安全写入：
```rust
// 读取当前文件 → 合并单个字段 → 写回
pub async fn save_pi_setting(key: String, value: serde_json::Value) -> Result<(), String>
```

3. `toggle_resource` 专用接口：
```rust
// 在 settings.json 的对应数组中添加 +path 或 -path
pub async fn toggle_resource(
    resource_type: String,  // "skills" | "extensions" | "prompts" | "themes"
    path: String,           // 相对路径
    enabled: bool,
    scope: String,          // "user" | "project"
) -> Result<(), String>
```

**验收标准：**
- `load_pi_settings_full` 返回完整结构
- `save_pi_setting` 不破坏 settings.json 中其他字段
- `toggle_resource` 正确写入 `+/-` 前缀
- project scope 写入 `.pi/settings.json`

### T3: 前端 — 类型定义与 Transport [π-zero]

**文件：** `src/types.ts`

**改动：**

1. 新增类型定义对齐后端：
```typescript
export interface ResourceMetadata {
  source: string
  scope: 'user' | 'project'
  origin: 'package' | 'top-level'
}

export interface ResourceInfo {
  name: string
  path: string
  description: string
  enabled: boolean
  resourceType: 'skills' | 'extensions' | 'prompts' | 'themes'
  metadata: ResourceMetadata
}

export interface PiSettingsFull {
  defaultProvider?: string
  defaultModel?: string
  defaultThinkingLevel?: string
  theme?: string
  steeringMode?: string
  followUpMode?: string
  hideThinkingBlock?: boolean
  quietStartup?: boolean
  collapseChangelog?: boolean
  enableSkillCommands?: boolean
  autoCompact?: boolean
  shellPath?: string
  packages: unknown[]
  extensions: string[]
  skills: string[]
  prompts: string[]
  themes: string[]
}
```

2. 保留旧类型兼容

### T4: 前端 — PiConfigSettings 重构 [π-zero]

**文件：** `src/components/settings/sections/PiConfigSettings.tsx`

**改动：**

1. 拆分为两个主 Tab：
   - **Resources**（资源管理）：对齐 pi 的 `config-selector`
   - **Settings**（Pi 设置项）：对齐 pi 的 `settings-selector`

2. Resources Tab：
   - 调用 `scan_all_resources` 获取数据
   - 按 scope → origin → resourceType 三级分组渲染
   - 搜索过滤（name/path/type）
   - Toggle 调用 `toggle_resource` 实时保存
   - 分组标题：`User (~/.pi/agent/)` / `Project (.pi/)` / `package-name (user)`

3. Settings Tab：
   - 调用 `load_pi_settings_full` 获取数据
   - 渲染设置项列表，支持：
     - Boolean toggle（autoCompact, hideThinkingBlock, quietStartup 等）
     - Enum select（steeringMode, followUpMode, defaultThinkingLevel）
     - Text input（shellPath, defaultProvider, defaultModel）
   - 每项修改调用 `save_pi_setting` 单字段保存

**验收标准：**
- Resources 正确分组显示所有资源
- Toggle 实时写入 settings.json
- Settings 项与 `pi config` 的 settings selector 一致
- 搜索过滤正常工作
- 移动端适配正常

### T5: 前端 — i18n 补充 [π-zero]

**文件：** `src/i18n/locales/zh-CN/settings.ts`, `src/i18n/locales/en-US/settings.ts`

**改动：** 补充 Resources/Settings 相关的翻译 key

### T6: dispatch 注册 [ZenIce]

**文件：** `src-tauri/src/dispatch.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/main.rs`

**改动：** 注册新命令到 dispatch + Tauri IPC

---

## 4. 任务依赖与分工

```
T1 (后端资源扫描) ──┐
                     ├──→ T4 (前端重构) ──→ T5 (i18n)
T2 (后端设置读写) ──┤
                     └──→ T6 (dispatch 注册)
T3 (前端类型) ───────────→ T4
```

### 分工建议

| Agent | 任务 | 原因 |
|---|---|---|
| ZenIce | T1, T2, T6 | 后端 Rust 改动，独立可测 |
| π-zero | T3, T4, T5 | 前端 React 改动，依赖后端接口 |

**并行策略：**
- ZenIce 先做 T1+T2，π-zero 同时做 T3（类型定义可以先行）
- T1+T2 完成后 ZenIce 做 T6，π-zero 开始 T4
- 最后 π-zero 做 T5

---

## 5. 接口契约

### 5.1 scan_all_resources

```json
// Request
{ "command": "scan_all_resources", "payload": { "cwd": "/path/to/project" } }

// Response
{
  "success": true,
  "data": [
    {
      "name": "ace-tool",
      "path": "skills/ace-tool/SKILL.md",
      "description": "Semantic search over codebase...",
      "enabled": true,
      "resource_type": "skills",
      "metadata": { "source": "auto", "scope": "user", "origin": "top-level" }
    },
    {
      "name": "answer.ts",
      "path": "extensions/answer.ts",
      "description": "",
      "enabled": true,
      "resource_type": "extensions",
      "metadata": { "source": "auto", "scope": "user", "origin": "top-level" }
    }
  ]
}
```

### 5.2 load_pi_settings_full

```json
// Request
{ "command": "load_pi_settings_full", "payload": {} }

// Response
{
  "success": true,
  "data": {
    "default_provider": "op4.6",
    "default_model": "claude-opus-4-6",
    "default_thinking_level": "xhigh",
    "theme": "light",
    "steering_mode": "one-at-a-time",
    "follow_up_mode": "one-at-a-time",
    "hide_thinking_block": false,
    "quiet_startup": false,
    "collapse_changelog": false,
    "enable_skill_commands": true,
    "auto_compact": true,
    "shell_path": null,
    "packages": ["npm:pi-context", "npm:pi-messenger"],
    "extensions": ["+extensions/answer.ts", "-extensions/custom-footer.ts"],
    "skills": [],
    "prompts": [],
    "themes": []
  }
}
```

### 5.3 save_pi_setting

```json
// Request
{ "command": "save_pi_setting", "payload": { "key": "hideThinkingBlock", "value": true } }

// Response
{ "success": true }
```

### 5.4 toggle_resource

```json
// Request
{
  "command": "toggle_resource",
  "payload": {
    "resource_type": "extensions",
    "path": "extensions/answer.ts",
    "enabled": false,
    "scope": "user"
  }
}

// Response
{ "success": true }
```

---

## 6. 风险与注意事项

1. **settings.json 并发写入**：pi 和我们的应用可能同时写 settings.json，需要读-合并-写
2. **packages 扫描**：npm 包的资源路径解析较复杂，V1 可以只展示包名和 enable/disable 状态，不深入扫描包内资源
3. **project scope**：需要知道当前项目的 cwd，Tauri 桌面端可以用 `std::env::current_dir()`，CLI 模式需要从配置读取
4. **向后兼容**：保留旧的 `scan_skills` / `scan_prompts` 接口，新接口并行提供

---

## 7. 验收标准

- [ ] Resources tab 显示 user/project 两个 scope 的 extensions/skills/prompts/themes
- [ ] 每个资源的 enabled 状态正确反映 settings.json
- [ ] Toggle 操作实时写入 settings.json，使用 `+/-` 前缀
- [ ] Settings tab 显示 pi 的核心设置项（provider, model, thinking, theme 等）
- [ ] 设置修改实时保存，不破坏 settings.json 中其他字段
- [ ] 搜索过滤正常工作
- [ ] 移动端适配正常
- [ ] `cargo test` 和 TSC 零错误


Explore the codebase, identify patterns and conventions, then create a task breakdown following the output format in your instructions.