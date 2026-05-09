# 快速启动指南

## 前置要求

1. **Node.js** (版本 20+)
2. **npm** 或 **yarn**
3. **OpenAI API Key** (需要访问 DALL-E 3 API)

## 快速开始

### 方法一: 使用启动脚本 (推荐)

```bash
# 1. 配置 API Key
cd backend
cp .env.example .env
# 编辑 .env 文件,填入你的 OpenAI API Key

# 2. 返回项目根目录并启动
cd ..
./start.sh
```

### 方法二: 手动启动

#### 1. 配置后端

```bash
cd backend

# 复制环境变量文件
cp .env.example .env

# 编辑 .env 文件
# 将 OPENAI_API_KEY=your_openai_api_key_here 
# 替换为你的真实 API Key
```

#### 2. 启动后端服务

```bash
cd backend
npm run dev
```

后端将运行在 `http://localhost:3001`

#### 3. 启动前端 (新终端窗口)

```bash
cd frontend
npm run dev
```

前端将运行在 `http://localhost:3000`

## 获取 OpenAI API Key

1. 访问 https://platform.openai.com/
2. 注册或登录你的账户
3. 进入 API Keys 页面
4. 创建新的 API Key
5. 将 Key 复制到后端的 `.env` 文件中

## 验证安装

启动成功后:

1. 打开浏览器访问 `http://localhost:3000`
2. 你应该能看到"模特图生成器"的界面
3. 点击"创建新模特"开始使用

## 常见问题

### Q: 后端启动失败?
A: 检查:
- 是否正确安装了依赖 (`npm install`)
- 端口 3001 是否被占用
- `.env` 文件是否存在

### Q: 前端无法连接后端?
A: 检查:
- 后端是否正常运行
- 浏览器控制台是否有 CORS 错误
- Vite 代理配置是否正确

### Q: 图片生成失败?
A: 检查:
- OpenAI API Key 是否正确
- 网络连接是否正常
- API 账户是否有足够的余额/额度

### Q: 上传图片失败?
A: 检查:
- 图片格式是否支持 (JPG, PNG, WEBP)
- 图片大小是否超过 10MB
- `backend/uploads` 目录是否存在且有写权限

## 开发模式

### 后端开发

```bash
cd backend
npm run dev  # 使用 nodemon 自动重启
```

### 前端开发

```bash
cd frontend
npm run dev  # Vite 热更新
```

## 生产构建

### 前端构建

```bash
cd frontend
npm run build
# 构建产物在 frontend/dist 目录
```

### 后端部署

建议使用 PM2 或 Docker 进行部署:

```bash
# 使用 PM2
npm install -g pm2
cd backend
pm2 start server.js --name model-generator
```

## 下一步

- 查看 `README.md` 了解详细功能
- 探索 API 接口文档
- 根据需求扩展功能

祝你使用愉快! 🎉
