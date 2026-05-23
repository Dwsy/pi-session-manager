use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::UNIX_EPOCH;
use tokio::process::Command;
use tokio::time::{timeout, Duration};

const PLUGINS_CONFIG_FILE: &str = "plugins.json";
const NPM_EXTENSIONS_DIR: &str = "extensions/npm";
const NPM_COMMAND_TIMEOUT_SECS: u64 = 300;
const PLUGIN_MODULE_SOURCE_LIMIT_BYTES: usize = 2 * 1024 * 1024;

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
}

fn default_config_version() -> u32 {
    1
}

impl Default for PsmPluginsConfig {
    fn default() -> Self {
        Self { version: 1, plugins: BTreeMap::new(), custom_paths: Vec::new() }
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
pub struct PsmPluginPaths {
    pub config_path: String,
    pub npm_dir: String,
    pub custom_paths: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct PsmPluginNpmOperationResult {
    pub entries: Vec<PsmNpmPluginEntry>,
    pub stdout: String,
    pub stderr: String,
}

fn plugins_config_path() -> Result<PathBuf, String> {
    Ok(crate::paths::psm_root_dir()?.join(PLUGINS_CONFIG_FILE))
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

fn ensure_plugin_module_file(path: &Path) -> Result<PathBuf, String> {
    let path = path.canonicalize().map_err(|e| format!("Failed to resolve PSM plugin module: {e}"))?;
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or_default();
    if !matches!(extension, "js" | "mjs") {
        return Err("PSM plugin module must be a .js or .mjs file".to_string());
    }
    let length = fs::metadata(&path).map_err(|e| format!("Failed to inspect PSM plugin module: {e}"))?.len();
    if length > PLUGIN_MODULE_SOURCE_LIMIT_BYTES as u64 {
        return Err(format!("PSM plugin module exceeds {PLUGIN_MODULE_SOURCE_LIMIT_BYTES} bytes"));
    }
    Ok(path)
}

fn normalize_path_plugin_entry_path(entry_path: &str) -> Result<String, String> {
    Ok(ensure_plugin_module_file(&expand_home_path(entry_path)?)?.to_string_lossy().to_string())
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
pub async fn set_psm_plugin_enabled(plugin_id: String, enabled: bool, source: Option<String>, package_name: Option<String>, entry_path: Option<String>) -> Result<PsmPluginsConfig, String> {
    let mut config = read_plugins_config()?;
    let entry = config.plugins.entry(plugin_id).or_insert_with(|| PsmPluginConfigEntry { enabled, source: source.clone().unwrap_or_default(), package_name: package_name.clone(), entry_path: entry_path.clone(), settings: BTreeMap::new() });
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
    write_plugins_config(&config)?;
    Ok(config)
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn set_psm_plugin_settings(plugin_id: String, settings: BTreeMap<String, Value>, source: Option<String>, package_name: Option<String>, entry_path: Option<String>) -> Result<PsmPluginsConfig, String> {
    let mut config = read_plugins_config()?;
    let entry = config.plugins.entry(plugin_id).or_insert_with(|| PsmPluginConfigEntry { enabled: true, source: source.clone().unwrap_or_default(), package_name: package_name.clone(), entry_path: entry_path.clone(), settings: BTreeMap::new() });
    if let Some(source) = source {
        entry.source = source;
    }
    if package_name.is_some() {
        entry.package_name = package_name;
    }
    if entry_path.is_some() {
        entry.entry_path = entry_path;
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
pub async fn reload_psm_plugins() -> Result<Vec<PsmNpmPluginEntry>, String> {
    list_npm_entries_internal()
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_npm_psm_plugin_module_source(entry_path: String) -> Result<String, String> {
    let path = ensure_npm_module_file(Path::new(&entry_path))?;
    fs::read_to_string(&path).map_err(|e| format!("Failed to read PSM plugin module: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn read_path_psm_plugin_module_source(entry_path: String) -> Result<String, String> {
    let path = ensure_plugin_module_file(&expand_home_path(&entry_path)?)?;
    fs::read_to_string(&path).map_err(|e| format!("Failed to read PSM plugin module: {e}"))
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_psm_plugin_paths() -> Result<PsmPluginPaths, String> {
    let npm_dir = npm_extensions_dir()?;
    fs::create_dir_all(&npm_dir).map_err(|e| format!("Failed to create PSM npm extensions dir: {e}"))?;
    let config = read_plugins_config()?;
    Ok(PsmPluginPaths { config_path: plugins_config_path()?.to_string_lossy().to_string(), npm_dir: npm_dir.to_string_lossy().to_string(), custom_paths: config.custom_paths })
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
        config.plugins.insert("builtin.sidechat".to_string(), PsmPluginConfigEntry { enabled: false, source: "builtin".to_string(), package_name: None, entry_path: None, settings: BTreeMap::new() });
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
        let config = runtime.block_on(set_psm_plugin_settings("builtin.sidechat".to_string(), settings, Some("builtin".to_string()), None, None)).unwrap();

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
    fn builds_safe_npm_command_args() {
        let npm_dir = PathBuf::from("/tmp/psm-npm");

        assert_eq!(npm_command_args("install", Some("@acme/psm-sidechat"), &npm_dir).unwrap(), vec!["install", "--prefix", "/tmp/psm-npm", "@acme/psm-sidechat"]);
        assert_eq!(npm_command_args("update", None, &npm_dir).unwrap(), vec!["update", "--prefix", "/tmp/psm-npm"]);

        assert!(npm_command_args("install", Some("--registry=https://evil.example"), &npm_dir).is_err());
        assert!(npm_command_args("install", Some("@acme/psm sidechat"), &npm_dir).is_err());
    }

    #[test]
    fn removes_uninstalled_npm_plugin_config_entries() {
        let mut config = PsmPluginsConfig::default();
        config.plugins.insert("npm.sidechat".to_string(), PsmPluginConfigEntry { enabled: false, source: "npm".to_string(), package_name: Some("@acme/psm-sidechat".to_string()), entry_path: None, settings: BTreeMap::new() });
        config.plugins.insert("npm.other".to_string(), PsmPluginConfigEntry { enabled: true, source: "npm".to_string(), package_name: Some("@acme/other".to_string()), entry_path: None, settings: BTreeMap::new() });
        config.plugins.insert("builtin.sidechat".to_string(), PsmPluginConfigEntry { enabled: true, source: "builtin".to_string(), package_name: Some("@acme/psm-sidechat".to_string()), entry_path: None, settings: BTreeMap::new() });

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
        fs::write(&big_path, vec![b'a'; PLUGIN_MODULE_SOURCE_LIMIT_BYTES + 1]).unwrap();
        fs::write(&outside_path, "export const manifest = {}; ").unwrap();

        let runtime = tokio::runtime::Runtime::new().unwrap();
        let txt_err = runtime.block_on(read_npm_psm_plugin_module_source(txt_path.to_string_lossy().to_string())).unwrap_err();
        let big_err = runtime.block_on(read_npm_psm_plugin_module_source(big_path.to_string_lossy().to_string())).unwrap_err();
        let outside_err = runtime.block_on(read_npm_psm_plugin_module_source(outside_path.to_string_lossy().to_string())).unwrap_err();

        assert!(txt_err.contains(".js or .mjs"));
        assert!(big_err.contains("exceeds"));
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
        fs::write(&big_path, vec![b'a'; PLUGIN_MODULE_SOURCE_LIMIT_BYTES + 1]).unwrap();

        let runtime = tokio::runtime::Runtime::new().unwrap();
        assert_eq!(runtime.block_on(read_path_psm_plugin_module_source(safe_path.to_string_lossy().to_string())).unwrap(), "export const manifest = {}; ");
        let txt_err = runtime.block_on(read_path_psm_plugin_module_source(txt_path.to_string_lossy().to_string())).unwrap_err();
        let big_err = runtime.block_on(read_path_psm_plugin_module_source(big_path.to_string_lossy().to_string())).unwrap_err();

        assert!(txt_err.contains(".js or .mjs"));
        assert!(big_err.contains("exceeds"));

        if let Some(old_home) = old_home {
            env::set_var("HOME", old_home);
        } else {
            env::remove_var("HOME");
        }
    }
}
