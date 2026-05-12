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
  let rawBodyLen = 0              // 用于诊断：body 的原始长度（未解析前）
  let bodyParseError = null       // body 解析异常信息
  let reqContentLength = null     // 请求头声明的 Content-Length

  // 诊断日志：记录 event 原始类型与大小
  const reqId = context?.requestId || ''

  if (Buffer.isBuffer(event)) {
    const str = event.toString('utf8').trim()
    rawBodyLen = str.length
    if (!str) {
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }
    let parsed = {}
    try { parsed = JSON.parse(str) } catch (e) { parsed = {}; bodyParseError = 'outer_parse:' + e.message }

    rawPath = parsed.rawPath || '/'
    const reqHeaders = parsed.headers || {}
    reqContentLength = reqHeaders['content-length'] || reqHeaders['Content-Length'] || null
    method = (parsed.httpMethod || parsed.method || parsed.requestMethod || 'POST').toUpperCase()

    // 增强 OPTIONS 检测：同时检查 httpMethod 和 CORS preflight 头
    const isOptions = method === 'OPTIONS' ||
      !!(reqHeaders['access-control-request-method'] || reqHeaders['Access-Control-Request-Method'])
    if (isOptions) {
      return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    }

    if ('body' in parsed) {
      let rawBody = parsed.body || ''
      if (parsed.isBase64Encoded && rawBody) {
        rawBody = Buffer.from(rawBody, 'base64').toString('utf8')
      }
      try { body = JSON.parse(rawBody) } catch (e) { body = {}; bodyParseError = 'inner_parse:' + e.message + '/rawLen=' + rawBody.length }
    } else {
      body = parsed
    }
  } else if (typeof event === 'string') {
    const str = event.trim()
    rawBodyLen = str.length
    if (!str) return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    let parsed = {}
    try { parsed = JSON.parse(str) } catch (e) { parsed = {}; bodyParseError = 'outer_parse:' + e.message }
    rawPath = parsed.rawPath || '/'
    const reqHeaders = parsed.headers || {}
    reqContentLength = reqHeaders['content-length'] || reqHeaders['Content-Length'] || null
    method = (parsed.httpMethod || parsed.method || 'POST').toUpperCase()
    const isOptions = method === 'OPTIONS' ||
      !!(reqHeaders['access-control-request-method'] || reqHeaders['Access-Control-Request-Method'])
    if (isOptions) return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    if ('body' in parsed) {
      let rawBody = parsed.body || ''
      if (parsed.isBase64Encoded && rawBody) rawBody = Buffer.from(rawBody, 'base64').toString('utf8')
      try { body = JSON.parse(rawBody) } catch (e) { body = {}; bodyParseError = 'inner_parse:' + e.message + '/rawLen=' + rawBody.length }
    } else {
      body = parsed
    }
  } else if (typeof event === 'object' && event !== null) {
    rawPath = event.rawPath || '/'
    const reqHeaders = event.headers || {}
    reqContentLength = reqHeaders['content-length'] || reqHeaders['Content-Length'] || null
    method = (event.httpMethod || event.method || 'POST').toUpperCase()
    const isOptions = method === 'OPTIONS' ||
      !!(reqHeaders['access-control-request-method'] || reqHeaders['Access-Control-Request-Method'])
    if (isOptions) return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    let rawBody = event.body || '{}'
    if (event.isBase64Encoded && rawBody) rawBody = Buffer.from(rawBody, 'base64').toString('utf8')
    rawBodyLen = typeof rawBody === 'string' ? rawBody.length : 0
    try {
      body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody
    } catch (e) { body = {}; bodyParseError = 'inner_parse:' + e.message + '/rawLen=' + rawBodyLen }
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

  // 请求入口诊断日志：无论后续是否调用 47claude，所有非OPTIONS/非logs 请求均留痕
  const promptLen = prompt.length
  const imagesCount = Array.isArray(body.images) ? body.images.length : 0

  // 读取环境变量
  const apiKey = process.env.OPENAI_API_KEY || ''
  const baseUrl = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '')
  const model = process.env.IMAGE_MODEL || 'gpt-image-2'

  // 提前返回的情况也写入日志，方便排查 “长 prompt 失败且无记录” 问题
  function logEarlyReturn(reason) {
    const ts = new Date()
    addLog({
      id: ts.getTime(),
      requestId: reqId,
      startTime: ts.toISOString(),
      endTime: ts.toISOString(),
      durationMs: 0,
      durationStr: '0秒',
      prompt: prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt,
      promptLen,
      imagesCount,
      rawBodyLen,
      reqContentLength,
      bodyParseError,
      model,
      success: false,
      error: reason,
      httpStatus: null,
      imageType: null,
      stage: 'early_return'
    })
  }

  if (!prompt) {
    logEarlyReturn('缺少 prompt (rawBodyLen=' + rawBodyLen + ', contentLength=' + reqContentLength + ', bodyParseError=' + bodyParseError + ')')
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ error: '缺少 prompt', debug: { rawBodyLen, reqContentLength, bodyParseError } })
    }
  }

  if (!apiKey) {
    logEarlyReturn('未配置 OPENAI_API_KEY')
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ error: '未配置 OPENAI_API_KEY 环境变量' })
    }
  }

  if (!baseUrl) {
    logEarlyReturn('未配置 OPENAI_BASE_URL')
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ error: '未配置 OPENAI_BASE_URL 环境变量' })
    }
  }

  // ========== 调用 47claude API（含日志记录）==========
  const callStartTime = new Date()
  const promptSummary = prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt
  console.log(JSON.stringify({
    event: 'API_CALL_START',
    requestId: context?.requestId || '',
    time: callStartTime.toISOString(),
    prompt: promptSummary,
    promptLen,
    rawBodyLen,
    imagesCount,
    model,
    baseUrl
  }))

  let callSuccess = false
  let callError = null
  let imageUrl = null
  let upstreamMs = 0       // fetch 47claude 纯耗时
  let parseMs = 0          // 解析响应耗时
  let upstreamStatus = null

  try {
    const fetchStart = Date.now()
    const response = await fetch(baseUrl + '/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey
      },
      body: JSON.stringify({
        model,
        input: prompt,
        store: false,
        reasoning: { effort: 'low' },
        tools: [{ type: 'image_generation' }]
      })
    })

    const data = await response.json()
    upstreamMs = Date.now() - fetchStart
    upstreamStatus = response.status
    const callEndTime = new Date()
    const duration = callEndTime - callStartTime
    const parseStart = Date.now()

    // ========== 解析图片 ==========
    // 优先解析 chat/completions 响应：choices[0].message.content 中的图片
    let textContent = ''
    if (Array.isArray(data.choices) && data.choices.length > 0) {
      const msg = data.choices[0].message || {}
      if (typeof msg.content === 'string') {
        textContent = msg.content
      } else if (Array.isArray(msg.content)) {
        for (const c of msg.content) {
          if (!c) continue
          if ((c.type === 'image_url' || c.type === 'output_image') && c.image_url) {
            imageUrl = typeof c.image_url === 'string' ? c.image_url : c.image_url.url
            if (imageUrl) break
          }
          if (typeof c.text === 'string') textContent += c.text + '\n'
        }
      }
      // 部分网关会把图放在 message.images 里
      if (!imageUrl && Array.isArray(msg.images) && msg.images.length > 0) {
        const img0 = msg.images[0]
        imageUrl = typeof img0 === 'string' ? img0 : (img0.url || img0.image_url || null)
      }
    }

    // 兜底：images/generations 风格
    if (!imageUrl && Array.isArray(data.data) && data.data.length > 0) {
      const first = data.data[0]
      if (first.url) imageUrl = first.url
      else if (first.b64_json) imageUrl = 'data:image/png;base64,' + first.b64_json
    }

    // 兜底：Responses API 风格
    const output = !imageUrl && Array.isArray(data.output) ? data.output : []

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
    parseMs = Date.now() - parseStart

    // 估算响应体大小（base64 图片是主要流量）
    const responseBodyStr = imageUrl ? JSON.stringify({ url: imageUrl }) : JSON.stringify(data)
    const responseSizeKb = Math.round(responseBodyStr.length / 1024)

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
      promptLen,
      rawBodyLen,
      imagesCount,
      model,
      success: callSuccess,
      error: null,
      httpStatus: response.status,
      imageType: imageUrl ? (imageUrl.startsWith('data:') ? 'base64' : 'url') : null,
      upstreamMs,
      parseMs,
      responseSizeKb,
      stage: 'completed'
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
      promptLen,
      rawBodyLen,
      imagesCount,
      model,
      success: false,
      error: err.message,
      httpStatus: null,
      imageType: null,
      upstreamMs,
      parseMs,
      responseSizeKb: 0,
      stage: 'fetch_error'
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
