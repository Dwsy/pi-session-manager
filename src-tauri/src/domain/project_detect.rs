//! Project marker detection for plugin project icons.
//!
//! This module is the only file-scanning surface plugins get for project
//! directories, and it is deliberately narrow: only the existence of a fixed
//! marker catalog at the directory top level is checked (plus the `src-tauri/`
//! convention), and `package.json` is read only to refine the node-family kind.
//! No file content ever leaves this module.
//!
//! The scan whitelist is auto-authorized from PSM's own project roots (the
//! distinct session `cwd` values), so plugins never read arbitrary directories
//! and no user approval is needed per directory.

use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;
use std::fs;
use std::path::Path;

/// Upper bound for the one file whose content is parsed (`package.json`).
const PACKAGE_JSON_MAX_BYTES: u64 = 256 * 1024;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDetection {
    /// Echo of the requested path (or the stored project root for whole-list scans).
    pub path: String,
    /// Directory basename, so callers can label without re-deriving it.
    pub name: String,
    /// `false` means the path is outside the auto-authorized scan whitelist.
    pub authorized: bool,
    /// Normalized project kind, e.g. `rust` or `react`. `None` when unknown or unauthorized.
    pub kind: Option<String>,
}

/// Separator-normalized comparison key: backslashes to `/`, no trailing `/`.
/// Security-sensitive: whitelist matching uses exact equality on this key.
fn normalize_root(value: &str) -> String {
    let normalized = value.trim().replace('\\', "/");
    let trimmed = normalized.trim_end_matches('/');
    if trimmed.is_empty() {
        normalized
    } else {
        trimmed.to_string()
    }
}

fn directory_name(path: &str) -> String {
    Path::new(path).file_name().map(|value| value.to_string_lossy().to_string()).unwrap_or_default()
}

/// Auto-authorized scan whitelist: every distinct project root PSM already knows.
/// Sorted and deduplicated so scan order is deterministic.
fn auto_authorized_roots() -> Result<Vec<String>, String> {
    let conn = crate::data::sqlite::init_db()?;
    let mut statement = conn.prepare("SELECT DISTINCT cwd FROM sessions WHERE cwd != ''").map_err(|e| format!("Failed to query project roots: {e}"))?;
    let rows = statement.query_map([], |row| row.get::<_, String>(0)).map_err(|e| format!("Failed to query project roots: {e}"))?;

    let mut roots = BTreeSet::new();
    for row in rows {
        let cwd = row.map_err(|e| format!("Failed to read project root: {e}"))?;
        let normalized = normalize_root(&cwd);
        if !normalized.is_empty() {
            roots.insert(normalized);
        }
    }
    Ok(roots.into_iter().collect())
}

/// Detects project kinds for the requested paths (or every whitelisted root when
/// `paths` is empty/omitted). Unauthorized paths come back with `authorized: false`
/// instead of an error, so a batch scan reports per-entry outcomes.
pub fn detect_projects(paths: Option<Vec<String>>) -> Result<Vec<ProjectDetection>, String> {
    let roots = auto_authorized_roots()?;
    scan_projects(&roots, paths.as_deref())
}

/// Pure scan step over a prepared whitelist; split out so tests do not need the sessions DB.
fn scan_projects(roots: &[String], paths: Option<&[String]>) -> Result<Vec<ProjectDetection>, String> {
    let whitelisted: std::collections::HashMap<String, String> = roots.iter().map(|root| (normalize_root(root), root.clone())).collect();

    let requested: Vec<String> = match paths {
        Some(paths) if !paths.is_empty() => paths.to_vec(),
        _ => roots.to_vec(),
    };

    let mut detections = Vec::with_capacity(requested.len());
    for path in requested {
        let key = normalize_root(&path);
        let root = whitelisted.get(&key);
        detections.push(ProjectDetection { name: directory_name(&path), authorized: root.is_some(), kind: root.and_then(|root| detect_kind(Path::new(root))), path });
    }
    Ok(detections)
}

