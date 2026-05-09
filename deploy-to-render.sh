#!/bin/bash

echo "🚀 一键部署到 Render"
echo "===================="
echo ""

# 提交新增文件
echo "📦 提交新增文件..."
git add -A
git commit -m "Add deployment configs" 2>/dev/null || true

echo ""
echo "📤 推送代码到 GitHub..."
echo "注意: 如果提示输入密码，请输入你的 GitHub Personal Access Token"
echo "(如果没有 Token，请访问 https://github.com/settings/tokens 创建)"
echo ""

# 尝试推送
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 代码推送成功！"
    echo ""
    echo "🎯 现在部署到 Render:"
    echo ""
    echo "请打开浏览器访问以下链接："
    echo ""
    echo "   https://render.com/deploy?repo=https://github.com/evergreen0527-cmd/model-generator"
    echo ""
    echo "部署步骤："
    echo "1. 使用 GitHub 登录 Render（免费注册）"
    echo "2. 填写环境变量："
    echo "   OPENAI_API_KEY=sk-yXDP7yRzZ1fh9CJwIr5tYrTK96GoFRiEmr0K4aoaQ6RS6sE0"
    echo "   OPENAI_BASE_URL=https://47claude.com/v1"
    echo "   IMAGE_MODEL=gpt-image2"
    echo "3. 点击 'Deploy' 按钮"
    echo ""
    echo "⏱️  等待 2-3 分钟部署完成"
    echo "🎉 你将获得永久公网 URL！"
else
    echo ""
    echo "❌ 推送失败"
    echo ""
    echo "解决方案："
    echo "1. 生成 GitHub Personal Access Token:"
    echo "   访问 https://github.com/settings/tokens/new"
    echo "   勾选 'repo' 权限"
    echo "   点击 Generate token"
    echo ""
    echo "2. 使用 Token 推送："
    echo "   git remote set-url origin https://YOUR_TOKEN@github.com/evergreen0527-cmd/model-generator.git"
    echo "   git push -u origin main"
    echo ""
    echo "3. 或者使用 GitHub CLI："
    echo "   brew install gh"
    echo "   gh auth login"
    echo "   git push -u origin main"
fi
