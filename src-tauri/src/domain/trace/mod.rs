//! Trace domain: Ariadne-style session trace extraction from JSONL files.
//!
//! Parses existing Pi session JSONL files and extracts structured trace analytics:
//! per-event timelines, tool call breakdowns, file tracking, token/cost aggregation.
//!
//! Zero new storage: reads directly from Pi session JSONL files under the user's `~/.pi/agent/sessions/` root.

pub mod extractor;
pub mod types;

pub use extractor::{extract_inspect_data, extract_trace_analytics};
pub use types::*;
