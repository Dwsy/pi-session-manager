//! Read-only view of OpenBot's local agent metadata.
//!
//! OpenBot is a separate app and this schema is not ours. Everything here is
//! therefore best-effort: a missing database, a missing table or an unreadable row
//! degrades to fewer (or zero) agents instead of an error, because the only consumer
//! is a display label in the project list.

use rusqlite::{Connection, OpenFlags};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::path::{Path, PathBuf};

/// Environment escape hatch, mainly for tests and non-standard installs.
pub const DATABASE_PATH_ENV: &str = "PSM_OPENBOT_DB";

const AGENTS_TABLE: &str = "projection_agents";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenBotAgent {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_seed: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_hue: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    /// Absolute workspace path; also the session `cwd` PSM shows as a project.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_path: Option<String>,
}

/// `~/Library/Application Support/OpenBot/openbot.db` on macOS,
/// `%APPDATA%\OpenBot\openbot.db` on Windows, `~/.config/OpenBot/openbot.db` on Linux.
pub fn database_path() -> Option<PathBuf> {
    if let Some(override_path) = std::env::var_os(DATABASE_PATH_ENV) {
        if !override_path.is_empty() {
            return Some(PathBuf::from(override_path));
        }
    }

    let base = if cfg!(target_os = "linux") { dirs::config_dir() } else { dirs::data_dir() }?;
    Some(base.join("OpenBot").join("openbot.db"))
}

fn text_field(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::trim).filter(|text| !text.is_empty()).map(str::to_string)
}

/// Parses one `projection_agents.agent_json` payload.
/// Rows without a usable `id` or `name` are skipped, since nothing can be labelled.
pub fn parse_agent_json(raw: &str) -> Option<OpenBotAgent> {
    let value: Value = serde_json::from_str(raw).ok()?;
    let id = text_field(&value, "id")?;
    let name = text_field(&value, "name")?;
    Some(OpenBotAgent {
        id,
        name,
        title: text_field(&value, "title"),
        description: text_field(&value, "description"),
        avatar_seed: text_field(&value, "avatarSeed"),
        avatar_hue: value.get("avatarHue").and_then(Value::as_f64).filter(|hue| hue.is_finite()).map(|hue| hue.round().rem_euclid(360.0) as u32),
        avatar_url: text_field(&value, "avatarUrl"),
        workspace_path: text_field(&value, "workspacePath"),
    })
}

/// Reads all agents from an explicit database path. Never creates or writes the file.
pub fn list_agents_at(path: &Path) -> Vec<OpenBotAgent> {
    if !path.is_file() {
        return Vec::new();
    }

    let connection = match Connection::open_with_flags(path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
        Ok(connection) => connection,
        Err(error) => {
            eprintln!("[openbot-agents] cannot open {}: {error}", path.display());
            return Vec::new();
        }
    };

    let mut statement = match connection.prepare(&format!("SELECT agent_json FROM {AGENTS_TABLE}")) {
        Ok(statement) => statement,
        Err(error) => {
            eprintln!("[openbot-agents] cannot read {AGENTS_TABLE}: {error}");
            return Vec::new();
        }
    };

    let rows = match statement.query_map([], |row| row.get::<_, String>(0)) {
        Ok(rows) => rows,
        Err(error) => {
            eprintln!("[openbot-agents] cannot list {AGENTS_TABLE}: {error}");
            return Vec::new();
        }
    };

    rows.filter_map(|row| match row {
        Ok(raw) => parse_agent_json(&raw),
        Err(error) => {
            eprintln!("[openbot-agents] skipping unreadable row: {error}");
            None
        }
    })
    .collect()
}

/// Best-effort agent list from the detected (or overridden) database.
pub fn list_agents() -> Vec<OpenBotAgent> {
    match database_path() {
        Some(path) => list_agents_at(&path),
        None => Vec::new(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_db_path(name: &str) -> PathBuf {
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos();
        std::env::temp_dir().join(format!("psm-openbot-agents-{name}-{stamp}.db"))
    }

    fn create_agents_db(path: &Path, rows: &[Option<&str>]) {
        let connection = Connection::open(path).unwrap();
        connection.execute_batch("CREATE TABLE projection_agents (agent_json TEXT NOT NULL)").unwrap();
        for row in rows {
            if let Some(raw) = row {
                connection.execute("INSERT INTO projection_agents (agent_json) VALUES (?1)", [raw]).unwrap();
            }
        }
    }

    const ZERO_JSON: &str =
        r#"{"id":"agent-da66bdca-0664-440c-a271-585ab5c62164","name":"zero","title":"","description":"General-purpose assistant","avatarSeed":"first-bot:avatar:0:7","avatarHue":320,"avatarUrl":null,"workspacePath":"/Users/dev/OpenBot/Agents/agent-da66bdca-0664-440c-a271-585ab5c62164"}"#;

    #[test]
    fn parses_agent_json_fields() {
        let agent = parse_agent_json(ZERO_JSON).expect("agent should parse");

        assert_eq!(agent.id, "agent-da66bdca-0664-440c-a271-585ab5c62164");
        assert_eq!(agent.name, "zero");
        assert_eq!(agent.title, None, "empty titles stay absent");
        assert_eq!(agent.avatar_hue, Some(320));
        assert_eq!(agent.workspace_path.as_deref(), Some("/Users/dev/OpenBot/Agents/agent-da66bdca-0664-440c-a271-585ab5c62164"));
    }

    #[test]
    fn normalizes_and_rejects_agent_json() {
        assert_eq!(parse_agent_json("not json"), None);
        assert_eq!(parse_agent_json(r#"{"id":"a"}"#), None, "name is required");
        assert_eq!(parse_agent_json(r#"{"name":"zero"}"#), None, "id is required");
        assert_eq!(parse_agent_json(r#"{"id":"a","name":"  "}"#), None);

        let wrapped = parse_agent_json(r#"{"id":"a","name":"zero","avatarHue":-90}"#).unwrap();
        assert_eq!(wrapped.avatar_hue, Some(270));
    }

    #[test]
    fn reads_rows_and_skips_malformed_ones() {
        let path = temp_db_path("rows");
        create_agents_db(&path, &[Some(ZERO_JSON), Some("{broken"), Some(r#"{"id":"no-name"}"#)]);

        let agents = list_agents_at(&path);

        assert_eq!(agents.len(), 1);
        assert_eq!(agents[0].name, "zero");
        std::fs::remove_file(&path).ok();
    }

    #[test]
    fn tolerates_missing_files_and_foreign_databases() {
        let missing = temp_db_path("missing");
        assert!(list_agents_at(&missing).is_empty());

        let foreign = temp_db_path("foreign");
        std::fs::write(&foreign, b"definitely not sqlite").unwrap();
        assert!(list_agents_at(&foreign).is_empty());
        std::fs::remove_file(&foreign).ok();
    }

    #[test]
    fn tolerates_databases_without_the_agents_table() {
        let path = temp_db_path("empty-schema");
        Connection::open(&path).unwrap().execute_batch("CREATE TABLE unrelated (id TEXT)").unwrap();

        assert!(list_agents_at(&path).is_empty());
        std::fs::remove_file(&path).ok();
    }

    #[test]
    #[ignore]
    fn tmp_print_real_payload() {
        let agents = list_agents();
        println!("{}", serde_json::to_string_pretty(&agents).unwrap());
    }

    #[test]
    fn database_path_uses_the_platform_data_directory() {
        let path = database_path().expect("data directory should resolve");
        assert!(path.ends_with(Path::new("OpenBot").join("openbot.db")));
    }
}
