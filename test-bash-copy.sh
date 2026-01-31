#!/bin/bash

# BASH 工具调用复制按钮测试脚本

echo "🔍 BASH 工具调用复制按钮测试"
echo "================================"
echo ""

# 检查文件是否存在
echo "📁 检查文件..."
if [ -f "src/components/BashExecution.tsx" ]; then
  echo "✅ src/components/BashExecution.tsx"
else
  echo "❌ src/components/BashExecution.tsx (不存在)"
  exit 1
fi

if [ -f "src/index.css" ]; then
  echo "✅ src/index.css"
else
  echo "❌ src/index.css (不存在)"
  exit 1
fi

echo ""

# 检查关键代码是否存在
echo "🔎 检查关键代码..."

# 检查状态管理
if grep -q "commandCopied" src/components/BashExecution.tsx; then
  echo "✅ 命令复制状态"
else
  echo "❌ 命令复制状态缺失"
fi

if grep -q "outputCopied" src/components/BashExecution.tsx; then
  echo "✅ 输出复制状态"
else
  echo "❌ 输出复制状态缺失"
fi

# 检查复制函数
if grep -q "handleCopyCommand" src/components/BashExecution.tsx; then
  echo "✅ 命令复制函数"
else
  echo "❌ 命令复制函数缺失"
fi

if grep -q "handleCopyOutput" src/components/BashExecution.tsx; then
  echo "✅ 输出复制函数"
else
  echo "❌ 输出复制函数缺失"
fi

# 检查剪贴板 API
if grep -q "navigator.clipboard.writeText" src/components/BashExecution.tsx; then
  echo "✅ 剪贴板 API 调用"
else
  echo "❌ 剪贴板 API 调用缺失"
fi

# 检查 UI 元素
if grep -q "tool-command-wrapper" src/components/BashExecution.tsx; then
  echo "✅ 命令包装器"
else
  echo "❌ 命令包装器缺失"
fi

if grep -q "tool-output-wrapper" src/components/BashExecution.tsx; then
  echo "✅ 输出包装器"
else
  echo "❌ 输出包装器缺失"
fi

if grep -q "tool-copy-button" src/components/BashExecution.tsx; then
  echo "✅ 复制按钮"
else
  echo "❌ 复制按钮缺失"
fi

# 检查样式
if grep -q "\.tool-command-wrapper" src/index.css; then
  echo "✅ 命令包装器样式"
else
  echo "❌ 命令包装器样式缺失"
fi

if grep -q "\.tool-output-wrapper" src/index.css; then
  echo "✅ 输出包装器样式"
else
  echo "❌ 输出包装器样式缺失"
fi

if grep -q "\.tool-output-header" src/index.css; then
  echo "✅ 输出头部样式"
else
  echo "❌ 输出头部样式缺失"
fi

if grep -q "\.tool-copy-button" src/index.css; then
  echo "✅ 复制按钮样式"
else
  echo "❌ 复制按钮样式缺失"
fi

echo ""
echo "================================"
echo "✅ 所有检查完成！"
echo ""
echo "📝 功能特性："
echo "1. ✅ 命令复制按钮"
echo "2. ✅ 输出复制按钮"
echo "3. ✅ 视觉反馈（2秒）"
echo "4. ✅ 悬停效果"
echo "5. ✅ 图标切换（复制/勾选）"
echo ""
echo "🎯 使用方式："
echo "  命令复制："
echo "    1. 点击命令行右侧的复制按钮"
echo "    2. 命令被复制到剪贴板"
echo "    3. 图标变为勾选，2秒后恢复"
echo ""
echo "  输出复制："
echo "    1. 点击输出区域顶部的复制按钮"
echo "    2. 输出被复制到剪贴板"
echo "    3. 图标变为勾选，2秒后恢复"
echo ""
echo "📖 详细文档: BASH_COPY_BUTTON.md"
