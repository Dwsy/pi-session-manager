pub fn is_chinese_locale_value(locale: &str) -> bool {
    let normalized = locale.trim().to_ascii_lowercase();
    !normalized.is_empty() && (normalized.contains("zh") || normalized.contains("cn") || normalized.contains("chinese"))
}

pub fn is_system_chinese_locale() -> bool {
    ["LANG", "LC_ALL", "LC_MESSAGES"].into_iter().find_map(|key| std::env::var(key).ok()).is_some_and(|value| is_chinese_locale_value(&value))
}

pub fn resolve_locale_backed_default(explicit: Option<bool>, system_is_chinese: bool) -> bool {
    explicit.unwrap_or(system_is_chinese)
}

#[cfg(test)]
mod tests {
    use super::{is_chinese_locale_value, is_system_chinese_locale, resolve_locale_backed_default};

    #[test]
    fn detects_chinese_locale_values() {
        assert!(is_chinese_locale_value("zh-CN"));
        assert!(is_chinese_locale_value("zh_CN.UTF-8"));
        assert!(is_chinese_locale_value("Chinese_China.936"));
        assert!(!is_chinese_locale_value("en-US"));
        assert!(!is_chinese_locale_value("ja-JP"));
    }

    #[test]
    fn resolves_locale_backed_default_flags() {
        assert!(resolve_locale_backed_default(Some(true), false));
        assert!(!resolve_locale_backed_default(Some(false), true));
        assert!(resolve_locale_backed_default(None, true));
        assert!(!resolve_locale_backed_default(None, false));
    }

    #[test]
    fn system_locale_helper_returns_boolean_without_panicking() {
        let _ = is_system_chinese_locale();
    }
}
