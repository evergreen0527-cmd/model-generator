import { useState, useEffect } from 'react'
import axios from 'axios'
import './App.css'

// 使用环境变量或默认本地地址
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || ''

function App() {
  const [models, setModels] = useState([])
  const [selectedModel, setSelectedModel] = useState(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchModels()
  }, [])

  const fetchModels = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/models`)
      setModels(response.data)
    } catch (err) {
      console.error('获取模特列表失败:', err)
    }
  }

  const handleModelSelect = async (model) => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/models/${model.id}`)
      setSelectedModel(response.data)
    } catch (err) {
      console.error('获取模特详情失败:', err)
    }
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
                  src={`${API_BASE_URL}${model.referenceImage}`}
                  alt={model.name}
                  className="model-avatar"
                />
                <span className="model-name">{model.name}</span>
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
            <ModelWorkspace model={selectedModel} onRefresh={() => handleModelSelect(selectedModel)} />
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
            fetchModels()
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
      const formData = new FormData()
      formData.append('name', name)
      formData.append('referenceImage', image)

      await axios.post(`${API_BASE_URL}/api/models`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      onSuccess()
    } catch (err) {
      setError(err.response?.data?.error || '创建失败')
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
      const formData = new FormData()
      formData.append('sceneImage', sceneImage)
      formData.append('prompt', prompt)

      await axios.post(`${API_BASE_URL}/api/models/${model.id}/generate`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      })

      setSceneImage(null)
      setScenePreview(null)
      setPrompt('')
      onRefresh()
    } catch (err) {
      setError(err.response?.data?.error || '生成失败')
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
      // 如果下载失败，尝试直接打开
      window.open(imageUrl, '_blank')
    }
  }

  return (
    <div className="model-workspace">
      <div className="model-header">
        <img
          src={`${API_BASE_URL}${model.referenceImage}`}
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
              src={`${API_BASE_URL}${model.referenceImage}`}
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
                    onMouseEnter={(e) => {
                      e.target.style.transform = 'translateY(-2px)'
                      e.target.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)'
                    }}
                    onMouseLeave={(e) => {
                      e.target.style.transform = 'translateY(0)'
                      e.target.style.boxShadow = 'none'
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
