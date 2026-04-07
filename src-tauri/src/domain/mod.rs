//! Domain layer: core business logic extracted from commands
//!
//! Structure:
//! - model_config/: Model configuration management
//! - terminal/: External terminal launching logic
//! - stats/: Statistics aggregation

pub mod model_config;
pub mod session_list;
pub mod stats;
pub mod terminal;
