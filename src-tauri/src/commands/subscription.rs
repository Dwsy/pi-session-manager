use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;

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
    pub source: String,
    pub available: bool,
    pub extension_installed: bool,
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

    let content = std::fs::read_to_string(&settings_path).unwrap_or_default();
    Ok(content.contains("pi-sub-core") || content.contains("sub-core"))
}

/// Convert raw cache data to SubscriptionUsageEntry list
fn convert_cache_to_entries(cache: &Value) -> Vec<SubscriptionUsageEntry> {
    let obj = cache.as_object().map(|o| o.clone()).unwrap_or_default();
    
    obj.into_iter()
        .map(|(provider, entry_value)| {
            let entry: CacheEntry = serde_json::from_value(entry_value.clone())
                .unwrap_or(CacheEntry {
                    fetched_at: None,
                    usage: None,
                    status: None,
                });

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
        .collect()
}

/// Fetch subscription data by calling pi with sub-core extension via -e
fn fetch_subscription_via_pi_extension(extension_path: &str) -> Result<Value, String> {
    let output = Command::new("pi")
        .args([
            "--mode", "rpc",
            "--extension", extension_path,
            "--no-session",
            "--no-extensions",
            "--no-skills",
            "get all usage"
        ])
        .output()
        .map_err(|e| format!("Failed to execute pi command: {e}"))?;

    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        if stdout.trim().is_empty() {
            return Ok(Value::Object(serde_json::Map::new()));
        }
        serde_json::from_str(&stdout)
            .map_err(|e| format!("Failed to parse pi output: {e}. Output: {stdout}"))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("pi command failed: {stderr}"))
    }
}

#[cfg_attr(feature = "gui", tauri::command)]
pub async fn get_subscription_usage() -> Result<SubscriptionUsageSnapshot, String> {
    let cache_path = sub_core_cache_path()?;
    let source_path = cache_path.to_string_lossy().to_string();

    let extension_installed = has_sub_core_extension()?;
    let mut source = "none".to_string();
    let message: Option<String>;

    // Strategy 1: Try to read cache directly
    if cache_path.exists() {
        let content = std::fs::read_to_string(&cache_path)
            .map_err(|e| format!("Failed to read sub-core cache: {e}"))?;
        
        let cache: Value = serde_json::from_str(&content)
            .unwrap_or(Value::Object(serde_json::Map::new()));
        
        let mut entries = convert_cache_to_entries(&cache);
        entries.sort_by(|a, b| a.provider.cmp(&b.provider));

        if !entries.is_empty() {
            source = "cache".to_string();
            
            return Ok(SubscriptionUsageSnapshot {
                source_path,
                source,
                available: true,
                extension_installed,
                entries,
                message: None,
            });
        }
    }

    // Strategy 2: Try to fetch via pi with -e extension (if installed locally)
    let extension_path = "/tmp/package/index.ts";
    if std::path::Path::new(extension_path).exists() {
        match fetch_subscription_via_pi_extension(extension_path) {
            Ok(result) => {
                let entries_raw = result.get("entries")
                    .and_then(|e| e.as_array())
                    .cloned()
                    .unwrap_or_default();
                
                if !entries_raw.is_empty() {
                    let entries: Vec<SubscriptionUsageEntry> = entries_raw
                        .iter()
                        .filter_map(|e| serde_json::from_value(e.clone()).ok())
                        .collect();
                    
                    if !entries.is_empty() {
                        source = "pi-extension".to_string();
                        return Ok(SubscriptionUsageSnapshot {
                            source_path: extension_path.to_string(),
                            source,
                            available: true,
                            extension_installed: true,
                            entries,
                            message: None,
                        });
                    }
                }
            }
            Err(_) => {
                // Extension call failed, continue to fallback
            }
        }
    }

    // Fallback: return empty result with helpful message
    message = if !extension_installed {
        Some("sub-core not installed. Install it: pi install npm:@marckrenn/pi-sub-core".to_string())
    } else {
        Some("sub-core cache is empty. Open pi and refresh subscription data once.".to_string())
    };

    Ok(SubscriptionUsageSnapshot {
        source_path,
        source,
        available: false,
        extension_installed,
        entries: Vec::new(),
        message,
    })
}