fn has_file(root: &Path, name: &str) -> bool {
    root.join(name).is_file()
}

fn has_top_level_extension(root: &Path, extension: &str) -> bool {
    let Ok(entries) = fs::read_dir(root) else {
        return false;
    };
    entries.filter_map(Result::ok).any(|entry| entry.path().is_file() && entry.path().extension().is_some_and(|value| value.eq_ignore_ascii_case(extension)))
}

fn dependency_names(root: &Path) -> Vec<String> {
    let mut raw = Vec::new();
    if let Ok(mut file) = fs::File::open(root.join("package.json")) {
        use std::io::Read;
        let _ = file.by_ref().take(PACKAGE_JSON_MAX_BYTES).read_to_end(&mut raw);
    }
    let Ok(value) = serde_json::from_slice::<serde_json::Value>(&raw) else {
        return Vec::new();
    };
    ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"].iter().filter_map(|field| value.get(field).and_then(serde_json::Value::as_object)).flat_map(|deps| deps.keys().cloned()).collect()
}

/// Node-family refinement: frameworks win over the plain `node` kind.
fn node_kind(root: &Path) -> String {
    let dependencies = dependency_names(root);
    let has = |name: &str| dependencies.iter().any(|dep| dep == name);
    if has("next") {
        "nextjs".to_string()
    } else if has("react") {
        "react".to_string()
    } else if has("vue") {
        "vue".to_string()
    } else if has("svelte") || has("@sveltejs/kit") {
        "svelte".to_string()
    } else if has("@angular/core") {
        "angular".to_string()
    } else {
        "node".to_string()
    }
}

