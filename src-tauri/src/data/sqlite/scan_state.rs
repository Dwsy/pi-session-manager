use super::deps::*;

#[derive(Debug, Clone)]
pub struct ScanStateEntry {
    pub path: String,
    pub backing_path: String,
    pub provider_slug: String,
    pub file_modified: DateTime<Utc>,
    pub file_size: u64,
    pub last_scanned_at: DateTime<Utc>,
    pub last_parse_status: String,
    pub read_offset: u64,
    pub append_trust_count: u32,
}

pub fn get_scan_state(conn: &Connection, path: &str) -> Result<Option<ScanStateEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT path, backing_path, provider_slug, file_modified, file_size, last_scanned_at, last_parse_status, read_offset, append_trust_count
             FROM scan_state WHERE path = ?1",
        )
        .map_err(|e| format!("Failed to prepare scan_state query: {e}"))?;

    let entry = stmt
        .query_row(params![path], |row| {
            let path: String = row.get(0)?;
            let backing_path: String = row.get(1)?;
            let provider_slug: String = row.get(2)?;
            let file_modified_raw: String = row.get(3)?;
            let file_size_raw: i64 = row.get(4)?;
            let last_scanned_at_raw: String = row.get(5)?;
            let last_parse_status: String = row.get(6)?;
            let read_offset_raw: i64 = row.get(7).unwrap_or(0);
            let append_trust_count_raw: i32 = row.get(8).unwrap_or(0);
            Ok(ScanStateEntry {
                path: path.clone(),
                backing_path,
                provider_slug,
                file_modified: super::util::parse_timestamp(&file_modified_raw),
                file_size: u64::try_from(file_size_raw).unwrap_or_default(),
                last_scanned_at: super::util::parse_timestamp(&last_scanned_at_raw),
                last_parse_status,
                read_offset: u64::try_from(read_offset_raw).unwrap_or_default(),
                append_trust_count: append_trust_count_raw as u32,
            })
        })
        .optional()
        .map_err(|e| format!("Failed to query scan_state for {path}: {e}"))?;

    Ok(entry)
}

pub fn get_all_scan_state(conn: &Connection) -> Result<HashMap<String, ScanStateEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT path, backing_path, provider_slug, file_modified, file_size, last_scanned_at, last_parse_status, read_offset, append_trust_count
             FROM scan_state",
        )
        .map_err(|e| format!("Failed to prepare scan_state query: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            let path: String = row.get(0)?;
            let backing_path: String = row.get(1)?;
            let provider_slug: String = row.get(2)?;
            let file_modified_raw: String = row.get(3)?;
            let file_size_raw: i64 = row.get(4)?;
            let last_scanned_at_raw: String = row.get(5)?;
            let last_parse_status: String = row.get(6)?;
            let read_offset_raw: i64 = row.get(7).unwrap_or(0);
            let append_trust_count_raw: i32 = row.get(8).unwrap_or(0);
            Ok((
                path.clone(),
                ScanStateEntry {
                    path,
                    backing_path,
                    provider_slug,
                    file_modified: super::util::parse_timestamp(&file_modified_raw),
                    file_size: u64::try_from(file_size_raw).unwrap_or_default(),
                    last_scanned_at: super::util::parse_timestamp(&last_scanned_at_raw),
                    last_parse_status,
                    read_offset: u64::try_from(read_offset_raw).unwrap_or_default(),
                    append_trust_count: append_trust_count_raw as u32,
                },
            ))
        })
        .map_err(|e| format!("Failed to query scan_state rows: {e}"))?
        .collect::<SqliteResult<Vec<_>>>()
        .map_err(|e| format!("Failed to collect scan_state rows: {e}"))?;

    Ok(rows.into_iter().collect())
}

