# ⚡ 5 分钟快速部署指南

## 🎯 最简单的方式: 使用 Render (推荐新手)

### 第 1 步: 推送代码到 GitHub (2 分钟)

```bash
cd /Users/长青/qoder/gptmodel/model-generator

# 初始化 Git (如果还没有)
git init

# 添加所有文件
git add .

# 提交
git commit -m "Ready for deployment"

# 创建 GitHub 仓库 (在 github.com 上)
# 然后关联并推送
git remote add origin https://github.com/你的用户名/model-generator.git
git branch -M main
git push -u origin main
```

### 第 2 步: 部署后端到 Render (3 分钟)

1. **访问** https://render.com/
2. **注册** - 使用 GitHub 账号登录
3. **创建后端服务**:
   - 点击 "New +" → "Web Service"
   - 选择 "Connect" 你的 GitHub 仓库
   - 配置:
     ```
     Name: model-generator-api
     Root Directory: backend
     Environment: Node
     Build Command: npm install
     Start Command: node server.js
     Plan: Free
     ```
4. **添加环境变量** (点击 "Environment" 标签):
   ```
   OPENAI_API_KEY=sk-yXDP7yRzZ1fh9CJwIr5tYrTK96GoFRiEmr0K4aoaQ6RS6sE0
   OPENAI_BASE_URL=https://47claude.com/v1
   IMAGE_MODEL=gpt-image2
   NODE_ENV=production
   ```
5. **点击** "Create Web Service"
6. **等待部署完成**,复制后端 URL (类似: `https://xxx.onrender.com`)

### 第 3 步: 部署前端到 Render (2 分钟)

1. **创建前端服务**:
   - 点击 "New +" → "Static Site"
   - 选择同一个 GitHub 仓库
   - 配置:
     ```
     Name: model-generator
     Root Directory: frontend
     Build Command: npm install && npm run build
     Publish Directory: dist
     Plan: Free
     ```
2. **添加环境变量**:
   ```
   VITE_API_BASE_URL=https://你的后端.onrender.com
   ```
   (替换为第 2 步中获得的实际后端 URL)
3. **点击** "Create Static Site"
4. **等待部署完成**,复制前端 URL

### 第 4 步: 测试 (1 分钟)

1. 打开前端 URL
2. 创建测试模特
3. 上传图片测试
4. 生成图片测试

**✅ 完成! 你的应用现在可以通过公网访问了!**

---

## 🚀 替代方案: Vercel + Railway (性能更好)

### 快速步骤

#### 1. 部署后端到 Railway
```
1. 访问 https://railway.app/
2. 使用 GitHub 登录
3. New Project → Deploy from GitHub repo
4. 选择 backend 目录
5. 添加环境变量 (同上)
6. 自动部署,获得 URL
```

#### 2. 部署前端到 Vercel
```
1. 访问 https://vercel.com/
2. 使用 GitHub 登录
3. New Project → Import Git Repository
4. 选择 frontend 目录
5. 添加环境变量 VITE_API_BASE_URL
6. Deploy
```

---

## 📋 环境变量清单

### 后端必须配置
| 变量名 | 值 | 说明 |
|--------|-----|------|
| OPENAI_API_KEY | sk-yXDP... | 你的 API Key |
| OPENAI_BASE_URL | https://47claude.com/v1 | API 地址 |
| IMAGE_MODEL | gpt-image2 | 图像模型 |
| NODE_ENV | production | 运行环境 |

### 前端必须配置
| 变量名 | 值 | 说明 |
|--------|-----|------|
| VITE_API_BASE_URL | https://xxx.onrender.com | 后端 URL |

---

## 🔍 验证部署

访问以下地址检查:

1. **前端首页**: `https://你的前端.onrender.com`
2. **后端健康**: `https://你的后端.onrender.com/api/models`
3. **文件上传**: 在前端创建模特测试

---

## ⚠️ 注意事项

### 免费平台限制
- **Render**: 15 分钟无访问会休眠,下次访问需要 30-60 秒唤醒
- **Railway**: 每月 $5 免费额度
- **Vercel**: 个人使用完全免费

### 数据持久化
- Render/Railway 的文件系统是临时的
- 重要数据建议:
  - 定期备份 `data/` 目录
  - 或使用数据库服务 (MongoDB Atlas 免费)

### 性能优化
- 首次访问可能较慢 (冷启动)
- 可以使用 cron-job.org 定时访问保持活跃

---

## 🆘 遇到问题?

### 前端无法连接后端?
检查:
1. `VITE_API_BASE_URL` 是否正确
2. 后端 CORS 配置
3. 浏览器控制台错误

### 图片生成失败?
检查:
1. API Key 是否正确
2. 环境变量是否配置
3. 后端日志

### 需要帮助?
查看详细文档: `DEPLOYMENT.md`

---

## 🎉 部署成功后

你可以:
- ✅ 通过公网 URL 访问应用
- ✅ 分享给朋友使用
- ✅ 在手机/平板上使用
- ✅ 持续迭代更新

**享受你的线上模特图生成器!** 🚀
