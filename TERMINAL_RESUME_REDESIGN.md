# Terminal Resume 功能全面重设计

## 问题诊断

```
Terminal Resume 功能问题清单
│
├── 功能问题
│   ├── [1] Resume 时无法选择终端，只能用设置中的默认终端
│   ├── [2] 自定义命令占位符逻辑有问题：无占位符时追加 sh -lc，可能破坏完整命令
│   ├── [3] Web 模式 vs 桌面模式的 buildResumeCommand 逻辑不一致
│   └── [4] 快捷键 Cmd+R 无任何反馈提示
│
├── UI/UX 问题
│   ├── [1] TerminalSettings 自定义 toggle 按钮与 SettingsToggleRow 风格不一致
│   ├── [2] Resume 按钮太小 (ghost variant)，视觉权重不够
│   ├── [3] 操作后无成功/失败反馈
│   ├── [4] 占位符文档缺失，用户不知道怎么写自定义命令
│   └── [5] 信息分组混乱：内建终端和外部终端混在一起
│
└── 设计改进
    ├── [1] 重新组织设置页面分区
    ├── [2] 使用统一组件（SettingsToggleRow, SettingsOptionGroup）
    ├── [3] 增加占位符参考卡片
    └── [4] Resume 按钮增加快捷键提示
```

## 修改文件

### 1. `src/components/settings/sections/TerminalSettings.tsx` - 完全重写
- 分区设计：内置终端 / 外部终端 / 快捷键
- 使用统一的 ToggleRow 组件
- 添加占位符参考折叠卡片
- 添加 tmux 命令示例（可复制）
- 添加快捷键提示区域

### 2. `src/components/OpenInTerminalButton.tsx` - 改进
- 添加 `showShortcut` 属性显示 ⌘R 提示
- 新增 `secondary` variant 选项
- 移除未使用的 Keyboard 导入

### 3. `src-tauri/src/commands/session_open.rs` - Bug 修复
- 修复占位符逻辑：只有在没有使用 `{command}` 占位符时才追加 `sh -lc`
- 用户使用 `{command}` 时意味着已经嵌入了完整的命令逻辑，不应再包裹

### 4. i18n 翻译文件
- `src/i18n/locales/zh-CN/settings.ts` - 添加新的翻译键
- `src/i18n/locales/en-US/settings.ts` - 添加新的翻译键

## 设计对比

### Before
```
终端设置
├── 内置终端 toggle (自定义样式)
├── 默认 Shell (折叠)
├── 字号滑块 (折叠)
├── 分割线
├── 默认终端 (单选卡片，风格不一)
├── 自定义命令 (条件显示)
└── Pi 命令路径
```

### After
```
终端设置
│
├── 内置终端 卡片
│   ├── Toggle 开关 (统一组件)
│   ├── 默认 Shell (展开式)
│   └── 字号滑块
│
├── 外部终端 卡片
│   ├── 标题 + ⌘R 快捷键提示
│   ├── 终端选择网格 (2x3)
│   ├── 自定义命令 (条件显示)
│   │   ├── 命令输入框
│   │   ├── 占位符参考 (可折叠)
│   │   └── tmux 示例 (可复制)
│   └── Pi 命令路径
│
└── 快捷键 卡片
    ├── 恢复会话 ⌘R
    └── 切换终端 ⌘`
```

## 占位符逻辑修复

### Bug
当用户写完整命令如：
```
tmux new-window -t $(tmux display-message -p "#S") -c {cwd} "/bin/zsh -lic \"{pi} --session {path}\""
```
旧逻辑仍然会追加 `sh -lc '...'`，导致双重 shell 包裹。

### Fix
```rust
let has_command_placeholder = template.contains("{command}");
// ...
if !has_command_placeholder {
    rendered = format!("{rendered} sh -lc {}", shell_single_quote(&resume_cmd));
}
```

只有在没有使用 `{command}` 占位符时才追加，因为：
- `{command}` = 用户已嵌入完整命令逻辑
- 只用 `{cwd}/{path}/{pi}` = 用户在构建终端启动命令，需要追加恢复命令
