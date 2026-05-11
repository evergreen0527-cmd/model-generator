import https from 'https'

export const handler = (event, context, callback) => {
  // 解析 event
  let body = {}
  try {
    if (typeof event === 'string') body = JSON.parse(event)
    else if (Buffer.isBuffer(event)) body = JSON.parse(event.toString('utf8'))
    else if (typeof event === 'object' && event !== null) body = event
  } catch {}

  // HTTP 触发器事件格式：{ httpMethod, headers, body, ... }
  const httpMethod = (body.httpMethod || body.method || '').toUpperCase()
  const rawBody = body.body || '{}'
  const eventBody = typeof rawBody === 'string' ? (() => { try { return JSON.parse(rawBody) } catch { return {} } })() : rawBody
  const prompt = eventBody.prompt || body.prompt || ''

  // CORS 预检
  if (httpMethod === 'OPTIONS') {
    context.succeed({
      statusCode: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: ''
    })
    return
  }

  // 读取环境变量
  const apiKey = process.env.OPENAI_API_KEY || ''
  const baseUrl = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '')
  const model = process.env.IMAGE_MODEL || 'gpt-image-2'

  if (!prompt) {
    context.succeed({
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: '缺少 prompt' })
    })
    return
  }

  if (!apiKey) {
    context.succeed({
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: '未配置 OPENAI_API_KEY 环境变量' })
    })
    return
  }

  if (!baseUrl) {
    context.succeed({
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: '未配置 OPENAI_BASE_URL 环境变量' })
    })
    return
  }

  // 发送 API 请求
  const url = new URL(baseUrl + '/responses')
  const requestBody = JSON.stringify({
    model,
    input: prompt,
    reasoning: { effort: 'high' },
    store: false,
    tools: [{ type: 'image_generation' }]
  })

  const options = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname + url.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
      'Content-Length': Buffer.byteLength(requestBody)
    }
  }

  const request = https.request(options, (res) => {
    let data = ''
    res.setEncoding('utf8')
    res.on('data', (chunk) => { data += chunk })
    res.on('end', () => {
      // 解析 API 响应，提取图片
      let imageUrl = null
      let textContent = ''
      try {
        const apiData = JSON.parse(data)
        const output = Array.isArray(apiData.output) ? apiData.output : []
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
      } catch {}

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
        context.succeed({
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ url: imageUrl })
        })
      } else {
        // 转发原始响应，让前端处理
        context.succeed({
          statusCode: res.statusCode || 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: data
        })
      }
    })
  })

  request.on('error', (err) => {
    context.succeed({
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'API 请求失败: ' + err.message })
    })
  })

  request.write(requestBody)
  request.end()
}
