use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;

use serde_json::Value;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SubscriptionUsageWindow {
    pub label: String,
    pub used_percent: Option<f64>,
    pub reset_at: Option<String>,
    pub reset_description: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SubscriptionUsageEntry {
    pub provider: String,
    pub fetched_at: Option<u64>,
    pub status_description: Option<String>,
    pub windows: Vec<SubscriptionUsageWindow>,
    pub error_message: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct SubscriptionUsageSnapshot {
    pub source_path: String,
    pub available: bool,
    pub extension_installed: bool,
    pub auto_install_attempted: bool,
    pub auto_install_ok: bool,
    pub entries: Vec<SubscriptionUsageEntry>,
    pub message: Option<String>,
}

#[derive(serde::Deserialize, Clone, Debug)]
struct CacheEntry {
    #[serde(rename = "fetchedAt")]
    fetched_at: Option<u64>,
    usage: Option<UsageSnapshot>,
    status: Option<ProviderStatus>,
}

#[derive(serde::Deserialize, Clone, Debug)]
struct UsageSnapshot {
    windows: Vec<RateWindow>,
    error: Option<UsageError>,
}

#[derive(serde::Deserialize, Clone, Debug)]
struct RateWindow {
    label: String,
    #[serde(rename = "usedPercent")]
    used_percent: Option<f64>,
    #[serde(rename = "resetAt")]
    reset_at: Option<String>,
    #[serde(rename = "resetDescription")]
    reset_description: Option<String>,
}

#[derive(serde::Deserialize, Clone, Debug)]
struct ProviderStatus {
    description: Option<String>,
}

#[derive(serde::Deserialize, Clone, Debug)]
struct UsageError {
    message: Option<String>,
}

fn pi_agent_home() -> Result<PathBuf, String> {
    let home = dirs::home_dir().ok_or("Failed to resolve home directory")?;
    Ok(home.join(".pi/agent"))
}

fn sub_core_cache_path() -> Result<PathBuf, String> {
    Ok(pi_agent_home()?.join("cache/sub-core/cache.json"))
}

fn has_sub_core_extension() -> Result<bool, String> {
    let base = pi_agent_home()?;
    let candidates = [
        base.join("extensions/sub-core"),
        base.join("extensions/pi-sub-core"),
        base.join("extensions/@marckrenn/pi-sub-core"),
    ];

    if candidates.iter().any(|p| p.exists()) {
        return Ok(true);
    }

    let settings_path = base.join("settings.json");
    if !settings_path.exists() {
        return Ok(false);
    }

    let content = std::fs::read_to_string(settings_path).unwrap_or_default();
    Ok(content.contains("pi-sub-core") || content.contains("sub-core"))
}

fn try_install_sub_core() -> bool {
    let status = Command::new("pi")
        .args(["install", "npm:@marckrenn/pi-sub-core"])
        .status();

    match status {
        Ok(s) => s.success(),
        Err(_) => false,
    }
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_subscription_usage() -> Result<SubscriptionUsageSnapshot, String> {
    let cache_path = sub_core_cache_path()?;
    let source_path = cache_path.to_string_lossy().to_string();

    let mut extension_installed = has_sub_core_extension()?;
    let mut auto_install_attempted = false;
    let mut auto_install_ok = false;

    if !extension_installed {
        auto_install_attempted = true;
        auto_install_ok = try_install_sub_core();
        extension_installed = has_sub_core_extension()?;
    }

    if !cache_path.exists() {
        let msg = if extension_installed {
            "sub-core is installed, but cache is empty. Run one refresh in pi (sub-core) and reopen this page.".to_string()
        } else if auto_install_attempted && !auto_install_ok {
            "sub-core not installed and auto-install failed. Please run: pi install npm:@marckrenn/pi-sub-core".to_string()
        } else {
            "sub-core cache not found. Install/enable @marckrenn/pi-sub-core and refresh usage once.".to_string()
        };

        return Ok(SubscriptionUsageSnapshot {
            source_path,
            available: false,
            extension_installed,
            auto_install_attempted,
            auto_install_ok,
            entries: Vec::new(),
            message: Some(msg),
        });
    }

    let content = std::fs::read_to_string(&cache_path)
        .map_err(|e| format!("Failed to read sub-core cache: {e}"))?;

    let parsed_map: Result<HashMap<String, CacheEntry>, _> = serde_json::from_str(&content);

    let cache = match parsed_map {
        Ok(map) => map,
        Err(_) => {
            // Fallback: tolerate legacy/partial shape by parsing as generic value
            let value: Value = serde_json::from_str(&content)
                .map_err(|e| format!("Failed to parse sub-core cache: {e}"))?;
            let obj = value.as_object().ok_or("sub-core cache is not an object")?;

            let mut map = HashMap::new();
            for (provider, entry_value) in obj {
                let entry: CacheEntry = serde_json::from_value(entry_value.clone())
                    .map_err(|e| format!("Invalid cache entry for {provider}: {e}"))?;
                map.insert(provider.clone(), entry);
            }
            map
        }
    };

    let mut entries: Vec<SubscriptionUsageEntry> = cache
        .into_iter()
        .map(|(provider, entry)| {
            let windows = entry
                .usage
                .as_ref()
                .map(|u| {
                    u.windows
                        .iter()
                        .map(|w| SubscriptionUsageWindow {
                            label: w.label.clone(),
                            used_percent: w.used_percent,
                            reset_at: w.reset_at.clone(),
                            reset_description: w.reset_description.clone(),
                        })
                        .collect::<Vec<_>>()
                })
                .unwrap_or_default();

            let error_message = entry
                .usage
                .as_ref()
                .and_then(|u| u.error.as_ref())
                .and_then(|e| e.message.clone());

            SubscriptionUsageEntry {
                provider,
                fetched_at: entry.fetched_at,
                status_description: entry.status.and_then(|s| s.description),
                windows,
                error_message,
            }
        })
        .collect();

    entries.sort_by(|a, b| a.provider.cmp(&b.provider));

    Ok(SubscriptionUsageSnapshot {
        source_path,
        available: !entries.is_empty(),
        extension_installed,
        auto_install_attempted,
        auto_install_ok,
        entries,
        message: None,
    })
}
