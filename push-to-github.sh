#!/bin/bash

echo "🚀 推送到 GitHub 并部署到 Render"
echo "================================"
echo ""

# 提示用户输入 GitHub 用户名
read -p "请输入你的 GitHub 用户名: " USERNAME

if [ -z "$USERNAME" ]; then
    echo "❌ 用户名不能为空"
    exit 1
fi

REPO_URL="https://github.com/$USERNAME/model-generator.git"

echo ""
echo "📦 准备推送代码到: $REPO_URL"
echo ""

# 添加远程仓库
git remote remove origin 2>/dev/null
git remote add origin "$REPO_URL"

# 推送代码
echo "🚀 推送代码..."
git branch -M main
git push -u origin main

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ 代码推送成功！"
    echo ""
    echo "📍 仓库地址: https://github.com/$USERNAME/model-generator"
    echo ""
    echo "🎯 下一步：部署到 Render"
    echo "========================"
    echo ""
    echo "请点击以下链接一键部署："
    echo ""
    echo "   https://render.com/deploy?repo=$REPO_URL"
    echo ""
    echo "部署步骤："
    echo "1. 点击上方链接"
    echo "2. 使用 GitHub 登录 Render（如果没有账号，免费注册）"
    echo "3. 在环境变量页面输入你的 OPENAI_API_KEY"
    echo "4. 点击 Deploy"
    echo ""
    echo "⏱️  等待 2-3 分钟部署完成"
    echo "🎉 你将获得永久访问 URL！"
    echo ""
else
    echo "❌ 推送失败，请检查："
    echo "1. 是否已在 GitHub 创建仓库"
    echo "2. 用户名是否正确"
    echo "3. 是否已配置 Git 凭据"
    echo ""
    echo "配置 Git 凭据："
    echo "git config --global user.name '你的名字'"
    echo "git config --global user.email '你的邮箱'"
    echo ""
    echo "然后重新运行此脚本"
fi
