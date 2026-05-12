import { useState, useEffect, useRef } from 'react'
import axios from 'axios'
import './App.css'

// API 地址配置：阿里云 FC 公网地址（v2）
// 部署到阿里云 FC 后，改为阿里云 FC 的公网 URL
// 例如：const API_BASE_URL = 'https://xxx.aliyuncs.com'
const API_BASE_URL = 'https://model-gator-api-gmbhjzhwgo.cn-hangzhou.fcapp.run/'
const STATUS_URL = API_BASE_URL.replace(/\/$/, '') + '/status'

// 异步轮询生图任务
async function pollForImage(prompt, onProgress) {
  const { data } = await axios.post(`${API_BASE_URL}`, { prompt }, { timeout: 15000 })
  const taskId = data.taskId
  if (!taskId) throw new Error(data.error || '未返回 taskId')

  return new Promise((resolve, reject) => {
    let stopped = false
    const interval = setInterval(async () => {
      if (stopped) return
      try {
        const { data: st } = await axios.get(`${STATUS_URL}?id=${taskId}`, { timeout: 10000 })
        if (onProgress) onProgress(st)
        if (st.status === 'done' && st.url) {
          stopped = true; clearInterval(interval); resolve(st.url)
        }
        if (st.status === 'error') {
          stopped = true; clearInterval(interval); reject(new Error(st.error || '生成失败'))
        }
      } catch (e) {
        // 轮询网络失败不放弃，继续
      }
    }, 2000) // 每 2 秒查一次
    // 10 分钟总超时
    setTimeout(() => { if (!stopped) { stopped = true; clearInterval(interval); reject(new Error('生成超时(已等待10分钟)')) } }, 600000)
  })
}

const DB_NAME = 'model_generator_db'
const STORE_NAME = 'models'
const DATA_KEY = 'data'
const CHAT_KEY = 'chat_messages'
const LEGACY_KEY = 'model_generator_data'

// 文件转 base64（带压缩，限制最大 2MB）
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result)
    reader.onerror = (error) => reject(error)
  })
}

// 压缩图片（限制尺寸和文件大小）
const compressImage = (base64, maxWidth = 1024, maxHeight = 1024, quality = 0.8) => {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      let { width, height } = img
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height)
        width *= ratio
        height *= ratio
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, width, height)
      resolve(canvas.toDataURL('image/jpeg', quality))
    }
    img.src = base64
  })
}

// 生成 UUID
const uuid = () => {
  if (crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0
    const v = c === 'x' ? r : (r & 0x3 | 0x8)
    return v.toString(16)
  })
}

// IndexedDB 封装（容量 GB 级，远大于 localStorage 的 5MB）
const openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, 1)
  req.onupgradeneeded = () => {
    const db = req.result
    if (!db.objectStoreNames.contains(STORE_NAME)) {
      db.createObjectStore(STORE_NAME)
    }
  }
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

const idbGet = async (key) => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).get(key)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

const idbSet = async (key, value) => {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put(value, key)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  })
}

// 读取数据（自动迁移 localStorage 旧数据）
const loadData = async () => {
  try {
    const data = await idbGet(DATA_KEY)
    if (Array.isArray(data)) return data

    // 迁移 localStorage 旧数据
    try {
      const legacy = localStorage.getItem(LEGACY_KEY)
      if (legacy) {
        const parsed = JSON.parse(legacy)
        if (Array.isArray(parsed) && parsed.length) {
          await idbSet(DATA_KEY, parsed)
          localStorage.removeItem(LEGACY_KEY)
          return parsed
        }
      }
    } catch {}
    return []
  } catch (e) {
    console.error('读取数据失败:', e)
    return []
  }
}

// 保存数据
const saveData = async (models) => {
  try {
    await idbSet(DATA_KEY, models)
  } catch (e) {
    console.error('保存数据失败:', e)
    alert('保存失败：' + (e.message || '存储空间不足'))
  }
}

