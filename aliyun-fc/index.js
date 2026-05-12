// 全局日志存储（同一实例生命周期内有效，最多保留 200 条）
const CALL_LOGS = []
const MAX_LOGS = 200

function addLog(entry) {
  CALL_LOGS.unshift(entry)
  if (CALL_LOGS.length > MAX_LOGS) CALL_LOGS.pop()
}

export const handler = async (event, context) => {
  const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400'
  }

  // ========== 解析 event ==========
  let body = {}
  let method = 'POST'
  let rawPath = '/'

  // 诊断日志：记录 event 原始类型
  const reqId = context?.requestId || ''
  console.log(JSON.stringify({ event: 'PARSE_START', reqId, eventType: Buffer.isBuffer(event) ? 'Buffer' : typeof event }))

  if (Buffer.isBuffer(event)) {
    const str = event.toString('utf8').trim()
    if (!str) {
      console.log(JSON.stringify({ event: 'EARLY_RETURN', reqId, reason: 'empty_buffer' }))
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }
    let parsed = {}
    try { parsed = JSON.parse(str) } catch { parsed = {} }

    rawPath = parsed.rawPath || '/'
    if ('body' in parsed) {
      method = (parsed.httpMethod || parsed.method || 'POST').toUpperCase()
      if (method === 'OPTIONS') {
        console.log(JSON.stringify({ event: 'EARLY_RETURN', reqId, reason: 'options_preflight' }))
        return { statusCode: 204, headers: CORS_HEADERS, body: '' }
      }
      let rawBody = parsed.body || ''
      if (parsed.isBase64Encoded && rawBody) {
        rawBody = Buffer.from(rawBody, 'base64').toString('utf8')
      }
      try { body = JSON.parse(rawBody) } catch { body = {} }
    } else {
      body = parsed
    }
  } else if (typeof event === 'string') {
    const str = event.trim()
    if (!str) {
      console.log(JSON.stringify({ event: 'EARLY_RETURN', reqId, reason: 'empty_string' }))
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }
    let parsed = {}
    try { parsed = JSON.parse(str) } catch { parsed = {} }
    rawPath = parsed.rawPath || '/'
    if ('body' in parsed) {
      let rawBody = parsed.body || ''
      if (parsed.isBase64Encoded && rawBody) rawBody = Buffer.from(rawBody, 'base64').toString('utf8')
      try { body = JSON.parse(rawBody) } catch { body = {} }
    } else {
      body = parsed
    }
  } else if (typeof event === 'object' && event !== null) {
    rawPath = event.rawPath || '/'
    method = (event.httpMethod || event.method || 'POST').toUpperCase()
    if (method === 'OPTIONS') {
      console.log(JSON.stringify({ event: 'EARLY_RETURN', reqId, reason: 'options_preflight_obj' }))
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }
    let rawBody = event.body || '{}'
    if (event.isBase64Encoded && rawBody) rawBody = Buffer.from(rawBody, 'base64').toString('utf8')
    try {
      body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody
    } catch { body = {} }
  }

  // ========== /logs 路由：查看调用日志 ==========
  if (rawPath === '/logs') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ total: CALL_LOGS.length, logs: CALL_LOGS }, null, 2)
    }
  }

  const prompt = body.prompt || ''

  // 诊断日志：记录解析后的关键字段
  console.log(JSON.stringify({
    event: 'PARSE_DONE', reqId,
    method, rawPath,
    hasPrompt: !!prompt,
    promptPreview: prompt ? prompt.substring(0, 50) : '',
    bodyKeys: Object.keys(body)
  }))

  // 读取环境变量
  const apiKey = process.env.OPENAI_API_KEY || ''
  const baseUrl = (process.env.OPENAI_BASE_URL || '').replace(/\/$/,  '')
  const model = process.env.IMAGE_MODEL || 'gpt-image-2'

  if (!prompt) {
    console.log(JSON.stringify({ event: 'EARLY_RETURN', reqId, reason: 'no_prompt', bodyKeys: Object.keys(body) }))
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ error: '缺少 prompt' })
    }
  }

  if (!apiKey) {
    console.log(JSON.stringify({ event: 'EARLY_RETURN', reqId, reason: 'no_api_key' }))
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

  // ========== 调用 47claude API（含日志记录）==========
  const callStartTime = new Date()
  const promptSummary = prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt
  const imagesCount = Array.isArray(body.images) ? body.images.length : 0

  console.log(JSON.stringify({
    event: 'API_CALL_START',
    requestId: context?.requestId || '',
    time: callStartTime.toISOString(),
    prompt: promptSummary,
    imagesCount,
    model,
    baseUrl
  }))

  let callSuccess = false
  let callError = null
  let imageUrl = null

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
    const callEndTime = new Date()
    const duration = callEndTime - callStartTime

    // ========== 解析图片 ==========
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

    callSuccess = !!imageUrl

    const logEntry = {
      id: callStartTime.getTime(),
      requestId: context?.requestId || '',
      startTime: callStartTime.toISOString(),
      endTime: callEndTime.toISOString(),
      durationMs: duration,
      durationStr: duration >= 60000
        ? `${Math.floor(duration / 60000)}分${Math.floor((duration % 60000) / 1000)}秒`
        : `${(duration / 1000).toFixed(1)}秒`,
      prompt: promptSummary,
      imagesCount,
      model,
      success: callSuccess,
      error: null,
      httpStatus: response.status,
      imageType: imageUrl ? (imageUrl.startsWith('data:') ? 'base64' : 'url') : null
    }

    addLog(logEntry)

    console.log(JSON.stringify({
      event: 'API_CALL_END',
      ...logEntry
    }))

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
    const callEndTime = new Date()
    const duration = callEndTime - callStartTime
    callError = err.message

    const logEntry = {
      id: callStartTime.getTime(),
      requestId: context?.requestId || '',
      startTime: callStartTime.toISOString(),
      endTime: callEndTime.toISOString(),
      durationMs: duration,
      durationStr: duration >= 60000
        ? `${Math.floor(duration / 60000)}分${Math.floor((duration % 60000) / 1000)}秒`
        : `${(duration / 1000).toFixed(1)}秒`,
      prompt: promptSummary,
      imagesCount,
      model,
      success: false,
      error: err.message,
      httpStatus: null,
      imageType: null
    }

    addLog(logEntry)

    console.log(JSON.stringify({
      event: 'API_CALL_ERROR',
      ...logEntry
    }))

    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ error: 'API 请求失败: ' + err.message })
    }
  }
}
