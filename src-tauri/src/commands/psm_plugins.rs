use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

const PLUGINS_CONFIG_FILE: &str = "plugins.json";
const PLUGIN_JSON_CONFIG_DIR: &str = "plugin-config";
const NPM_EXTENSIONS_DIR: &str = "extensions/npm";
const NPM_COMMAND_TIMEOUT_SECS: u64 = 300;
const DEV_PLUGIN_BUILD_TIMEOUT_SECS: u64 = 300;
const PLUGIN_MODULE_GZIP_THRESHOLD_BYTES: usize = 2 * 1024 * 1024;
const PLUGIN_MODULE_GZIP_PREFIX: &str = "psm:gzip;base64,";
const NPM_MARKET_SEARCH_DEFAULT_SIZE: usize = 12;
const NPM_MARKET_SEARCH_MAX_SIZE: usize = 30;
const NPM_MARKET_REQUEST_TIMEOUT_SECS: u64 = 15;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PsmPluginConfigEntry {
    #[serde(default = "default_enabled")]
    pub enabled: bool,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub package_name: Option<String>,
    #[serde(default)]
    pub entry_path: Option<String>,
    #[serde(default)]
    pub project_path: Option<String>,
    #[serde(default)]
    pub settings: BTreeMap<String, Value>,
}

fn default_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PsmPluginsConfig {
    #[serde(default = "default_config_version")]
    pub version: u32,
    #[serde(default)]
    pub plugins: BTreeMap<String, PsmPluginConfigEntry>,
    #[serde(default)]
    pub custom_paths: Vec<String>,
    #[serde(default)]
    pub dev_projects: Vec<String>,
}

fn default_config_version() -> u32 {
    1
}

