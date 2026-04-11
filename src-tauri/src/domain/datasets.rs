#![allow(unknown_lints)]

use crate::config::{Config, DatasetRegistryEntry, SessionSourceMode};
use crate::core::scanner::{collect_jsonl_files, parallel_parse_files};
use crate::data::sqlite;
use chrono::Utc;
use futures_util::stream::{self, StreamExt};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

const DOWNLOAD_CONCURRENCY: usize = 6;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetInfo {
    pub id: String,
    pub slug: String,
    pub display_name: String,
    pub source_url: String,
    pub repo_id: String,
    pub revision: String,
    pub imported_at: Option<String>,
    pub total_files: usize,
    pub total_bytes: u64,
    pub local_path: String,
    pub sessions_path: String,
    pub db_path: String,
    pub is_active: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DatasetImportStatus {
    pub task_id: String,
    pub dataset_id: String,
    pub display_name: String,
    pub source_url: String,
    pub phase: String,
    pub total_files: usize,
    pub downloaded_files: usize,
    pub indexed_files: usize,
    pub total_bytes: u64,
    pub downloaded_bytes: u64,
    pub error: Option<String>,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct HuggingFaceTreeEntry {
    path: String,
    #[serde(rename = "type")]
    entry_type: String,
    size: Option<u64>,
}

#[derive(Debug, Clone)]
struct ParsedDatasetSource {
    repo_id: String,
    display_name: String,
    source_url: String,
    revision: String,
    slug: String,
}

fn import_states() -> &'static Mutex<HashMap<String, DatasetImportStatus>> {
    static STATES: OnceLock<Mutex<HashMap<String, DatasetImportStatus>>> = OnceLock::new();
    STATES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn update_import_status(
    task_id: &str,
    update: impl FnOnce(&mut DatasetImportStatus),
) -> Result<(), String> {
    let mut states = import_states()
        .lock()
        .map_err(|_| "Failed to lock dataset import state".to_string())?;
    let Some(state) = states.get_mut(task_id) else {
        return Err(format!("Dataset import task not found: {task_id}"));
    };
    update(state);
    Ok(())
}

fn set_import_failed(task_id: &str, error: String) {
    let _ = update_import_status(task_id, |state| {
        state.phase = "failed".to_string();
        state.error = Some(error);
        state.finished_at = Some(Utc::now().to_rfc3339());
    });
}

fn home_dir() -> Result<PathBuf, String> {
    if let Ok(home) = std::env::var("HOME") {
        return Ok(PathBuf::from(home));
    }
    dirs::home_dir().ok_or("Cannot find home directory".to_string())
}

fn datasets_root_dir() -> Result<PathBuf, String> {
    let root = home_dir()?
        .join(".pi")
        .join("agent")
        .join("sessions")
        .join("datasets");
    fs::create_dir_all(&root).map_err(|e| format!("Failed to create datasets dir: {e}"))?;
    Ok(root)
}

fn dataset_root_dir(slug: &str) -> Result<PathBuf, String> {
    let dir = datasets_root_dir()?.join(slug);
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dataset root dir: {e}"))?;
    Ok(dir)
}

fn dataset_sessions_dir(slug: &str) -> Result<PathBuf, String> {
    let dir = dataset_root_dir(slug)?.join("sessions");
    fs::create_dir_all(&dir).map_err(|e| format!("Failed to create dataset sessions dir: {e}"))?;
    Ok(dir)
}

fn dataset_db_path(slug: &str) -> Result<PathBuf, String> {
    Ok(dataset_root_dir(slug)?.join("sessions.db"))
}

fn slugify_repo_id(repo_id: &str) -> String {
    repo_id
        .chars()
        .map(|ch| match ch {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '.' | '_' | '-' => ch,
            '/' => '_',
            _ => '-',
        })
        .collect::<String>()
        .replace("__", "_")
}

fn parse_dataset_source(source: &str) -> Result<ParsedDatasetSource, String> {
    let trimmed = source.trim().trim_end_matches('/');
    if trimmed.is_empty() {
        return Err("Dataset source cannot be empty".to_string());
    }

    let repo_id = if let Some(rest) = trimmed.strip_prefix("https://huggingface.co/datasets/") {
        let mut parts = rest.split('/').filter(|part| !part.is_empty());
        let owner = parts.next().ok_or("Invalid Hugging Face dataset URL")?;
        let name = parts.next().ok_or("Invalid Hugging Face dataset URL")?;
        format!("{owner}/{name}")
    } else if !trimmed.contains("://") && trimmed.split('/').count() == 2 {
        trimmed.to_string()
    } else {
        return Err(
            "Only Hugging Face dataset URLs or owner/name identifiers are supported".to_string(),
        );
    };

    let display_name = repo_id
        .split('/')
        .next_back()
        .unwrap_or(&repo_id)
        .to_string();

    Ok(ParsedDatasetSource {
        source_url: format!("https://huggingface.co/datasets/{repo_id}"),
        slug: slugify_repo_id(&repo_id),
        repo_id: repo_id.clone(),
        display_name,
        revision: "main".to_string(),
    })
}

async fn fetch_dataset_tree(
    client: &reqwest::Client,
    source: &ParsedDatasetSource,
) -> Result<Vec<HuggingFaceTreeEntry>, String> {
    fn parse_next_link(link_header: &str) -> Option<String> {
        link_header.split(',').find_map(|part| {
            let trimmed = part.trim();
            if !trimmed.contains("rel=\"next\"") {
                return None;
            }
            let start = trimmed.find('<')?;
            let end = trimmed[start + 1..].find('>')?;
            Some(trimmed[start + 1..start + 1 + end].to_string())
        })
    }

    let mut url = format!(
        "https://huggingface.co/api/datasets/{}/tree/{}?recursive=true&expand=true",
        source.repo_id, source.revision
    );
    let mut results = Vec::new();

    loop {
        let response = client
            .get(&url)
            .send()
            .await
            .map_err(|e| format!("Failed to query dataset tree: {e}"))?
            .error_for_status()
            .map_err(|e| format!("Failed to query dataset tree: {e}"))?;

        let next_link = response
            .headers()
            .get("link")
            .and_then(|value| value.to_str().ok())
            .and_then(parse_next_link);

        let mut page = response
            .json::<Vec<HuggingFaceTreeEntry>>()
            .await
            .map_err(|e| format!("Failed to parse dataset tree: {e}"))?;
        results.append(&mut page);

        if let Some(next) = next_link {
            url = next;
        } else {
            break;
        }
    }

    Ok(results)
}

fn dataset_file_url(source: &ParsedDatasetSource, relative_path: &str) -> String {
    format!(
        "https://huggingface.co/datasets/{}/resolve/{}/{}?download=true",
        source.repo_id, source.revision, relative_path
    )
}

fn remove_existing_dataset_artifacts(slug: &str) -> Result<(), String> {
    let sessions_dir = dataset_sessions_dir(slug)?;
    if sessions_dir.exists() {
        fs::remove_dir_all(&sessions_dir)
            .map_err(|e| format!("Failed to clear dataset sessions dir: {e}"))?;
    }
    fs::create_dir_all(&sessions_dir)
        .map_err(|e| format!("Failed to recreate dataset sessions dir: {e}"))?;

    let db_path = dataset_db_path(slug)?;
    for suffix in ["", "-wal", "-shm"] {
        let candidate = PathBuf::from(format!("{}{}", db_path.to_string_lossy(), suffix));
        if candidate.exists() {
            fs::remove_file(&candidate)
                .map_err(|e| format!("Failed to remove stale dataset DB {candidate:?}: {e}"))?;
        }
    }
    Ok(())
}

async fn download_dataset_files(
    task_id: &str,
    source: &ParsedDatasetSource,
    files: Vec<HuggingFaceTreeEntry>,
) -> Result<(), String> {
    let target_root = dataset_sessions_dir(&source.slug)?;
    let client = reqwest::Client::builder()
        .user_agent("pi-session-manager/0.5")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let tasks = files.into_iter().map(|entry| {
        let client = client.clone();
        let source = source.clone();
        let target_root = target_root.clone();
        async move {
            let response = client
                .get(dataset_file_url(&source, &entry.path))
                .send()
                .await
                .map_err(|e| format!("Failed to download {}: {e}", entry.path))?
                .error_for_status()
                .map_err(|e| format!("Failed to download {}: {e}", entry.path))?;
            let bytes = response
                .bytes()
                .await
                .map_err(|e| format!("Failed to read {}: {e}", entry.path))?;
            let local_path = target_root.join(&entry.path);
            if let Some(parent) = local_path.parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .map_err(|e| format!("Failed to create {parent:?}: {e}"))?;
            }
            tokio::fs::write(&local_path, &bytes)
                .await
                .map_err(|e| format!("Failed to write {local_path:?}: {e}"))?;
            Ok::<u64, String>(entry.size.unwrap_or(bytes.len() as u64))
        }
    });

    let mut stream = stream::iter(tasks).buffer_unordered(DOWNLOAD_CONCURRENCY);
    while let Some(result) = stream.next().await {
        let size = result?;
        update_import_status(task_id, |state| {
            state.downloaded_files += 1;
            state.downloaded_bytes = state.downloaded_bytes.saturating_add(size);
        })?;
    }

    Ok(())
}

fn build_dataset_db_blocking(slug: &str) -> Result<usize, String> {
    let sessions_dir = dataset_sessions_dir(slug)?;
    let db_path = dataset_db_path(slug)?;
    let config = Config::default();
    let mut conn = sqlite::init_db_with_path(&db_path, &config)?;
    let files = collect_jsonl_files(&[sessions_dir]);
    let handle = tokio::runtime::Handle::current();
    let parsed_results = handle.block_on(parallel_parse_files(files));

    for parsed in &parsed_results {
        sqlite::upsert_session(
            &mut conn,
            &parsed.info,
            parsed.file_modified,
            Some(&parsed.entries),
        )?;
    }

    sqlite::optimize_database(&conn)?;
    Ok(parsed_results.len())
}

fn write_dataset_manifest(dataset: &DatasetInfo) -> Result<(), String> {
    let manifest_path = PathBuf::from(&dataset.local_path).join("manifest.json");
    let content = serde_json::to_string_pretty(dataset)
        .map_err(|e| format!("Failed to serialize dataset manifest: {e}"))?;
    fs::write(&manifest_path, content).map_err(|e| format!("Failed to write dataset manifest: {e}"))
}

fn config_to_dataset_info(
    config: &Config,
    dataset: &DatasetRegistryEntry,
) -> Result<DatasetInfo, String> {
    let active_ids = config.effective_active_dataset_ids();
    Ok(DatasetInfo {
        id: dataset.id.clone(),
        slug: dataset.slug.clone(),
        display_name: dataset.display_name.clone(),
        source_url: dataset.source_url.clone(),
        repo_id: dataset.repo_id.clone(),
        revision: dataset.revision.clone(),
        imported_at: dataset.imported_at.clone(),
        total_files: dataset.total_files,
        total_bytes: dataset.total_bytes,
        local_path: dataset_root_dir(&dataset.slug)?
            .to_string_lossy()
            .to_string(),
        sessions_path: dataset_sessions_dir(&dataset.slug)?
            .to_string_lossy()
            .to_string(),
        db_path: dataset_db_path(&dataset.slug)?
            .to_string_lossy()
            .to_string(),
        is_active: config.session_source_mode == SessionSourceMode::Dataset
            && active_ids.iter().any(|item| item == &dataset.id),
    })
}

fn upsert_dataset_registry_entry(
    source: &ParsedDatasetSource,
    total_files: usize,
    total_bytes: u64,
) -> Result<DatasetInfo, String> {
    let mut config = Config::load().unwrap_or_default();
    let entry = DatasetRegistryEntry {
        id: source.repo_id.clone(),
        slug: source.slug.clone(),
        display_name: source.display_name.clone(),
        source_url: source.source_url.clone(),
        repo_id: source.repo_id.clone(),
        revision: source.revision.clone(),
        imported_at: Some(Utc::now().to_rfc3339()),
        total_files,
        total_bytes,
    };

    if let Some(existing) = config.datasets.iter_mut().find(|item| item.id == entry.id) {
        *existing = entry.clone();
    } else {
        config.datasets.push(entry.clone());
    }
    config
        .datasets
        .sort_by(|a, b| a.display_name.cmp(&b.display_name));
    crate::config::save_config(&config)?;
    config_to_dataset_info(&config, &entry)
}

async fn run_dataset_import(task_id: String, source: ParsedDatasetSource) -> Result<(), String> {
    remove_existing_dataset_artifacts(&source.slug)?;
    update_import_status(&task_id, |state| {
        state.phase = "discovering".to_string();
    })?;

    let client = reqwest::Client::builder()
        .user_agent("pi-session-manager/0.5")
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;
    let tree = fetch_dataset_tree(&client, &source).await?;
    let jsonl_files: Vec<HuggingFaceTreeEntry> = tree
        .into_iter()
        .filter(|entry| entry.entry_type == "file" && entry.path.ends_with(".jsonl"))
        .collect();

    if jsonl_files.is_empty() {
        return Err("No JSONL files found in dataset".to_string());
    }

    let jsonl_file_count = jsonl_files.len();
    let total_bytes = jsonl_files.iter().map(|item| item.size.unwrap_or(0)).sum();
    update_import_status(&task_id, |state| {
        state.phase = "downloading".to_string();
        state.total_files = jsonl_file_count;
        state.total_bytes = total_bytes;
    })?;

    download_dataset_files(&task_id, &source, jsonl_files).await?;

    update_import_status(&task_id, |state| {
        state.phase = "building".to_string();
    })?;

    let slug = source.slug.clone();
    let indexed_files = tokio::task::spawn_blocking(move || build_dataset_db_blocking(&slug))
        .await
        .map_err(|e| format!("Dataset indexing task failed: {e}"))??;

    let dataset = upsert_dataset_registry_entry(&source, jsonl_file_count, total_bytes)?;
    write_dataset_manifest(&dataset)?;

    update_import_status(&task_id, |state| {
        state.phase = "completed".to_string();
        state.indexed_files = indexed_files;
        state.finished_at = Some(Utc::now().to_rfc3339());
    })?;

    Ok(())
}

pub async fn start_dataset_import_internal(source: String) -> Result<DatasetImportStatus, String> {
    let parsed = parse_dataset_source(&source)?;
    let task_id = format!(
        "dataset-import-{}-{}",
        parsed.slug,
        Utc::now().timestamp_millis()
    );
    let initial = DatasetImportStatus {
        task_id: task_id.clone(),
        dataset_id: parsed.repo_id.clone(),
        display_name: parsed.display_name.clone(),
        source_url: parsed.source_url.clone(),
        phase: "queued".to_string(),
        total_files: 0,
        downloaded_files: 0,
        indexed_files: 0,
        total_bytes: 0,
        downloaded_bytes: 0,
        error: None,
        finished_at: None,
    };

    import_states()
        .lock()
        .map_err(|_| "Failed to lock dataset import state".to_string())?
        .insert(task_id.clone(), initial.clone());

    tokio::spawn(async move {
        if let Err(error) = run_dataset_import(task_id.clone(), parsed).await {
            set_import_failed(&task_id, error);
        }
    });

    Ok(initial)
}

pub fn get_dataset_import_status_internal(task_id: String) -> Result<DatasetImportStatus, String> {
    let states = import_states()
        .lock()
        .map_err(|_| "Failed to lock dataset import state".to_string())?;
    states
        .get(&task_id)
        .cloned()
        .ok_or_else(|| format!("Dataset import task not found: {task_id}"))
}

pub fn list_datasets_internal() -> Result<Vec<DatasetInfo>, String> {
    let config = Config::load().unwrap_or_default();
    let mut items = config
        .datasets
        .iter()
        .map(|dataset| config_to_dataset_info(&config, dataset))
        .collect::<Result<Vec<_>, _>>()?;
    items.sort_by(|a, b| a.display_name.cmp(&b.display_name));
    Ok(items)
}

pub fn save_session_source_internal(
    mode: String,
    active_dataset_id: Option<String>,
    active_dataset_ids: Option<Vec<String>>,
) -> Result<(), String> {
    let mut config = Config::load().unwrap_or_default();
    config.session_source_mode = match mode.as_str() {
        "dataset" => SessionSourceMode::Dataset,
        _ => SessionSourceMode::Local,
    };

    let mut normalized_ids = active_dataset_ids
        .unwrap_or_default()
        .into_iter()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .collect::<Vec<_>>();

    if normalized_ids.is_empty() {
        if let Some(value) = active_dataset_id
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
        {
            normalized_ids.push(value);
        }
    }

    normalized_ids.sort();
    normalized_ids.dedup();

    config.active_dataset_id = normalized_ids.first().cloned();
    config.active_dataset_ids = normalized_ids;
    crate::config::save_config(&config)?;
    crate::core::scanner::invalidate_cache();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_huggingface_url() {
        let parsed = parse_dataset_source("https://huggingface.co/datasets/badlogicgames/pi-mono")
            .expect("parsed");
        assert_eq!(parsed.repo_id, "badlogicgames/pi-mono");
        assert_eq!(parsed.slug, "badlogicgames_pi-mono");
    }

    #[test]
    fn parses_owner_repo_identifier() {
        let parsed = parse_dataset_source("badlogicgames/pi-mono").expect("parsed");
        assert_eq!(parsed.repo_id, "badlogicgames/pi-mono");
        assert_eq!(
            parsed.source_url,
            "https://huggingface.co/datasets/badlogicgames/pi-mono"
        );
    }
}
