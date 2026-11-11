---
name: i18ntool
description: 审计与补全 i18next 多语言 locale 翻译。用于检测各语言缺失键、统计翻译完成度、生成缺失清单驱动分批补翻译、并在补全后验证键对齐。当需要补翻译、检查 i18n 完成度、对比 locale 差异、或新增一个界面文案时使用。
---

# i18ntool — i18n 翻译审计与补全

以 `en-US` 为唯一基准（source of truth），逐 namespace 对比其它语言，找出缺失键并驱动补全。基准语言改文案时，也用它同步其它语言。

## 工具

`scripts/i18n-audit.mjs` — 检测缺失与完成度。**在项目根目录运行**（脚本默认读 `src/i18n/locales`）：

```bash
node <skill-dir>/scripts/i18n-audit.mjs                       # 概览：每语言完成度 + 缺失计数
node <skill-dir>/scripts/i18n-audit.mjs --lang de-DE          # 明细：该语言全部缺失键，按 namespace 分组
node <skill-dir>/scripts/i18n-audit.mjs --lang de-DE --namespace command   # 聚焦单个 namespace
node <skill-dir>/scripts/i18n-audit.mjs --json                # 机器可读，供脚本消费
```

`<skill-dir>` 用 Pi 提供的本技能目录绝对路径替换。选项：`--base <dir>`（换 locale 根）、`--lang`、`--namespace`、`--json`。

## 工作流

1. **审计**：先跑概览，掌握每语言完成度与缺失规模，据此分批，不要试图一次翻完上千键。
2. **分批补**：一次只做一个 `语言 × namespace`（例如 `de-DE/command`）。用 `--lang X --namespace Y` 取出该批的精确缺失键。
3. **翻译写入**：在 `src/i18n/locales/<lang>/<ns>.ts` 的对应对象里补齐缺失键。保持：
   - 嵌套结构与键名同 `en-US` 完全一致（这是键对齐的前提）。
   - 语气、术语、占位符（`{{var}}`）、HTML 与 en-US 一致；界面短标签宜短。
   - 同一术语全语言统一（如 Session/会话/セッション）。
4. **验证**：补完一批就跑 `npx tsc --noEmit` + 该批 audit，确认缺失归零、类型通过，再进下一批。

## 约定

- **只增不改基准**：除非用户要求改 en-US 文案，否则 `en-US` 只读；补的是其它语言。
- **不要删键**：缺失键是"待补"，不是"多余"。`extra`（某语言有、en-US 无）才是候选清理项，需用户确认。
- **占位符与插值**：`{{count}}` 之类必须原样保留，翻译只换自然语言部分。
- 补翻译是机械但需质量的活，优先高频 namespace（common/app/command/session/dashboard/settings），低频的帮助/引导文案可后置。

## 何时停下问用户

- 单批超过 ~300 键，或要覆盖整个 `onboarding`/帮助长文——先确认范围与机器翻译是否可接受。
- 发现 `en-US` 本身有重复键、空键、或键名疑似拼错——报告，不要自行改基准。
