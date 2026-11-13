//! Internationalization (i18n) support for Pi Session Manager CLI.
//!
//! All translations are externalized into `src-tauri-cli/locales/*.json`.
//! Supported languages align with the frontend:
//! - zh-CN (Simplified Chinese)
//! - en-US (English - United States)
//! - ja-JP (Japanese)
//! - de-DE (German)
//! - fr-FR (French)
//! - es-ES (Spanish)

#![allow(dead_code)]

use std::collections::HashMap;
use std::fmt;
use std::str::FromStr;
use std::sync::atomic::{AtomicU8, Ordering};
use std::sync::OnceLock;

/// Supported languages aligned with the frontend.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Default)]
pub enum Language {
    ZhCn,
    #[default]
    EnUs,
    JaJp,
    DeDe,
    FrFr,
    EsEs,
}

impl Language {
    /// Array of all supported languages.
    pub const ALL: [Language; 6] = [Language::ZhCn, Language::EnUs, Language::JaJp, Language::DeDe, Language::FrFr, Language::EsEs];

    /// Standard language identifier code (e.g. "zh-CN", "en-US").
    pub const fn as_str(&self) -> &'static str {
        match self {
            Language::ZhCn => "zh-CN",
            Language::EnUs => "en-US",
            Language::JaJp => "ja-JP",
            Language::DeDe => "de-DE",
            Language::FrFr => "fr-FR",
            Language::EsEs => "es-ES",
        }
    }

    /// Helper to parse or fall back to default (EnUs).
    pub fn parse_or_default(s: &str) -> Self {
        Self::from_str_loose(s).unwrap_or_default()
    }

    /// Loose string matching for language codes.
    pub fn from_str_loose(s: &str) -> Option<Self> {
        let trimmed = s.trim();
        if trimmed.is_empty() {
            return None;
        }

        let base = trimmed.split(['.', '@']).next().unwrap_or(trimmed).trim().to_ascii_lowercase();

        match base.as_str() {
            "zh-cn" | "zh_cn" | "zh" | "cn" | "zh-hans" | "zh-hant" | "zh-tw" | "zh-hk" | "chinese" => Some(Language::ZhCn),
            "en-us" | "en_us" | "en" | "us" | "en-gb" | "en_gb" | "gb" | "english" => Some(Language::EnUs),
            "ja-jp" | "ja_jp" | "ja" | "jp" | "japanese" => Some(Language::JaJp),
            "de-de" | "de_de" | "de" | "german" | "deutsch" => Some(Language::DeDe),
            "fr-fr" | "fr_fr" | "fr" | "french" | "francais" | "français" => Some(Language::FrFr),
            "es-es" | "es_es" | "es" | "spanish" | "espanol" | "español" => Some(Language::EsEs),
            _ => {
                if base.starts_with("zh") || base.starts_with("cn") {
                    Some(Language::ZhCn)
                } else if base.starts_with("ja") || base.starts_with("jp") {
                    Some(Language::JaJp)
                } else if base.starts_with("de") {
                    Some(Language::DeDe)
                } else if base.starts_with("fr") {
                    Some(Language::FrFr)
                } else if base.starts_with("es") {
                    Some(Language::EsEs)
                } else if base.starts_with("en") {
                    Some(Language::EnUs)
                } else {
                    None
                }
            }
        }
    }
}

impl fmt::Display for Language {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

impl FromStr for Language {
    type Err = ();

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        Self::from_str_loose(s).ok_or(())
    }
}

// ─── Environment Detection ───────────────────────────────────

pub fn detect_from_env_lookup<F>(get_env: F) -> Language
where
    F: Fn(&str) -> Option<String>,
{
    const ENV_VARS: [&str; 4] = ["PSM_LANG", "LC_ALL", "LC_MESSAGES", "LANG"];

    for key in ENV_VARS {
        if let Some(val) = get_env(key) {
            let trimmed = val.trim();
            if !trimmed.is_empty() {
                if let Some(lang) = Language::from_str_loose(trimmed) {
                    return lang;
                }
                let lower = trimmed.to_ascii_lowercase();
                if lower.contains("zh") || lower.contains("cn") {
                    return Language::ZhCn;
                }
                return Language::EnUs;
            }
        }
    }

    Language::EnUs
}

pub fn detect_language() -> Language {
    detect_from_env_lookup(|key| std::env::var(key).ok())
}

// ─── Global Language State ───────────────────────────────────

static CURRENT_LANG: AtomicU8 = AtomicU8::new(255); // 255 = uninitialized

pub fn set_current_language(lang: Language) {
    let val = match lang {
        Language::ZhCn => 0,
        Language::EnUs => 1,
        Language::JaJp => 2,
        Language::DeDe => 3,
        Language::FrFr => 4,
        Language::EsEs => 5,
    };
    CURRENT_LANG.store(val, Ordering::Relaxed);
}

