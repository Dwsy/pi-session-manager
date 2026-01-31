#!/bin/bash

# Session Viewer 搜索功能测试脚本

echo "🔍 Session Viewer 搜索功能测试"
echo "================================"
echo ""

# 检查文件是否存在
echo "📁 检查文件..."
files=(
  "src/components/SearchBar.tsx"
  "src/utils/search.ts"
  "src/components/SessionViewer.tsx"
  "src/components/UserMessage.tsx"
  "src/components/AssistantMessage.tsx"
  "src/components/MarkdownContent.tsx"
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

# 检查 SearchBar 组件
if grep -q "interface SearchBarProps" src/components/SearchBar.tsx; then
  echo "✅ SearchBar 组件定义"
else
  echo "❌ SearchBar 组件定义缺失"
fi

# 检查搜索工具函数
if grep -q "highlightSearchInHTML" src/utils/search.ts; then
  echo "✅ highlightSearchInHTML 函数"
else
  echo "❌ highlightSearchInHTML 函数缺失"
fi

if grep -q "containsSearchQuery" src/utils/search.ts; then
  echo "✅ containsSearchQuery 函数"
else
  echo "❌ containsSearchQuery 函数缺失"
fi

# 检查 SessionViewer 中的搜索状态
if grep -q "showSearch" src/components/SessionViewer.tsx; then
  echo "✅ SessionViewer 搜索状态"
else
  echo "❌ SessionViewer 搜索状态缺失"
fi

# 检查快捷键监听
if grep -q "metaKey.*ctrlKey.*key.*f" src/components/SessionViewer.tsx; then
  echo "✅ 快捷键监听 (cmd+f / ctrl+f)"
else
  echo "❌ 快捷键监听缺失"
fi

# 检查 UserMessage 中的 searchQuery 参数
if grep -q "searchQuery" src/components/UserMessage.tsx; then
  echo "✅ UserMessage searchQuery 参数"
else
  echo "❌ UserMessage searchQuery 参数缺失"
fi

# 检查 AssistantMessage 中的 searchQuery 参数
if grep -q "searchQuery" src/components/AssistantMessage.tsx; then
  echo "✅ AssistantMessage searchQuery 参数"
else
  echo "❌ AssistantMessage searchQuery 参数缺失"
fi

# 检查样式
if grep -q "search-bar" src/styles/session.css; then
  echo "✅ 搜索栏样式"
else
  echo "❌ 搜索栏样式缺失"
fi

if grep -q "search-highlight" src/styles/session.css; then
  echo "✅ 搜索高亮样式"
else
  echo "❌ 搜索高亮样式缺失"
fi

# 检查翻译
if grep -q "placeholder.*Search in session" src/i18n/locales/en-US.ts; then
  echo "✅ 英文翻译"
else
  echo "❌ 英文翻译缺失"
fi

if grep -q "placeholder.*在会话中搜索" src/i18n/locales/zh-CN.ts; then
  echo "✅ 中文翻译"
else
  echo "❌ 中文翻译缺失"
fi

echo ""
echo "================================"
echo "✅ 所有检查完成！"
echo ""
echo "📝 使用说明："
echo "1. 按 Cmd+F (macOS) 或 Ctrl+F (Windows/Linux) 打开搜索"
echo "2. 输入关键词进行搜索"
echo "3. 使用 Enter / Shift+Enter 导航结果"
echo "4. 按 Esc 关闭搜索"
echo ""
echo "📖 详细文档: SEARCH_FEATURE.md"
