#!/usr/bin/env bun

import { $ } from "bun";
import { join, dirname } from "path";

const root = join(dirname(import.meta.path), "..");
process.chdir(root);

console.log("📦 Building pi-session-cli...");
console.log("═══════════════════════════════════════");

// Step 1: Build frontend
console.log("→ Building frontend...");
await $`npm ci --silent`;
await $`npm run build`;

// Step 2: Build Rust CLI (rust-embed reads ../dist/)
console.log("→ Building CLI binary...");
await $`cd src-tauri-cli && cargo build --release`;

const binary = join(root, "target/release/pi-session-cli");
const stat = Bun.file(binary);
const size = (stat.size / 1024 / 1024).toFixed(1);

console.log("");
console.log("═══════════════════════════════════════");
console.log(`✅ Build successful!`);
console.log(`   Binary: ${binary} (${size}MB)`);
console.log("");
console.log("Run locally:");
console.log(`   ${binary}`);
console.log("");
console.log("Deploy to server:");
console.log(`   rsync -avz ${binary} user@host:/usr/local/bin/`);
