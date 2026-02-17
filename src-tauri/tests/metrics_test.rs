use pi_session_manager::metrics;
use std::time::Duration;

#[test]
fn test_metrics_render() {
    // Set known values
    metrics::set_message_entries_count(42);
    metrics::set_write_buffer_sessions_size(5);
    metrics::set_write_buffer_details_size(9);
    metrics::inc_search_queries();
    metrics::inc_search_queries();
    metrics::inc_search_queries();
    metrics::add_search_results(15);
    metrics::record_search_latency(Duration::from_millis(500));

    let output = metrics::render();

    // Verify presence of metrics with correct values
    assert!(output.contains("search_queries_total 3"));
    assert!(output.contains("search_results_total 15"));
    assert!(output.contains("write_buffer_sessions_size 5"));
    assert!(output.contains("write_buffer_details_size 9"));
    assert!(output.contains("message_entries_count 42"));
    assert!(output.contains("search_latency_ns_count 1"));
    assert!(output.contains("search_latency_ns_sum "));
    // HELP and TYPE lines
    assert!(output.contains("# HELP search_queries_total"));
    assert!(output.contains("# TYPE search_queries_total counter"));
    assert!(output.contains("# HELP search_results_total"));
}
