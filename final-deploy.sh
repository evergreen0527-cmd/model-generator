#!/bin/bash

echo ""
echo "🚀 终极一键部署"
echo "================"
echo ""
echo "步骤 1/3: 准备代码..."
git add -A
git commit -m "Ready for production" 2>/dev/null || true

echo ""
echo "=========================================="
echo "步骤 2/3: 推送到 GitHub"
echo "=========================================="
echo ""
echo "请打开浏览器，访问："
echo "  https://github.com/settings/tokens/new"
echo ""
echo "1. Note 填写: model-generator deploy"
echo "2. Expiration 选择: No expiration"
echo "3. 勾选 'repo' 权限（全选）"
echo "4. 点击 Generate token"
echo "5. 复制生成的 token（ghp_xxxxxx）"
echo ""
read -p "粘贴你的 Token: " TOKEN

if [ -z "$TOKEN" ]; then
    echo "❌ Token 不能为空"
    exit 1
fi

echo ""
echo "📤 正在推送代码..."
git remote set-url origin "https://${TOKEN}@github.com/evergreen0527-cmd/model-generator.git"
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 推送成功！"
    echo ""
    echo "=========================================="
    echo "步骤 3/3: 部署到 Render（点击按钮即可）"
    echo "=========================================="
    echo ""
    echo "请打开浏览器，访问以下链接："
    echo ""
    echo "  https://render.com/deploy?repo=https://github.com/evergreen0527-cmd/model-generator"
    echo ""
    echo "然后："
    echo "1. 点击 'Connect account' 用 GitHub 登录"
    echo "2. 在环境变量页面填写："
    echo "   OPENAI_API_KEY=sk-yXDP7yRzZ1fh9CJwIr5tYrTK96GoFRiEmr0K4aoaQ6RS6sE0"
    echo "   OPENAI_BASE_URL=https://47claude.com/v1"
    echo "   IMAGE_MODEL=gpt-image2"
    echo "3. 点击 'Apply' → 'Deploy'"
    echo ""
    echo "⏱️  等待 2-3 分钟..."
    echo "🎉 你将获得永久公网 URL！"
    echo ""
    echo "示例 URL 格式："
    echo "  前端: https://model-generator.onrender.com"
    echo "  后端: https://model-generator-api.onrender.com"
else
    echo "❌ 推送失败"
fi
