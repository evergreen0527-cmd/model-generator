# 模特图生成器

基于 GPT-Image2 (DALL-E 3) 的模特图片生成应用

## 功能特性

✨ **核心功能**:
- 创建和管理多个模特档案
- 为每个模特上传参考素材图
- 上传场景参考图,生成模特在新场景中的图片
- 独立的模特工作空间,方便管理

## 技术栈

**前端**:
- React 18
- Vite 5
- Axios

**后端**:
- Node.js + Express
- OpenAI API (DALL-E 3)
- Multer (文件上传)

## 安装步骤

### 1. 后端设置

```bash
cd backend

# 安装依赖
npm install

# 配置环境变量
cp .env.example .env

# 编辑 .env 文件,添加你的 OpenAI API Key
# OPENAI_API_KEY=your_api_key_here

# 启动后端服务
npm run dev
```

后端服务将运行在 `http://localhost:3001`

### 2. 前端设置

```bash
cd frontend

# 安装依赖
npm install

# 启动前端开发服务器
npm run dev
```

前端应用将运行在 `http://localhost:3000`

## 使用指南

### 创建模特

1. 点击左侧边栏的 "+ 创建新模特" 按钮
2. 输入模特名称
3. 上传模特的参考图片(清晰的人物照片)
4. 点击"创建"

### 生成场景图

1. 在左侧选择要使用的模特
2. 在工作区上传场景参考图片
3. (可选)输入描述你想要的效果的提示词
4. 点击"✨ 生成模特图"
5. 等待AI生成,生成的图片将显示在页面下方

### 管理模特

- 每个模特都有独立的工作空间
- 可以随时切换不同的模特
- 查看每个模特已生成的所有图片

## API 接口

### 后端 API

- `GET /api/models` - 获取所有模特列表
- `POST /api/models` - 创建新模特(需上传参考图)
- `GET /api/models/:id` - 获取模特详情
- `POST /api/models/:id/generate` - 生成场景图(需上传场景图)
- `DELETE /api/models/:id` - 删除模特

## 注意事项

⚠️ **重要提示**:

1. **API Key**: 需要在后端 `.env` 文件中配置有效的 OpenAI API Key
2. **图片大小**: 上传的图片限制为 10MB 以内
3. **支持格式**: JPEG, JPG, PNG, WEBP
4. **API 费用**: 使用 OpenAI 的图像生成 API 会产生费用,请注意控制使用量
5. **数据存储**: 当前版本使用内存存储模特数据,重启服务后数据会丢失。生产环境建议使用数据库

## 项目结构

```
model-generator/
├── backend/              # 后端服务
│   ├── server.js        # 主服务器文件
│   ├── package.json     # 后端依赖
│   ├── .env.example     # 环境变量示例
│   └── uploads/         # 上传文件存储目录
├── frontend/            # 前端应用
│   ├── src/
│   │   ├── App.jsx     # 主应用组件
│   │   ├── main.jsx    # 入口文件
│   │   └── index.css   # 全局样式
│   ├── index.html      # HTML 模板
│   ├── vite.config.js  # Vite 配置
│   └── package.json    # 前端依赖
└── README.md           # 项目说明
```

## 扩展建议

🚀 **未来可以添加的功能**:

1. 数据库集成(MongoDB/PostgreSQL)持久化数据
2. 用户认证和授权系统
3. 图片编辑和裁剪功能
4. 批量生成图片
5. 图片下载和分享功能
6. 历史记录和版本管理
7. 更多的 AI 模型支持
8. 图片质量选择
9. 生成进度实时显示
10. 移动端适配优化

## 许可证

MIT License

## 联系方式

如有问题或建议,请提交 Issue 或 Pull Request。
