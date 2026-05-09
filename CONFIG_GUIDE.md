# 配置指南

## 🔑 配置 OpenAI API Key

### 步骤 1: 获取 API Key

1. 访问 [OpenAI Platform](https://platform.openai.com/)
2. 注册或登录你的账户
3. 点击左侧菜单的 "API keys"
4. 点击 "Create new secret key"
5. 复制生成的密钥(格式类似: `sk-xxxxxxxxxxxxxxxxxxxxxxxx`)

### 步骤 2: 配置到项目

```bash
# 进入后端目录
cd backend

# 复制环境变量模板
cp .env.example .env

# 编辑 .env 文件
```

在 `.env` 文件中填入你的 API Key:

```env
OPENAI_API_KEY=sk-你的真实API密钥
PORT=3001
UPLOAD_DIR=./uploads
```

⚠️ **重要**: 不要将 `.env` 文件提交到 Git 仓库!

## 🌐 API 模型配置

### 当前配置

项目默认使用 `dall-e-3` 模型,这是 OpenAI 当前的主力图像生成模型。

### 修改模型

如果你需要使用其他模型,可以编辑 `backend/server.js` 文件:

```javascript
// 找到这行代码(约第 109 行)
const response = await openai.images.generate({
  model: "dall-e-3", // 修改这里的模型名称
  prompt: generationPrompt,
  n: 1,
  size: "1024x1024",
});
```

### 可用模型

| 模型 | 说明 | 尺寸选项 |
|------|------|----------|
| dall-e-3 | DALL-E 3,质量更高 | 1024x1024, 1024x1792, 1792x1024 |
| dall-e-2 | DALL-E 2,速度更快 | 256x256, 512x512, 1024x1024 |

## 🔧 高级配置

### 修改端口

如果端口冲突,可以修改:

**后端端口** (`backend/.env`):
```env
PORT=3001  # 改为其他端口,如 5000
```

**前端端口** (`frontend/vite.config.js`):
```javascript
server: {
  port: 3000,  // 改为其他端口,如 8080
  // ...
}
```

### 修改上传限制

编辑 `backend/server.js`:

```javascript
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 修改这里,单位:字节
  // 例如改为 20MB: 20 * 1024 * 1024
});
```

### 修改图片尺寸

编辑 `backend/server.js` 中的生成参数:

```javascript
const response = await openai.images.generate({
  model: "dall-e-3",
  prompt: generationPrompt,
  n: 1,
  size: "1024x1024", // 修改这里
  // DALL-E 3 可选: "1024x1024", "1024x1792", "1792x1024"
});
```

## 🗄️ 数据库配置 (未来扩展)

当前版本使用内存存储,如果需要持久化数据:

### 使用 MongoDB

1. 安装依赖:
```bash
cd backend
npm install mongoose
```

2. 在 `.env` 中添加:
```env
MONGODB_URI=mongodb://localhost:27017/model-generator
```

3. 创建数据模型并替换内存存储

### 使用 PostgreSQL

1. 安装依赖:
```bash
cd backend
npm install pg sequelize
```

2. 在 `.env` 中添加:
```env
DATABASE_URL=postgresql://user:password@localhost:5432/model-generator
```

## 🔐 安全建议

### 生产环境配置

1. **使用 HTTPS**
   - 配置 SSL 证书
   - 使用反向代理(Nginx)

2. **添加认证**
   - 实现 JWT 认证
   - 保护 API 端点

3. **速率限制**
   ```javascript
   // 安装 express-rate-limit
   npm install express-rate-limit
   
   // 在 server.js 中添加
   const rateLimit = require('express-rate-limit');
   const limiter = rateLimit({
     windowMs: 15 * 60 * 1000, // 15分钟
     max: 100 // 最多100个请求
   });
   app.use(limiter);
   ```

4. **环境变量**
   - 使用 `.env.production` 文件
   - 不要硬编码敏感信息

5. **文件上传安全**
   - 验证文件类型
   - 扫描恶意文件
   - 限制上传频率

## 📊 监控和日志

### 添加日志

```bash
npm install winston
```

在 `server.js` 中配置日志记录。

### 错误监控

考虑集成:
- Sentry
- LogRocket
- New Relic

## 🚀 部署配置

### Docker 部署

创建 `Dockerfile`:

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3001
CMD ["node", "server.js"]
```

### PM2 部署

```bash
npm install -g pm2
pm2 start server.js --name model-generator
pm2 save
pm2 startup
```

## ❓ 故障排查

### API Key 无效

检查:
1. Key 是否正确复制(没有多余空格)
2. 账户是否有余额/额度
3. 是否启用了 API 访问

### 跨域错误

确保 `backend/server.js` 中启用了 CORS:
```javascript
app.use(cors());
```

### 文件上传失败

检查:
1. `uploads` 目录权限
2. 文件大小限制
3. 文件类型是否正确

---

如有其他配置问题,请查看 README.md 或提交 Issue。
