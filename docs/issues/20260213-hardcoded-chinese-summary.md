# 硬编码中文扫描总结

**扫描日期**: 2026-02-13  
**扫描工具**: ripgrep (rg)  
**扫描范围**: src/ 目录（排除 i18n/locales/）

---

## 📊 核心数据

| 指标 | 数值 |
|------|------|
| 总硬编码行数 | 655 行 |
| 需修复文件数 | 7 个 |
| 需新增翻译文件 | 6 个 |
| 预计工作量 | 4 小时 |
| 优先级分布 | P0: 4 文件, P1: 1 文件, P2: 1 文件 |

---

## 🎯 关键发现

### 1. 插件系统缺少 i18n 支持

**问题**: 所有搜索插件的 name 和 description 都是硬编码中文

**影响**: 
- 用户界面无法切换语言
- 英文用户看到中文插件名称
- 搜索关键词包含中文，影响英文用户体验

**文件**:
- `src/plugins/session/SessionSearchPlugin.tsx`
- `src/plugins/project/ProjectSearchPlugin.tsx`
- `src/plugins/message/MessageSearchPlugin.tsx`

**修复**: 需要修改插件基类架构，支持 i18n context

---

### 2. 时间格式化完全硬编码

**问题**: 相对时间显示（"刚刚"、"5 分钟前"等）全部硬编码

**影响**:
- 时间显示无法本地化
- 英文用户看到中文时间格式
- 用户体验不一致

**位置**:
- `SessionSearchPlugin.tsx`: 5 种格式
- `MessageSearchPlugin.tsx`: 7 种格式

**修复**: 创建 time.ts 翻译文件，使用 i18next 的 interpolation

---

### 3. 错误和验证消息未国际化

**问题**: 用户可见的错误和验证消息是硬编码中文

**影响**:
- 错误提示无法本地化
- 表单验证反馈只有中文
- 降低产品的国际化程度

**位置**:
- `SettingsContext.tsx`: 2 条错误消息
- `utils/settings.ts`: 4 条验证消息

**修复**: 使用 useTranslation hook，添加翻译 key

---

### 4. 工具函数包含大量硬编码

**问题**: `utils/settings.ts` 的 `getSettingDisplayName()` 函数返回硬编码中文

**影响**:
- 可能影响设置界面显示
- 代码维护困难
- 不确定是否还在使用

**修复**: 
1. 检查调用点
2. 如果未使用，删除函数
3. 如果使用，重构为 i18n

---

## 📋 修复优先级

### P0 - 立即修复（用户直接可见）

1. **插件名称和描述** (3 个文件)
   - 用户在命令面板中直接看到
   - 影响搜索体验
   - 修复难度: 低-中

2. **时间格式化** (2 个文件)
   - 频繁显示在搜索结果中
   - 影响用户体验
   - 修复难度: 中

3. **错误消息** (1 个文件)
   - 用户遇到错误时看到
   - 影响用户反馈
   - 修复难度: 低

---

### P1 - 高优先级（功能完整性）

4. **验证消息** (1 个文件)
   - 表单验证时显示
   - 影响设置界面
   - 修复难度: 中

5. **格式化显示** (1 个文件)
   - 设置值的显示格式
   - 影响设置界面
   - 修复难度: 低

---

### P2 - 中优先级（代码质量）

6. **设置显示名称** (1 个文件)
   - 可能已废弃
   - 需要检查调用点
   - 修复难度: 低

7. **项目过滤器** (1 个文件)
   - 内部逻辑常量
   - 影响较小
   - 修复难度: 低

---

## 🔧 技术方案

### 方案 A: 插件架构改进（推荐）

**优点**:
- 彻底解决插件 i18n 问题
- 支持未来扩展
- 代码结构清晰

**缺点**:
- 需要修改基类
- 工作量稍大

**实现**:
```typescript
// 修改 BaseSearchPlugin
abstract class BaseSearchPlugin implements SearchPlugin {
  protected context?: SearchContext
  
  constructor(context?: SearchContext) {
    this.context = context
  }
  
  abstract get name(): string
  abstract get description(): string
}

// 子类实现
class SessionSearchPlugin extends BaseSearchPlugin {
  get name() {
    return this.context?.t('plugins.session.name', '会话搜索') || '会话搜索'
  }
}
```

---

### 方案 B: 简单替换（不推荐）

**优点**:
- 实现简单快速
- 不需要改架构

**缺点**:
- 无法访问 i18n context
- 需要全局 i18n 实例
- 不够优雅

**实现**:
```typescript
import i18n from '../i18n'

class SessionSearchPlugin extends BaseSearchPlugin {
  name = i18n.t('plugins.session.name', '会话搜索')
}
```