pub fn upsert_scan_state(
    conn: &Connection,
    path: &str,
    backing_path: &str,
    provider_slug: &str,
    file_modified: DateTime<Utc>,
    file_size: u64,
    last_parse_status: &str,
) -> Result<(), String> {
    conn.execute(
        "INSERT INTO scan_state (
            path, backing_path, provider_slug, file_modified, file_size, last_scanned_at, last_parse_status
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(path) DO UPDATE SET
            backing_path = excluded.backing_path,
            provider_slug = excluded.provider_slug,
            file_modified = excluded.file_modified,
            file_size = excluded.file_size,
            last_scanned_at = excluded.last_scanned_at,
            last_parse_status = excluded.last_parse_status",
        params![
            path,
            backing_path,
            provider_slug,
            file_modified.to_rfc3339(),
            i64::try_from(file_size).unwrap_or(i64::MAX),
            Utc::now().to_rfc3339(),
            last_parse_status,
        ],
    )
    .map_err(|e| format!("Failed to upsert scan_state for {path}: {e}"))?;
    Ok(())
}

pub fn update_scan_state_offset_and_trust(
    conn: &Connection,
    path: &str,
    read_offset: u64,
    append_trust_count: u32,
) -> Result<(), String> {
    conn.execute(
        "UPDATE scan_state SET
            read_offset = ?1,
            append_trust_count = ?2
         WHERE path = ?3",
        params![
            i64::try_from(read_offset).unwrap_or(i64::MAX),
            append_trust_count as i64,
            path,
        ],
    )
    .map_err(|e| format!("Failed to update scan_state trust for {path}: {e}"))?;
    Ok(())
}

pub fn upsert_scan_state_for_session(
    conn: &Connection,
    session: &SessionInfo,
    file_modified: DateTime<Utc>,
    last_parse_status: &str,
) -> Result<(), String> {
    let path = Path::new(&session.path);
    let backing_path = crate::domain::session_bridge::backing_file_path(path);
    let file_size = fs::metadata(&backing_path)
        .map(|metadata| metadata.len())
        .unwrap_or(0);
    let provider_slug = crate::domain::session_bridge::source_from_path(path)
        .map(|source| source.slug().replace('_', "-"))
        .unwrap_or_else(|| "pi".to_string());

    upsert_scan_state(
        conn,
        &session.path,
        &backing_path.to_string_lossy(),
        &provider_slug,
        file_modified,
        file_size,
        last_parse_status,
    )
}

pub fn delete_scan_state(conn: &Connection, path: &str) -> Result<(), String> {
    conn.execute("DELETE FROM scan_state WHERE path = ?1", params![path])
        .map_err(|e| format!("Failed to delete scan_state for {path}: {e}"))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scan_state_round_trip_works() {
        let temp = tempfile::tempdir().expect("tempdir");
        let db_path = temp.path().join("sessions.db");
        let conn =
            crate::data::sqlite::init_db_with_path(&db_path, &Config::default()).expect("db");
        let now = Utc::now();

        upsert_scan_state(
            &conn,
            "/tmp/session.jsonl",
            "/tmp/session.jsonl",
            "pi",
            now,
            123,
            "ok",
        )
        .expect("upsert scan_state");

        let states = get_all_scan_state(&conn).expect("load scan_state");
        let entry = states.get("/tmp/session.jsonl").expect("entry");
        assert_eq!(entry.provider_slug, "pi");
        assert_eq!(entry.file_size, 123);
        assert_eq!(entry.last_parse_status, "ok");
        assert_eq!(entry.read_offset, 0);
        assert_eq!(entry.append_trust_count, 0);

        update_scan_state_offset_and_trust(&conn, "/tmp/session.jsonl", 456, 3)
            .expect("update trust");
        let states_after = get_all_scan_state(&conn).expect("load scan_state after trust update");
        let entry_after = states_after.get("/tmp/session.jsonl").expect("entry");
        assert_eq!(entry_after.read_offset, 456);
        assert_eq!(entry_after.append_trust_count, 3);

        delete_scan_state(&conn, "/tmp/session.jsonl").expect("delete scan_state");
        let states_deleted = get_all_scan_state(&conn).expect("load scan_state after delete");
        assert!(!states_deleted.contains_key("/tmp/session.jsonl"));
    }
}
