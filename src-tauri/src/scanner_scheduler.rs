use crate::config::Config;
use crate::scanner;
use crate::sqlite_cache;
use chrono::{DateTime, Duration, Utc};
use std::fs;
use std::path::PathBuf;
use tokio::time::{interval, Duration as TokioDuration};
use tracing::{error, info};

pub struct ScannerScheduler {
    sessions_dir: PathBuf,
    scan_interval: TokioDuration,
    config: Config,
}

impl ScannerScheduler {
    pub fn new(sessions_dir: PathBuf, scan_interval_secs: u64, config: Config) -> Self {
        Self {
            sessions_dir,
            scan_interval: TokioDuration::from_secs(scan_interval_secs),
            config,
        }
    }

    pub async fn start(&self) {
        info!(
            "Starting scanner scheduler with {}s interval",
            self.scan_interval.as_secs()
        );
        let mut ticker = interval(self.scan_interval);
        ticker.tick().await;

        loop {
            ticker.tick().await;
            if let Err(e) = self.scan_and_update().await {
                error!("Scanner error: {}", e);
            }

            if let Err(e) = self.auto_cleanup().await {
                error!("Auto cleanup error: {}", e);
            }
        }
    }

    async fn scan_and_update(&self) -> Result<String, String> {
        let start = std::time::Instant::now();

        let conn = sqlite_cache::init_db_with_config(&self.config)?;

        let mut updated = 0;
        let mut added = 0;
        let mut skipped = 0;

        if let Ok(entries) = fs::read_dir(&self.sessions_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    if let Ok(files) = fs::read_dir(&path) {
                        for file in files.flatten() {
                            let file_path = file.path();
                            if file_path
                                .extension()
                                .map(|ext| ext == "jsonl")
                                .unwrap_or(false)
                            {
                                match self.process_file(&conn, &file_path)? {
                                    FileUpdateResult::Updated => updated += 1,
                                    FileUpdateResult::Added => added += 1,
                                    FileUpdateResult::Skipped => skipped += 1,
                                }
                            }
                        }
                    }
                }
            }
        }

        let elapsed = start.elapsed();
        info!(
            "Scanner complete: +{} added, ~{} updated, {} skipped in {:?}",
            added, updated, skipped, elapsed
        );

        Ok(format!(
            "Scanned: +{} added, ~{} updated, {} skipped",
            added, updated, skipped
        ))
    }

    fn process_file(
        &self,
        conn: &rusqlite::Connection,
        file_path: &std::path::Path,
    ) -> Result<FileUpdateResult, String> {
        let path_str = file_path.to_string_lossy().to_string();

        let metadata =
            fs::metadata(file_path).map_err(|e| format!("Failed to get metadata: {}", e))?;
        let file_modified = DateTime::from(
            metadata
                .modified()
                .map_err(|e| format!("Failed to get modified time: {}", e))?,
        );

        let cached_mtime = sqlite_cache::get_cached_file_modified(conn, &path_str)?;

        if let Some(cached) = cached_mtime {
            if file_modified <= cached {
                return Ok(FileUpdateResult::Skipped);
            }
        }

        if let Ok(session) = scanner::parse_session_info(file_path) {
            sqlite_cache::upsert_session(conn, &session, file_modified)?;
            return Ok(if cached_mtime.is_some() {
                FileUpdateResult::Updated
            } else {
                FileUpdateResult::Added
            });
        }

        Ok(FileUpdateResult::Skipped)
    }

    async fn auto_cleanup(&self) -> Result<String, String> {
        if let Some(cleanup_days) = self.config.auto_cleanup_days {
            let _cutoff = Utc::now() - Duration::days(cleanup_days);

            let conn = sqlite_cache::init_db_with_config(&self.config)?;
            let deleted = sqlite_cache::cleanup_missing_files(&conn)?;

            if deleted > 0 {
                info!("Auto cleanup: removed {} missing session records", deleted);
            }

            return Ok(format!("Auto cleanup: {} records removed", deleted));
        }

        Ok("Auto cleanup: disabled".to_string())
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileUpdateResult {
    Added,
    Updated,
    Skipped,
}

pub fn start_background_scanner(sessions_dir: PathBuf, interval_secs: u64) {
    let config = Config::load().unwrap_or_default();

    tokio::spawn(async move {
        let scheduler = ScannerScheduler::new(sessions_dir, interval_secs, config);
        scheduler.start().await;
    });
}
