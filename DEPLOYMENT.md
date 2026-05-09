# 🚀 线上部署完整指南

## 📋 部署架构

```
用户访问
   ↓
前端 (Vercel) ←→ 后端 (Railway/Render)
   ↓                    ↓
CDN 加速           OpenAI API
HTTPS 加密         数据持久化
```

---

## 🎨 方案一: Vercel (前端) + Railway (后端) ⭐ 推荐

### 第一部分: 部署后端到 Railway

#### 1. 准备代码

**创建 `backend/railway.json`**:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "node server.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**创建 `backend/Procfile`**:
```
web: node server.js
```

#### 2. 部署步骤

1. **注册 Railway**
   - 访问 https://railway.app/
   - 使用 GitHub 账号登录

2. **创建项目**
   - 点击 "New Project"
   - 选择 "Deploy from GitHub repo"
   - 授权访问你的代码仓库

3. **配置环境变量**
   在 Railway 项目设置中添加:
   ```
   OPENAI_API_KEY=sk-yXDP7yRzZ1fh9CJwIr5tYrTK96GoFRiEmr0K4aoaQ6RS6sE0
   OPENAI_BASE_URL=https://47claude.com/v1
   IMAGE_MODEL=gpt-image2
   PORT=3001
   NODE_ENV=production
   ```

4. **部署**
   - Railway 会自动检测并部署
   - 部署完成后会分配一个公网 URL
   - 例如: `https://your-app-production.up.railway.app`

5. **配置持久化存储**
   - Railway 提供临时文件系统
   - 重要数据建议使用 Railway 的 Volume 功能
   - 或者集成 MongoDB/PostgreSQL

---

### 第二部分: 部署前端到 Vercel

#### 1. 准备代码

**创建 `frontend/vercel.json`**:
```json
{
  "rewrites": [
    { "source": "/(.*)", "destination": "/" }
  ]
}
```

**更新 `frontend/.env.production`**:
```env
# 替换为你的 Railway 后端 URL
VITE_API_BASE_URL=https://your-app-production.up.railway.app
```

**修改 `frontend/src/App.jsx`**:
```javascript
// 将这一行:
const API_BASE_URL = 'http://localhost:3001'

// 改为:
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001'
```

**更新 `frontend/vite.config.js`**:
```javascript
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react()],
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL || 'http://localhost:3001',
          changeOrigin: true,
        },
        '/uploads': {
          target: env.VITE_API_BASE_URL || 'http://localhost:3001',
          changeOrigin: true,
        }
      }
    }
  }
})
```

#### 2. 部署步骤

1. **安装 Vercel CLI** (可选)
   ```bash
   npm install -g vercel
   ```

2. **注册 Vercel**
   - 访问 https://vercel.com/
   - 使用 GitHub 账号登录

3. **部署前端**
   
   **方法 A: 使用 Web 界面**
   - 点击 "New Project"
   - 选择 "Import Git Repository"
   - 选择 `frontend` 目录
   - 配置构建命令: `npm run build`
   - 配置输出目录: `dist`
   - 点击 "Deploy"

   **方法 B: 使用 CLI**
   ```bash
   cd frontend
   vercel --prod
   ```

4. **配置环境变量**
   在 Vercel 项目设置中添加:
   ```
   VITE_API_BASE_URL=https://your-backend.up.railway.app
   ```

5. **完成**
   - Vercel 会分配一个公网 URL
   - 例如: `https://your-app.vercel.app`

---

## 🎨 方案二: 全部部署到 Render (更简单)

### 优势
- 前后端都在一个平台
- 免费额度充足
- 自动 HTTPS

### 部署步骤

#### 1. 注册 Render
- 访问 https://render.com/
- 使用 GitHub 账号登录

#### 2. 部署后端

1. 点击 "New +" → "Web Service"
2. 连接 GitHub 仓库
3. 配置:
   - **Name**: model-generator-api
   - **Root Directory**: backend
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free

4. 添加环境变量:
   ```
   OPENAI_API_KEY=sk-yXDP7yRzZ1fh9CJwIr5tYrTK96GoFRiEmr0K4aoaQ6RS6sE0
   OPENAI_BASE_URL=https://47claude.com/v1
   IMAGE_MODEL=gpt-image2
   NODE_ENV=production
   ```

5. 点击 "Create Web Service"

#### 3. 部署前端

1. 点击 "New +" → "Static Site"
2. 连接 GitHub 仓库
3. 配置:
   - **Name**: model-generator
   - **Root Directory**: frontend
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: dist
   - **Plan**: Free

