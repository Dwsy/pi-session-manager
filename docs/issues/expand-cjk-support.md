# Issue #2: 扩展 CJK 字符支持范围

**状态**: 📋 待实现
**优先级**: 低
**标签**: enhancement, search, i18n
**创建时间**: 2026-05-11

---

## 📝 问题描述

在 `src-tauri/src/utils/search_text.rs:1` 中，CJK 字符检测只支持中文汉字：

```rust
pub fn is_cjk_char(ch: char) -> bool {
    matches!(
        ch as u32,
        0x4E00..=0x9FFF | 0x3400..=0x4DBF | 0xF900..=0xFAFF
    )
}
```

这导致韩语、日语等 CJK 字符无法被正确识别，影响搜索准确性。

## 🎯 期望行为

扩展 `is_cjk_char` 函数，支持所有 CJK 字符：

### 需要添加的 Unicode 范围

| 字符类型 | Unicode 范围 | 说明 |
|----------|--------------|------|
| 韩语 Hangul 音节 | U+AC00–U+D7AF | 韩语基本字符 |
| 日语平假名 | U+3040–U+309F | あ、い、う 等 |
| 日语片假名 | U+30A0–U+30FF | ア、イ、ウ 等 |
| CJK 部首补充 | U+2E80–U+2EFF | 部首符号 |
| CJK 符号和标点 | U+3000–U+303F | 。，、等 |
| 全角 ASCII | U+FF00–U+FFEF | Ａ、Ｂ、Ｃ 等 |

## 💡 实现建议

```rust
pub fn is_cjk_char(ch: char) -> bool {
    matches!(
        ch as u32,
        // 中文汉字
        0x4E00..=0x9FFF |  // CJK 统一汉字
        0x3400..=0x4DBF |  // CJK 统一汉字扩展 A
        0xF900..=0xFAFF |  // CJK 兼容汉字

        // 韩语
        0xAC00..=0xD7AF |  // 韩语音节

        // 日语
        0x3040..=0x309F |  // 平假名
        0x30A0..=0x30FF |  // 片假名

        // CJK 符号
        0x3000..=0x303F |  // CJK 符号和标点
        0x2E80..=0x2EFF |  // CJK 部首补充
        0xFF00..=0xFFEF    // 全角字符
    )
}
```

## 📊 影响范围

- **文件**: `src-tauri/src/utils/search_text.rs`
- **函数**: `is_cjk_char`, `contains_cjk`, `normalize_search_tokens`
- **测试**: 需要添加韩语、日语测试用例

## ✅ 验收标准

- [ ] 韩语字符被正确识别为 CJK
- [ ] 日语平假名/片假名被正确识别为 CJK
- [ ] CJK 符号和标点被正确识别
- [ ] 现有中文搜索功能不受影响
- [ ] 添加韩语、日语测试用例
- [ ] 更新文档说明支持范围

## 🔗 相关文件

- `src-tauri/src/utils/search_text.rs`
- `src-tauri/src/data/search/client.rs` (搜索逻辑)

---

**创建人**: MiMo Agent
**来源**: TODO 清理任务
