'use strict'

module.exports.handler = function (req, resp, context) {
  try {
    const method = req.method || ''

    // CORS 预检
    if (method === 'OPTIONS') {
      resp.setStatusCode(204)
      resp.setHeader('Access-Control-Allow-Origin', '*')
      resp.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      resp.setHeader('Access-Control-Allow-Headers', 'Content-Type')
      resp.send('')
      return
    }

    // 读取请求体
    let rawBody = ''
    if (req.body) {
      if (Buffer.isBuffer(req.body)) rawBody = req.body.toString('utf8')
      else if (typeof req.body === 'string') rawBody = req.body
      else rawBody = JSON.stringify(req.body)
    }

    let body = {}
    try { body = JSON.parse(rawBody || '{}') } catch {}

    const prompt = body.prompt || ''
    const apiKey = process.env.OPENAI_API_KEY || ''
    const baseUrl = (process.env.OPENAI_BASE_URL || '').replace(/\/$/, '')
    const model = process.env.IMAGE_MODEL || 'gpt-image-2'

    // 参数检查
    if (!prompt) {
      resp.setStatusCode(400)
      resp.setHeader('Content-Type', 'application/json')
      resp.setHeader('Access-Control-Allow-Origin', '*')
      resp.send(JSON.stringify({ error: '缺少 prompt', body: rawBody.substring(0, 200) }))
      return
    }

    if (!apiKey) {
      resp.setStatusCode(500)
      resp.setHeader('Content-Type', 'application/json')
      resp.setHeader('Access-Control-Allow-Origin', '*')
      resp.send(JSON.stringify({ error: '未配置 OPENAI_API_KEY 环境变量' }))
      return
    }

    if (!baseUrl) {
      resp.setStatusCode(500)
      resp.setHeader('Content-Type', 'application/json')
      resp.setHeader('Access-Control-Allow-Origin', '*')
      resp.send(JSON.stringify({ error: '未配置 OPENAI_BASE_URL 环境变量' }))
      return
    }

    // 发送 API 请求（使用内置 fetch 或 http）
    const https = require('https')
    const url = new URL(`${baseUrl}/responses`)
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
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }

    const request = https.request(options, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => data += chunk)
      res.on('end', () => {
        resp.setStatusCode(200)
        resp.setHeader('Content-Type', 'application/json')
        resp.setHeader('Access-Control-Allow-Origin', '*')
        resp.send(data)
      })
    })

    request.on('error', (err) => {
      resp.setStatusCode(500)
      resp.setHeader('Content-Type', 'application/json')
      resp.setHeader('Access-Control-Allow-Origin', '*')
      resp.send(JSON.stringify({ error: 'API 请求失败: ' + err.message }))
    })

    request.write(requestBody)
    request.end()

  } catch (err) {
    resp.setStatusCode(500)
    resp.setHeader('Content-Type', 'application/json')
    resp.setHeader('Access-Control-Allow-Origin', '*')
    resp.send(JSON.stringify({ error: '内部错误: ' + (err.message || String(err)) }))
  }
}
