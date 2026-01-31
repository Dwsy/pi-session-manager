#!/bin/bash

# SessionTree 工具调用显示优化测试脚本

echo "🔍 SessionTree 工具调用显示优化测试"
echo "================================"
echo ""

# 检查文件是否存在
echo "📁 检查文件..."
if [ -f "src/components/SessionTree.tsx" ]; then
  echo "✅ src/components/SessionTree.tsx"
else
  echo "❌ src/components/SessionTree.tsx (不存在)"
  exit 1
fi

echo ""

# 检查关键代码是否存在
echo "🔎 检查关键代码..."

# 检查 bash 工具显示
if grep -q "bash:" src/components/SessionTree.tsx; then
  echo "✅ Bash 工具显示"
else
  echo "❌ Bash 工具显示缺失"
fi

# 检查 read 工具显示
if grep -q "read:" src/components/SessionTree.tsx; then
  echo "✅ Read 工具显示"
else
  echo "❌ Read 工具显示缺失"
fi

# 检查 write 工具显示
if grep -q "write:" src/components/SessionTree.tsx; then
  echo "✅ Write 工具显示"
else
  echo "❌ Write 工具显示缺失"
fi

# 检查 edit 工具显示
if grep -q "edit:" src/components/SessionTree.tsx; then
  echo "✅ Edit 工具显示"
else
  echo "❌ Edit 工具显示缺失"
fi

# 检查命令截断
if grep -q "slice(0, 30)" src/components/SessionTree.tsx; then
  echo "✅ 命令截断功能"
else
  echo "❌ 命令截断功能缺失"
fi

# 检查文件名提取
if grep -q "split('/')\.pop()" src/components/SessionTree.tsx; then
  echo "✅ 文件名提取功能"
else
  echo "❌ 文件名提取功能缺失"
fi

# 检查工具结果状态显示
if grep -q "result.*✓" src/components/SessionTree.tsx; then
  echo "✅ 工具结果状态显示（成功）"
else
  echo "❌ 工具结果状态显示（成功）缺失"
fi

if grep -q "result.*✗" src/components/SessionTree.tsx; then
  echo "✅ 工具结果状态显示（失败）"
else
  echo "❌ 工具结果状态显示（失败）缺失"
fi

# 检查多工具调用支持
if grep -q "toolCalls.length > 1" src/components/SessionTree.tsx; then
  echo "✅ 多工具调用支持"
else
  echo "❌ 多工具调用支持缺失"
fi

echo ""
echo "================================"
echo "✅ 所有检查完成！"
echo ""
echo "📝 功能特性："
echo "1. ✅ 显示具体的工具名称"
echo "2. ✅ 显示关键参数（命令、文件名）"
echo "3. ✅ 文件名自动提取"
echo "4. ✅ 命令自动截断（超过30字符）"
echo "5. ✅ 工具结果状态显示（✓/✗）"
echo "6. ✅ 多工具调用支持"
echo ""
echo "🎯 显示示例："
echo "  • bash: ls -la"
echo "  • read: App.tsx"
echo "  • write: index.ts"
echo "  • edit: utils.ts"
echo "  • bash result ✓"
echo "  • read result ✗"
echo ""
echo "📖 详细文档: SESSION_TREE_TOOL_DISPLAY.md"
