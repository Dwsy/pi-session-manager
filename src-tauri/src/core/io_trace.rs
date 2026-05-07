//! IO & DB diagnostic tracing.
//!
//! Logs every file read/write and SQLite operation to a dedicated log file
//! for diagnosing IO hotspots. Controlled by `PSM_IO_TRACE=1` env var.
//!
//! Log format (TSV): timestamp\tkind\tdetail\tbytes\tduration_us

use std::fs::OpenOptions;
use std::io::Write;
use std::sync::OnceLock;
use std::time::{Duration, Instant};

static ENABLED: OnceLock<bool> = OnceLock::new();

fn is_enabled() -> bool {
    *ENABLED.get_or_init(|| std::env::var("PSM_IO_TRACE").is_ok_and(|v| v == "1" || v == "true"))
}

fn log_path() -> std::path::PathBuf {
    dirs::data_local_dir().unwrap_or_else(|| std::path::PathBuf::from("/tmp")).join("pi-session-manager").join("io_trace.tsv")
}

fn write_line(kind: &str, detail: &str, bytes: u64, duration: Duration) {
    if !is_enabled() {
        return;
    }
    let path = log_path();
    let Ok(mut f) = OpenOptions::new().create(true).append(true).open(&path) else {
        return;
    };
    let ts = chrono::Local::now().format("%H:%M:%S%.3f");
    let _ = writeln!(f, "{ts}\t{kind}\t{detail}\t{bytes}\t{}", duration.as_micros());
}

/// Record a file read operation.
pub fn trace_file_read(path: &str, bytes: u64, duration: Duration) {
    write_line("READ", path, bytes, duration);
}

/// Record a file write operation.
pub fn trace_file_write(path: &str, bytes: u64, duration: Duration) {
    write_line("WRITE", path, bytes, duration);
}

/// Record a file seek+read (incremental).
pub fn trace_file_seek_read(path: &str, offset: u64, bytes: u64, duration: Duration) {
    let detail = format!("{path}@{offset}");
    write_line("SEEK_READ", &detail, bytes, duration);
}

/// Record a DB operation.
pub fn trace_db(op: &str, detail: &str, rows: usize, duration: Duration) {
    write_line(&format!("DB:{op}"), detail, rows as u64, duration);
}

/// Record a scan event summary.
pub fn trace_scan(event: &str, detail: &str) {
    write_line("SCAN", &format!("{event}: {detail}"), 0, Duration::ZERO);
}

/// Convenience wrapper: time a closure and trace it as a DB op.
pub fn traced_db<F, R>(op: &str, detail: &str, f: F) -> R
where
    F: FnOnce() -> R,
{
    let start = Instant::now();
    let result = f();
    let elapsed = start.elapsed();
    trace_db(op, detail, 0, elapsed);
    result
}

/// Get IO trace log file path.
pub fn trace_log_path() -> std::path::PathBuf {
    log_path()
}
