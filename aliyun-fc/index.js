export const handler = async (event, context) => {
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  }

  // ========== 解析 event ==========
  // 阿里云 FC HTTP 触发器：event 是 Buffer，内容是 HTTP 请求体
  let body = {}
  let method = 'POST'

  if (Buffer.isBuffer(event)) {
    const str = event.toString('utf8').trim()
    // 空 Buffer = OPTIONS preflight 或无体请求，直接返回 CORS 头
    if (!str) {
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }
    try { body = JSON.parse(str) } catch { body = {} }
  } else if (typeof event === 'string') {
    const str = event.trim()
    if (!str) return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    try { body = JSON.parse(str) } catch { body = {} }
  } else if (typeof event === 'object' && event !== null) {
    method = (event.httpMethod || event.method || 'POST').toUpperCase()
    if (method === 'OPTIONS') {
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }
    const rawBody = event.body || '{}'
    try {
      body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody
    } catch { body = {} }
  }

  const prompt = body.prompt || ''

  // 读取环境变量
  const apiKey = process.env.OPENAI_API_KEY || ''
  const baseUrl = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '')
  const model = process.env.IMAGE_MODEL || 'gpt-image-2'

  if (!prompt) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ error: '缺少 prompt' })
    }
  }

  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ error: '未配置 OPENAI_API_KEY 环境变量' })
    }
  }

  if (!baseUrl) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ error: '未配置 OPENAI_BASE_URL 环境变量' })
    }
  }

  // ========== 调用 47claude API ==========
  try {
    const response = await fetch(baseUrl + '/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model,
        input: prompt,
        reasoning: { effort: 'high' },
        store: false,
        tools: [{ type: 'image_generation' }]
      })
    })

    const data = await response.json()

    // ========== 解析图片 ==========
    let imageUrl = null
    let textContent = ''
    const output = Array.isArray(data.output) ? data.output : []

    for (const item of output) {
      if (!item || typeof item !== 'object') continue
      if (item.type === 'image_generation_call' && item.result) {
        imageUrl = 'data:image/png;base64,' + item.result
        break
      }
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (!c) continue
          if ((c.type === 'output_image' || c.type === 'image') && (c.image_url || c.url)) {
            imageUrl = c.image_url || c.url
            break
          }
          if (c.image_url && typeof c.image_url === 'object' && c.image_url.url) {
            imageUrl = c.image_url.url
            break
          }
          if ((c.type === 'output_text' || c.type === 'text') && typeof c.text === 'string') {
            textContent += c.text + '\n'
          }
        }
        if (imageUrl) break
      }
    }

    if (!imageUrl && textContent) {
      const mdMatch = textContent.match(/!\[[^\]]*\]\(([^)]+)\)/)
      if (mdMatch) imageUrl = mdMatch[1]
      if (!imageUrl) {
        const dataMatch = textContent.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/)
        if (dataMatch) imageUrl = dataMatch[0]
      }
      if (!imageUrl) {
        const urlMatch = textContent.match(/https?:\/\/[^\s)"'<>]+\.(?:png|jpg|jpeg|webp|gif)/i)
        if (urlMatch) imageUrl = urlMatch[0]
      }
    }

    if (imageUrl) {
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({ url: imageUrl })
      }
    } else {
      return {
        statusCode: response.status || 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify(data)
      }
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ error: 'API 请求失败: ' + err.message })
    }
  }
}