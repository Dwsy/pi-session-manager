#!/usr/bin/env bash
set -euo pipefail

mkdir -p src-tauri/examples
cp autoresearch.sql_index_bench.rs src-tauri/examples/sql_index_bench.rs

cargo run \
  --quiet \
  --manifest-path src-tauri/Cargo.toml \
  --no-default-features \
  --features cli \
  --example sql_index_bench \
  -- \
  --runs 5 \
  --sessions 180 \
  --messages 18 \
  --page-size 20
