import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

const DB_NAME = 'model_generator_db'
const STORE_NAME = 'models'
const DATA_KEY = 'data'
const LEGACY_KEY = 'model_generator_data'

// 文件转 base64
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result)
    reader.onerror = (error) => reject(error)
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

function App() {
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)

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
    if (!confirm('确定删除该模特及其所有生成历史吗？')) return
    const current = await loadData()
    const data = current.filter(m => m.id !== modelId)
    await saveData(data)
    if (selectedModel?.id === modelId) setSelectedModel(null)
    setModels(data)
  }

  return (
    <div className="container">
      <header className="header">
        <h1>🎨 模特图生成器</h1>
        <p>基于 AI 的模特图片生成平台</p>
      </header>

      <div className="main-content">
        <aside className="sidebar">
          <h2>我的模特</h2>
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
            + 创建新模特
          </button>
        </aside>

        <main className="workspace">
          {selectedModel ? (
            <ModelWorkspace model={selectedModel} onRefresh={refreshModels} />
          ) : (
            <div className="empty-state">
              <h2>欢迎使用模特图生成器</h2>
              <p>请先创建或选择一个模特开始使用</p>
            </div>
          )}
        </main>
      </div>

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
      setError('请填写模特名称并上传参考图片')
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
        <h3>创建新模特</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>模特名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="请输入模特名称"
              required
            />
          </div>

          <div className="form-group">
            <label>模特参考图片</label>
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
                    <div>点击上传模特参考图片</div>
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

  const handleSceneImageChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      setSceneImage(file)
      setScenePreview(URL.createObjectURL(file))
    }
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
      const generationPrompt = prompt || '将模特放置在提供的场景背景中，保持模特的姿势和外观，自然地融合到新场景中'

      // 调用 Pages Functions API 生成图片
      const response = await axios.post('/api/generate', {
        prompt: generationPrompt
      })

      const generatedUrl = response.data.url

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
      setError(err.response?.data?.error || err.message || '生成失败')
    } finally {
      setLoading(false)
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
                <span className="loading"></span> 生成中...
              </span>
            ) : (
              '✨ 生成模特图'
            )}
          </button>

          {error && <div className="error-message">{error}</div>}
        </div>

        <div>
          <h3 style={{ marginBottom: '15px', color: '#333' }}>模特参考图</h3>
          <div className="upload-area has-image">
            <img
              src={model.referenceImage}
              alt="模特参考"
            />
          </div>
        </div>
      </div>

      {model.generatedImages && model.generatedImages.length > 0 && (
        <div>
          <h3 style={{ marginBottom: '15px', color: '#333' }}>已生成的图片</h3>
          <div className="generated-images">
            {model.generatedImages.map(img => (
              <div key={img.id} className="generated-image-card">
                <img src={img.url} alt="生成的图片" />
                <div className="image-info">
                  <p>{img.prompt}</p>
                  <p style={{ fontSize: '0.75rem', color: '#999' }}>
                    {new Date(img.createdAt).toLocaleString('zh-CN')}
                  </p>
                  <button
                    className="download-btn"
                    onClick={() => handleDownloadImage(img.url, `model-${model.name}-${img.id}.png`)}
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
    </div>
  )
}

export default App
