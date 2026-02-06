//! Service layer for business logic extraction
//!
//! Services contain the core business logic that can be called from both:
//! - Tauri commands (with State<T> injection)
//! - WebSocket adapter (with explicit state passing)

pub mod rpc_service;

pub use rpc_service::*;
