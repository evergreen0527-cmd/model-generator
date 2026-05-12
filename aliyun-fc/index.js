// ========== 全局存储 ==========
const CALL_LOGS = []
const MAX_LOGS = 200
const TASKS = new Map()   // taskId -> { status, progress, url, error, startTime, ... }
const MAX_TASKS = 50

function addLog(entry) {
  CALL_LOGS.unshift(entry)
  if (CALL_LOGS.length > MAX_LOGS) CALL_LOGS.pop()
}

function generateTaskId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 6)
}

function fmtDuration(ms) {
  return ms >= 60000
    ? `${Math.floor(ms / 60000)}分${Math.floor((ms % 60000) / 1000)}秒`
    : `${(ms / 1000).toFixed(1)}秒`
}

// ========== 后台 stream 任务执行 ==========
async function runImageTask(taskId, prompt, apiKey, baseUrl, model, meta) {
  const task = TASKS.get(taskId)
  if (!task) return
  const callStartTime = new Date()
  const promptSummary = prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt

  // 9 分钟总超时（FC 配 600 秒，留 60 秒余量）
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 540000)

  try {
    task.status = 'connecting'
    task.progress = 0.05

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
        tools: [{ type: 'image_generation' }],
        stream: true
      }),
      signal: controller.signal
    })
    clearTimeout(timer)

    const upstreamStatus = response.status

    // 非 2xx 时直接解析错误（非流式）
    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`
      try {
        const errData = await response.json()
        errMsg = errData?.error?.message || errData?.error || errMsg
      } catch {}
      task.status = 'error'
      task.error = errMsg
      task.progress = 0
      const endTime = new Date()
      addLog({
        id: callStartTime.getTime(), requestId: meta.reqId,
        startTime: callStartTime.toISOString(), endTime: endTime.toISOString(),
        durationMs: endTime - callStartTime, durationStr: fmtDuration(endTime - callStartTime),
        prompt: promptSummary, promptLen: meta.promptLen, rawBodyLen: meta.rawBodyLen,
        imagesCount: meta.imagesCount, model, success: false,
        error: errMsg, httpStatus: upstreamStatus, imageType: null,
        upstreamMs: Date.now() - fetchStart, stage: 'stream_error'
      })
      return
    }

    // ===== 读取 SSE 流 =====
    task.status = 'reasoning'
    task.progress = 0.1
    let imageUrl = null
    let sseBuffer = ''

    for await (const chunk of response.body) {
      const text = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk)
      sseBuffer += text

      // 拆分 SSE 事件（以 \n\n 分割）
      const parts = sseBuffer.split('\n\n')
      sseBuffer = parts.pop() // 最后一块可能不完整

      for (const part of parts) {
        if (!part.trim()) continue
        let eventType = ''
        let eventData = ''
        for (const line of part.split('\n')) {
          if (line.startsWith('event: ')) eventType = line.slice(7).trim()
          else if (line.startsWith('data: ')) eventData += line.slice(6)
        }
        if (!eventData || eventData === '[DONE]') continue

        try {
          const parsed = JSON.parse(eventData)
          const t = eventType || parsed.type || ''

          if (t.includes('created')) {
            task.status = 'reasoning'
            task.progress = 0.1
          }
          if (t.includes('reasoning')) {
            task.status = 'reasoning'
            task.progress = Math.min(0.5, task.progress + 0.01)
          }
          if (t.includes('image_generation_call') && !t.includes('done')) {
            task.status = 'generating'
            task.progress = Math.max(0.6, task.progress)
          }
          // output_item.done 里拿到完整 base64
          if (t === 'response.output_item.done') {
            const item = parsed.item || parsed
            if (item.type === 'image_generation_call' && item.result) {
              imageUrl = 'data:image/png;base64,' + item.result
              task.progress = 0.95
            }
          }
          // response.completed 兜底
          if (t === 'response.completed' || t === 'response.done') {
            if (!imageUrl && parsed.response?.output) {
              for (const item of parsed.response.output) {
                if (item.type === 'image_generation_call' && item.result) {
                  imageUrl = 'data:image/png;base64,' + item.result
                  break
                }
              }
            }
          }
        } catch (e) {
          // SSE event JSON 解析失败，跳过
        }
      }
    }

    // ===== 流结束 =====
    const upstreamMs = Date.now() - fetchStart
    const endTime = new Date()
    const duration = endTime - callStartTime

    if (imageUrl) {
      task.status = 'done'
      task.progress = 1
      task.url = imageUrl
      const responseSizeKb = Math.round(imageUrl.length / 1024)
      addLog({
        id: callStartTime.getTime(), requestId: meta.reqId,
        startTime: callStartTime.toISOString(), endTime: endTime.toISOString(),
        durationMs: duration, durationStr: fmtDuration(duration),
        prompt: promptSummary, promptLen: meta.promptLen, rawBodyLen: meta.rawBodyLen,
        imagesCount: meta.imagesCount, model, success: true,
        error: null, httpStatus: upstreamStatus, imageType: 'base64',
        upstreamMs, responseSizeKb, stage: 'stream_done'
      })
      console.log(JSON.stringify({ event: 'STREAM_SUCCESS', taskId, duration: fmtDuration(duration), responseSizeKb }))
    } else {
      task.status = 'error'
      task.error = '上游未返回图片(stream结束但无image)'
      addLog({
        id: callStartTime.getTime(), requestId: meta.reqId,
        startTime: callStartTime.toISOString(), endTime: endTime.toISOString(),
        durationMs: duration, durationStr: fmtDuration(duration),
        prompt: promptSummary, promptLen: meta.promptLen, rawBodyLen: meta.rawBodyLen,
        imagesCount: meta.imagesCount, model, success: false,
        error: '上游未返回图片', httpStatus: upstreamStatus, imageType: null,
        upstreamMs, stage: 'stream_no_image'
      })
    }
  } catch (err) {
    clearTimeout(timer)
    const endTime = new Date()
    const duration = endTime - callStartTime
    const errMsg = err.name === 'AbortError' ? '请求超时(已等待9分钟)' : err.message
    task.status = 'error'
    task.error = errMsg
    addLog({
      id: callStartTime.getTime(), requestId: meta.reqId,
      startTime: callStartTime.toISOString(), endTime: endTime.toISOString(),
      durationMs: duration, durationStr: fmtDuration(duration),
      prompt: promptSummary, promptLen: meta.promptLen, rawBodyLen: meta.rawBodyLen,
      imagesCount: meta.imagesCount, model, success: false,
      error: errMsg, httpStatus: null, imageType: null,
      upstreamMs: Date.now() - callStartTime.getTime(), stage: 'stream_fetch_error'
    })
    console.log(JSON.stringify({ event: 'STREAM_ERROR', taskId, error: errMsg, duration: fmtDuration(duration) }))
  }
}

// ========== FC Handler ==========
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
  let rawBodyLen = 0
  let bodyParseError = null
  let reqContentLength = null
  let queryParams = {}
  const reqId = context?.requestId || ''

  if (Buffer.isBuffer(event)) {
    const str = event.toString('utf8').trim()
    rawBodyLen = str.length
    if (!str) return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    let parsed = {}
    try { parsed = JSON.parse(str) } catch (e) { parsed = {}; bodyParseError = 'outer:' + e.message }
    rawPath = parsed.rawPath || '/'
    queryParams = parsed.queryStringParameters || parsed.queryParameters || {}
    const reqHeaders = parsed.headers || {}
    reqContentLength = reqHeaders['content-length'] || reqHeaders['Content-Length'] || null
    method = (parsed.httpMethod || parsed.method || parsed.requestMethod || 'POST').toUpperCase()
    const isOptions = method === 'OPTIONS' ||
      !!(reqHeaders['access-control-request-method'] || reqHeaders['Access-Control-Request-Method'])
    if (isOptions) return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    if ('body' in parsed) {
      let rawBody = parsed.body || ''
      if (parsed.isBase64Encoded && rawBody) rawBody = Buffer.from(rawBody, 'base64').toString('utf8')
      try { body = JSON.parse(rawBody) } catch (e) { body = {}; bodyParseError = 'inner:' + e.message }
    } else {
      body = parsed
    }
  } else if (typeof event === 'string') {
    const str = event.trim()
    rawBodyLen = str.length
    if (!str) return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    let parsed = {}
    try { parsed = JSON.parse(str) } catch (e) { parsed = {}; bodyParseError = 'outer:' + e.message }
    rawPath = parsed.rawPath || '/'
    queryParams = parsed.queryStringParameters || parsed.queryParameters || {}
    const reqHeaders = parsed.headers || {}
    reqContentLength = reqHeaders['content-length'] || reqHeaders['Content-Length'] || null
    method = (parsed.httpMethod || parsed.method || 'POST').toUpperCase()
    const isOptions = method === 'OPTIONS' ||
      !!(reqHeaders['access-control-request-method'] || reqHeaders['Access-Control-Request-Method'])
    if (isOptions) return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    if ('body' in parsed) {
      let rawBody = parsed.body || ''
      if (parsed.isBase64Encoded && rawBody) rawBody = Buffer.from(rawBody, 'base64').toString('utf8')
      try { body = JSON.parse(rawBody) } catch (e) { body = {}; bodyParseError = 'inner:' + e.message }
    } else {
      body = parsed
    }
  } else if (typeof event === 'object' && event !== null) {
    rawPath = event.rawPath || '/'
    queryParams = event.queryStringParameters || event.queryParameters || {}
    const reqHeaders = event.headers || {}
    reqContentLength = reqHeaders['content-length'] || reqHeaders['Content-Length'] || null
    method = (event.httpMethod || event.method || 'POST').toUpperCase()
    const isOptions = method === 'OPTIONS' ||
      !!(reqHeaders['access-control-request-method'] || reqHeaders['Access-Control-Request-Method'])
    if (isOptions) return { statusCode: 204, headers: CORS_HEADERS, body: '' }
    let rawBody = event.body || '{}'
    if (event.isBase64Encoded && rawBody) rawBody = Buffer.from(rawBody, 'base64').toString('utf8')
    rawBodyLen = typeof rawBody === 'string' ? rawBody.length : 0
    try { body = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody }
    catch (e) { body = {}; bodyParseError = 'inner:' + e.message }
  }

  // ========== /logs 路由 ==========
  if (rawPath === '/logs') {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ total: CALL_LOGS.length, logs: CALL_LOGS }, null, 2)
    }
  }

  // ========== /status 路由：查询任务进度 ==========
  if (rawPath === '/status') {
    const taskId = queryParams.id || ''
    if (!taskId) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({ error: '缺少 id 参数' })
      }
    }
    const task = TASKS.get(taskId)
    if (!task) {
      return {
        statusCode: 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
        body: JSON.stringify({ error: '任务不存在(可能已过期)', status: 'error' })
      }
    }
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({
        status: task.status,
        progress: task.progress,
        url: task.url || null,
        error: task.error || null,
        elapsed: Date.now() - task.startTime
      })
    }
  }

  // ========== POST / → 发起生图任务 ==========
  const prompt = body.prompt || ''
  const promptLen = prompt.length
  const imagesCount = Array.isArray(body.images) ? body.images.length : 0
  const apiKey = process.env.OPENAI_API_KEY || ''
  const baseUrl = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '')
  const model = process.env.IMAGE_MODEL || 'gpt-image-2'

  // 早退日志
  function logEarlyReturn(reason) {
    const ts = new Date()
    addLog({
      id: ts.getTime(), requestId: reqId,
      startTime: ts.toISOString(), endTime: ts.toISOString(),
      durationMs: 0, durationStr: '0秒',
      prompt: prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt,
      promptLen, imagesCount, rawBodyLen, bodyParseError, model,
      success: false, error: reason, httpStatus: null, imageType: null, stage: 'early_return'
    })
  }

  if (!prompt) {
    logEarlyReturn('缺少 prompt (rawBodyLen=' + rawBodyLen + ', bodyParseError=' + bodyParseError + ')')
    return {
      statusCode: 400,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ error: '缺少 prompt', debug: { rawBodyLen, bodyParseError } })
    }
  }
  if (!apiKey) {
    logEarlyReturn('未配置 OPENAI_API_KEY')
    return { statusCode: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ error: '未配置 OPENAI_API_KEY' }) }
  }
  if (!baseUrl) {
    logEarlyReturn('未配置 OPENAI_BASE_URL')
    return { statusCode: 500, headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      body: JSON.stringify({ error: '未配置 OPENAI_BASE_URL' }) }
  }

  // 创建任务
  const taskId = generateTaskId()
  TASKS.set(taskId, {
    status: 'pending', progress: 0, url: null, error: null,
    startTime: Date.now()
  })

  // 清理旧任务（保留最近 MAX_TASKS 个）
  if (TASKS.size > MAX_TASKS) {
    const keys = [...TASKS.keys()]
    for (let i = 0; i < keys.length - MAX_TASKS; i++) {
      TASKS.delete(keys[i])
    }
  }

  console.log(JSON.stringify({
    event: 'TASK_CREATED', taskId, prompt: prompt.length > 100 ? prompt.substring(0, 100) + '...' : prompt,
    promptLen, model
  }))

  // 后台执行（不 await，立即返回 taskId）
  runImageTask(taskId, prompt, apiKey, baseUrl, model, {
    reqId, promptLen, rawBodyLen, imagesCount
  }).catch(err => console.error('Task fatal:', taskId, err))

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify({ taskId })
  }
}
