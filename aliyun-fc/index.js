import https from 'https'

export const handler = (event, context, callback) => {
  // event 可能是字符串或已解析的对象
  let body = {}
  try {
    if (typeof event === 'string') body = JSON.parse(event)
    else if (Buffer.isBuffer(event)) body = JSON.parse(event.toString('utf8'))
    else if (typeof event === 'object' && event !== null) body = event
  } catch {}
  
  // 兼容 HTTP 触发器事件格式
  const httpMethod = body.httpMethod || body.method || ''
  const eventBody = body.body || {}
  const prompt = (typeof eventBody === 'string' ? (() => { try { return JSON.parse(eventBody).prompt } catch { return eventBody } })() : eventBody.prompt) || body.prompt || ''
  
  // CORS 预检
  if (httpMethod === 'OPTIONS') {
    callback(null, {
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
    callback(null, {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: '缺少 prompt', received: JSON.stringify(body).substring(0, 200) })
    })
    return
  }

  if (!apiKey) {
    callback(null, {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: '未配置 OPENAI_API_KEY 环境变量' })
    })
    return
  }

  if (!baseUrl) {
    callback(null, {
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
      // 解析 API 响应，提取图片 URL
      let imageUrl = null
      try {
        const apiData = JSON.parse(data)
        const output = Array.isArray(apiData.output) ? apiData.output : []
        for (const item of output) {
          if (item.type === 'image_generation_call' && item.result) {
            imageUrl = 'data:image/png;base64,' + item.result
            break
          }
        }
      } catch {}

      if (imageUrl) {
        callback(null, {
          statusCode: 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: JSON.stringify({ url: imageUrl })
        })
      } else {
        // 直接转发原始响应
        callback(null, {
          statusCode: res.statusCode || 200,
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
          body: data
        })
      }
    })
  })

  request.on('error', (err) => {
    callback(null, {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: 'API 请求失败: ' + err.message })
    })
  })

  request.write(requestBody)
  request.end()
}