---

## 📦 交付物

### 代码修改

1. `src/plugins/base/BaseSearchPlugin.ts` - 添加 context 支持
2. `src/plugins/session/SessionSearchPlugin.tsx` - i18n 化
3. `src/plugins/project/ProjectSearchPlugin.tsx` - i18n 化
4. `src/plugins/message/MessageSearchPlugin.tsx` - i18n 化
5. `src/contexts/SettingsContext.tsx` - 错误消息 i18n
6. `src/utils/settings.ts` - 验证消息 i18n
7. `src/components/ProjectFilterList.tsx` - 常量统一

---

### 翻译文件

**新增**:
1. `src/i18n/locales/zh-CN/plugins.ts`
2. `src/i18n/locales/en-US/plugins.ts`
3. `src/i18n/locales/zh-CN/time.ts`
4. `src/i18n/locales/en-US/time.ts`

**扩展**:
5. `src/i18n/locales/zh-CN/common.ts` (添加 enabled/disabled/unknown)
6. `src/i18n/locales/zh-CN/settings.ts` (添加 error/validation)
7. `src/i18n/locales/en-US/common.ts`
8. `src/i18n/locales/en-US/settings.ts`

---

### 文档

1. ✅ `docs/issues/20260213-hardcoded-chinese-audit.md` - 详细审计报告
2. ✅ `docs/issues/20260213-hardcoded-chinese-scan.md` - 扫描结果可视化
3. ✅ `docs/issues/20260213-hardcoded-chinese-quickref.md` - 快速参考
4. ✅ `docs/issues/20260213-hardcoded-chinese-summary.md` - 本文档

---

## ⏱️ 实施计划

### Week 1: Phase 1 (P0)

**Day 1-2**: 插件 i18n 化
- [ ] 修改 BaseSearchPlugin 支持 context
- [ ] 修改 3 个插件类
- [ ] 添加 plugins.ts 翻译文件
- [ ] 添加 time.ts 翻译文件
- [ ] 测试插件名称和时间格式

**Day 3**: 错误消息 i18n
- [ ] SettingsContext 使用 useTranslation
- [ ] 添加错误消息翻译
- [ ] 测试错误提示

---

### Week 1: Phase 2 (P1)

**Day 4**: 验证消息 i18n
- [ ] utils/settings.ts 重构
- [ ] 添加验证消息翻译
- [ ] 测试表单验证

---

### Week 1: Phase 3 (P2)

**Day 5**: 清理和优化
- [ ] 检查 getSettingDisplayName 调用点
- [ ] 清理废弃代码
- [ ] 统一常量
- [ ] 全量测试

---

## ✅ 验证标准

### 功能验证

- [ ] 切换到英文，所有插件名称显示英文
- [ ] 切换到中文，所有插件名称显示中文
- [ ] 时间格式化在两种语言下正确显示
- [ ] 错误消息在两种语言下正确显示
- [ ] 验证消息在两种语言下正确显示

---

### 代码质量

- [ ] 无 TypeScript 错误
- [ ] 无 ESLint 警告
- [ ] 无控制台警告（missing translation keys）
- [ ] 代码通过 code review

---

### 用户体验

- [ ] 语言切换后立即生效，无需刷新
- [ ] 所有文本清晰易读
- [ ] 时间格式符合语言习惯
- [ ] 错误提示准确明了

---

## 📈 预期收益

### 用户体验提升

- ✅ 支持英文用户
- ✅ 提升产品国际化程度
- ✅ 改善用户满意度

---

### 代码质量提升

- ✅ 消除硬编码
- ✅ 提高可维护性
- ✅ 统一 i18n 架构

---

### 技术债务清理

- ✅ 清理废弃代码
- ✅ 统一代码风格
- ✅ 改进插件架构

---

## 🔗 相关资源

- [详细审计报告](./20260213-hardcoded-chinese-audit.md)
- [扫描结果可视化](./20260213-hardcoded-chinese-scan.md)
- [快速参考卡片](./20260213-hardcoded-chinese-quickref.md)
- [i18n 架构文档](../architecture/i18n-architecture.md)
- [插件开发指南](../architecture/plugin-architecture.md)

---

## 📝 备注

1. **插件架构改进**是关键，建议优先实施
2. **时间格式化**考虑使用 i18next 的 plural 功能
3. **验证逻辑**可能需要重构到组件层
4. **getSettingDisplayName** 函数需要确认是否还在使用

---

**下一步**: 开始 Phase 1 - 插件 i18n 化

> *「国际化不是翻译，而是设计」* — 从一开始就考虑多语言支持，比事后补救容易得多。
