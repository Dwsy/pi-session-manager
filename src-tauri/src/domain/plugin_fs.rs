use base64::Engine;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

const DEFAULT_MAX_BYTES: u64 = 2 * 1024 * 1024;
const HARD_MAX_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PsmFsRootInfo {
    pub id: String,
    pub path: String,
    pub read: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PsmFsEntry {
    pub root_id: String,
    pub path: String,
    pub name: String,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PsmFsReadResult {
    pub root_id: String,
    pub path: String,
    pub content: String,
    pub encoding: String,
    pub bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
}

fn widgets_root() -> Result<PathBuf, String> {
    dirs::home_dir().map(|home| home.join(".pi").join("widgets")).ok_or_else(|| "Unable to resolve home directory".to_string())
}

fn root_path(root_id: &str) -> Result<PathBuf, String> {
    match root_id {
        "widgets" => widgets_root(),
        _ => Err(format!("Unknown plugin filesystem root: {root_id}")),
    }
}

fn validate_relative_path(path: &str) -> Result<(), String> {
    if path.is_empty() || path.contains('\0') {
        return Err("Invalid plugin filesystem path".to_string());
    }

    let path = Path::new(path);
    if path.is_absolute() {
        return Err("Plugin filesystem path must be relative".to_string());
    }

    for component in path.components() {
        match component {
            Component::Normal(_) => {}
            _ => return Err("Invalid plugin filesystem path".to_string()),
        }
    }

    Ok(())
}

fn canonical_root(root_id: &str) -> Result<PathBuf, String> {
    root_path(root_id)?.canonicalize().map_err(|error| format!("Failed to resolve plugin filesystem root: {error}"))
}

fn resolve_path(root_id: &str, relative_path: &str) -> Result<PathBuf, String> {
    validate_relative_path(relative_path)?;
    let root = root_path(root_id)?;
    let canonical_root = canonical_root(root_id)?;
    let target = root.join(relative_path);
    let canonical_target = target.canonicalize().map_err(|error| format!("File not found: {error}"))?;

    if !canonical_target.starts_with(&canonical_root) {
        return Err("Plugin filesystem path escapes root".to_string());
    }

    Ok(canonical_target)
}

fn clamp_max_bytes(max_bytes: Option<u64>) -> u64 {
    max_bytes.unwrap_or(DEFAULT_MAX_BYTES).min(HARD_MAX_BYTES)
}

fn modified_at(metadata: &fs::Metadata) -> Option<String> {
    let modified = metadata.modified().ok()?;
    let duration = modified.duration_since(UNIX_EPOCH).ok()?;
    Some(duration.as_secs().to_string())
}

fn entry_for(root_id: &str, root: &Path, path: PathBuf) -> Result<PsmFsEntry, String> {
    let metadata = fs::metadata(&path).map_err(|error| format!("Failed to stat plugin filesystem entry: {error}"))?;
    let relative = path.strip_prefix(root).map_err(|_| "Plugin filesystem path escapes root".to_string())?;
    let relative_path = relative.to_string_lossy().replace('\\', "/");
    let name = path.file_name().and_then(|value| value.to_str()).unwrap_or_default().to_string();

    Ok(PsmFsEntry { root_id: root_id.to_string(), path: relative_path, name, kind: if metadata.is_dir() { "directory".to_string() } else { "file".to_string() }, size: metadata.is_file().then_some(metadata.len()), modified_at: modified_at(&metadata) })
}

fn mime_type_for(path: &Path) -> Option<String> {
    match path.extension().and_then(|value| value.to_str()).map(|value| value.to_ascii_lowercase()).as_deref() {
        Some("html") | Some("htm") => Some("text/html".to_string()),
        Some("svg") => Some("image/svg+xml".to_string()),
        Some("json") => Some("application/json".to_string()),
        Some("txt") => Some("text/plain".to_string()),
        Some("md") => Some("text/markdown".to_string()),
        _ => None,
    }
}

pub fn plugin_fs_roots() -> Result<Vec<PsmFsRootInfo>, String> {
    let widgets = widgets_root()?;
    Ok(vec![PsmFsRootInfo { id: "widgets".to_string(), path: widgets.to_string_lossy().to_string(), read: true }])
}

pub fn plugin_fs_list(root_id: String, path: Option<String>) -> Result<Vec<PsmFsEntry>, String> {
    let relative_path = path.unwrap_or_else(|| ".".to_string());
    let target = if relative_path == "." { canonical_root(&root_id)? } else { resolve_path(&root_id, &relative_path)? };
    let root = canonical_root(&root_id)?;

    if !target.is_dir() {
        return Err("Plugin filesystem path is not a directory".to_string());
    }

    let mut entries = Vec::new();
    for item in fs::read_dir(&target).map_err(|error| format!("Failed to read plugin filesystem directory: {error}"))? {
        let item = item.map_err(|error| format!("Failed to read plugin filesystem entry: {error}"))?;
        entries.push(entry_for(&root_id, &root, item.path())?);
    }
    entries.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(entries)
}

pub fn plugin_fs_stat(root_id: String, path: String) -> Result<Option<PsmFsEntry>, String> {
    let root = canonical_root(&root_id)?;
    match resolve_path(&root_id, &path) {
        Ok(target) => Ok(Some(entry_for(&root_id, &root, target)?)),
        Err(error) if error.starts_with("File not found:") => Ok(None),
        Err(error) => Err(error),
    }
}

pub fn plugin_fs_read(root_id: String, path: String, encoding: Option<String>, max_bytes: Option<u64>) -> Result<PsmFsReadResult, String> {
    let target = resolve_path(&root_id, &path)?;
    let metadata = fs::metadata(&target).map_err(|error| format!("Failed to stat plugin filesystem file: {error}"))?;
    if !metadata.is_file() {
        return Err("Plugin filesystem path is not a file".to_string());
    }

    let bytes = metadata.len();
    let limit = clamp_max_bytes(max_bytes);
    if bytes > limit {
        return Err(format!("Plugin filesystem file is too large: {bytes} bytes exceeds {limit} bytes"));
    }

    let raw = fs::read(&target).map_err(|error| format!("Failed to read plugin filesystem file: {error}"))?;
    let encoding = encoding.unwrap_or_else(|| "utf-8".to_string());
    let content = match encoding.as_str() {
        "utf-8" => String::from_utf8(raw).map_err(|error| format!("Plugin filesystem file is not valid UTF-8: {error}"))?,
        "base64" => base64::engine::general_purpose::STANDARD.encode(raw),
        _ => return Err(format!("Unsupported plugin filesystem encoding: {encoding}")),
    };

    Ok(PsmFsReadResult { root_id, path, content, encoding, bytes, mime_type: mime_type_for(&target) })
}

#[cfg(test)]
mod tests {
    use super::validate_relative_path;

    #[test]
    fn rejects_unsafe_relative_paths() {
        for path in ["", "../x.html", "/tmp/x.html", "nested/../x.html", "x\0.html"] {
            assert!(validate_relative_path(path).is_err(), "{path} should be rejected");
        }
    }

    #[test]
    fn accepts_nested_normal_paths() {
        assert!(validate_relative_path("index.json").is_ok());
        assert!(validate_relative_path("nested/widget.html").is_ok());
    }
}
