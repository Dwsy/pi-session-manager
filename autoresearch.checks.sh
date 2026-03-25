#!/usr/bin/env bash
set -euo pipefail

cargo test --manifest-path src-tauri/Cargo.toml --test full_text_search_command_test --quiet
cargo test --manifest-path src-tauri/Cargo.toml --test full_text_search_integration_test --quiet
cargo test --manifest-path src-tauri/Cargo.toml --test migration_test --quiet
