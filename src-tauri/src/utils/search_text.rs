// CJK character detection - currently supports Chinese characters only
// Missing: Korean Hangul (U+AC00–U+D7AF), Japanese Hiragana (U+3040–U+309F),
// Katakana (U+30A0–U+30FF), CJK Radicals (U+2E80–U+2EFF)
// See: docs/issues/expand-cjk-support.md
pub fn is_cjk_char(ch: char) -> bool {
    matches!(
        ch as u32,
        0x4E00..=0x9FFF | 0x3400..=0x4DBF | 0xF900..=0xFAFF
    )
}

pub fn contains_cjk(value: &str) -> bool {
    value.chars().any(is_cjk_char)
}

pub fn normalize_search_tokens(value: &str) -> Vec<String> {
    let mut tokens = Vec::new();
    let mut current_word = String::new();

    let flush_word = |tokens: &mut Vec<String>, current_word: &mut String| {
        if !current_word.is_empty() {
            tokens.push(std::mem::take(current_word));
        }
    };

    for ch in value.chars() {
        if is_cjk_char(ch) {
            flush_word(&mut tokens, &mut current_word);
            tokens.push(ch.to_string());
            continue;
        }

        if ch.is_alphanumeric() {
            current_word.extend(ch.to_lowercase());
            continue;
        }

        flush_word(&mut tokens, &mut current_word);
    }

    flush_word(&mut tokens, &mut current_word);
    tokens
}

pub fn normalize_search_text(value: &str) -> String {
    normalize_search_tokens(value).join(" ")
}

#[cfg(test)]
mod tests {
    use super::{contains_cjk, normalize_search_text, normalize_search_tokens};

    #[test]
    fn normalizes_mixed_text_into_search_tokens() {
        let tokens = normalize_search_tokens("北京Welcome-123，世界");
        assert_eq!(tokens, vec!["北", "京", "welcome", "123", "世", "界"]);
    }

    #[test]
    fn normalizes_text_with_spaces() {
        assert_eq!(normalize_search_text("默认 识别 系统 语言"), "默 认 识 别 系 统 语 言");
    }

    #[test]
    fn detects_cjk_content() {
        assert!(contains_cjk("hello世界"));
        assert!(!contains_cjk("hello world"));
    }
}
