//! Stats domain module
//!
//! Organized as:
//! - types.rs: All stats-related types
//! - aggregator.rs: Core stats aggregation logic
//! - heatmap.rs: Heatmap and time distribution generation
//! - day_stats.rs: Day-specific statistics

pub mod types;
pub mod aggregator;
pub mod heatmap;
pub mod day_stats;

pub use types::*;
pub use aggregator::*;
pub use heatmap::*;
pub use day_stats::*;
