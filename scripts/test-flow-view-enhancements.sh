#!/bin/bash
# Test Flow View Enhancements
# Tests: Interactive Minimap, Zoom Control Default, Hierarchy View

set -e

echo "=== Flow View Enhancements Test ==="
echo ""

# Test 1: Check zoom_hotkeys_enabled is set to false
echo "Test 1: Checking zoom_hotkeys_enabled default value..."
if grep -q "zoom_hotkeys_enabled(false)" src-tauri/src/main.rs; then
    echo "✓ PASS: Zoom hotkeys disabled by default"
else
    echo "✗ FAIL: Zoom hotkeys should be disabled by default"
    exit 1
fi
echo ""

# Test 2: Check MiniMap has draggable prop
echo "Test 2: Checking MiniMap draggable property..."
if grep -q "draggable" src/components/SessionFlowView.tsx; then
    echo "✓ PASS: MiniMap is draggable"
else
    echo "✗ FAIL: MiniMap should be draggable"
    exit 1
fi
echo ""

# Test 3: Check MiniMap has pannable and zoomable props
echo "Test 3: Checking MiniMap pannable/zoomable properties..."
if grep -q "pannable={true}" src/components/SessionFlowView.tsx && grep -q "zoomable={true}" src/components/SessionFlowView.tsx; then
    echo "✓ PASS: MiniMap is pannable and zoomable"
else
    echo "✗ FAIL: MiniMap should be pannable and zoomable"
    exit 1
fi
echo ""

# Test 4: Check hierarchy view mode exists
echo "Test 4: Checking hierarchy view mode..."
if grep -q "'hierarchy'" src/components/SessionTree.tsx; then
    echo "✓ PASS: Hierarchy view mode exists"
else
    echo "✗ FAIL: Hierarchy view mode should exist"
    exit 1
fi
echo ""

# Test 5: Check view mode toggle button
echo "Test 5: Checking view mode toggle in toolbar..."
if grep -q "GitBranch" src/components/SessionFlowView.tsx && grep -q "List" src/components/SessionFlowView.tsx; then
    echo "✓ PASS: View mode toggle buttons exist"
else
    echo "✗ FAIL: View mode toggle buttons should exist"
    exit 1
fi
echo ""

# Test 6: Check CSS enhancements for MiniMap
echo "Test 6: Checking MiniMap CSS enhancements..."
if grep -q "cursor: move" src/styles/flow.css; then
    echo "✓ PASS: MiniMap has cursor: move style"
else
    echo "✗ FAIL: MiniMap should have cursor: move style"
    exit 1
fi
echo ""

# Test 7: TypeScript compilation
echo "Test 7: Running TypeScript compilation..."
if npx tsc --noEmit 2>&1 | grep -q "error TS"; then
    echo "✗ FAIL: TypeScript compilation errors found"
    npx tsc --noEmit
    exit 1
else
    echo "✓ PASS: TypeScript compilation successful"
fi
echo ""

# Test 8: Rust compilation
echo "Test 8: Running Rust compilation check..."
cd src-tauri
if cargo check --quiet 2>&1 | grep -q "error"; then
    echo "✗ FAIL: Rust compilation errors found"
    cargo check
    exit 1
else
    echo "✓ PASS: Rust compilation successful"
fi
cd ..
echo ""

echo "=== All Tests Passed ==="
echo ""
echo "Summary of enhancements:"
echo "  1. ✓ Zoom hotkeys disabled by default (prevents accidental pinch zoom)"
echo "  2. ✓ Interactive MiniMap with draggable viewport"
echo "  3. ✓ MiniMap supports pannable and zoomable"
echo "  4. ✓ Hierarchy view mode for parent-child relationships"
echo "  5. ✓ View mode toggle in toolbar (Flow ↔ Hierarchy)"
echo "  6. ✓ Enhanced CSS styling for MiniMap"
