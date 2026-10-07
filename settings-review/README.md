# 设置页面评审 — 修复报告

日期:2026-10-07 · 基线提交:`dd206421`(评审前的本地改动已先行提交)
状态:修复完成,类型检查 ✅ · 38/38 设置相关测试 ✅ · 浏览器截图验证 ✅

## 本轮修复清单

| # | 问题(评审结论) | 修复 | 关键文件 |
|---|---|---|---|
| 1 | 重置按钮是无文字小图标,确认弹窗却宣称 "reset all settings",而实际只重置 app-settings,不涉及模型/Pi 资源/插件配置 | 按钮加可见文字标签(悬停变危险色);确认文案如实描述范围(6 个语言全部更新) | `SettingsSidebar.tsx`、`SettingsPanel.tsx`、`i18n/locales/*/settings.ts` |
| 2 | inline 保存提示对所有页面显示同一句话,对 Models(手动保存)和 Server & Access(混合模式)是错误陈述 | 注册表新增按页提示 `getSettingsSaveHint()`;桌面与移动端共用;通用文案改为"修改会随调整自动保存" | `settingsRegistry.tsx`、`SettingsContent.tsx`、`MobileSettings.tsx` |
| 3 | 搜索索引 70 条中 13 条字段级锚点缺失、10 条 section 级条目无锚点,点击结果不滚动不高亮且静默失败 | 补齐 6 个字段锚点(Session Viewer)+ 3 个条件锚点(会话来源/外部会话/Resume)+ 3 个卡片锚点(服务器/Invoke 测试/备份);`SettingsContent` 内容根节点以 section id 兜底,section 级条目全部可高亮 | `SessionGeneralSettings.tsx`、`SessionDatasetSettings.tsx`、`ExternalSessionsSettings.tsx`、`ServerAccessSettingsTab.tsx`、`APITestSettings.tsx`、`ConfigBundleManager.tsx`、`SettingsContent.tsx` |
| 4 | "Session Sources"(data-sources)是孤儿页:不在侧边栏,但 Onboarding 会深链过去,左侧无高亮 | 加入 Sessions 组首位,作为该组入口页;深链状态恢复正常 | `settingsRegistry.tsx` |
| 5 | 嵌套手写模态里按 Escape 会连整个设置面板一起关掉(Theme Studio、备份恢复确认/预览、Pi 资源预览、外观选择器) | 4 处全部改用 `useEscapeToClose`(capture 阶段消费事件),只关最上层 | `ThemeStudioModal.tsx`、`ConfigBundleManager.tsx`、`pi-config/ResourcesTab.tsx`、`AppearanceSettings.tsx` |
| 6 | 破坏性确认三套原语并存(`window.confirm` / Tauri 原生 / 项目 dialog) | 新增 `src/utils/confirmDialog.ts`(`askConfirm`:Tauri 原生优先、浏览器回退),替换默认目录重建、清除缓存、吊销 API Key、全局重置 4 处 | `utils/confirmDialog.ts` 等 5 个文件 |
| 7 | 侧边栏图标多处复用(Database×2、Bot×2、Settings2×2、Activity×3、Download×3…) | 同区去重:模型→Cpu、Pi 运行时→FileCog、会话浏览→ListTree、备份→Archive、诊断→Wrench、插件区→Blocks/Store/FolderInput/Code2/HeartPulse | `settingsRegistry.tsx` |
| 8 | 死代码:`AdvancedSettings` 的 `mode="all"` 分支不可达,`StorageSettingsTab` 及其重复的 clear-cache 逻辑成漂移源;连带发现"轻量模式"开关被死分支门控(功能已由 App Behavior 接管) | 删除死分支与 `StorageSettingsTab.tsx`,类型收敛为 `"server-access"`;`AdvancedSettings` 不再接收未用的 settings/onUpdate | `AdvancedSettings.tsx`、`advancedSettingsTypes.ts` |

**撤回一个评审点**:`APITestSettings` 细看是 invoke 传输通道诊断工具(测 IPC/HTTP/WS 命令契约),放在"诊断与维护"是合理的,不迁移。

## 截图验证

截图位于本目录(`settings-review/*.png`,1440×900):

1. `01-preferences-appearance.png` — 偏好设置基线;侧边栏底部 **Reset Settings 带文字标签**
2. `02-config-center-sidebar.png` — dataset 演示模式:**Session Sources 进侧边栏**并默认选中
3. `03-server-access-hint.png` → 被 05 取代(见下)
4. `04-config-center-full.png` — 完整配置中心:四组齐全、**图标全部去重**、会话来源入口页
5. `05-server-access-hint.png` — 右上角准确提示"**服务器设置需点击下方保存;API 密钥与远程访问即时生效**"
6. `06-models-hint.png` — 右上角"此页面不会自动保存,请点击保存配置写入磁盘"
7. `07-search-anchor-flash.png` — 搜索"导出"→点击"默认导出格式"→自动切区+滚动;evaluate 验证锚点 outline 高亮生效
8. `08-search-section-anchor.png` — 搜索"标签"(section 级条目)→ 根节点兜底锚点高亮生效;右上角同时可见新的通用 inline 提示

行为级修复(Escape 隔离、原生确认弹窗)无法截图,已由代码走查 + 测试覆盖。

## 验证记录

- `npx tsc --noEmit` — 0 错误
- `npx vitest run src/components/settings/` — 11 文件 / 38 用例全过
- 锚点覆盖脚本:70/70 条索引在运行时有对应锚点(3 条动态赋值 + 7 条 section 兜底人工确认)
- dataset 演示模式(1420)与完整后端模式(1421)双环境人工核对

## 遗留(未在本轮处理)

- `alert()` 结果提示(DiagnosticsMaintenance 清缓存结果)仍是浏览器原生的,项目暂无 toast 体系可复用
- 设置面板 `role="dialog"` 尚无 focus trap / 关闭还焦
- 自动保存每次落盘后 `reloadSettings()` 全局重载,可改为面板直接回写 context,省一次磁盘往返
- i18n 遗留 key(session/search/export/piConfig/piAgent/advanced)与 `navigation.ts` 旧别名仍在,清理涉及 6 个语言文件,建议单独一次提交
