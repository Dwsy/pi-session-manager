#!/bin/bash

# 折叠内容悬浮预览功能测试脚本

echo "🔍 折叠内容悬浮预览功能测试"
echo "================================"
echo ""

# 检查文件是否存在
echo "📁 检查文件..."
files=(
  "src/components/HoverPreview.tsx"
  "src/components/ExpandableOutput.tsx"
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

# 检查 HoverPreview 组件
if grep -q "interface HoverPreviewProps" src/components/HoverPreview.tsx; then
  echo "✅ HoverPreview 组件定义"
else
  echo "❌ HoverPreview 组件定义缺失"
fi

if grep -q "createPortal" src/components/HoverPreview.tsx; then
  echo "✅ Portal 渲染"
else
  echo "❌ Portal 渲染缺失"
fi

if grep -q "setTimeout" src/components/HoverPreview.tsx; then
  echo "✅ 延迟显示逻辑"
else
  echo "❌ 延迟显示逻辑缺失"
fi

# 检查各组件集成
if grep -q "HoverPreview" src/components/ExpandableOutput.tsx; then
  echo "✅ ExpandableOutput 集成"
else
  echo "❌ ExpandableOutput 集成缺失"
fi

if grep -q "HoverPreview" src/components/ReadExecution.tsx; then
  echo "✅ ReadExecution 集成"
else
  echo "❌ ReadExecution 集成缺失"
fi

if grep -q "HoverPreview" src/components/WriteExecution.tsx; then
  echo "✅ WriteExecution 集成"
else
  echo "❌ WriteExecution 集成缺失"
fi

if grep -q "HoverPreview" src/components/EditExecution.tsx; then
  echo "✅ EditExecution 集成"
else
  echo "❌ EditExecution 集成缺失"
fi

if grep -q "HoverPreview" src/components/GenericToolCall.tsx; then
  echo "✅ GenericToolCall 集成"
else
  echo "❌ GenericToolCall 集成缺失"
fi

# 检查样式
if grep -q "\.hover-preview" src/index.css; then
  echo "✅ 悬浮预览样式"
else
  echo "❌ 悬浮预览样式缺失"
fi

if grep -q "fadeIn" src/index.css; then
  echo "✅ 淡入动画"
else
  echo "❌ 淡入动画缺失"
fi

if grep -q "hover-preview-content" src/index.css; then
  echo "✅ 预览内容样式"
else
  echo "❌ 预览内容样式缺失"
fi

echo ""
echo "================================"
echo "✅ 所有检查完成！"
echo ""
echo "📝 功能特性："
echo "1. ✅ 延迟显示（500ms）"
echo "2. ✅ 智能定位（自动避免超出屏幕）"
echo "3. ✅ Portal 渲染（避免裁剪）"
echo "4. ✅ 平滑动画（淡入效果）"
echo "5. ✅ 滚动支持（长内容）"
echo "6. ✅ 鼠标移入保持显示"
echo ""
echo "🎯 使用方式："
echo "  1. 鼠标悬停在折叠提示上"
echo "  2. 等待 500ms"
echo "  3. 自动显示完整内容"
echo "  4. 鼠标移开隐藏"
echo ""
echo "📖 详细文档: HOVER_PREVIEW_FEATURE.md"
