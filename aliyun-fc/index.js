export const handler = async (event, context) => {
  // ========== 解析 event ==========
  // 阿里云 FC HTTP 触发器：event 是 Buffer，内容是 HTTP 请求体
  let body = {}
  if (Buffer.isBuffer(event)) {
    try { body = JSON.parse(event.toString('utf8')) } catch { body = {} }
  } else if (typeof event === 'string') {
    try { body = JSON.parse(event) } catch { body = {} }
  } else if (typeof event === 'object' && event !== null) {
    // 兼容：如果 event 是对象，尝试从 event.body 取
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
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: '缺少 prompt' })
    }
  }

  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: '未配置 OPENAI_API_KEY 环境变量' })
    }
  }

  if (!baseUrl) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
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
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ url: imageUrl })
      }
    } else {
      return {
        statusCode: response.status || 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify(data)
      }
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'API 请求失败: ' + err.message })
    }
  }
}