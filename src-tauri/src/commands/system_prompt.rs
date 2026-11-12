use serde::{
    de::{Deserializer, MapAccess, Visitor},
    Deserialize, Serialize,
};
use serde_json::Value;
use std::{
    fmt, fs,
    io::{BufRead, BufReader},
};

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemPromptSection {
    pub name: String,
    pub text: String,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemPromptTool {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemPromptSnapshot {
    pub id: String,
    pub timestamp: String,
    pub version: usize,
    /// Base system message body recorded before `sections`.
    pub content: String,
    pub prompt: String,
    pub sections: Vec<SystemPromptSection>,
    /// Tools effective at this version after replaying `toolsAdded`/`toolsRemoved`.
    pub tools: Vec<SystemPromptTool>,
    pub changed_sections: Vec<String>,
    pub removed_sections: Vec<String>,
    pub tools_added: Vec<String>,
    pub tools_removed: Vec<String>,
}

#[derive(Default)]
struct ReplayState {
    content: String,
    sections: Vec<SystemPromptSection>,
    tools: Vec<SystemPromptTool>,
}

impl ReplayState {
    fn prompt(&self) -> String {
        let mut parts = Vec::with_capacity(self.sections.len() + 1);
        if !self.content.is_empty() {
            parts.push(self.content.as_str());
        }
        parts.extend(self.sections.iter().map(|section| section.text.as_str()).filter(|text| !text.is_empty()));
        parts.join("\n\n")
    }

    fn apply_sections(&mut self, updates: Vec<(String, Option<String>)>) -> (Vec<String>, Vec<String>) {
        let mut changed_sections = Vec::new();
        let mut removed_sections = Vec::new();

        for (name, text) in updates {
            let index = self.sections.iter().position(|section| section.name.as_str() == name.as_str());
            match text {
                Some(text) => {
                    if let Some(index) = index {
                        if self.sections[index].text == text {
                            continue;
                        }
                        self.sections[index].text = text;
                    } else {
                        self.sections.push(SystemPromptSection { name: name.clone(), text });
                    }
                    changed_sections.push(name);
                }
                None => {
                    if let Some(index) = index {
                        self.sections.remove(index);
                    }
                    removed_sections.push(name);
                }
            }
        }

        (changed_sections, removed_sections)
    }

    fn apply_tools(&mut self, added: Vec<SystemPromptTool>, removed: Vec<String>) -> (Vec<String>, Vec<String>) {
        let mut removed_names = Vec::new();
        for name in removed {
            if removed_names.contains(&name) {
                continue;
            }
            self.tools.retain(|tool| tool.name != name);
            removed_names.push(name);
        }

        let mut added_names = Vec::new();
        for tool in added {
            if !added_names.contains(&tool.name) {
                added_names.push(tool.name.clone());
            }
            match self.tools.iter_mut().find(|existing| existing.name == tool.name) {
                Some(existing) => *existing = tool,
                None => self.tools.push(tool),
            }
        }

        (added_names, removed_names)
    }
}

// serde_json::Value maps sections by key unless the crate's preserve_order
// feature is enabled. A map visitor reads the JSONL object's original entry
// order without depending on that feature.
struct OrderedSections(Vec<(String, Option<String>)>);

impl<'de> Deserialize<'de> for OrderedSections {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_map(OrderedSectionsVisitor)
    }
}

struct OrderedSectionsVisitor;

impl<'de> Visitor<'de> for OrderedSectionsVisitor {
    type Value = OrderedSections;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("an object of system prompt section strings or null values")
    }

    fn visit_map<A>(self, mut map: A) -> Result<Self::Value, A::Error>
    where
        A: MapAccess<'de>,
    {
        let mut updates = Vec::new();
        while let Some((name, value)) = map.next_entry::<String, Value>()? {
            match value {
                Value::String(text) => push_ordered_update(&mut updates, name, Some(text)),
                Value::Null => push_ordered_update(&mut updates, name, None),
                _ => {}
            }
        }
        Ok(OrderedSections(updates))
    }
}

