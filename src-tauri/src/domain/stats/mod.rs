//! Stats domain module
//!
//! Organized as:
//! - types.rs: All stats-related types
//! - aggregator.rs: Core stats aggregation logic
//! - heatmap.rs: Heatmap and time distribution generation
//! - day_stats.rs: Day-specific statistics

pub mod aggregator;
pub mod day_stats;
pub mod heatmap;
pub mod types;

pub use aggregator::*;
pub use day_stats::*;
pub use heatmap::*;
pub use types::*;
