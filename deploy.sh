#!/bin/bash

echo "🚀 准备部署到线上环境..."
echo ""

# 检查 Git
if ! git rev-parse --is-inside-work-tree &>/dev/null; then
    echo "📦 初始化 Git 仓库..."
    git init
    git add .
    git commit -m "Initial commit for deployment"
fi

echo ""
echo "✅ 项目已准备好部署!"
echo ""
echo "📋 接下来请按以下步骤操作:"
echo ""
echo "🔹 方案一: Vercel + Railway (推荐)"
echo "  1. 将代码推送到 GitHub"
echo "     git remote add origin <你的仓库地址>"
echo "     git push -u origin main"
echo ""
echo "  2. 部署后端到 Railway"
echo "     - 访问 https://railway.app/"
echo "     - 选择 'Deploy from GitHub repo'"
echo "     - 选择 'backend' 目录"
echo "     - 配置环境变量 (见 DEPLOYMENT.md)"
echo ""
echo "  3. 部署前端到 Vercel"
echo "     - 访问 https://vercel.com/"
echo "     - 导入 'frontend' 目录"
echo "     - 配置环境变量 VITE_API_BASE_URL"
echo ""
echo "🔹 方案二: Render (一站式)"
echo "  1. 访问 https://render.com/"
echo "  2. 部署后端 (Web Service)"
echo "  3. 部署前端 (Static Site)"
echo "  4. 配置环境变量"
echo ""
echo "📖 详细部署指南请查看: DEPLOYMENT.md"
echo ""
echo "需要帮助吗? 随时告诉我! 💪"
