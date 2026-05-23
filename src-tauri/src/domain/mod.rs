//! Domain layer: core business logic extracted from commands
//!
//! Structure:
//! - model_config/: Model configuration management
//! - terminal/: External terminal launching logic
//! - stats/: Statistics aggregation

pub mod casr_min;
pub mod datasets;
pub mod model_config;
pub mod pi_session;
pub mod session_bridge;
pub mod session_list;
pub mod session_sidechat;
pub mod session_summary;
pub mod stats;
pub mod terminal;
pub mod trace;
pub mod workspaces;