pub fn current_language() -> Language {
    match CURRENT_LANG.load(Ordering::Relaxed) {
        0 => Language::ZhCn,
        1 => Language::EnUs,
        2 => Language::JaJp,
        3 => Language::DeDe,
        4 => Language::FrFr,
        5 => Language::EsEs,
        _ => {
            let detected = detect_language();
            set_current_language(detected);
            detected
        }
    }
}

#[cfg(test)]
pub fn reset_current_language() {
    CURRENT_LANG.store(255, Ordering::Relaxed);
}

// ─── External Locale Resource Loading ────────────────────────

static LOCALES: OnceLock<HashMap<Language, HashMap<String, String>>> = OnceLock::new();

fn init_locales() -> HashMap<Language, HashMap<String, String>> {
    let mut map = HashMap::new();

    let zh_raw = include_str!("../../locales/zh-CN.json");
    let en_raw = include_str!("../../locales/en-US.json");
    let ja_raw = include_str!("../../locales/ja-JP.json");
    let de_raw = include_str!("../../locales/de-DE.json");
    let fr_raw = include_str!("../../locales/fr-FR.json");
    let es_raw = include_str!("../../locales/es-ES.json");

    map.insert(Language::ZhCn, serde_json::from_str(zh_raw).unwrap_or_default());
    map.insert(Language::EnUs, serde_json::from_str(en_raw).unwrap_or_default());
    map.insert(Language::JaJp, serde_json::from_str(ja_raw).unwrap_or_default());
    map.insert(Language::DeDe, serde_json::from_str(de_raw).unwrap_or_default());
    map.insert(Language::FrFr, serde_json::from_str(fr_raw).unwrap_or_default());
    map.insert(Language::EsEs, serde_json::from_str(es_raw).unwrap_or_default());

    map
}

pub fn get_text(key: &str, lang: Language) -> String {
    let locales = LOCALES.get_or_init(init_locales);
    if let Some(dict) = locales.get(&lang) {
        if let Some(val) = dict.get(key) {
            return val.clone();
        }
    }
    // Fallback to English
    if lang != Language::EnUs {
        if let Some(en_dict) = locales.get(&Language::EnUs) {
            if let Some(val) = en_dict.get(key) {
                return val.clone();
            }
        }
    }
    key.to_string()
}

// ─── Text Keys Enum ──────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TextKey {
    CliAbout,
    CliLongAbout,
    CliArgPort,
    CmdStatus,
    CmdSession,
    CmdModel,
    CmdTag,
    CmdFavorite,
    CmdApiKey,
    CmdSkill,
    CmdPrompt,
    CmdSettings,
    CmdDataset,
    CmdConfig,
    CmdUpdate,
    CmdSearch,
    CmdRecall,
    CmdStats,
    CmdInspect,
    CmdExportSkill,
    CmdSessionList,
    CmdSessionGet,
    CmdSessionDelete,
    CmdSessionFork,
    CmdSessionRename,
    CmdSessionExport,
    SessionDeleted,
    SessionRenamed,
    SessionExported,
    SessionForked,
    TagDeleted,
    FavoriteAdded,
    FavoriteRemoved,
    ApiKeyRevoked,
    SettingsSaved,
    ConfigSaved,
    RecallNoneFound,
    RecallResults,
    StatsSummary,
    InspectSession,
    InspectNotFound,
    SkillExported,
    SkillExportFailed,
    ServerConnectError,
    RequestTimeout,
    NonJsonResponse,
    RequestFailed,
    ServerHttpError,
    ServerStatusFailed,
    HttpClientInitFailed,
    WindowsUpdateNotSupported,
    ReinstallScriptHint,
    ReleasesDownloadHint,
    AlreadyUpToDate,
    UpdateAvailable,
    UpdateComplete,
}

