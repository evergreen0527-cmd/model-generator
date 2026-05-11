export const handler = async (event, context) => {
  // 解析 event
  let body = {}
  try {
    if (typeof event === 'string') body = JSON.parse(event)
    else if (typeof event === 'object' && event !== null) body = event
  } catch {}

  // HTTP 触发器事件格式：{ httpMethod, headers, body, ... }
  const httpMethod = (body.httpMethod || body.method || '').toUpperCase()
  const rawBody = body.body || '{}'
  const eventBody = typeof rawBody === 'string' ? (() => { try { return JSON.parse(rawBody) } catch { return {} } })() : rawBody
  const prompt = eventBody.prompt || body.prompt || ''

  // CORS 预检
  if (httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    }
  }

  // 读取环境变量
  const apiKey = process.env.OPENAI_API_KEY || ''
  const baseUrl = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '')
  const model = process.env.IMAGE_MODEL || 'gpt-image-2'

  if (!prompt) {
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: '缺少 prompt', eventKeys: Object.keys(body) })
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

  // 使用 Node.js 18 内置 fetch 发送 API 请求（async/await 方式）
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

    // 解析 API 响应，提取图片
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

    // 从文本中提取图片 URL（兜底）
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
      // 转发原始响应
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