impl Default for PsmPluginsConfig {
    fn default() -> Self {
        Self { version: 1, plugins: BTreeMap::new(), custom_paths: Vec::new(), dev_projects: Vec::new() }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PsmNpmPluginEntry {
    pub package_name: String,
    pub package_version: Option<String>,
    pub entry_path: String,
    pub export_path: String,
    pub module_modified_ms: Option<u64>,
    pub source_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PsmPathPluginEntry {
    pub entry_path: String,
    pub module_modified_ms: Option<u64>,
    pub source_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PsmDevPluginEntry {
    pub project_path: String,
    pub package_name: Option<String>,
    pub package_version: Option<String>,
    pub entry_path: String,
    pub export_path: String,
    pub module_modified_ms: Option<u64>,
    pub source_hash: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PsmPluginPaths {
    pub config_path: String,
    pub npm_dir: String,
    pub custom_paths: Vec<String>,
    pub dev_projects: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PsmPluginNpmOperationResult {
    pub entries: Vec<PsmNpmPluginEntry>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PsmPluginDevBuildResult {
    pub entries: Vec<PsmDevPluginEntry>,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PsmPluginMarketSearchResult {
    pub query: String,
    pub total: u64,
    pub results: Vec<PsmPluginMarketEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PsmPluginMarketEntry {
    pub package_name: String,
    pub package_version: Option<String>,
    pub description: Option<String>,
    pub author: Option<String>,
    pub keywords: Vec<String>,
    pub npm_url: Option<String>,
    pub homepage_url: Option<String>,
    pub repository_url: Option<String>,
    pub image_url: Option<String>,
    pub weekly_downloads: Option<u64>,
    pub published_at: Option<String>,
    pub psm_extension_exports: Vec<String>,
    pub installed: bool,
}

#[derive(Debug, Deserialize)]
struct NpmSearchResponse {
    #[serde(default)]
    total: u64,
    #[serde(default)]
    objects: Vec<NpmSearchObject>,
}

#[derive(Debug, Deserialize)]
struct NpmSearchObject {
    package: NpmSearchPackage,
}

#[derive(Debug, Deserialize)]
struct NpmSearchPackage {
    name: String,
    #[serde(default)]
    version: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    keywords: Vec<String>,
    #[serde(default)]
    date: Option<String>,
    #[serde(default)]
    links: NpmPackageLinks,
    #[serde(default)]
    publisher: Option<NpmPackagePublisher>,
}

#[derive(Debug, Default, Deserialize)]
struct NpmPackageLinks {
    #[serde(default)]
    npm: Option<String>,
    #[serde(default)]
    homepage: Option<String>,
    #[serde(default)]
    repository: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NpmPackagePublisher {
    #[serde(default)]
    username: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NpmDownloadsResponse {
    #[serde(default)]
    downloads: u64,
}

#[derive(Debug, Default, Deserialize)]
struct NpmLatestPackageMeta {
    #[serde(default)]
    psm: Option<NpmPsmMetadata>,
    #[serde(default)]
    repository: Option<RepositoryField>,
    #[serde(default)]
    homepage: Option<String>,
    #[serde(default)]
    icon: Option<String>,
    #[serde(default)]
    logo: Option<String>,
}

#[derive(Debug, Default, Deserialize)]
struct NpmPsmMetadata {
    #[serde(default)]
    extensions: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum RepositoryField {
    Url(String),
    Object { url: Option<String> },
}

fn plugins_config_path() -> Result<PathBuf, String> {
    Ok(crate::paths::psm_root_dir()?.join(PLUGINS_CONFIG_FILE))
}

fn plugin_json_config_root() -> Result<PathBuf, String> {
    Ok(crate::paths::psm_root_dir()?.join(PLUGIN_JSON_CONFIG_DIR))
}

fn npm_extensions_dir() -> Result<PathBuf, String> {
    Ok(crate::paths::psm_root_dir()?.join(NPM_EXTENSIONS_DIR))
}

fn read_plugins_config() -> Result<PsmPluginsConfig, String> {
    let path = plugins_config_path()?;
    if !path.exists() {
        return Ok(PsmPluginsConfig::default());
    }

    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read PSM plugins config: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse PSM plugins config: {e}"))
}

fn write_plugins_config(config: &PsmPluginsConfig) -> Result<(), String> {
    let path = plugins_config_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create PSM config dir: {e}"))?;
    }
    let content = serde_json::to_string_pretty(config).map_err(|e| format!("Failed to serialize PSM plugins config: {e}"))?;
    fs::write(&path, format!("{content}\n")).map_err(|e| format!("Failed to write PSM plugins config: {e}"))
}

fn package_dirs(node_modules: &Path) -> Result<Vec<PathBuf>, String> {
    if !node_modules.exists() {
        return Ok(Vec::new());
    }

    let mut dirs = Vec::new();
    for entry in fs::read_dir(node_modules).map_err(|e| format!("Failed to scan npm extensions: {e}"))? {
        let entry = entry.map_err(|e| format!("Failed to read npm extension entry: {e}"))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };

        if name.starts_with('@') {
            for scoped in fs::read_dir(&path).map_err(|e| format!("Failed to scan scoped npm extensions: {e}"))? {
                let scoped = scoped.map_err(|e| format!("Failed to read scoped npm extension entry: {e}"))?;
                if scoped.path().is_dir() {
                    dirs.push(scoped.path());
                }
            }
        } else {
            dirs.push(path);
        }
    }

    dirs.sort();
    Ok(dirs)
}

fn read_package_json(path: &Path) -> Option<Value> {
    let content = fs::read_to_string(path.join("package.json")).ok()?;
    serde_json::from_str(&content).ok()
}

fn psm_extension_exports(package_json: &Value) -> Vec<String> {
    package_json.get("psm").and_then(|psm| psm.get("extensions")).and_then(Value::as_array).map(|items| items.iter().filter_map(Value::as_str).map(str::to_string).collect()).unwrap_or_default()
}

fn plugin_module_metadata(path: &Path) -> (Option<u64>, Option<String>) {
    let module_modified_ms = fs::metadata(path).ok().and_then(|metadata| metadata.modified().ok()).and_then(|modified| modified.duration_since(UNIX_EPOCH).ok()).and_then(|duration| u64::try_from(duration.as_millis()).ok());
    let source_hash = fs::read(path).ok().map(|content| format!("{:x}", Sha256::digest(&content)));
    (module_modified_ms, source_hash)
}

fn expand_home_path(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("PSM plugin path is required".to_string());
    }
    if trimmed == "~" {
        return crate::paths::home_dir();
    }
    if let Some(rest) = trimmed.strip_prefix("~/") {
        return Ok(crate::paths::home_dir()?.join(rest));
    }
    Ok(PathBuf::from(trimmed))
}

fn validate_plugin_config_token(raw: &str, label: &str) -> Result<String, String> {
    let value = raw.trim();
    if value.is_empty() {
        return Err(format!("{label} is required"));
    }
    if value == "." || value == ".." || value.starts_with('.') {
        return Err(format!("{label} must not start with '.'"));
    }
    if value.contains('/') || value.contains('\\') || value.contains("..") {
        return Err(format!("{label} must be a single safe path segment"));
    }
    if value.chars().any(|ch| !(ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.'))) {
        return Err(format!("{label} contains unsupported characters"));
    }
    Ok(value.to_string())
}

fn plugin_json_config_path(plugin_id: &str, key: &str) -> Result<PathBuf, String> {
    let plugin_id = validate_plugin_config_token(plugin_id, "pluginId")?;
    let key = validate_plugin_config_token(key, "config key")?;
    Ok(plugin_json_config_root()?.join(plugin_id).join(format!("{key}.json")))
}

fn ensure_plugin_module_file(path: &Path) -> Result<PathBuf, String> {
    let path = path.canonicalize().map_err(|e| format!("Failed to resolve PSM plugin module: {e}"))?;
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default();
    if !matches!(extension, "js" | "mjs") {
        return Err("PSM plugin module must be a .js or .mjs file".to_string());
    }
    Ok(path)
}

fn read_plugin_module_source(path: &Path) -> Result<String, String> {
    let bytes = fs::read(path).map_err(|e| format!("Failed to read PSM plugin module: {e}"))?;
    if bytes.len() > PLUGIN_MODULE_GZIP_THRESHOLD_BYTES {
        return crate::compression::gzip_compress_to_base64(&bytes).map(|payload| format!("{PLUGIN_MODULE_GZIP_PREFIX}{payload}"));
    }
    String::from_utf8(bytes).map_err(|e| format!("PSM plugin module is not valid UTF-8: {e}"))
}

fn normalize_path_plugin_entry_path(entry_path: &str) -> Result<String, String> {
    Ok(ensure_plugin_module_file(&expand_home_path(entry_path)?)?.to_string_lossy().to_string())
}

fn read_dev_project_package_json(project_dir: &Path) -> Result<Value, String> {
    let path = project_dir.join("package.json");
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read PSM dev plugin package.json: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse PSM dev plugin package.json: {e}"))
}

fn normalize_dev_plugin_project_path(project_path: &str) -> Result<String, String> {
    let project_dir = expand_home_path(project_path)?.canonicalize().map_err(|e| format!("Failed to resolve PSM dev plugin project: {e}"))?;
    if !project_dir.is_dir() {
        return Err("PSM dev plugin project must be a directory".to_string());
    }

    let package_json = read_dev_project_package_json(&project_dir)?;
    if psm_extension_exports(&package_json).is_empty() {
        return Err("PSM dev plugin project must declare package.json#psm.extensions".to_string());
    }

    Ok(project_dir.to_string_lossy().to_string())
}

fn normalize_dev_plugin_project_path_for_remove(project_path: &str) -> Result<String, String> {
    let expanded = expand_home_path(project_path)?;
    Ok(expanded.canonicalize().unwrap_or(expanded).to_string_lossy().to_string())
}

fn ensure_dev_plugin_module_file(project_dir: &Path, export_path: &str) -> Result<PathBuf, String> {
    let export_path = export_path.trim();
    if export_path.is_empty() {
        return Err("PSM dev plugin export path is required".to_string());
    }

    let project_root = project_dir.canonicalize().map_err(|e| format!("Failed to resolve PSM dev plugin project: {e}"))?;
    let module_path = ensure_plugin_module_file(&project_root.join(export_path))?;
    if !module_path.starts_with(&project_root) {
        return Err("PSM dev plugin module is outside its project directory".to_string());
    }
    Ok(module_path)
}

fn dev_project_entries(project_path: &str) -> Result<Vec<PsmDevPluginEntry>, String> {
    let project_path = normalize_dev_plugin_project_path(project_path)?;
    let project_dir = PathBuf::from(&project_path);
    let package_json = read_dev_project_package_json(&project_dir)?;
    let package_name = package_json.get("name").and_then(Value::as_str).map(str::to_string);
    let package_version = package_json.get("version").and_then(Value::as_str).map(str::to_string);
    let mut entries = Vec::new();

    for export_path in psm_extension_exports(&package_json) {
        let module_path = ensure_dev_plugin_module_file(&project_dir, &export_path)?;
        let (module_modified_ms, source_hash) = plugin_module_metadata(&module_path);
        entries.push(PsmDevPluginEntry { project_path: project_path.clone(), package_name: package_name.clone(), package_version: package_version.clone(), entry_path: module_path.to_string_lossy().to_string(), export_path, module_modified_ms, source_hash });
    }

    entries.sort_by(|a, b| a.entry_path.cmp(&b.entry_path));
    Ok(entries)
}

fn list_dev_entries_internal() -> Result<Vec<PsmDevPluginEntry>, String> {
    let config = read_plugins_config()?;
    let mut entries = Vec::new();
    for project_path in config.dev_projects {
        entries.extend(dev_project_entries(&project_path)?);
    }
    entries.sort_by(|a, b| a.entry_path.cmp(&b.entry_path));
    Ok(entries)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_psm_plugin_json_config(plugin_id: String, key: String, default_value: Option<Value>) -> Result<Value, String> {
    let path = plugin_json_config_path(&plugin_id, &key)?;
    if !path.exists() {
        return Ok(default_value.unwrap_or(Value::Null));
    }

    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read PSM plugin JSON config: {e}"))?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse PSM plugin JSON config: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn write_psm_plugin_json_config(plugin_id: String, key: String, value: Value) -> Result<(), String> {
    let path = plugin_json_config_path(&plugin_id, &key)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create PSM plugin JSON config dir: {e}"))?;
    }
    let content = serde_json::to_string_pretty(&value).map_err(|e| format!("Failed to serialize PSM plugin JSON config: {e}"))?;
    fs::write(&path, format!("{content}\n")).map_err(|e| format!("Failed to write PSM plugin JSON config: {e}"))
}

fn list_npm_entries_internal() -> Result<Vec<PsmNpmPluginEntry>, String> {
    let npm_dir = npm_extensions_dir()?;
    fs::create_dir_all(&npm_dir).map_err(|e| format!("Failed to create PSM npm extensions dir: {e}"))?;

    let node_modules = npm_dir.join("node_modules");
    let mut entries = Vec::new();

    for package_dir in package_dirs(&node_modules)? {
        let Some(package_json) = read_package_json(&package_dir) else {
            continue;
        };
        let Some(package_name) = package_json.get("name").and_then(Value::as_str) else {
            continue;
        };
        let package_version = package_json.get("version").and_then(Value::as_str).map(str::to_string);

        for export_path in psm_extension_exports(&package_json) {
            if export_path.trim().is_empty() {
                continue;
            }
            let entry_path = package_dir.join(&export_path);
            let (module_modified_ms, source_hash) = plugin_module_metadata(&entry_path);
            entries.push(PsmNpmPluginEntry { package_name: package_name.to_string(), package_version: package_version.clone(), entry_path: entry_path.to_string_lossy().to_string(), export_path, module_modified_ms, source_hash });
        }
    }

    Ok(entries)
}

fn list_path_entries_internal() -> Result<Vec<PsmPathPluginEntry>, String> {
    let config = read_plugins_config()?;
    let mut entries = Vec::new();
    for entry_path in config.custom_paths {
        let canonical = normalize_path_plugin_entry_path(&entry_path)?;
        let path = PathBuf::from(&canonical);
        let (module_modified_ms, source_hash) = plugin_module_metadata(&path);
        entries.push(PsmPathPluginEntry { entry_path: canonical, module_modified_ms, source_hash });
    }
    entries.sort_by(|a, b| a.entry_path.cmp(&b.entry_path));
    Ok(entries)
}

fn ensure_npm_child(path: &Path) -> Result<PathBuf, String> {
    let npm_dir = npm_extensions_dir()?;
    fs::create_dir_all(&npm_dir).map_err(|e| format!("Failed to create PSM npm extensions dir: {e}"))?;
    let root = npm_dir.canonicalize().map_err(|e| format!("Failed to resolve PSM npm extensions dir: {e}"))?;
    let candidate = path.canonicalize().map_err(|e| format!("Failed to resolve PSM plugin module: {e}"))?;
    if !candidate.starts_with(&root) {
        return Err("PSM plugin module is outside the managed npm extensions directory".to_string());
    }
    Ok(candidate)
}

fn ensure_npm_module_file(path: &Path) -> Result<PathBuf, String> {
    ensure_plugin_module_file(&ensure_npm_child(path)?)
}

fn validate_npm_package_name(package_name: &str) -> Result<&str, String> {
    let package_name = package_name.trim();
    if package_name.is_empty() {
        return Err("NPM package name is required".to_string());
    }
    if package_name.starts_with('-') {
        return Err("NPM package name must not start with '-'".to_string());
    }
    if package_name.contains("..") || package_name.contains("://") || package_name.starts_with("file:") {
        return Err("NPM package name must be a registry package, not a path or URL".to_string());
    }
    if package_name.chars().any(|ch| !(ch.is_ascii_alphanumeric() || matches!(ch, '@' | '/' | '-' | '_' | '.'))) {
        return Err("NPM package name contains unsupported characters".to_string());
    }

    if let Some(rest) = package_name.strip_prefix('@') {
        let Some((scope, name)) = rest.split_once('/') else {
            return Err("Scoped NPM package name must be @scope/name".to_string());
        };
        if scope.is_empty() || name.is_empty() || name.contains('/') {
            return Err("Scoped NPM package name must be @scope/name".to_string());
        }
    } else if package_name.contains('/') {
        return Err("Unscoped NPM package name must not contain '/'".to_string());
    }

    Ok(package_name)
}

fn npm_command_args(command: &str, package_name: Option<&str>, npm_dir: &Path) -> Result<Vec<String>, String> {
    if !matches!(command, "install" | "uninstall" | "update") {
        return Err(format!("Unsupported npm command: {command}"));
    }

    let mut args = vec![command.to_string(), "--prefix".to_string(), npm_dir.to_string_lossy().to_string()];
    match package_name {
        Some(package_name) => args.push(validate_npm_package_name(package_name)?.to_string()),
        None if command != "update" => return Err(format!("npm {command} requires a package name")),
        None => {}
    }
    Ok(args)
}

fn remove_npm_plugin_config_entries(config: &mut PsmPluginsConfig, package_name: &str) {
    config.plugins.retain(|_, entry| entry.source != "npm" || entry.package_name.as_deref() != Some(package_name));
}

fn remove_path_plugin_config_entries(config: &mut PsmPluginsConfig, entry_path: &str) {
    config.plugins.retain(|_, entry| entry.source != "path" || entry.entry_path.as_deref() != Some(entry_path));
}

fn remove_dev_plugin_config_entries(config: &mut PsmPluginsConfig, project_path: &str) {
    config.plugins.retain(|_, entry| entry.source != "dev" || entry.project_path.as_deref() != Some(project_path));
}

fn clamp_market_size(size: Option<usize>) -> usize {
    let size = size.unwrap_or(NPM_MARKET_SEARCH_DEFAULT_SIZE);
    size.clamp(1, NPM_MARKET_SEARCH_MAX_SIZE)
}

fn normalize_market_query(query: &str) -> String {
    let trimmed = query.trim();
    if trimmed.is_empty() {
        "psm plugin".to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_repository_url(url: &str) -> Option<String> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return None;
    }

    let without_git_prefix = trimmed.strip_prefix("git+").unwrap_or(trimmed);
    let normalized = if let Some(path) = without_git_prefix.strip_prefix("git://github.com/") {
        format!("https://github.com/{path}")
    } else if let Some(path) = without_git_prefix.strip_prefix("ssh://git@github.com/") {
        format!("https://github.com/{path}")
    } else if let Some(path) = without_git_prefix.strip_prefix("git@github.com:") {
        format!("https://github.com/{path}")
    } else if let Some(path) = without_git_prefix.strip_prefix("github:") {
        format!("https://github.com/{path}")
    } else {
        without_git_prefix.to_string()
    };

    Some(normalized.trim_end_matches(".git").to_string())
}

fn parse_github_repository(url: &str) -> Option<(String, String)> {
    let normalized = normalize_repository_url(url)?;
    let path = normalized.strip_prefix("https://github.com/").or_else(|| normalized.strip_prefix("http://github.com/"))?;
    let mut segments = path.split('/').filter(|segment| !segment.is_empty());
    let owner = segments.next()?;
    let repo = segments.next()?;
    Some((owner.to_string(), repo.trim_end_matches(".git").to_string()))
}

fn repository_field_to_url(repository: Option<&RepositoryField>) -> Option<String> {
    let raw = match repository {
        Some(RepositoryField::Url(url)) => Some(url.as_str()),
        Some(RepositoryField::Object { url }) => url.as_deref(),
        None => None,
    }?;
    normalize_repository_url(raw)
}

fn normalize_market_asset_url(value: Option<String>) -> Option<String> {
    let value = value?;
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return None;
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") || trimmed.starts_with("data:") {
        return Some(trimmed.to_string());
    }
    if let Some(rest) = trimmed.strip_prefix("//") {
        return Some(format!("https://{rest}"));
    }
    None
}

fn build_market_image_url(package_name: &str, repository_url: Option<&str>, author: Option<&str>) -> String {
    if let Some((owner, _repo)) = repository_url.and_then(parse_github_repository) {
        return format!("https://github.com/{owner}.png");
    }

    if let Some(author) = author {
        let author = author.trim();
        if !author.is_empty() {
            return format!("https://api.dicebear.com/9.x/shapes/svg?seed={}", urlencoding::encode(author));
        }
    }

    format!("https://api.dicebear.com/9.x/shapes/svg?seed={}", urlencoding::encode(package_name))
}

fn market_http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder().user_agent("pi-session-manager/psm-market").timeout(Duration::from_secs(NPM_MARKET_REQUEST_TIMEOUT_SECS)).build().map_err(|e| format!("Failed to create npm market HTTP client: {e}"))
}

async fn fetch_weekly_downloads(client: &reqwest::Client, package_name: &str) -> Option<u64> {
    let encoded = urlencoding::encode(package_name);
    let url = format!("https://api.npmjs.org/downloads/point/last-week/{encoded}");
    let response = client.get(url).send().await.ok()?.error_for_status().ok()?;
    response.json::<NpmDownloadsResponse>().await.ok().map(|value| value.downloads)
}

async fn fetch_latest_package_meta(client: &reqwest::Client, package_name: &str) -> Option<NpmLatestPackageMeta> {
    let encoded = urlencoding::encode(package_name);
    let url = format!("https://registry.npmjs.org/{encoded}/latest");
    let response = client.get(url).send().await.ok()?.error_for_status().ok()?;
    response.json::<NpmLatestPackageMeta>().await.ok()
}

async fn search_psm_plugin_market_internal(query: &str, size: Option<usize>, from: Option<usize>) -> Result<PsmPluginMarketSearchResult, String> {
    let query = normalize_market_query(query);
    let size = clamp_market_size(size);
    let from = from.unwrap_or(0);

    let client = market_http_client()?;
    let url = format!("https://registry.npmjs.org/-/v1/search?text={}&size={size}&from={from}", urlencoding::encode(&query));
    let response = client.get(url).send().await.map_err(|e| format!("Failed to search npm marketplace: {e}"))?.error_for_status().map_err(|e| format!("Failed to search npm marketplace: {e}"))?;
    let search_response = response.json::<NpmSearchResponse>().await.map_err(|e| format!("Failed to parse npm marketplace response: {e}"))?;

    let installed_packages: BTreeSet<String> = list_npm_entries_internal()?.into_iter().map(|entry| entry.package_name).collect();

    let mut results = Vec::with_capacity(search_response.objects.len());
    for item in search_response.objects {
        let package = item.package;
        let package_name = package.name.clone();
        let author = package.publisher.and_then(|publisher| publisher.username);
        let search_repository_url = package.links.repository.as_deref().and_then(normalize_repository_url);
        let (weekly_downloads, latest_meta) = tokio::join!(fetch_weekly_downloads(&client, &package_name), fetch_latest_package_meta(&client, &package_name));

        let latest_repository_url = latest_meta.as_ref().and_then(|meta| repository_field_to_url(meta.repository.as_ref()));
        let repository_url = latest_repository_url.or(search_repository_url);
        let homepage_url = latest_meta.as_ref().and_then(|meta| meta.homepage.clone()).or(package.links.homepage);
        let image_url = latest_meta.as_ref().and_then(|meta| normalize_market_asset_url(meta.icon.clone().or(meta.logo.clone()))).or_else(|| Some(build_market_image_url(&package_name, repository_url.as_deref(), author.as_deref())));

        let psm_extension_exports = latest_meta.and_then(|meta| meta.psm.map(|psm| psm.extensions)).unwrap_or_default().into_iter().filter(|item| !item.trim().is_empty()).collect::<Vec<_>>();
        if psm_extension_exports.is_empty() {
            continue;
        }

        results.push(PsmPluginMarketEntry {
            package_name: package_name.clone(),
            package_version: package.version,
            description: package.description,
            author,
            keywords: package.keywords,
            npm_url: package.links.npm,
            homepage_url,
            repository_url,
            image_url,
            weekly_downloads,
            published_at: package.date,
            psm_extension_exports,
            installed: installed_packages.contains(&package_name),
        });
    }

    Ok(PsmPluginMarketSearchResult { query, total: results.len() as u64, results })
}

async fn run_npm_command(command: &str, package_name: Option<&str>) -> Result<(String, String), String> {
    let npm_dir = npm_extensions_dir()?;
    fs::create_dir_all(&npm_dir).map_err(|e| format!("Failed to create PSM npm extensions dir: {e}"))?;
    let args = npm_command_args(command, package_name, &npm_dir)?;

    let mut process = Command::new("npm");
    process.args(&args);
    let output = timeout(Duration::from_secs(NPM_COMMAND_TIMEOUT_SECS), process.output()).await.map_err(|_| format!("npm {command} timed out after {NPM_COMMAND_TIMEOUT_SECS}s"))?.map_err(|e| format!("Failed to run npm {command}: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        return Err(format!("npm {command} failed with status {}{}{}", output.status, if stderr.is_empty() { "" } else { ": " }, stderr));
    }

    Ok((stdout, stderr))
}

fn operation_result(stdout: String, stderr: String) -> Result<PsmPluginNpmOperationResult, String> {
    Ok(PsmPluginNpmOperationResult { entries: list_npm_entries_internal()?, stdout, stderr })
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn load_psm_plugin_config() -> Result<PsmPluginsConfig, String> {
    read_plugins_config()
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn set_psm_plugin_enabled(plugin_id: String, enabled: bool, source: Option<String>, package_name: Option<String>, entry_path: Option<String>, project_path: Option<String>) -> Result<PsmPluginsConfig, String> {
    let mut config = read_plugins_config()?;
    let entry = config.plugins.entry(plugin_id).or_insert_with(|| PsmPluginConfigEntry { enabled, source: source.clone().unwrap_or_default(), package_name: package_name.clone(), entry_path: entry_path.clone(), project_path: project_path.clone(), settings: BTreeMap::new() });
    entry.enabled = enabled;
    if let Some(source) = source {
        entry.source = source;
    }
    if package_name.is_some() {
        entry.package_name = package_name;
    }
    if entry_path.is_some() {
        entry.entry_path = entry_path;
    }
    if project_path.is_some() {
        entry.project_path = project_path;
    }
    write_plugins_config(&config)?;
    Ok(config)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn set_psm_plugin_settings(plugin_id: String, settings: BTreeMap<String, Value>, source: Option<String>, package_name: Option<String>, entry_path: Option<String>, project_path: Option<String>) -> Result<PsmPluginsConfig, String> {
    let mut config = read_plugins_config()?;
    let entry = config.plugins.entry(plugin_id).or_insert_with(|| PsmPluginConfigEntry { enabled: true, source: source.clone().unwrap_or_default(), package_name: package_name.clone(), entry_path: entry_path.clone(), project_path: project_path.clone(), settings: BTreeMap::new() });
    if let Some(source) = source {
        entry.source = source;
    }
    if package_name.is_some() {
        entry.package_name = package_name;
    }
    if entry_path.is_some() {
        entry.entry_path = entry_path;
    }
    if project_path.is_some() {
        entry.project_path = project_path;
    }
    entry.settings = settings;
    write_plugins_config(&config)?;
    Ok(config)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_npm_psm_plugin_entries() -> Result<Vec<PsmNpmPluginEntry>, String> {
    list_npm_entries_internal()
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_path_psm_plugin_entries() -> Result<Vec<PsmPathPluginEntry>, String> {
    list_path_entries_internal()
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn list_dev_psm_plugin_entries() -> Result<Vec<PsmDevPluginEntry>, String> {
    list_dev_entries_internal()
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn search_psm_plugin_market(query: Option<String>, size: Option<usize>, from: Option<usize>) -> Result<PsmPluginMarketSearchResult, String> {
    search_psm_plugin_market_internal(query.as_deref().unwrap_or_default(), size, from).await
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn add_path_psm_plugin(entry_path: String) -> Result<PsmPluginsConfig, String> {
    let canonical = normalize_path_plugin_entry_path(&entry_path)?;
    let mut config = read_plugins_config()?;
    if !config.custom_paths.iter().any(|path| path == &canonical) {
        config.custom_paths.push(canonical);
        config.custom_paths.sort();
    }
    write_plugins_config(&config)?;
    Ok(config)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn remove_path_psm_plugin(entry_path: String) -> Result<PsmPluginsConfig, String> {
    let canonical = normalize_path_plugin_entry_path(&entry_path)?;
    let mut config = read_plugins_config()?;
    config.custom_paths.retain(|path| path != &canonical);
    remove_path_plugin_config_entries(&mut config, &canonical);
    write_plugins_config(&config)?;
    Ok(config)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn add_dev_psm_plugin(project_path: String) -> Result<PsmPluginsConfig, String> {
    let canonical = normalize_dev_plugin_project_path(&project_path)?;
    let mut config = read_plugins_config()?;
    if !config.dev_projects.iter().any(|path| path == &canonical) {
        config.dev_projects.push(canonical);
        config.dev_projects.sort();
    }
    write_plugins_config(&config)?;
    Ok(config)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn remove_dev_psm_plugin(project_path: String) -> Result<PsmPluginsConfig, String> {
    let canonical = normalize_dev_plugin_project_path_for_remove(&project_path)?;
    let mut config = read_plugins_config()?;
    config.dev_projects.retain(|path| path != &canonical);
    remove_dev_plugin_config_entries(&mut config, &canonical);
    write_plugins_config(&config)?;
    Ok(config)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn install_psm_plugin(package_name: String) -> Result<PsmPluginNpmOperationResult, String> {
    let (stdout, stderr) = run_npm_command("install", Some(&package_name)).await?;
    operation_result(stdout, stderr)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn uninstall_psm_plugin(package_name: String) -> Result<PsmPluginNpmOperationResult, String> {
    let package_name = validate_npm_package_name(&package_name)?.to_string();
    let (stdout, stderr) = run_npm_command("uninstall", Some(&package_name)).await?;
    let mut config = read_plugins_config()?;
    remove_npm_plugin_config_entries(&mut config, &package_name);
    write_plugins_config(&config)?;
    operation_result(stdout, stderr)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn update_psm_plugins() -> Result<PsmPluginNpmOperationResult, String> {
    let (stdout, stderr) = run_npm_command("update", None).await?;
    operation_result(stdout, stderr)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn build_dev_psm_plugin(project_path: String) -> Result<PsmPluginDevBuildResult, String> {
    let canonical = normalize_dev_plugin_project_path(&project_path)?;
    let project_dir = PathBuf::from(&canonical);

    let mut process = Command::new("npm");
    process.args(["run", "build"]);
    process.current_dir(&project_dir);
    let output = timeout(Duration::from_secs(DEV_PLUGIN_BUILD_TIMEOUT_SECS), process.output()).await.map_err(|_| format!("npm run build timed out after {DEV_PLUGIN_BUILD_TIMEOUT_SECS}s"))?.map_err(|e| format!("Failed to run npm run build for PSM dev plugin: {e}"))?;

    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if !output.status.success() {
        return Err(format!("npm run build failed with status {}{}{}", output.status, if stderr.is_empty() { "" } else { ": " }, stderr));
    }

    Ok(PsmPluginDevBuildResult { entries: dev_project_entries(&canonical)?, stdout, stderr })
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn reload_psm_plugins() -> Result<Vec<PsmNpmPluginEntry>, String> {
    list_npm_entries_internal()
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_npm_psm_plugin_module_source(entry_path: String) -> Result<String, String> {
    let path = ensure_npm_module_file(Path::new(&entry_path))?;
    read_plugin_module_source(&path)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_path_psm_plugin_module_source(entry_path: String) -> Result<String, String> {
    let path = ensure_plugin_module_file(&expand_home_path(&entry_path)?)?;
    read_plugin_module_source(&path)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_dev_psm_plugin_module_source(entry_path: String, project_path: String) -> Result<String, String> {
    let project_path = normalize_dev_plugin_project_path(&project_path)?;
    let project_dir = PathBuf::from(project_path);
    let path = ensure_dev_plugin_module_file(&project_dir, &entry_path)?;
    read_plugin_module_source(&path)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_psm_plugin_paths() -> Result<PsmPluginPaths, String> {
    let npm_dir = npm_extensions_dir()?;
    fs::create_dir_all(&npm_dir).map_err(|e| format!("Failed to create PSM npm extensions dir: {e}"))?;
    let config = read_plugins_config()?;
    Ok(PsmPluginPaths { config_path: plugins_config_path()?.to_string_lossy().to_string(), npm_dir: npm_dir.to_string_lossy().to_string(), custom_paths: config.custom_paths, dev_projects: config.dev_projects })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::env;

    #[test]
    fn discovers_psm_npm_extension_entries() {
        let _guard = crate::paths::test_env_lock().lock().unwrap();
        let home = tempfile::tempdir().unwrap();
        let old_home = env::var("HOME").ok();
        env::set_var("HOME", home.path());

        let package_dir = home.path().join(".pi/pi-session-manager/extensions/npm/node_modules/@acme/psm-sidechat");
        fs::create_dir_all(package_dir.join("dist")).unwrap();
        fs::write(
            package_dir.join("package.json"),
            r#"{
              "name": "@acme/psm-sidechat",
              "version": "1.2.3",
              "psm": { "extensions": ["./dist/index.js"] }
            }"#,
        )
        .unwrap();
        fs::write(package_dir.join("dist/index.js"), "export const manifest = {};").unwrap();

        let entries = list_npm_entries_internal().unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].package_name, "@acme/psm-sidechat");
        assert_eq!(entries[0].package_version.as_deref(), Some("1.2.3"));
        assert!(entries[0].entry_path.ends_with("dist/index.js"));
        assert!(entries[0].module_modified_ms.is_some());
        assert!(entries[0].source_hash.as_deref().is_some_and(|hash| hash.len() == 64));

        if let Some(old_home) = old_home {
            env::set_var("HOME", old_home);
        } else {
            env::remove_var("HOME");
        }
    }

    #[test]
    fn reads_and_updates_plugin_config() {
        let _guard = crate::paths::test_env_lock().lock().unwrap();
        let home = tempfile::tempdir().unwrap();
        let old_home = env::var("HOME").ok();
        env::set_var("HOME", home.path());

        let mut config = read_plugins_config().unwrap();
        assert_eq!(config, PsmPluginsConfig::default());
        config.plugins.insert("builtin.sidechat".to_string(), PsmPluginConfigEntry { enabled: false, source: "builtin".to_string(), package_name: None, entry_path: None, project_path: None, settings: BTreeMap::new() });
        write_plugins_config(&config).unwrap();

        let loaded = read_plugins_config().unwrap();
        assert_eq!(loaded.plugins["builtin.sidechat"].enabled, false);
        assert!(plugins_config_path().unwrap().ends_with("plugins.json"));

        if let Some(old_home) = old_home {
            env::set_var("HOME", old_home);
        } else {
            env::remove_var("HOME");
        }
    }

    #[test]
    fn writes_plugin_settings_without_disabling_plugin() {
        let _guard = crate::paths::test_env_lock().lock().unwrap();
        let home = tempfile::tempdir().unwrap();
        let old_home = env::var("HOME").ok();
        env::set_var("HOME", home.path());

        let runtime = tokio::runtime::Runtime::new().unwrap();
        let mut settings = BTreeMap::new();
        settings.insert("limit".to_string(), Value::from(12));
        settings.insert("thinkingLevel".to_string(), Value::from("high"));
        let config = runtime.block_on(set_psm_plugin_settings("builtin.sidechat".to_string(), settings, Some("builtin".to_string()), None, None, None)).unwrap();

        let entry = &config.plugins["builtin.sidechat"];
        assert!(entry.enabled);
        assert_eq!(entry.source, "builtin");
        assert_eq!(entry.settings["limit"], Value::from(12));
        assert_eq!(entry.settings["thinkingLevel"], Value::from("high"));

        if let Some(old_home) = old_home {
            env::set_var("HOME", old_home);
        } else {
            env::remove_var("HOME");
        }
    }

    #[test]
    fn reads_and_writes_scoped_plugin_json_config() {
        let _guard = crate::paths::test_env_lock().lock().unwrap();
        let home = tempfile::tempdir().unwrap();
        let old_home = env::var("HOME").ok();
        env::set_var("HOME", home.path());

        let runtime = tokio::runtime::Runtime::new().unwrap();
        let missing = runtime.block_on(read_psm_plugin_json_config("builtin.config-test".to_string(), "workspace".to_string(), Some(serde_json::json!({ "items": [] })))).unwrap();
        assert_eq!(missing["items"], serde_json::json!([]));

        runtime.block_on(write_psm_plugin_json_config("builtin.config-test".to_string(), "workspace".to_string(), serde_json::json!({ "active": "default" }))).unwrap();
        let stored = runtime.block_on(read_psm_plugin_json_config("builtin.config-test".to_string(), "workspace".to_string(), None)).unwrap();
        assert_eq!(stored["active"], "default");

        let unsafe_key = runtime.block_on(write_psm_plugin_json_config("builtin.config-test".to_string(), "folder/workspace".to_string(), serde_json::json!({}))).unwrap_err();
        assert!(unsafe_key.contains("single safe path segment"));

        if let Some(old_home) = old_home {
            env::set_var("HOME", old_home);
        } else {
            env::remove_var("HOME");
        }
    }

    #[test]
    fn builds_safe_npm_command_args() {
        let npm_dir = PathBuf::from("/tmp/psm-npm");

        assert_eq!(npm_command_args("install", Some("@acme/psm-sidechat"), &npm_dir).unwrap(), vec!["install", "--prefix", "/tmp/psm-npm", "@acme/psm-sidechat"]);
        assert_eq!(npm_command_args("update", None, &npm_dir).unwrap(), vec!["update", "--prefix", "/tmp/psm-npm"]);

        assert!(npm_command_args("install", Some("--registry=https://evil.example"), &npm_dir).is_err());
        assert!(npm_command_args("install", Some("@acme/psm sidechat"), &npm_dir).is_err());
    }

    #[test]
    fn parses_github_repository_urls() {
        assert_eq!(parse_github_repository("git://github.com/acme/psm-plugin.git"), Some(("acme".to_string(), "psm-plugin".to_string())));
        assert_eq!(parse_github_repository("github:acme/psm-plugin"), Some(("acme".to_string(), "psm-plugin".to_string())));
        assert_eq!(parse_github_repository("https://github.com/acme/psm-plugin"), Some(("acme".to_string(), "psm-plugin".to_string())));
        assert_eq!(parse_github_repository("https://example.com/acme/psm-plugin"), None);
    }

    #[test]
    fn builds_market_image_url_with_github_priority() {
        let github = build_market_image_url("@acme/psm-sidechat", Some("git://github.com/acme/psm-sidechat.git"), Some("fallback-author"));
        assert_eq!(github, "https://github.com/acme.png");

        let author = build_market_image_url("@acme/psm-sidechat", None, Some("acme-author"));
        assert!(author.starts_with("https://api.dicebear.com/9.x/shapes/svg?seed="));

        let fallback = build_market_image_url("@acme/psm-sidechat", None, None);
        assert!(fallback.starts_with("https://api.dicebear.com/9.x/shapes/svg?seed="));
    }

    #[test]
    fn normalizes_market_asset_urls() {
        assert_eq!(normalize_market_asset_url(Some("https://example.com/icon.png".to_string())).as_deref(), Some("https://example.com/icon.png"));
        assert_eq!(normalize_market_asset_url(Some("//example.com/icon.png".to_string())).as_deref(), Some("https://example.com/icon.png"));
        assert_eq!(normalize_market_asset_url(Some("/icon.png".to_string())), None);
        assert_eq!(normalize_market_asset_url(Some("".to_string())), None);
    }

    #[test]
    fn removes_uninstalled_npm_plugin_config_entries() {
        let mut config = PsmPluginsConfig::default();
        config.plugins.insert("npm.sidechat".to_string(), PsmPluginConfigEntry { enabled: false, source: "npm".to_string(), package_name: Some("@acme/psm-sidechat".to_string()), entry_path: None, project_path: None, settings: BTreeMap::new() });
        config.plugins.insert("npm.other".to_string(), PsmPluginConfigEntry { enabled: true, source: "npm".to_string(), package_name: Some("@acme/other".to_string()), entry_path: None, project_path: None, settings: BTreeMap::new() });
        config.plugins.insert("builtin.sidechat".to_string(), PsmPluginConfigEntry { enabled: true, source: "builtin".to_string(), package_name: Some("@acme/psm-sidechat".to_string()), entry_path: None, project_path: None, settings: BTreeMap::new() });

        remove_npm_plugin_config_entries(&mut config, "@acme/psm-sidechat");

        assert!(!config.plugins.contains_key("npm.sidechat"));
        assert!(config.plugins.contains_key("npm.other"));
        assert!(config.plugins.contains_key("builtin.sidechat"));
    }

    #[test]
    fn read_npm_module_source_rejects_unsafe_files() {
        let _guard = crate::paths::test_env_lock().lock().unwrap();
        let home = tempfile::tempdir().unwrap();
        let old_home = env::var("HOME").ok();
        env::set_var("HOME", home.path());

        let package_dir = home.path().join(".pi/pi-session-manager/extensions/npm/node_modules/@acme/psm-safe/dist");
        fs::create_dir_all(&package_dir).unwrap();
        let txt_path = package_dir.join("index.txt");
        let big_path = package_dir.join("big.js");
        let outside_path = home.path().join("outside.js");
        fs::write(&txt_path, "export const manifest = {}; ").unwrap();
        let big_source = format!("export const payload = '{}';", "a".repeat(2 * 1024 * 1024 + 1));
        fs::write(&big_path, &big_source).unwrap();
        fs::write(&outside_path, "export const manifest = {}; ").unwrap();

        let runtime = tokio::runtime::Runtime::new().unwrap();
        let txt_err = runtime.block_on(read_npm_psm_plugin_module_source(txt_path.to_string_lossy().to_string())).unwrap_err();
        let big_result = runtime.block_on(read_npm_psm_plugin_module_source(big_path.to_string_lossy().to_string())).unwrap();
        let outside_err = runtime.block_on(read_npm_psm_plugin_module_source(outside_path.to_string_lossy().to_string())).unwrap_err();

        assert!(txt_err.contains(".js or .mjs"));
        assert!(big_result.starts_with(PLUGIN_MODULE_GZIP_PREFIX));
        let decoded = crate::compression::gzip_decompress_from_base64(big_result.trim_start_matches(PLUGIN_MODULE_GZIP_PREFIX)).unwrap();
        assert_eq!(String::from_utf8(decoded).unwrap(), big_source);
        assert!(outside_err.contains("outside the managed npm extensions directory"));

        if let Some(old_home) = old_home {
            env::set_var("HOME", old_home);
        } else {
            env::remove_var("HOME");
        }
    }

    #[test]
    fn reload_psm_plugins_returns_current_npm_entries() {
        let _guard = crate::paths::test_env_lock().lock().unwrap();
        let home = tempfile::tempdir().unwrap();
        let old_home = env::var("HOME").ok();
        env::set_var("HOME", home.path());

        let package_dir = home.path().join(".pi/pi-session-manager/extensions/npm/node_modules/@acme/psm-reload");
        fs::create_dir_all(package_dir.join("dist")).unwrap();
        fs::write(
            package_dir.join("package.json"),
            r#"{
              "name": "@acme/psm-reload",
              "version": "0.2.0",
              "psm": { "extensions": ["./dist/index.mjs"] }
            }"#,
        )
        .unwrap();
        fs::write(package_dir.join("dist/index.mjs"), "export const manifest = {}; ").unwrap();

        let runtime = tokio::runtime::Runtime::new().unwrap();
        let entries = runtime.block_on(reload_psm_plugins()).unwrap();

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].package_name, "@acme/psm-reload");
        assert_eq!(entries[0].export_path, "./dist/index.mjs");

        if let Some(old_home) = old_home {
            env::set_var("HOME", old_home);
        } else {
            env::remove_var("HOME");
        }
    }

    #[test]
    fn adds_lists_and_removes_custom_path_plugin_entries() {
        let _guard = crate::paths::test_env_lock().lock().unwrap();
        let home = tempfile::tempdir().unwrap();
        let old_home = env::var("HOME").ok();
        env::set_var("HOME", home.path());

        let plugin_dir = home.path().join("plugins");
        fs::create_dir_all(&plugin_dir).unwrap();
        let plugin_path = plugin_dir.join("local-plugin.mjs");
        fs::write(&plugin_path, "export const manifest = { id: 'path.local', name: 'Local', version: '1.0.0' };").unwrap();

        let runtime = tokio::runtime::Runtime::new().unwrap();
        let config = runtime.block_on(add_path_psm_plugin(plugin_path.to_string_lossy().to_string())).unwrap();
        assert_eq!(config.custom_paths.len(), 1);

        let duplicate = runtime.block_on(add_path_psm_plugin(plugin_path.to_string_lossy().to_string())).unwrap();
        assert_eq!(duplicate.custom_paths.len(), 1);

        let entries = runtime.block_on(list_path_psm_plugin_entries()).unwrap();
        assert_eq!(entries.len(), 1);
        assert!(entries[0].entry_path.ends_with("local-plugin.mjs"));
        assert!(entries[0].module_modified_ms.is_some());
        assert!(entries[0].source_hash.as_deref().is_some_and(|hash| hash.len() == 64));

        let removed = runtime.block_on(remove_path_psm_plugin(plugin_path.to_string_lossy().to_string())).unwrap();
        assert!(removed.custom_paths.is_empty());
        assert!(runtime.block_on(list_path_psm_plugin_entries()).unwrap().is_empty());

        if let Some(old_home) = old_home {
            env::set_var("HOME", old_home);
        } else {
            env::remove_var("HOME");
        }
    }

    #[test]
    fn adds_lists_builds_and_removes_dev_plugin_projects() {
        let _guard = crate::paths::test_env_lock().lock().unwrap();
        let home = tempfile::tempdir().unwrap();
        let old_home = env::var("HOME").ok();
        env::set_var("HOME", home.path());

        let project_dir = home.path().join("dev-plugin");
        fs::create_dir_all(project_dir.join("dist")).unwrap();
        fs::write(
            project_dir.join("package.json"),
            r#"{
              "name": "@acme/dev-plugin",
              "version": "0.3.0",
              "scripts": { "build": "node build.cjs" },
              "psm": { "extensions": ["./dist/index.js"] }
            }"#,
        )
        .unwrap();
        fs::write(project_dir.join("build.cjs"), "require('fs').mkdirSync('dist', { recursive: true }); require('fs').writeFileSync('dist/index.js', 'export const manifest = {}; ');").unwrap();
        fs::write(project_dir.join("dist/index.js"), "export const manifest = {}; ").unwrap();

        let runtime = tokio::runtime::Runtime::new().unwrap();
        let config = runtime.block_on(add_dev_psm_plugin(project_dir.to_string_lossy().to_string())).unwrap();
        assert_eq!(config.dev_projects.len(), 1);

        let duplicate = runtime.block_on(add_dev_psm_plugin(project_dir.to_string_lossy().to_string())).unwrap();
        assert_eq!(duplicate.dev_projects.len(), 1);

        let entries = runtime.block_on(list_dev_psm_plugin_entries()).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].package_name.as_deref(), Some("@acme/dev-plugin"));
        assert_eq!(entries[0].package_version.as_deref(), Some("0.3.0"));
        assert!(entries[0].entry_path.ends_with("dist/index.js"));
        assert!(entries[0].project_path.ends_with("dev-plugin"));
        assert!(entries[0].module_modified_ms.is_some());
        assert!(entries[0].source_hash.as_deref().is_some_and(|hash| hash.len() == 64));

        fs::remove_file(project_dir.join("dist/index.js")).unwrap();
        let built = runtime.block_on(build_dev_psm_plugin(project_dir.to_string_lossy().to_string())).unwrap();
        assert_eq!(built.entries.len(), 1);
        assert!(built.entries[0].entry_path.ends_with("dist/index.js"));

        let mut stored = read_plugins_config().unwrap();
        stored.plugins.insert(
            "dev.plugin".to_string(),
            PsmPluginConfigEntry { enabled: true, source: "dev".to_string(), package_name: Some("@acme/dev-plugin".to_string()), entry_path: Some(built.entries[0].entry_path.clone()), project_path: Some(built.entries[0].project_path.clone()), settings: BTreeMap::new() },
        );
        write_plugins_config(&stored).unwrap();

        let removed = runtime.block_on(remove_dev_psm_plugin(project_dir.to_string_lossy().to_string())).unwrap();
        assert!(removed.dev_projects.is_empty());
        assert!(!removed.plugins.contains_key("dev.plugin"));
        assert!(runtime.block_on(list_dev_psm_plugin_entries()).unwrap().is_empty());

        if let Some(old_home) = old_home {
            env::set_var("HOME", old_home);
        } else {
            env::remove_var("HOME");
        }
    }

    #[test]
    fn dev_plugin_project_validation_rejects_missing_exports_and_unsafe_modules() {
        let _guard = crate::paths::test_env_lock().lock().unwrap();
        let home = tempfile::tempdir().unwrap();
        let old_home = env::var("HOME").ok();
        env::set_var("HOME", home.path());

        let project_dir = home.path().join("bad-dev-plugin");
        fs::create_dir_all(project_dir.join("dist")).unwrap();
        fs::write(project_dir.join("package.json"), r#"{ "name": "@acme/bad" }"#).unwrap();

        let runtime = tokio::runtime::Runtime::new().unwrap();
        let missing_exports = runtime.block_on(add_dev_psm_plugin(project_dir.to_string_lossy().to_string())).unwrap_err();
        assert!(missing_exports.contains("psm.extensions"));

        fs::write(project_dir.join("package.json"), r#"{ "name": "@acme/bad", "psm": { "extensions": ["./dist/index.txt"] } }"#).unwrap();
        fs::write(project_dir.join("dist/index.txt"), "export const manifest = {}; ").unwrap();
        let unsafe_module = runtime.block_on(list_dev_psm_plugin_entries()).unwrap();
        assert!(unsafe_module.is_empty());
        let add_config = runtime.block_on(add_dev_psm_plugin(project_dir.to_string_lossy().to_string())).unwrap();
        assert_eq!(add_config.dev_projects.len(), 1);
        let list_err = runtime.block_on(list_dev_psm_plugin_entries()).unwrap_err();
        assert!(list_err.contains(".js or .mjs"));

        if let Some(old_home) = old_home {
            env::set_var("HOME", old_home);
        } else {
            env::remove_var("HOME");
        }
    }

    #[test]
    fn read_path_module_source_rejects_unsafe_files() {
        let _guard = crate::paths::test_env_lock().lock().unwrap();
        let home = tempfile::tempdir().unwrap();
        let old_home = env::var("HOME").ok();
        env::set_var("HOME", home.path());

        let plugin_dir = home.path().join("plugins");
        fs::create_dir_all(&plugin_dir).unwrap();
        let safe_path = plugin_dir.join("safe.js");
        let txt_path = plugin_dir.join("safe.txt");
        let big_path = plugin_dir.join("big.mjs");
        fs::write(&safe_path, "export const manifest = {}; ").unwrap();
        fs::write(&txt_path, "export const manifest = {}; ").unwrap();
        let big_source = format!("export const payload = '{}';", "a".repeat(2 * 1024 * 1024 + 1));
        fs::write(&big_path, &big_source).unwrap();

        let runtime = tokio::runtime::Runtime::new().unwrap();
        assert_eq!(runtime.block_on(read_path_psm_plugin_module_source(safe_path.to_string_lossy().to_string())).unwrap(), "export const manifest = {}; ");
        let txt_err = runtime.block_on(read_path_psm_plugin_module_source(txt_path.to_string_lossy().to_string())).unwrap_err();
        let big_result = runtime.block_on(read_path_psm_plugin_module_source(big_path.to_string_lossy().to_string())).unwrap();

        assert!(txt_err.contains(".js or .mjs"));
        assert!(big_result.starts_with(PLUGIN_MODULE_GZIP_PREFIX));
        let decoded = crate::compression::gzip_decompress_from_base64(big_result.trim_start_matches(PLUGIN_MODULE_GZIP_PREFIX)).unwrap();
        assert_eq!(String::from_utf8(decoded).unwrap(), big_source);

        if let Some(old_home) = old_home {
            env::set_var("HOME", old_home);
        } else {
            env::remove_var("HOME");
        }
    }
}
