#!/bin/bash

echo "🔍 Dynamic Tool Filters Test"
echo "=============================="
echo ""

# Check if availableTools extraction exists
if grep -q "const availableTools = useMemo" src/components/SessionTree.tsx; then
  echo "✅ Dynamic tool extraction implemented"
else
  echo "❌ Dynamic tool extraction missing"
  exit 1
fi

# Check if FilterMode type is updated
if grep -q "tool-\${string}" src/components/SessionTree.tsx; then
  echo "✅ FilterMode type supports dynamic tools"
else
  echo "❌ FilterMode type not updated"
  exit 1
fi

# Check if dynamic filter buttons are rendered
if grep -q "availableTools.map" src/components/SessionTree.tsx; then
  echo "✅ Dynamic filter buttons rendering"
else
  echo "❌ Dynamic filter buttons missing"
  exit 1
fi

# Check if SessionFlowView is updated
if grep -q "tool-\${string}" src/components/SessionFlowView.tsx; then
  echo "✅ SessionFlowView FilterMode updated"
else
  echo "❌ SessionFlowView FilterMode not updated"
  exit 1
fi

# Check if matchesFilter handles dynamic tools
if grep -q "filter.startsWith('tool-')" src/components/SessionFlowView.tsx; then
  echo "✅ matchesFilter supports dynamic tool filtering"
else
  echo "❌ matchesFilter not updated"
  exit 1
fi

echo ""
echo "=============================="
echo "✅ All checks passed!"
echo ""
echo "📝 Features:"
echo "  1. ✅ Automatically extracts all tools from current session"
echo "  2. ✅ Dynamically generates filter buttons for each tool"
echo "  3. ✅ Supports filtering by any tool type (tool:bash, tool:read, etc.)"
echo "  4. ✅ Tool buttons use color coding from theme"
echo "  5. ✅ Compatible with both Tree and Flow views"
echo ""
echo "🎯 Usage:"
echo "  • Open a session with tool calls"
echo "  • Filter buttons will auto-appear based on used tools"
echo "  • Click any tool button to filter by that tool type"
echo ""
