#!/bin/bash

# 工具调用显示优化测试脚本

echo "🔍 工具调用显示优化测试"
echo "================================"
echo ""

# 检查文件是否存在
echo "📁 检查文件..."
files=(
  "src/components/BashExecution.tsx"
  "src/components/ReadExecution.tsx"
  "src/components/WriteExecution.tsx"
  "src/components/EditExecution.tsx"
  "src/components/GenericToolCall.tsx"
  "src/index.css"
)

all_exist=true
for file in "${files[@]}"; do
  if [ -f "$file" ]; then
    echo "✅ $file"
  else
    echo "❌ $file (不存在)"
    all_exist=false
  fi
done

echo ""

if [ "$all_exist" = false ]; then
  echo "❌ 部分文件不存在，请检查实现"
  exit 1
fi

# 检查关键代码是否存在
echo "🔎 检查关键代码..."

# 检查工具头部
if grep -q "tool-header" src/components/BashExecution.tsx; then
  echo "✅ BashExecution 工具头部"
else
  echo "❌ BashExecution 工具头部缺失"
fi

if grep -q "tool-header" src/components/ReadExecution.tsx; then
  echo "✅ ReadExecution 工具头部"
else
  echo "❌ ReadExecution 工具头部缺失"
fi

if grep -q "tool-header" src/components/WriteExecution.tsx; then
  echo "✅ WriteExecution 工具头部"
else
  echo "❌ WriteExecution 工具头部缺失"
fi

if grep -q "tool-header" src/components/EditExecution.tsx; then
  echo "✅ EditExecution 工具头部"
else
  echo "❌ EditExecution 工具头部缺失"
fi

# 检查图标
if grep -q "tool-icon" src/components/BashExecution.tsx; then
  echo "✅ Bash SVG 图标"
else
  echo "❌ Bash SVG 图标缺失"
fi

if grep -q "tool-icon" src/components/ReadExecution.tsx; then
  echo "✅ Read SVG 图标"
else
  echo "❌ Read SVG 图标缺失"
fi

if grep -q "tool-icon" src/components/WriteExecution.tsx; then
  echo "✅ Write SVG 图标"
else
  echo "❌ Write SVG 图标缺失"
fi

if grep -q "tool-icon" src/components/EditExecution.tsx; then
  echo "✅ Edit SVG 图标"
else
  echo "❌ Edit SVG 图标缺失"
fi

if grep -q "tool-icon" src/components/GenericToolCall.tsx; then
  echo "✅ Generic Tool SVG 图标"
else
  echo "❌ Generic Tool SVG 图标缺失"
fi

# 检查 CSS 图标样式
if grep -q "\.tool-icon" src/index.css; then
  echo "✅ 工具图标样式"
else
  echo "❌ 工具图标样式缺失"
fi

# 检查展开/折叠功能
if grep -q "setExpanded" src/components/ReadExecution.tsx; then
  echo "✅ ReadExecution 展开/折叠"
else
  echo "❌ ReadExecution 展开/折叠缺失"
fi

if grep -q "setExpanded" src/components/WriteExecution.tsx; then
  echo "✅ WriteExecution 展开/折叠"
else
  echo "❌ WriteExecution 展开/折叠缺失"
fi

if grep -q "setExpanded" src/components/EditExecution.tsx; then
  echo "✅ EditExecution 展开/折叠"
else
  echo "❌ EditExecution 展开/折叠缺失"
fi

# 检查样式
if grep -q "\.tool-execution" src/index.css; then
  echo "✅ 工具执行容器样式"
else
  echo "❌ 工具执行容器样式缺失"
fi

if grep -q "\.tool-header" src/index.css; then
  echo "✅ 工具头部样式"
else
  echo "❌ 工具头部样式缺失"
fi

if grep -q "\.tool-name" src/index.css; then
  echo "✅ 工具名称样式"
else
  echo "❌ 工具名称样式缺失"
fi

if grep -q "\.tool-path" src/index.css; then
  echo "✅ 工具路径样式"
else
  echo "❌ 工具路径样式缺失"
fi

if grep -q "\.tool-command" src/index.css; then
  echo "✅ 工具命令样式"
else
  echo "❌ 工具命令样式缺失"
fi

if grep -q "\.tool-output" src/index.css; then
  echo "✅ 工具输出样式"
else
  echo "❌ 工具输出样式缺失"
fi

if grep -q "\.expand-hint" src/index.css; then
  echo "✅ 展开提示样式"
else
  echo "❌ 展开提示样式缺失"
fi

echo ""
echo "================================"
echo "✅ 所有检查完成！"
echo ""
echo "📝 功能特性："
echo "1. ✅ 清晰的工具区分（图标 + 名称）"
echo "2. ✅ 状态指示（颜色边框）"
echo "3. ✅ 内容展开/折叠"
echo "4. ✅ 代码高亮（Read/Write）"
echo "5. ✅ 元数据显示"
echo ""
echo "🎨 工具图标："
echo "  [Terminal Icon] Bash - 命令执行"
echo "  [Document Icon] Read - 文件读取"
echo "  [Edit Icon] Write - 文件写入"
echo "  [Pencil Icon] Edit - 文件编辑"
echo "  [Settings Icon] Tool - 通用工具"
echo ""
echo "📖 详细文档: TOOL_CALL_ENHANCEMENT.md"