impl TextKey {
    pub fn as_key_str(&self) -> &'static str {
        match self {
            TextKey::CliAbout => "cli_about",
            TextKey::CliLongAbout => "cli_long_about",
            TextKey::CliArgPort => "cli_arg_port",
            TextKey::CmdStatus => "cmd_status",
            TextKey::CmdSession => "cmd_session",
            TextKey::CmdModel => "cmd_model",
            TextKey::CmdTag => "cmd_tag",
            TextKey::CmdFavorite => "cmd_favorite",
            TextKey::CmdApiKey => "cmd_api_key",
            TextKey::CmdSkill => "cmd_skill",
            TextKey::CmdPrompt => "cmd_prompt",
            TextKey::CmdSettings => "cmd_settings",
            TextKey::CmdDataset => "cmd_dataset",
            TextKey::CmdConfig => "cmd_config",
            TextKey::CmdUpdate => "cmd_update",
            TextKey::CmdSearch => "cmd_search",
            TextKey::CmdRecall => "cmd_recall",
            TextKey::CmdStats => "cmd_stats",
            TextKey::CmdInspect => "cmd_inspect",
            TextKey::CmdExportSkill => "cmd_export_skill",
            TextKey::CmdSessionList => "cmd_session_list",
            TextKey::CmdSessionGet => "cmd_session_get",
            TextKey::CmdSessionDelete => "cmd_session_delete",
            TextKey::CmdSessionFork => "cmd_session_fork",
            TextKey::CmdSessionRename => "cmd_session_rename",
            TextKey::CmdSessionExport => "cmd_session_export",
            TextKey::SessionDeleted => "session_deleted",
            TextKey::SessionRenamed => "session_renamed",
            TextKey::SessionExported => "session_exported",
            TextKey::SessionForked => "session_forked",
            TextKey::TagDeleted => "tag_deleted",
            TextKey::FavoriteAdded => "favorite_added",
            TextKey::FavoriteRemoved => "favorite_removed",
            TextKey::ApiKeyRevoked => "api_key_revoked",
            TextKey::SettingsSaved => "settings_saved",
            TextKey::ConfigSaved => "config_saved",
            TextKey::RecallNoneFound => "recall_none_found",
            TextKey::RecallResults => "recall_results",
            TextKey::StatsSummary => "stats_summary",
            TextKey::InspectSession => "inspect_session",
            TextKey::InspectNotFound => "inspect_not_found",
            TextKey::SkillExported => "skill_exported",
            TextKey::SkillExportFailed => "skill_export_failed",
            TextKey::ServerConnectError => "server_connect_error",
            TextKey::RequestTimeout => "request_timeout",
            TextKey::NonJsonResponse => "non_json_response",
            TextKey::RequestFailed => "request_failed",
            TextKey::ServerHttpError => "server_http_error",
            TextKey::ServerStatusFailed => "server_status_failed",
            TextKey::HttpClientInitFailed => "http_client_init_failed",
            TextKey::WindowsUpdateNotSupported => "windows_update_not_supported",
            TextKey::ReinstallScriptHint => "windows_update_hint",
            TextKey::ReleasesDownloadHint => "releases_download_hint",
            TextKey::AlreadyUpToDate => "already_up_to_date",
            TextKey::UpdateAvailable => "update_available",
            TextKey::UpdateComplete => "update_complete",
        }
    }

    pub fn translate(&self, lang: Language) -> String {
        get_text(self.as_key_str(), lang)
    }
}

pub fn t(key: TextKey, lang: Language) -> String {
    key.translate(lang)
}

// ─── Format & Parameter Helpers ──────────────────────────────

pub fn msg_server_connect_error(url: &str, lang: Language) -> String {
    get_text("server_connect_error", lang).replace("{url}", url)
}

pub fn msg_request_timeout(url: &str, lang: Language) -> String {
    get_text("request_timeout", lang).replace("{url}", url)
}

pub fn msg_non_json_response(url: &str, lang: Language) -> String {
    get_text("non_json_response", lang).replace("{url}", url)
}

pub fn msg_request_failed(url: &str, err: &str, lang: Language) -> String {
    get_text("request_failed", lang).replace("{url}", url).replace("{error}", err)
}

pub fn msg_server_http_error(status: u16, detail: &str, lang: Language) -> String {
    let detail_str = if detail.is_empty() { String::new() } else { format!("\n  {}", detail) };
    get_text("server_http_error", lang).replace("{status}", &status.to_string()).replace("{detail}", &detail_str)
}

pub fn msg_session_deleted(path: &str, lang: Language) -> String {
    get_text("session_deleted", lang).replace("{path}", path)
}

pub fn msg_session_renamed(path: &str, lang: Language) -> String {
    get_text("session_renamed", lang).replace("{path}", path)
}

pub fn msg_session_exported(path: &str, lang: Language) -> String {
    get_text("session_exported", lang).replace("{path}", path)
}

pub fn msg_session_forked(path: &str, lang: Language) -> String {
    get_text("session_forked", lang).replace("{path}", path)
}

pub fn msg_tag_deleted(id: &str, lang: Language) -> String {
    get_text("tag_deleted", lang).replace("{id}", id)
}

pub fn msg_favorite_added(id: &str, lang: Language) -> String {
    get_text("favorite_added", lang).replace("{id}", id)
}

pub fn msg_favorite_removed(id: &str, lang: Language) -> String {
    get_text("favorite_removed", lang).replace("{id}", id)
}

pub fn msg_api_key_revoked(key: &str, lang: Language) -> String {
    get_text("api_key_revoked", lang).replace("{key}", key)
}

pub fn msg_settings_saved(lang: Language) -> String {
    get_text("settings_saved", lang)
}

