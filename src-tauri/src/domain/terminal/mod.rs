//! Terminal launching module
//!
//! Organized as:
//! - types.rs: Shared types
//! - utils.rs: Cross-platform utilities (path resolution, command building)
//! - launch.rs: Platform-specific terminal launch implementations
//! - api.rs: Public API for commands layer

pub mod types;
pub mod utils;
pub mod launch;
pub mod api;

pub use api::*;
pub use types::*;
pub use utils::*;
