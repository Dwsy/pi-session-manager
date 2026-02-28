#!/bin/bash
# 子代理费用功能测试脚本
# 测试 subagent cost 扫描、聚合和统计功能

set -e

echo "========================================="
echo "  Subagent Cost Feature Test Suite"
echo "========================================="
echo ""

cd "$(dirname "$0")/.."

echo "📦 Running unit tests in subagent.rs..."
cargo test --package pi-session-manager --lib subagent::tests --quiet

echo ""
echo "📦 Running integration tests (subagent_cost_test.rs)..."
cargo test --package pi-session-manager --test subagent_cost_test -- --nocapture

echo ""
echo "📦 Running stats tests..."
cargo test --package pi-session-manager --lib stats::tests --quiet

echo ""
echo "========================================="
echo "  ✅ All tests passed!"
echo "========================================="
echo ""
echo "Test Coverage:"
echo "  ✓ Single meta.json parsing"
echo "  ✓ Multiple runs aggregation"
echo "  ✓ Directory scanning"
echo "  ✓ File modification detection"
echo "  ✓ Full integration scanning"
echo "  ✓ Empty directory handling"
echo "  ✓ Multiple session directories"
echo "  ✓ Malformed JSON graceful handling"
echo ""
echo "To run frontend tests:"
echo "  npm run test"
echo ""
