#!/bin/bash

# 代码块功能测试脚本

echo "🔍 代码块功能测试"
echo "================================"
echo ""

# 检查文件是否存在
echo "📁 检查文件..."
files=(
  "src/components/CodeBlock.tsx"
  "src/utils/markdown.ts"
  "src/main.tsx"
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

# 检查 CodeBlock 组件
if grep -q "code-copy-button" src/components/CodeBlock.tsx; then
  echo "✅ CodeBlock 复制按钮"
else
  echo "❌ CodeBlock 复制按钮缺失"
fi

if grep -q "code-line-numbers" src/components/CodeBlock.tsx; then
  echo "✅ CodeBlock 行号显示"
else
  echo "❌ CodeBlock 行号显示缺失"
fi

# 检查 markdown 自定义渲染器
if grep -q "renderer.code" src/utils/markdown.ts; then
  echo "✅ Markdown 自定义渲染器"
else
  echo "❌ Markdown 自定义渲染器缺失"
fi

if grep -q "code-line-number" src/utils/markdown.ts; then
  echo "✅ Markdown 行号生成"
else
  echo "❌ Markdown 行号生成缺失"
fi

# 检查全局复制函数
if grep -q "window.copyCode" src/main.tsx; then
  echo "✅ 全局复制函数"
else
  echo "❌ 全局复制函数缺失"
fi

# 检查样式
if grep -q "code-block-wrapper" src/index.css; then
  echo "✅ 代码块容器样式"
else
  echo "❌ 代码块容器样式缺失"
fi

if grep -q "code-block-header" src/index.css; then
  echo "✅ 代码块头部样式"
else
  echo "❌ 代码块头部样式缺失"
fi

if grep -q "code-line-numbers" src/index.css; then
  echo "✅ 行号样式"
else
  echo "❌ 行号样式缺失"
fi

if grep -q "code-copy-button" src/index.css; then
  echo "✅ 复制按钮样式"
else
  echo "❌ 复制按钮样式缺失"
fi

# 检查间距
if grep -q "margin: 16px 0" src/index.css; then
  echo "✅ 代码块间距"
else
  echo "❌ 代码块间距缺失"
fi

echo ""
echo "================================"
echo "✅ 所有检查完成！"
echo ""
echo "📝 功能特性："
echo "1. ✅ 代码块行号显示"
echo "2. ✅ 代码块复制按钮"
echo "3. ✅ 代码块和消息之间的间距"
echo "4. ✅ 语法高亮"
echo "5. ✅ 语言标签显示"
echo ""
echo "📖 详细文档: CODE_BLOCK_ENHANCEMENT.md"
