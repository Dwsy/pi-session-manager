#![forbid(unsafe_code)]

//! casr — Cross Agent Session Resumer.
//!
//! Library entry point exposing the public API for session conversion.
//! The binary (`main.rs`) is a thin CLI wrapper around this library.

pub mod discovery;
pub mod error;
pub mod model;
pub mod pipeline;
pub mod providers;
pub mod responses;
