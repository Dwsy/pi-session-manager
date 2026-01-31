#!/bin/bash

echo "🚀 Pi Session Manager - 侧边栏改进测试"
echo "========================================"
echo ""

# 检查依赖
echo "📦 检查依赖..."
if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装"
    exit 1
fi

if ! command -v cargo &> /dev/null; then
    echo "❌ Rust 未安装"
    exit 1
fi

echo "✅ 依赖检查通过"
echo ""

# 显示改进内容
echo "📋 改进内容:"
echo "  ✅ 树形连接线 (├─, └─, │)"
echo "  ✅ 活动标记 (•, ·)"
echo "  ✅ 统一颜色方案"
echo "  ✅ 搜索和过滤"
echo "  ✅ 状态栏显示"
echo ""

# 显示测试步骤
echo "🧪 测试步骤:"
echo "  1. 打开应用后，选择一个会话"
echo "  2. 点击左上角的菜单按钮 (☰) 打开侧边栏"
echo "  3. 检查树形连接线是否正确显示"
echo "  4. 测试搜索功能"
echo "  5. 测试过滤功能"
echo "  6. 点击节点测试跳转"
echo ""

# 显示文档
echo "📚 参考文档:"
echo "  - SIDEBAR_SUMMARY.md - 改进总结"
echo "  - SIDEBAR_TEST_GUIDE.md - 测试指南"
echo "  - SIDEBAR_COMPARISON.md - 对比文档"
echo ""

# 启动应用
echo "🎬 启动应用..."
echo ""

cd "$(dirname "$0")"
npm run tauri:dev
