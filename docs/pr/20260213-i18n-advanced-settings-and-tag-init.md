# i18n: Advanced Settings & Locale-aware Tag Initialization

**Date**: 2026-02-13  
**Status**: ✅ Completed  
**Related Issues**: User feedback on missing i18n and tag localization

## Summary

Fixed two i18n-related issues:
1. Added missing translations for Advanced settings page
2. Implemented locale-aware default tag initialization

## Changes

### 1. Advanced Settings i18n (Frontend)

**Files Modified**:
- `src/i18n/locales/en-US/settings.ts`
- `src/i18n/locales/zh-CN/settings.ts`

**Added Translations**:
- Server settings section (bind address, ports, authentication)
- API key management (create, revoke, copy)
- Session directory configuration
- All existing advanced settings labels

**Before**: Hard-coded Chinese text in `AdvancedSettings.tsx`  
**After**: Full i18n support with `t('settings.advanced.*')` keys

### 2. Locale-aware Tag Initialization (Backend)

**File Modified**: `src-tauri/src/sqlite_cache.rs`

**Implementation**:
```rust
// Detect system language from environment variables
let is_chinese = std::env::var("LANG")
    .or_else(|_| std::env::var("LC_ALL"))
    .or_else(|_| std::env::var("LC_MESSAGES"))
    .map(|lang| lang.to_lowercase().contains("zh") || lang.to_lowercase().contains("cn"))
    .unwrap_or(false);

// Generate appropriate labels
let builtins = if is_chinese {
    [("builtin-todo", "待处理", "warning", 0), ...]
} else {
    [("builtin-todo", "To Do", "warning", 0), ...]
};
```

**Detection Logic**:
- Checks `LANG`, `LC_ALL`, `LC_MESSAGES` environment variables
- If contains "zh" or "cn" → Chinese labels
- Otherwise → English labels (default)

**Default Tags**:

| ID | Chinese | English | Color |
|----|---------|---------|-------|
| builtin-todo | 待处理 | To Do | warning |
| builtin-wip | 进行中 | In Progress | info |
| builtin-done | 已完成 | Done | success |
| builtin-important | 重要 | Important | destructive |
| builtin-archive | 归档 | Archive | slate |

## Testing

### Frontend i18n
```bash
npm run build  # ✓ No errors
```

### Backend Compilation
```bash
cd src-tauri && cargo check  # ✓ Passed
```

### Tag Initialization Logic
- ✅ Chinese locale (zh_CN.UTF-8) → Chinese labels
- ✅ English locale (en_US.UTF-8) → English labels
- ✅ No locale set → English labels (default)

## Impact

### User Experience
- **Advanced Settings**: Now fully localized for English/Chinese users
- **Default Tags**: Automatically match system language on first run
- **Consistency**: All UI elements now respect user's language preference

### Technical
- No breaking changes
- Backward compatible (existing tags unchanged)
- Only affects new database initialization

## Notes

1. **Existing Users**: Already created tags will keep their current names
2. **New Users**: Will see tags in their system language
3. **Manual Override**: Users can still rename tags via Tag Manager

## Verification

To verify the changes:

1. **i18n Coverage**:
   ```bash
   # Check all translation keys are used
   rg "t\('settings.advanced" src/components/settings/sections/AdvancedSettings.tsx
   ```

2. **Tag Initialization**:
   ```bash
   # Delete database and restart app
   rm ~/.pi/agent/sessions/sessions.db
   # Launch app and check tag names in Tag Manager
   ```

## Related Files

- `src/components/settings/sections/AdvancedSettings.tsx` (uses i18n)
- `src/i18n/locales/en-US/settings.ts` (English translations)
- `src/i18n/locales/zh-CN/settings.ts` (Chinese translations)
- `src-tauri/src/sqlite_cache.rs` (tag initialization logic)

---

**Commit Message**:
```
feat(i18n): add Advanced settings translations and locale-aware tag init

- Add missing i18n keys for Advanced settings page (server, API keys, etc.)
- Implement locale detection for default tag initialization
- Generate Chinese labels for zh/cn locales, English for others
- Maintain backward compatibility with existing tags
```