/// Ordered marker precedence: the strongest ecosystem wins when a directory
/// carries several markers (e.g. a Tauri app nests `src-tauri/Cargo.toml`
/// under a `package.json`).
fn detect_kind(root: &Path) -> Option<String> {
    if has_file(root, "tauri.conf.json") || has_file(root, "src-tauri/tauri.conf.json") || has_file(root, "src-tauri/Cargo.toml") {
        return Some("tauri".to_string());
    }
    if has_file(root, "Cargo.toml") {
        return Some("rust".to_string());
    }
    if has_file(root, "go.mod") {
        return Some("go".to_string());
    }
    if has_file(root, "pyproject.toml") || has_file(root, "setup.py") || has_file(root, "requirements.txt") || has_file(root, "Pipfile") {
        return Some("python".to_string());
    }
    if has_file(root, "pom.xml") || has_file(root, "build.gradle") || has_file(root, "build.gradle.kts") {
        return Some("java".to_string());
    }
    if has_top_level_extension(root, "csproj") || has_top_level_extension(root, "sln") || has_top_level_extension(root, "fsproj") {
        return Some("dotnet".to_string());
    }
    if has_file(root, "composer.json") {
        return Some("php".to_string());
    }
    if has_file(root, "Gemfile") {
        return Some("ruby".to_string());
    }
    if has_file(root, "CMakeLists.txt") {
        return Some("c-cpp".to_string());
    }
    if has_file(root, "package.json") {
        return Some(node_kind(root));
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::TempDir;

    fn project_with(files: &[&str]) -> TempDir {
        let dir = tempfile::tempdir().expect("tempdir");
        for file in files {
            let path = dir.path().join(file);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("parent");
            }
            fs::write(path, "{}").expect("write marker");
        }
        dir
    }

    fn kind_of(dir: &TempDir) -> Option<String> {
        detect_kind(dir.path())
    }

    #[test]
    fn detects_common_ecosystems_by_marker() {
        assert_eq!(kind_of(&project_with(&["Cargo.toml"])), Some("rust".into()));
        assert_eq!(kind_of(&project_with(&["go.mod"])), Some("go".into()));
        assert_eq!(kind_of(&project_with(&["requirements.txt"])), Some("python".into()));
        assert_eq!(kind_of(&project_with(&["pom.xml"])), Some("java".into()));
        assert_eq!(kind_of(&project_with(&["app.csproj"])), Some("dotnet".into()));
        assert_eq!(kind_of(&project_with(&["composer.json"])), Some("php".into()));
        assert_eq!(kind_of(&project_with(&["Gemfile"])), Some("ruby".into()));
        assert_eq!(kind_of(&project_with(&["CMakeLists.txt"])), Some("c-cpp".into()));
    }

    #[test]
    fn strongest_marker_wins_over_node_family() {
        // Root-level Rust workspace alongside a package.json still reads as Rust.
        let dir = project_with(&["package.json", "Cargo.toml"]);
        assert_eq!(kind_of(&dir), Some("rust".into()));

        // The Tauri convention beats both.
        let nested = project_with(&["package.json", "src-tauri/Cargo.toml"]);
        assert_eq!(kind_of(&nested), Some("tauri".into()));
    }

    #[test]
    fn package_json_refines_node_family() {
        let write_deps = |deps: &str| {
            let dir = tempfile::tempdir().expect("tempdir");
            fs::write(dir.path().join("package.json"), deps).expect("write package.json");
            kind_of(&dir)
        };
        assert_eq!(write_deps(r#"{"dependencies":{"next":"15"}}"#), Some("nextjs".into()));
        assert_eq!(write_deps(r#"{"dependencies":{"react":"18"}}"#), Some("react".into()));
        assert_eq!(write_deps(r#"{"devDependencies":{"vue":"3"}}"#), Some("vue".into()));
        assert_eq!(write_deps(r#"{"dependencies":{"@angular/core":"17"}}"#), Some("angular".into()));
        assert_eq!(write_deps(r#"{"dependencies":{"lodash":"4"}}"#), Some("node".into()));
    }

    #[test]
    fn invalid_package_json_degrades_to_node() {
        let dir = project_with(&["package.json"]);
        fs::write(dir.path().join("package.json"), "not json").expect("corrupt package.json");
        assert_eq!(kind_of(&dir), Some("node".into()));
    }

    #[test]
    fn unrecognized_directory_has_no_kind() {
        let dir = project_with(&["README.md"]);
        assert_eq!(kind_of(&dir), None);
    }

    #[test]
    fn whitelist_matching_is_exact_after_normalization() {
        let dir = project_with(&["Cargo.toml"]);
        let root = dir.path().to_string_lossy().to_string();

        let scans = scan_projects(&[root.clone()], Some(&[format!("{root}/"), root.replace('/', "\\")])).expect("scan");
        assert_eq!(scans.len(), 2);
        assert!(scans.iter().all(|scan| scan.authorized));
        assert_eq!(scans[0].kind, Some("rust".into()));

        // Not a known project root: denied without any filesystem probing.
        let denied = scan_projects(&[root], Some(&["/tmp/not-a-known-project".to_string()])).expect("scan");
        assert_eq!(denied.len(), 1);
        assert!(!denied[0].authorized);
        assert_eq!(denied[0].kind, None);
    }

    #[test]
    fn prefix_and_case_variants_are_not_whitelisted() {
        let dir = project_with(&["Cargo.toml"]);
        let root = dir.path().to_string_lossy().to_string();

        let denied = scan_projects(&[root.clone()], Some(&[format!("{root}/child"), root.to_uppercase()])).expect("scan");
        assert!(denied.iter().all(|scan| !scan.authorized));
    }

    #[test]
    fn empty_paths_scans_every_whitelisted_root() {
        let first = project_with(&["Cargo.toml"]);
        let second = project_with(&["go.mod"]);
        let roots = vec![first.path().to_string_lossy().to_string(), second.path().to_string_lossy().to_string()];

        let scans = scan_projects(&roots, None).expect("scan");
        assert_eq!(scans.len(), 2);
        assert!(scans.iter().all(|scan| scan.authorized));
    }
}