4. 添加环境变量:
   ```
   VITE_API_BASE_URL=https://your-backend.onrender.com
   ```

5. 点击 "Create Static Site"

---

## 🎨 方案三: 部署到 Vercel (前后端一体)

### 注意: 需要将后端改造为 Serverless 函数

#### 1. 创建 `api/` 目录结构

```
model-generator/
├── api/
│   ├── models.js          # 模特相关 API
│   └── generate.js        # 图片生成 API
├── frontend/
└── package.json
```

#### 2. 改造 API 为 Serverless

**创建 `api/models/index.js`**:
```javascript
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL
})

export default async function handler(req, res) {
  // 处理 API 请求
  // ...
}

export const config = {
  api: {
    bodyParser: false,
  }
}
```

#### 3. 部署到 Vercel
```bash
vercel --prod
```

---

## 🔧 部署前检查清单

### ✅ 后端检查
- [ ] `.env` 文件中的敏感信息已移除(使用环境变量)
- [ ] CORS 配置允许前端域名访问
- [ ] 数据持久化方案已配置
- [ ] 错误日志已添加
- [ ] 文件大小限制合理

### ✅ 前端检查
- [ ] API 地址使用环境变量
- [ ] 生产构建无错误
- [ ] 所有功能正常
- [ ] 图片上传正常

### ✅ 安全配置
- [ ] API Key 不暴露在前端代码
- [ ] 启用 HTTPS
- [ ] 配置 CORS 白名单
- [ ] 添加速率限制(可选)

---

## 📊 更新 CORS 配置

**修改 `backend/server.js`**:
```javascript
app.use(cors({
  origin: [
    'http://localhost:3000',      // 本地开发
    'https://your-app.vercel.app', // 生产环境 - 替换为你的域名
    'https://*.vercel.app'         // 所有 Vercel 预览部署
  ],
  credentials: true
}))
```

---

## 🚀 快速部署脚本

### 使用 Railway + Vercel

**1. 推送代码到 GitHub**
```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin <your-repo-url>
git push -u origin main
```

**2. 部署后端到 Railway**
- 在 Railway 中连接仓库
- 选择 `backend` 目录
- 配置环境变量
- 自动部署

**3. 部署前端到 Vercel**
```bash
cd frontend
vercel --prod
```

---

## 📝 环境变量汇总

### 后端环境变量
```env
OPENAI_API_KEY=sk-yXDP7yRzZ1fh9CJwIr5tYrTK96GoFRiEmr0K4aoaQ6RS6sE0
OPENAI_BASE_URL=https://47claude.com/v1
IMAGE_MODEL=gpt-image2
PORT=3001
NODE_ENV=production
CORS_ORIGIN=https://your-frontend.vercel.app
```

### 前端环境变量
```env
VITE_API_BASE_URL=https://your-backend.up.railway.app
```

---

## 🎯 推荐方案总结

### 最快上手: Render (一站式)
- ✅ 前后端一起部署
- ✅ 配置简单
- ✅ 免费额度够用
- ⏱️ 预计时间: 15 分钟

### 最佳性能: Vercel + Railway
- ✅ 前端 CDN 加速
- ✅ 后端独立扩展
- ✅ 开发者体验好
- ⏱️ 预计时间: 20 分钟

### 最省钱: 全部免费
- ✅ Vercel 免费计划
- ✅ Railway 免费额度($5/月)
- ✅ 足够个人使用

---

## 🔍 部署后验证

1. **访问前端 URL**
   - 检查页面是否正常加载
   - 测试创建模特功能
   - 测试图片上传

2. **检查 API 连接**
   - 浏览器控制台查看网络请求
   - 确认 CORS 配置正确
   - 测试图片生成

3. **数据持久化**
   - 创建测试数据
   - 刷新页面验证数据保留
   - 重启服务验证数据加载

---

## 🆘 常见问题

### Q: 部署后图片无法上传?
A: 检查:
1. 后端 CORS 配置
2. 文件大小限制
3. 存储权限

### Q: 图片生成失败?
A: 检查:
1. 环境变量是否正确
2. API Key 是否有效
3. 网络连接是否正常

### Q: 刷新页面数据丢失?
A: 确认:
1. 后端数据持久化已配置
2. 存储卷已挂载(Railway/Render)
3. 文件权限正确

---

## 📞 需要帮助?

如果部署过程中遇到问题:
1. 查看平台文档
2. 检查部署日志
3. 查看浏览器控制台错误
4. 提交 Issue 或联系支持

祝你部署顺利! 🎉
