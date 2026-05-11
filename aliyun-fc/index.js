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
    if (!str) {
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }
    let parsed = {}
    try { parsed = JSON.parse(str) } catch { parsed = {} }

    // 阿里云 FC HTTP 触发器事件对象：{version, rawPath, headers, body, isBase64Encoded, ...}
    // 请求体在 parsed.body 字段里，不是直接是请求体
    if ('body' in parsed) {
      const httpMethod = (parsed.httpMethod || parsed.method || 'POST').toUpperCase()
      if (httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers: CORS_HEADERS, body: '' }
      }
      let rawBody = parsed.body || ''
      // 如果 body 是 base64 编码的，需要先解码
      if (parsed.isBase64Encoded && rawBody) {
        rawBody = Buffer.from(rawBody, 'base64').toString('utf8')
      }
      try { body = JSON.parse(rawBody) } catch { body = {} }
    } else {
      // 兼容：如果没有 body 字段，直接当请求体使用
      body = parsed
    }
  } else if (typeof event === 'string') {
    const str = event.trim()
    if (!str) return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    let parsed = {}
    try { parsed = JSON.parse(str) } catch { parsed = {} }
    if ('body' in parsed) {
      let rawBody = parsed.body || ''
      if (parsed.isBase64Encoded && rawBody) rawBody = Buffer.from(rawBody, 'base64').toString('utf8')
      try { body = JSON.parse(rawBody) } catch { body = {} }
    } else {
      body = parsed
    }
  } else if (typeof event === 'object' && event !== null) {
    method = (event.httpMethod || event.method || 'POST').toUpperCase()
    if (method === 'OPTIONS') {
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }
    let rawBody = event.body || '{}'
    if (event.isBase64Encoded && rawBody) rawBody = Buffer.from(rawBody, 'base64').toString('utf8')
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