pub fn msg_config_saved(lang: Language) -> String {
    get_text("config_saved", lang)
}

pub fn msg_recall_none_found(query: &str, lang: Language) -> String {
    get_text("recall_none_found", lang).replace("{query}", query)
}

pub fn msg_recall_results(count: usize, query: &str, lang: Language) -> String {
    get_text("recall_results", lang).replace("{count}", &count.to_string()).replace("{query}", query)
}

pub fn msg_stats_summary(target: &str, lang: Language) -> String {
    get_text("stats_summary", lang).replace("{target}", target)
}

pub fn msg_inspect_session(target: &str, lang: Language) -> String {
    get_text("inspect_session", lang).replace("{target}", target)
}

pub fn msg_inspect_not_found(path: &str, lang: Language) -> String {
    get_text("inspect_not_found", lang).replace("{path}", path)
}

pub fn msg_skill_exported(path: &str, lang: Language) -> String {
    get_text("skill_exported", lang).replace("{path}", path)
}

pub fn msg_skill_export_failed(error: &str, lang: Language) -> String {
    get_text("skill_export_failed", lang).replace("{error}", error)
}

pub fn msg_windows_update_not_supported(lang: Language) -> String {
    get_text("windows_update_not_supported", lang)
}

pub fn msg_windows_update_hint(lang: Language) -> String {
    get_text("windows_update_hint", lang)
}

pub fn msg_releases_download_hint(lang: Language) -> String {
    get_text("releases_download_hint", lang)
}

pub fn format_reqwest_error(e: &reqwest::Error, url: &str, lang: Language) -> String {
    if e.is_connect() {
        msg_server_connect_error(url, lang)
    } else if e.is_timeout() {
        msg_request_timeout(url, lang)
    } else if e.is_decode() {
        msg_non_json_response(url, lang)
    } else {
        msg_request_failed(url, &e.to_string(), lang)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_language_as_str_and_display() {
        for lang in Language::ALL {
            assert_eq!(lang.to_string(), lang.as_str());
        }
        assert_eq!(Language::ZhCn.as_str(), "zh-CN");
        assert_eq!(Language::EnUs.as_str(), "en-US");
        assert_eq!(Language::JaJp.as_str(), "ja-JP");
        assert_eq!(Language::DeDe.as_str(), "de-DE");
        assert_eq!(Language::FrFr.as_str(), "fr-FR");
        assert_eq!(Language::EsEs.as_str(), "es-ES");
    }

    #[test]
    fn test_language_from_str_loose_exact() {
        assert_eq!(Language::from_str_loose("zh-CN"), Some(Language::ZhCn));
        assert_eq!(Language::from_str_loose("zh_CN"), Some(Language::ZhCn));
        assert_eq!(Language::from_str_loose("zh"), Some(Language::ZhCn));
        assert_eq!(Language::from_str_loose("en-US"), Some(Language::EnUs));
        assert_eq!(Language::from_str_loose("en"), Some(Language::EnUs));
        assert_eq!(Language::from_str_loose("ja-JP.UTF-8"), Some(Language::JaJp));
        assert_eq!(Language::from_str_loose("de_DE@euro"), Some(Language::DeDe));
        assert_eq!(Language::from_str_loose("fr"), Some(Language::FrFr));
        assert_eq!(Language::from_str_loose("es-ES"), Some(Language::EsEs));
    }

    #[test]
    fn test_env_detection_order_and_fallback() {
        let env_table = [("LANG", "zh_CN.UTF-8"), ("LC_ALL", "en_US.UTF-8")];
        let detected = detect_from_env_lookup(|k| env_table.iter().find(|(key, _)| *key == k).map(|(_, v)| v.to_string()));
        assert_eq!(detected, Language::EnUs);
    }

    #[test]
    fn test_all_text_keys_defined_in_json_and_non_empty() {
        for lang in Language::ALL {
            let conn_err = msg_server_connect_error("http://test:1234", lang);
            assert!(conn_err.contains("http://test:1234"));
            assert!(!conn_err.is_empty());

            let about = get_text("cli_about", lang);
            assert!(!about.is_empty());
            assert_ne!(about, "cli_about");
        }
    }

    #[test]
    fn test_msg_server_connect_error_all_languages() {
        assert!(msg_server_connect_error("http://1", Language::ZhCn).contains("无法连接到"));
        assert!(msg_server_connect_error("http://1", Language::EnUs).contains("Cannot connect to"));
        assert!(msg_server_connect_error("http://1", Language::JaJp).contains("接続できません"));
        assert!(msg_server_connect_error("http://1", Language::DeDe).contains("Verbindung"));
        assert!(msg_server_connect_error("http://1", Language::FrFr).contains("Impossible"));
        assert!(msg_server_connect_error("http://1", Language::EsEs).contains("No se puede"));
    }
}
