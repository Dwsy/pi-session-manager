use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};

// Atomic metrics storage
static SEARCH_QUERIES_TOTAL: AtomicU64 = AtomicU64::new(0);
static SEARCH_RESULTS_TOTAL: AtomicU64 = AtomicU64::new(0);
static SEARCH_LATENCY_NANOS_SUM: AtomicU64 = AtomicU64::new(0);
static SEARCH_LATENCY_COUNT: AtomicU64 = AtomicU64::new(0);
static DB_CORRUPTION_RECOVERY_TOTAL: AtomicU64 = AtomicU64::new(0);
static WRITE_BUFFER_SESSIONS_SIZE: AtomicUsize = AtomicUsize::new(0);
static WRITE_BUFFER_DETAILS_SIZE: AtomicUsize = AtomicUsize::new(0);
static MESSAGE_ENTRIES_COUNT: AtomicU64 = AtomicU64::new(0);

/// Increment total search queries counter.
pub fn inc_search_queries() {
    SEARCH_QUERIES_TOTAL.fetch_add(1, Ordering::Relaxed);
}

/// Add to total search results count.
pub fn add_search_results(count: usize) {
    SEARCH_RESULTS_TOTAL.fetch_add(count as u64, Ordering::Relaxed);
}

/// Record search latency in nanoseconds.
pub fn record_search_latency(dur: std::time::Duration) {
    let nanos = dur.as_nanos() as u64;
    SEARCH_LATENCY_NANOS_SUM.fetch_add(nanos, Ordering::Relaxed);
    SEARCH_LATENCY_COUNT.fetch_add(1, Ordering::Relaxed);
}

/// Increment database corruption recovery counter.
pub fn inc_corruption_recovery() {
    DB_CORRUPTION_RECOVERY_TOTAL.fetch_add(1, Ordering::Relaxed);
}

/// Set current write buffer sessions size (gauge).
pub fn set_write_buffer_sessions_size(size: usize) {
    WRITE_BUFFER_SESSIONS_SIZE.store(size, Ordering::Relaxed);
}

/// Set current write buffer details size (gauge).
pub fn set_write_buffer_details_size(size: usize) {
    WRITE_BUFFER_DETAILS_SIZE.store(size, Ordering::Relaxed);
}

/// Set current message_entries count (gauge).
pub fn set_message_entries_count(count: u64) {
    MESSAGE_ENTRIES_COUNT.store(count, Ordering::Relaxed);
}

/// Render all metrics in Prometheus text format.
pub fn render() -> String {
    let mut out = String::new();

    out.push_str("# HELP search_queries_total Total number of search queries\n");
    out.push_str("# TYPE search_queries_total counter\n");
    out.push_str(&format!(
        "search_queries_total {}\n",
        SEARCH_QUERIES_TOTAL.load(Ordering::Relaxed)
    ));

    out.push_str("# HELP search_results_total Total number of search results returned\n");
    out.push_str("# TYPE search_results_total counter\n");
    out.push_str(&format!(
        "search_results_total {}\n",
        SEARCH_RESULTS_TOTAL.load(Ordering::Relaxed)
    ));

    out.push_str("# HELP search_latency_ns_sum Sum of search latency in nanoseconds\n");
    out.push_str("# TYPE search_latency_ns_sum counter\n");
    out.push_str(&format!(
        "search_latency_ns_sum {}\n",
        SEARCH_LATENCY_NANOS_SUM.load(Ordering::Relaxed)
    ));
    out.push_str("# TYPE search_latency_ns_count counter\n");
    out.push_str(&format!(
        "search_latency_ns_count {}\n",
        SEARCH_LATENCY_COUNT.load(Ordering::Relaxed)
    ));

    out.push_str("# HELP db_corruption_recovery_total Number of times database corruption recovery was triggered\n");
    out.push_str("# TYPE db_corruption_recovery_total counter\n");
    out.push_str(&format!(
        "db_corruption_recovery_total {}\n",
        DB_CORRUPTION_RECOVERY_TOTAL.load(Ordering::Relaxed)
    ));

    out.push_str("# HELP write_buffer_sessions_size Current number of sessions in write buffer\n");
    out.push_str("# TYPE write_buffer_sessions_size gauge\n");
    out.push_str(&format!(
        "write_buffer_sessions_size {}\n",
        WRITE_BUFFER_SESSIONS_SIZE.load(Ordering::Relaxed)
    ));

    out.push_str("# HELP write_buffer_details_size Current number of details in write buffer\n");
    out.push_str("# TYPE write_buffer_details_size gauge\n");
    out.push_str(&format!(
        "write_buffer_details_size {}\n",
        WRITE_BUFFER_DETAILS_SIZE.load(Ordering::Relaxed)
    ));

    out.push_str(
        "# HELP message_entries_count Current number of entries in message_entries index\n",
    );
    out.push_str("# TYPE message_entries_count gauge\n");
    out.push_str(&format!(
        "message_entries_count {}\n",
        MESSAGE_ENTRIES_COUNT.load(Ordering::Relaxed)
    ));

    out
}