// 读取聊天数据
const loadChatData = async () => {
  try {
    const data = await idbGet(CHAT_KEY)
    if (Array.isArray(data)) return data
    return []
  } catch (e) {
    console.error('读取聊天数据失败:', e)
    return []
  }
}

// 保存聊天数据
const saveChatData = async (messages) => {
  try {
    await idbSet(CHAT_KEY, messages)
  } catch (e) {
    console.error('保存聊天数据失败:', e)
    alert('保存聊天记录失败：' + (e.message || '存储空间不足'))
  }
}

function App() {
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [activeTab, setActiveTab] = useState('models')

  useEffect(() => {
    loadData().then(setModels)
  }, [])

  const refreshModels = async () => {
    const data = await loadData()
    setModels(data)
    if (selectedModel) {
      const updated = data.find(m => m.id === selectedModel.id)
      setSelectedModel(updated || null)
    }
  }

  const handleModelSelect = (model) => {
    setSelectedModel(model)
  }

  const handleDeleteModel = async (modelId, e) => {
    e.stopPropagation()
    if (!confirm('确定删除该人物及其所有生成历史吗？')) return
    const current = await loadData()
    const data = current.filter(m => m.id !== modelId)
    await saveData(data)
    if (selectedModel?.id === modelId) setSelectedModel(null)
    setModels(data)
  }

  return (
    <div className="container">
      <header className="header">
        <h1>🎨 图片生成</h1>
        <p>图片生成平台</p>
      </header>

      <nav className="tab-nav">
        <button
          className={`tab-btn ${activeTab === 'models' ? 'active' : ''}`}
          onClick={() => setActiveTab('models')}
        >
          👤 人物管理
        </button>
        <button
          className={`tab-btn ${activeTab === 'chat' ? 'active' : ''}`}
          onClick={() => setActiveTab('chat')}
        >
          💬 AI 生图聊天
        </button>
      </nav>

      {activeTab === 'models' ? (
        <div className="main-content">
          <aside className="sidebar">
            <h2>人物列表</h2>
            <div className="model-list">
              {models.map(model => (
                <div
                  key={model.id}
                  className={`model-item ${selectedModel?.id === model.id ? 'active' : ''}`}
                  onClick={() => handleModelSelect(model)}
                >
                  <img
                    src={model.referenceImage}
                    alt={model.name}
                    className="model-avatar"
                  />
                  <span className="model-name">{model.name}</span>
                  <button
                    onClick={(e) => handleDeleteModel(model.id, e)}
                    style={{
                      marginLeft: 'auto',
                      background: 'transparent',
                      border: 'none',
                      color: '#f66',
                      cursor: 'pointer',
                      fontSize: '16px'
                    }}
                    title="删除"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button
              className="create-model-btn"
              onClick={() => setShowCreateModal(true)}
            >
              + 创建新人物
            </button>
          </aside>

          <main className="workspace">
            {selectedModel ? (
              <ModelWorkspace model={selectedModel} onRefresh={refreshModels} />
            ) : (
              <div className="empty-state">
                <h2>欢迎使用图片生成</h2>
                <p>请先创建或选择一个人物开始使用</p>
              </div>
            )}
          </main>
        </div>
      ) : (
        <main className="workspace chat-workspace">
          <ChatPage />
        </main>
      )}

      {showCreateModal && (
        <CreateModelModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false)
            refreshModels()
          }}
        />
      )}
    </div>
  )
}