fn push_ordered_update(updates: &mut Vec<(String, Option<String>)>, name: String, text: Option<String>) {
    if let Some(index) = updates.iter().position(|(existing, _)| existing == &name) {
        updates[index].1 = text;
    } else {
        updates.push((name, text));
    }
}

fn deserialize_ordered_sections<'de, D>(deserializer: D) -> Result<Vec<(String, Option<String>)>, D::Error>
where
    D: Deserializer<'de>,
{
    Ok(Option::<OrderedSections>::deserialize(deserializer)?.map(|sections| sections.0).unwrap_or_default())
}

#[derive(Default, Deserialize)]
#[serde(default)]
struct OrderedSectionsLine {
    message: Option<OrderedSectionsMessage>,
}

#[derive(Default, Deserialize)]
#[serde(default)]
struct OrderedSectionsMessage {
    #[serde(default, deserialize_with = "deserialize_ordered_sections")]
    sections: Vec<(String, Option<String>)>,
}

fn ordered_section_updates(line: &[u8]) -> Vec<(String, Option<String>)> {
    serde_json::from_slice::<OrderedSectionsLine>(line).map(|entry| entry.message.map(|message| message.sections).unwrap_or_default()).unwrap_or_default()
}

fn tool_names(value: Option<&Value>) -> Vec<String> {
    value.and_then(Value::as_array).into_iter().flatten().filter_map(|tool| tool.as_str().map(str::to_string).or_else(|| tool.get("name").and_then(Value::as_str).map(str::to_string))).collect()
}

fn parse_tools(value: Option<&Value>) -> Vec<SystemPromptTool> {
    value
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(|tool| {
            let name = tool.get("name").and_then(Value::as_str).filter(|name| !name.is_empty())?;
            Some(SystemPromptTool { name: name.to_string(), description: tool.get("description").and_then(Value::as_str).unwrap_or_default().to_string(), parameters: tool.get("parameters").cloned().unwrap_or(Value::Null) })
        })
        .collect()
}

