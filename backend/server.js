require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
const https = require('https');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');

// 忽略SSL证书错误(仅用于开发环境)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = express();
const PORT = process.env.PORT || 3001;

// 中间件
const corsOptions = {
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://*.vercel.app',
    'https://*.onrender.com',
    'https://*.railway.app'
  ],
  credentials: true
};
app.use(cors(corsOptions));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// 检测是否在 Vercel 环境
const isVercel = !!process.env.VERCEL;

// 创建上传目录 (Vercel 使用 /tmp 可写目录)
const uploadDir = isVercel ? '/tmp/uploads' : path.join(__dirname, 'uploads');
if (!fsSync.existsSync(uploadDir)) {
  fsSync.mkdirSync(uploadDir, { recursive: true });
}

// Vercel 环境下提供 uploads 目录访问
if (isVercel) {
  app.use('/uploads', express.static(uploadDir));
}

// 配置multer
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB限制
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const mimetype = allowedTypes.test(file.mimetype);
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('只支持图片文件 (jpeg, jpg, png, webp)'));
  }
});

// 初始化OpenAI客户端
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
});

// 数据持久化文件路径 (Vercel 使用 /tmp)
const dataDir = isVercel ? '/tmp/data' : path.join(__dirname, 'data');
const dataFilePath = path.join(dataDir, 'models.json');

// 确保数据目录存在
async function ensureDataDir() {
  if (!fsSync.existsSync(dataDir)) {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// 读取数据
async function loadModels() {
  try {
    await ensureDataDir();
    const data = await fs.readFile(dataFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // 如果文件不存在或解析失败,返回空对象
    return {};
  }
}

// 保存数据
async function saveModels(models) {
  await ensureDataDir();
  await fs.writeFile(dataFilePath, JSON.stringify(models, null, 2), 'utf8');
}

// 内存存储模特数据 (启动时从文件加载)
let models = {};

// 启动时加载数据
loadModels().then(loadedModels => {
  models = loadedModels;
  console.log(`已加载 ${Object.keys(models).length} 个模特数据`);
});

// API路由

// 获取所有模特
app.get('/api/models', (req, res) => {
  res.json(Object.values(models));
});

// 创建新模特
app.post('/api/models', upload.single('referenceImage'), async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name || !req.file) {
      return res.status(400).json({ error: '需要提供模特名称和参考图片' });
    }

    const modelId = uuidv4();
    const modelData = {
      id: modelId,
      name: name,
      referenceImage: `/uploads/${req.file.filename}`,
      createdAt: new Date().toISOString(),
      generatedImages: []
    };

    models[modelId] = modelData;
    await saveModels(models); // 保存数据
    res.status(201).json(modelData);
  } catch (error) {
    console.error('创建模特失败:', error);
    res.status(500).json({ error: '创建模特失败' });
  }
});

// 获取单个模特详情
app.get('/api/models/:id', (req, res) => {
  const model = models[req.params.id];
  if (!model) {
    return res.status(404).json({ error: '模特不存在' });
  }
  res.json(model);
});

// 生成模特在场景中的图片
app.post('/api/models/:id/generate', upload.single('sceneImage'), async (req, res) => {
  try {
    const model = models[req.params.id];
    if (!model) {
      return res.status(404).json({ error: '模特不存在' });
    }

    if (!req.file) {
      return res.status(400).json({ error: '需要提供场景参考图片' });
    }

    const { prompt } = req.body;

    // 构建生成提示词
    const generationPrompt = prompt || 
      `将模特放置在提供的场景背景中，保持模特的姿势和外观，自然地融合到新场景中`;

    // 调用GPT-Image2生成图片
    const imageModel = process.env.IMAGE_MODEL || 'gpt-image-2';
    const response = await openai.images.generate({
      model: imageModel,
      prompt: generationPrompt,
      n: 1,
      size: "1024x1024",
    });

    const generatedImageUrl = response.data[0].url;
    const imageId = uuidv4();

    const generatedImage = {
      id: imageId,
      url: generatedImageUrl,
      sceneImage: `/uploads/${req.file.filename}`,
      prompt: generationPrompt,
      createdAt: new Date().toISOString()
    };

    model.generatedImages.push(generatedImage);
    await saveModels(models); // 保存数据
    res.json(generatedImage);
  } catch (error) {
    console.error('生成图片失败:', error);
    res.status(500).json({ error: '生成图片失败: ' + error.message });
  }
});

// 删除模特
app.delete('/api/models/:id', async (req, res) => {
  if (!models[req.params.id]) {
    return res.status(404).json({ error: '模特不存在' });
  }
  
  delete models[req.params.id];
  await saveModels(models); // 保存数据
  res.json({ message: '模特已删除' });
});

// 生产环境：提供前端静态文件
if (process.env.NODE_ENV === 'production') {
  const publicPath = path.join(__dirname, 'public');
  app.use(express.static(publicPath));
  
  // 所有非API路由指向前端
  app.get('*', (req, res) => {
    res.sendFile(path.join(publicPath, 'index.html'));
  });
}

// 启动服务器 (Vercel 环境不需要 listen)
if (!isVercel) {
  app.listen(PORT, () => {
    console.log(`服务器运行在 http://localhost:${PORT}`);
  });
}

// 导出 app 供 Vercel Serverless 使用
module.exports = app;