function CreateModelModal({ onClose, onSuccess }) {
  const [name, setName] = useState('')
  const [image, setImage] = useState(null)
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setImage(file)
      setPreview(URL.createObjectURL(file))
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name || !image) {
      setError('请填写人物名称并上传参考图片')
      return
    }

    setLoading(true)
    setError('')

    try {
      const base64 = await fileToBase64(image)
      const newModel = {
        id: uuid(),
        name,
        referenceImage: base64,
        createdAt: new Date().toISOString(),
        generatedImages: []
      }
      const data = await loadData()
      data.push(newModel)
      await saveData(data)
      onSuccess()
    } catch (err) {
      setError('创建失败：' + err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>创建新人物</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>人物名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入人物名称"
              required
            />
          </div>

          <div className="form-group">
            <label>参考图片</label>
            <div className="upload-area" style={{ cursor: 'pointer' }}>
              <input
                type="file"
                accept="image/*"
                onChange={handleImageChange}
                style={{ display: 'none' }}
                id="model-image"
                required
              />
              <label htmlFor="model-image" style={{ cursor: 'pointer' }}>
                {preview ? (
                  <img src={preview} alt="预览" />
                ) : (
                  <div className="upload-label">
                    <div className="upload-icon">📷</div>
                    <div>点击上传参考图片</div>
                  </div>
                )}
              </label>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="loading"></span> : '创建'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ModelWorkspace({ model, onRefresh }) {
  const [sceneImage, setSceneImage] = useState(null)
  const [scenePreview, setScenePreview] = useState(null)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [genStatus, setGenStatus] = useState('')
  const [genProgress, setGenProgress] = useState(0)
  const [lightboxImage, setLightboxImage] = useState(null)
  const [showHistory, setShowHistory] = useState(false)

  const handleSceneImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setSceneImage(file)
      setScenePreview(URL.createObjectURL(file))
    }
    // 清空 input value，确保下次选同一个文件也能触发 onChange
    e.target.value = ''
  }
  const handleGenerate = async () => {
    if (!sceneImage) {
      setError('请上传场景参考图片')
      return
    }

    setLoading(true)
    setError('')

    try {
      const sceneBase64 = await fileToBase64(sceneImage)
      const generationPrompt = prompt || '将人物放置在提供的场景背景中，保持人物的姿势和外观，自然地融合到新场景中'

      // 注意：47claude 不支持多模态图片输入，只传 prompt
      const generatedUrl = await pollForImage(generationPrompt, (st) => {
        setGenStatus(st.status)
        setGenProgress(st.progress || 0)
      })

      // 更新 IndexedDB
      const data = await loadData()
      const modelIdx = data.findIndex(m => m.id === model.id)
      if (modelIdx !== -1) {
        data[modelIdx].generatedImages.push({
          id: uuid(),
          url: generatedUrl,
          sceneImage: sceneBase64,
          prompt: generationPrompt,
          createdAt: new Date().toISOString()
        })
        await saveData(data)
      }

      setSceneImage(null)
      setScenePreview(null)
      setPrompt('')
      await onRefresh()
    } catch (err) {
      const errObj = err.response?.data?.error
      let errMsg = (errObj && typeof errObj === 'object' ? (errObj.message || JSON.stringify(errObj)) : errObj) || err.message || '生成失败'
      if (err.code === 'ECONNABORTED' || err.message?.includes('524') || err.message?.includes('timeout') || err.message?.includes('Network Error')) {
        errMsg = '生成超时（模型响应较慢），请重试或稍后再次尝试'
      }
      setError(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg))
    } finally {
      setLoading(false)
      setGenStatus('')
      setGenProgress(0)
    }
  }

  const handleDownloadImage = async (imageUrl, filename) => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename || `model-${Date.now()}.png`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('下载失败:', error)
      window.open(imageUrl, '_blank')
    }
  }

  const handleDeleteHistoryImage = async (imageId) => {
    if (!confirm('确定删除这张历史图片吗？')) return
    const data = await loadData()
    const modelIdx = data.findIndex(m => m.id === model.id)
    if (modelIdx !== -1) {
      data[modelIdx].generatedImages = data[modelIdx].generatedImages.filter(img => img.id !== imageId)
      await saveData(data)
      await onRefresh()
    }
  }

  return (
    <div className="model-workspace">
      <div className="model-header">
        <img
          src={model.referenceImage}
          alt={model.name}
        />
        <div className="model-info">
          <h2>{model.name}</h2>
          <p>创建于 {new Date(model.createdAt).toLocaleDateString('zh-CN')}</p>
          <p>已生成 {model.generatedImages?.length || 0} 张图片</p>
          <button
            className="btn btn-secondary history-btn"
            onClick={() => setShowHistory(true)}
          >
            📜 查看历史 ({model.generatedImages?.length || 0})
          </button>
        </div>
      </div>

      <div className="generation-section">
        <div>
          <h3 style={{ marginBottom: '15px', color: '#333' }}>上传场景参考图</h3>
          <div className={`upload-area ${scenePreview ? 'has-image' : ''}`}>
            <input
              type="file"
              accept="image/*"
              onChange={handleSceneImageChange}
              style={{ display: 'none' }}
              id="scene-image"
            />
            <label htmlFor="scene-image" style={{ cursor: 'pointer', width: '100%' }}>
              {scenePreview ? (
                <img src={scenePreview} alt="场景预览" />
              ) : (
                <div className="upload-label">
                  <div className="upload-icon">🖼️</div>
                  <div>点击上传场景参考图片</div>
                </div>
              )}
            </label>
          </div>

          <textarea
            className="prompt-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="描述你想要的生成效果（可选）"
          />

          <button
            className="generate-btn"
            onClick={handleGenerate}
            disabled={loading || !sceneImage}
          >
            {loading ? (
              <span>
                <span className="loading"></span>
                {genStatus === 'reasoning' ? '🤔 推理中...' : genStatus === 'generating' ? '🎨 生成中...' : genStatus === 'connecting' ? '🔗 连接中...' : '生成中...'}
                {genProgress > 0 && ` ${Math.round(genProgress * 100)}%`}
              </span>
            ) : (
              '✨ 生成图片'
            )}
          </button>

          {error && <div className="error-message">{error}</div>}
        </div>

        <div>
          <h3 style={{ marginBottom: '15px', color: '#333' }}>人物参考图</h3>
          <div className="upload-area has-image">
            <img
              src={model.referenceImage}
              alt="人物参考"
            />
          </div>
        </div>
      </div>

      {model.generatedImages && model.generatedImages.length > 0 && (
        <div>
          <h3 style={{ marginBottom: '15px', color: '#333' }}>已生成的图片</h3>
          <div className="generated-images">
            {model.generatedImages.slice().reverse().map(img => (
              <div key={img.id} className="generated-image-card" onClick={() => setLightboxImage(img)}>
                <img src={img.url} alt="生成的图片" />
                <div className="image-info">
                  <p>{img.prompt}</p>
                  <p style={{ fontSize: '0.75rem', color: '#999' }}>
                    {new Date(img.createdAt).toLocaleString('zh-CN')}
                  </p>
                  <button
                    className="download-btn"
                    onClick={(e) => { e.stopPropagation(); handleDownloadImage(img.url, `model-${model.name}-${img.id}.png`) }}
                    style={{
                      marginTop: '8px',
                      padding: '6px 12px',
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      fontWeight: '500',
                      width: '100%',
                      transition: 'all 0.3s'
                    }}
                  >
                    💾 下载图片
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lightbox 大图预览 */}
      {lightboxImage && (
        <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightboxImage(null)}>✕</button>
            <img src={lightboxImage.url} alt="大图预览" />
            <div className="lightbox-info">
              <p>{lightboxImage.prompt}</p>
              <p style={{ fontSize: '0.85rem', color: '#ccc' }}>
                {new Date(lightboxImage.createdAt).toLocaleString('zh-CN')}
              </p>
              <button className="btn btn-primary" onClick={() => handleDownloadImage(lightboxImage.url, `model-${model.name}-${lightboxImage.id}.png`)}>
                💾 下载
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 历史记录弹窗 */}
      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h3>📜 {model.name} 的历史生成记录</h3>
              <button className="btn btn-secondary" onClick={() => setShowHistory(false)}>✕ 关闭</button>
            </div>
            {model.generatedImages?.length > 0 ? (
              <div className="history-grid">
                {model.generatedImages.slice().reverse().map(img => (
                  <div key={img.id} className="history-item">
                    <img src={img.url} alt="历史图片" onClick={() => { setShowHistory(false); setLightboxImage(img) }} />
                    <p>{img.prompt}</p>
                    <p style={{ fontSize: '0.75rem', color: '#999' }}>
                      {new Date(img.createdAt).toLocaleString('zh-CN')}
                    </p>
                    <div className="history-actions">
                      <button className="btn btn-primary btn-sm" onClick={() => handleDownloadImage(img.url, `model-${model.name}-${img.id}.png`)}>
                        💾 下载
                      </button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDeleteHistoryImage(img.id)}>
                        🗑 删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ textAlign: 'center', color: '#999', padding: '40px' }}>暂无历史生成记录</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ChatPage() {
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [uploadedImages, setUploadedImages] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [genStatus, setGenStatus] = useState('')
  const [genProgress, setGenProgress] = useState(0)
  const [lightboxImage, setLightboxImage] = useState(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    loadChatData().then(setMessages)
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleImageUpload = (e) => {
    const files = Array.from(e.target.files)
    files.forEach(file => {
      const reader = new FileReader()
      reader.readAsDataURL(file)
      reader.onload = async () => {
        const compressed = await compressImage(reader.result, 1024, 1024, 0.8)
        setUploadedImages(prev => [...prev, { id: uuid(), base64: compressed, preview: URL.createObjectURL(file) }])
      }
    })
    e.target.value = ''
  }

  const removeUploadedImage = (id) => {
    setUploadedImages(prev => prev.filter(img => img.id !== id))
  }

  const handleSend = async () => {
    if (!inputText.trim() && uploadedImages.length === 0) return

    const userMsg = {
      id: uuid(),
      role: 'user',
      content: inputText,
      images: uploadedImages.map(img => img.base64),
      createdAt: new Date().toISOString()
    }

    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    await saveChatData(newMessages)
    setInputText('')
    const currentImages = [...uploadedImages]
    setUploadedImages([])
    setLoading(true)
    setError('')

    try {
      const generatedUrl = await pollForImage(
        inputText || '根据参考图片生成图片',
        (st) => { setGenStatus(st.status); setGenProgress(st.progress || 0) }
      )

      const assistantMsg = {
        id: uuid(),
        role: 'assistant',
        content: '图片已生成',
        images: [generatedUrl],
        createdAt: new Date().toISOString()
      }

      const finalMessages = [...newMessages, assistantMsg]
      setMessages(finalMessages)
      await saveChatData(finalMessages)
    } catch (err) {
      const errObj = err.response?.data?.error
      let errMsg = (errObj && typeof errObj === 'object' ? (errObj.message || JSON.stringify(errObj)) : errObj) || err.message || '生成失败'
      if (err.code === 'ECONNABORTED' || err.message?.includes('524') || err.message?.includes('timeout') || err.message?.includes('Network Error')) {
        errMsg = '生成超时（模型响应较慢），请重试或稍后再次尝试'
      } else if (err.response?.data?.detail) {
        errMsg = `${errMsg}（${JSON.stringify(err.response.data.detail).substring(0, 200)}）`
      }
      setError(typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg))
    } finally {
      setLoading(false)
      setGenStatus('')
      setGenProgress(0)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleDownload = async (url) => {
    try {
      const res = await fetch(url)
      const blob = await res.blob()
      const a = document.createElement('a')
      a.href = window.URL.createObjectURL(blob)
      a.download = `chat-image-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(a.href)
    } catch {
      window.open(url, '_blank')
    }
  }

  const handleClear = async () => {
    if (!confirm('确定清空所有聊天记录吗？')) return
    setMessages([])
    await saveChatData([])
  }

  return (
    <div className="chat-page">
      <div className="chat-header">
        <h2>💬 AI 生图聊天</h2>
        <button className="btn btn-secondary btn-sm" onClick={handleClear}>🗑 清空记录</button>
      </div>

      <div className="chat-list">
        {messages.length === 0 && (
          <div className="chat-empty">
            <div className="chat-empty-icon">🎨</div>
            <p>上传图片并描述需求，AI 将为您生成图片</p>
            <p style={{ fontSize: '0.85rem', color: '#999' }}>
              支持上传多张参考图，AI 会结合图片和文字描述进行生成
            </p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`chat-message ${msg.role}`}>
            <div className="chat-avatar">
              {msg.role === 'user' ? '👤' : '🤖'}
            </div>
            <div className="chat-bubble">
              {msg.content && <p className="chat-text">{msg.content}</p>}
              {msg.images && msg.images.length > 0 && (
                <div className={`chat-images ${msg.images.length > 1 ? 'multi' : ''}`}>
                  {msg.images.map((img, idx) => (
                    <img
                      key={idx}
                      src={img}
                      alt="图片"
                      onClick={() => setLightboxImage(img)}
                      className="chat-image"
                    />
                  ))}
                </div>
              )}
              <span className="chat-time">
                {new Date(msg.createdAt).toLocaleString('zh-CN')}
              </span>
            </div>
          </div>
        ))}
        {loading && (
          <div className="chat-message assistant">
            <div className="chat-avatar">🤖</div>
            <div className="chat-bubble">
              <div className="chat-loading">
                <span className="loading"></span>
                {genStatus === 'reasoning' ? ' 🤔 AI 正在推理中...' : genStatus === 'generating' ? ' 🎨 图片生成中...' : genStatus === 'connecting' ? ' 🔗 连接中...' : ' AI 正在生成图片...'}
                {genProgress > 0 && <div style={{marginTop:'6px',background:'#e5e7eb',borderRadius:'4px',height:'6px',width:'100%'}}><div style={{background:'#3b82f6',borderRadius:'4px',height:'6px',width:`${Math.round(genProgress*100)}%`,transition:'width 0.5s'}}></div></div>}
              </div>
            </div>
          </div>
        )}
        {error && (
          <div className="chat-error">
            ❌ {error}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="chat-input-area">
        {uploadedImages.length > 0 && (
          <div className="chat-upload-preview">
            {uploadedImages.map(img => (
              <div key={img.id} className="chat-preview-item">
                <img src={img.preview} alt="预览" />
                <button onClick={() => removeUploadedImage(img.id)}>✕</button>
              </div>
            ))}
          </div>
        )}
        <div className="chat-input-row">
          <label className="chat-upload-btn" title="上传图片">
            📎
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleImageUpload}
              style={{ display: 'none' }}
            />
          </label>
          <textarea
            className="chat-textarea"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="描述你想要的图片效果，支持上传多张参考图..."
            rows={2}
          />
          <button
            className="chat-send-btn"
            onClick={handleSend}
            disabled={loading || (!inputText.trim() && uploadedImages.length === 0)}
          >
            {loading ? <span className="loading"></span> : '➤'}
          </button>
        </div>
      </div>

      {lightboxImage && (
        <div className="lightbox-overlay" onClick={() => setLightboxImage(null)}>
          <div className="lightbox-content" onClick={e => e.stopPropagation()}>
            <button className="lightbox-close" onClick={() => setLightboxImage(null)}>✕</button>
            <img src={lightboxImage} alt="大图预览" />
            <div className="lightbox-info">
              <button className="btn btn-primary" onClick={() => handleDownload(lightboxImage)}>
                💾 下载
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
