#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "📦 Building pi-session-cli..."
echo "═══════════════════════════════════════"

echo "→ Building frontend..."
pnpm install --frozen-lockfile
pnpm run build

echo "→ Building CLI binary..."
cd src-tauri-cli && cargo build --release && cd ..

BINARY="$(pwd)/target/release/pi-session-cli"
SIZE=$(du -m "$BINARY" | cut -f1)

echo ""
echo "═══════════════════════════════════════"
echo "✅ Build successful!"
echo "   Binary: $BINARY (${SIZE}MB)"
echo ""
echo "Run locally:"
echo "   $BINARY"
echo ""
echo "Deploy to server:"
echo "   rsync -avz $BINARY user@host:/usr/local/bin/"
