#!/bin/bash

echo "🚀 自动化部署助手"
echo "=================="
echo ""

# 检查是否已安装必要工具
echo "📋 检查必要工具..."

# 检查 Git
if ! command -v git &> /dev/null; then
    echo "❌ 未安装 Git,请先安装"
    exit 1
fi
echo "✅ Git 已安装"

# 检查 Node.js
if ! command -v node &> /dev/null; then
    echo "❌ 未安装 Node.js,请先安装"
    exit 1
fi
echo "✅ Node.js 已安装: $(node -v)"

echo ""
echo "📦 准备项目..."

# 初始化 Git
if [ ! -d ".git" ]; then
    echo "📝 初始化 Git 仓库..."
    git init
    git add .
    git commit -m "Initial commit for deployment"
    echo "✅ Git 仓库已初始化"
else
    echo "✅ Git 仓库已存在"
fi

echo ""
echo "=========================================="
echo "🎯 接下来需要你手动操作 (仅需 3 步):"
echo "=========================================="
echo ""
echo "第 1 步: 创建 GitHub 仓库 (1 分钟)"
echo "-------------------------------------------"
echo "1. 打开浏览器访问: https://github.com/new"
echo "2. 创建一个新仓库,名称: model-generator"
echo "3. 选择 Public (公开)"
echo "4. 点击 'Create repository'"
echo ""
read -p "✅ 完成后按回车继续..."

echo ""
echo "第 2 步: 推送代码到 GitHub (30 秒)"
echo "-------------------------------------------"
echo "请执行以下命令 (替换 YOUR_USERNAME 为你的 GitHub 用户名):"
echo ""
echo "git remote add origin https://github.com/YOUR_USERNAME/model-generator.git"
echo "git branch -M main"
echo "git push -u origin main"
echo ""
read -p "✅ 推送完成后按回车继续..."

echo ""
echo "第 3 步: 一键部署到 Render (3 分钟)"
echo "-------------------------------------------"
echo "1. 打开浏览器访问: https://render.com/"
echo "2. 使用 GitHub 账号登录 (如果没有账号,先注册)"
echo ""
echo "部署后端:"
echo "  - 点击 'New +' → 'Web Service'"
echo "  - 选择 'Connect' 你的 model-generator 仓库"
echo "  - 配置:"
echo "    • Name: model-generator-api"
echo "    • Root Directory: backend"
echo "    • Build Command: npm install"
echo "    • Start Command: node server.js"
echo "    • Plan: Free"
echo "  - 点击 'Advanced' 添加环境变量:"
echo "    OPENAI_API_KEY=sk-yXDP7yRzZ1fh9CJwIr5tYrTK96GoFRiEmr0K4aoaQ6RS6sE0"
echo "    OPENAI_BASE_URL=https://47claude.com/v1"
echo "    IMAGE_MODEL=gpt-image2"
echo "    NODE_ENV=production"
echo "  - 点击 'Create Web Service'"
echo ""
echo "部署前端:"
echo "  - 等待后端部署完成后,复制后端 URL (如: https://xxx.onrender.com)"
echo "  - 点击 'New +' → 'Static Site'"
echo "  - 选择同一个仓库"
echo "  - 配置:"
echo "    • Name: model-generator"
echo "    • Root Directory: frontend"
echo "    • Build Command: npm install && npm run build"
echo "    • Publish Directory: dist"
echo "  - 添加环境变量:"
echo "    VITE_API_BASE_URL=粘贴你的后端URL"
echo "  - 点击 'Create Static Site'"
echo ""
read -p "✅ 部署完成后按回车继续..."

echo ""
echo "=========================================="
echo "🎉 部署完成!"
echo "=========================================="
echo ""
echo "你的应用现在可以通过公网访问了!"
echo ""
echo "📍 前端 URL: https://model-generator-xxxx.onrender.com"
echo "📍 后端 URL: https://model-generator-api-xxxx.onrender.com"
echo ""
echo "⚠️  注意:"
echo "- 首次访问可能需要 30-60 秒 (冷启动)"
echo "- 15 分钟无访问会进入休眠,下次访问会自动唤醒"
echo ""
echo "📖 详细说明请查看: QUICK_DEPLOY.md"
echo ""
echo "祝你使用愉快! 🚀"
