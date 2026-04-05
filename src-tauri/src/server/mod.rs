#[cfg(feature = "gui")]
pub mod http;
#[cfg(feature = "gui")]
pub mod ws;

#[cfg(feature = "gui")]
pub use http::*;
#[cfg(feature = "gui")]
pub use ws::{init_ws_adapter, WsAdapter};