fn read_snapshots(path: &str) -> Result<Vec<SystemPromptSnapshot>, String> {
    let file = fs::File::open(path).map_err(|e| format!("Failed to open session file: {e}"))?;
    let mut reader = BufReader::with_capacity(256 * 1024, file);
    let mut state = ReplayState::default();
    let mut snapshots = Vec::new();

    loop {
        let mut line = Vec::new();
        let bytes_read = reader.read_until(b'\n', &mut line).map_err(|e| format!("Failed to read session file: {e}"))?;
        if bytes_read == 0 {
            break;
        }

        let Ok(entry) = serde_json::from_slice::<Value>(&line) else {
            continue;
        };
        if entry.get("type").and_then(Value::as_str) != Some("message") {
            continue;
        }
        let Some(message) = entry.get("message") else {
            continue;
        };
        if message.get("role").and_then(Value::as_str) != Some("system") {
            continue;
        }

        if let Some(content) = message.get("content").and_then(Value::as_str).filter(|text| !text.is_empty()) {
            state.content.push_str(content);
        }

        let (changed_sections, removed_sections) = state.apply_sections(ordered_section_updates(&line));
        let (tools_added, tools_removed) = state.apply_tools(parse_tools(message.get("toolsAdded")), tool_names(message.get("toolsRemoved")));
        let version = snapshots.len() + 1;
        snapshots.push(SystemPromptSnapshot {
            id: entry.get("id").and_then(Value::as_str).unwrap_or_default().to_string(),
            timestamp: entry.get("timestamp").and_then(Value::as_str).unwrap_or_default().to_string(),
            version,
            content: state.content.clone(),
            prompt: state.prompt(),
            sections: state.sections.clone(),
            tools: state.tools.clone(),
            changed_sections,
            removed_sections,
            tools_added,
            tools_removed,
        });
    }

    Ok(snapshots)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_session_system_prompt_snapshots(path: String) -> Result<Vec<SystemPromptSnapshot>, String> {
    read_snapshots(&path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn returns_empty_without_system_messages() {
        let temp = tempdir().expect("tempdir");
        let path = temp.path().join("session.jsonl");
        fs::write(&path, "{\"type\":\"session\",\"id\":\"header\"}\nnot json\n{\"type\":\"message\",\"id\":\"user-1\",\"message\":{\"role\":\"user\",\"content\":\"hello\"}}\n").expect("write session");

        let snapshots = read_snapshots(path.to_str().expect("path utf8")).expect("read snapshots");
        assert!(snapshots.is_empty());
    }

    #[test]
    fn unchanged_section_updates_are_not_reported_as_changes() {
        let mut state = ReplayState::default();
        state.apply_sections(vec![("rules".into(), Some("same".into())), ("skills".into(), Some("old".into()))]);
        let (changed, removed) = state.apply_sections(vec![("rules".into(), Some("same".into())), ("skills".into(), Some("new".into()))]);
        assert_eq!(changed, vec!["skills"]);
        assert!(removed.is_empty());
    }

    #[test]
    fn replays_system_prompt_sections_and_tools_in_file_order() {
        let temp = tempdir().expect("tempdir");
        let path = temp.path().join("session.jsonl");
        let contents = r#"{"type":"session","id":"header"}
not json
{"type":"message","id":"sys-1","timestamp":"2026-11-06T00:00:00.000Z","message":{"role":"system","content":"Base prompt","sections":{"zeta":"Zeta text","alpha":"First section","beta":"Second section","empty":"","ignored":123},"toolsAdded":[{"name":"read","description":"Read files","parameters":{"type":"object","properties":{"path":{"type":"string"}}}},{"noName":"ignored"},{"name":"bash"},{"name":"read","description":"Read files (updated)","parameters":{"type":"object","required":["path"]}}],"toolsRemoved":[{"name":"legacy"}]}}
{"type":"message","id":"user-1","timestamp":"2026-11-06T00:00:01.000Z","message":{"role":"user","content":"hello"}}
{"type":"message","id":"sys-2","timestamp":"2026-11-06T00:00:02.000Z","message":{"role":"system","content":"","sections":{"alpha":"Updated first","beta":null,"gamma":"New tail"},"toolsAdded":[{"name":"edit","description":"Edit files","parameters":{"type":"object"}},{"name":42},"not-an-object"],"toolsRemoved":[{"name":"bash"},{"name":"bash"}]}}
{"type":"message","id":"sys-3","timestamp":"2026-11-06T00:00:03.000Z","message":{"role":"system","content":" Extra","sections":{}}}
"#;
        fs::write(&path, contents).expect("write session");

        let snapshots = read_snapshots(path.to_str().expect("path utf8")).expect("read snapshots");
        assert_eq!(snapshots.len(), 3);

        let first = &snapshots[0];
        assert_eq!(first.id, "sys-1");
        assert_eq!(first.timestamp, "2026-11-06T00:00:00.000Z");
        assert_eq!(first.version, 1);
        assert_eq!(first.content, "Base prompt");
        assert_eq!(first.prompt, "Base prompt\n\nZeta text\n\nFirst section\n\nSecond section");
        assert_eq!(first.sections.iter().map(|section| (section.name.as_str(), section.text.as_str())).collect::<Vec<_>>(), vec![("zeta", "Zeta text"), ("alpha", "First section"), ("beta", "Second section"), ("empty", "")]);
        assert_eq!(first.changed_sections, vec!["zeta", "alpha", "beta", "empty"]);
        assert!(first.removed_sections.is_empty());
        assert_eq!(first.tools_added, vec!["read", "bash"]);
        assert_eq!(first.tools_removed, vec!["legacy"]);
        assert_eq!(first.tools.iter().map(|tool| tool.name.as_str()).collect::<Vec<_>>(), vec!["read", "bash"]);
        assert_eq!(first.tools[0].description, "Read files (updated)");
        assert_eq!(first.tools[0].parameters, json!({ "type": "object", "required": ["path"] }));
        assert_eq!(first.tools[1].description, "");
        assert_eq!(first.tools[1].parameters, Value::Null);

        let serialized = serde_json::to_value(first).expect("serialize snapshot");
        assert_eq!(serialized["content"], json!("Base prompt"));
        assert_eq!(serialized["sections"][0], json!({ "name": "zeta", "text": "Zeta text" }));
        assert_eq!(serialized["tools"][0]["name"], json!("read"));
        assert_eq!(serialized["tools"][0]["description"], json!("Read files (updated)"));
        assert_eq!(serialized["changedSections"], json!(["zeta", "alpha", "beta", "empty"]));
        assert_eq!(serialized["removedSections"], json!([]));
        assert_eq!(serialized["toolsAdded"], json!(["read", "bash"]));
        assert_eq!(serialized["toolsRemoved"], json!(["legacy"]));

        let second = &snapshots[1];
        assert_eq!(second.id, "sys-2");
        assert_eq!(second.version, 2);
        assert_eq!(second.content, "Base prompt");
        assert_eq!(second.prompt, "Base prompt\n\nZeta text\n\nUpdated first\n\nNew tail");
        assert_eq!(second.sections.iter().map(|section| (section.name.as_str(), section.text.as_str())).collect::<Vec<_>>(), vec![("zeta", "Zeta text"), ("alpha", "Updated first"), ("empty", ""), ("gamma", "New tail")]);
        assert_eq!(second.changed_sections, vec!["alpha", "gamma"]);
        assert_eq!(second.removed_sections, vec!["beta"]);
        assert_eq!(second.tools_added, vec!["edit"]);
        assert_eq!(second.tools_removed, vec!["bash"]);
        assert_eq!(second.tools.iter().map(|tool| tool.name.as_str()).collect::<Vec<_>>(), vec!["read", "edit"]);
        assert_eq!(second.tools[1].description, "Edit files");

        let third = &snapshots[2];
        assert_eq!(third.version, 3);
        assert_eq!(third.content, "Base prompt Extra");
        assert_eq!(third.prompt, "Base prompt Extra\n\nZeta text\n\nUpdated first\n\nNew tail");
        assert_eq!(third.sections, second.sections);
        assert_eq!(third.tools, second.tools);
        assert!(third.changed_sections.is_empty());
        assert!(third.removed_sections.is_empty());
        assert!(third.tools_added.is_empty());
        assert!(third.tools_removed.is_empty());
    }

    #[test]
    fn removes_tools_that_were_never_added_without_duplicating_changes() {
        let temp = tempdir().expect("tempdir");
        let path = temp.path().join("session.jsonl");
        fs::write(
            &path,
            r#"{"type":"message","id":"sys-1","message":{"role":"system","sections":{},"toolsRemoved":[{"name":"ghost"},"legacy-string"]}}
"#,
        )
        .expect("write session");

        let snapshots = read_snapshots(path.to_str().expect("path utf8")).expect("read snapshots");
        assert_eq!(snapshots.len(), 1);
        assert!(snapshots[0].tools.is_empty());
        assert_eq!(snapshots[0].tools_removed, vec!["ghost", "legacy-string"]);
    }

    #[test]
    fn propagates_file_open_errors() {
        let temp = tempdir().expect("tempdir");
        let missing = temp.path().join("missing.jsonl");
        let error = read_snapshots(missing.to_str().expect("path utf8")).expect_err("missing file must fail");
        assert!(error.contains("Failed to open session file"));
    }
}
