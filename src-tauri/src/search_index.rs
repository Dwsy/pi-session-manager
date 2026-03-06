use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SearchSegmentSource {
    User,
    Assistant,
    Thinking,
}

impl SearchSegmentSource {
    pub fn as_str(self) -> &'static str {
        match self {
            SearchSegmentSource::User => "user",
            SearchSegmentSource::Assistant => "assistant",
            SearchSegmentSource::Thinking => "thinking",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SearchSegment {
    pub source: SearchSegmentSource,
    pub text: String,
}

#[derive(Debug, Clone, Copy)]
pub struct SearchIndexOptions {
    pub include_thinking: bool,
}

impl Default for SearchIndexOptions {
    fn default() -> Self {
        Self {
            include_thinking: false,
        }
    }
}

pub fn extract_search_segments(entry: &Value, options: SearchIndexOptions) -> Vec<SearchSegment> {
    if entry.get("type").and_then(Value::as_str) != Some("message") {
        return vec![];
    }

    let Some(message) = entry.get("message") else {
        return vec![];
    };

    let role = message.get("role").and_then(Value::as_str).unwrap_or("");
    let source = match role {
        "user" => SearchSegmentSource::User,
        "assistant" => SearchSegmentSource::Assistant,
        _ => return vec![],
    };

    let mut visible_parts = Vec::new();
    let mut thinking_parts = Vec::new();

    if let Some(content) = message.get("content").and_then(Value::as_array) {
        for item in content {
            if let Some(text) = item.get("text").and_then(Value::as_str) {
                let trimmed = text.trim();
                if !trimmed.is_empty() {
                    visible_parts.push(trimmed.to_string());
                }
            }

            if options.include_thinking {
                if let Some(thinking) = item.get("thinking").and_then(Value::as_str) {
                    let trimmed = thinking.trim();
                    if !trimmed.is_empty() {
                        thinking_parts.push(trimmed.to_string());
                    }
                }
            }
        }
    }

    let mut segments = Vec::new();
    if !visible_parts.is_empty() {
        segments.push(SearchSegment {
            source,
            text: visible_parts.join("\n"),
        });
    }
    if options.include_thinking && !thinking_parts.is_empty() {
        segments.push(SearchSegment {
            source: SearchSegmentSource::Thinking,
            text: thinking_parts.join("\n"),
        });
    }

    segments
}

pub fn extract_message_contents(entry: &Value, include_thinking: bool) -> Vec<(String, String)> {
    extract_search_segments(
        entry,
        SearchIndexOptions {
            include_thinking,
        },
    )
    .into_iter()
    .map(|segment| (segment.source.as_str().to_string(), segment.text))
    .collect()
}

pub fn extract_primary_message_text(entry: &Value) -> String {
    extract_search_segments(entry, SearchIndexOptions::default())
        .into_iter()
        .find(|segment| segment.source != SearchSegmentSource::Thinking)
        .map(|segment| segment.text)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::{extract_search_segments, SearchIndexOptions, SearchSegmentSource};

    #[test]
    fn extracts_text_and_thinking_segments() {
        let entry = serde_json::json!({
            "type": "message",
            "message": {
                "role": "assistant",
                "content": [
                    {"type": "text", "text": "visible"},
                    {"type": "thinking", "thinking": "hidden"},
                    {"type": "text", "text": "second"}
                ]
            }
        });

        let without_thinking = extract_search_segments(
            &entry,
            SearchIndexOptions { include_thinking: false },
        );
        assert_eq!(without_thinking.len(), 1);
        assert_eq!(without_thinking[0].source, SearchSegmentSource::Assistant);
        assert_eq!(without_thinking[0].text, "visible\nsecond");

        let with_thinking = extract_search_segments(
            &entry,
            SearchIndexOptions { include_thinking: true },
        );
        assert_eq!(with_thinking.len(), 2);
        assert_eq!(with_thinking[1].source, SearchSegmentSource::Thinking);
        assert_eq!(with_thinking[1].text, "hidden");
    }
}
