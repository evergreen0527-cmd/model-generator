'use strict'

// 阿里云函数计算 FC - HTTP 函数入口
// 支持 600 秒超时（突破 Cloudflare 100 秒限制）

const http = require('http')
const https = require('https')

module.exports.handler = async function (req, resp, context) {
  // 只处理 POST 请求
  if (req.method !== 'POST' && req.method !== 'OPTIONS') {
    resp.setStatusCode(405)
    resp.setHeader('Content-Type', 'application/json')
    resp.send(JSON.stringify({ error: '仅支持 POST 和 OPTIONS 请求' }))
    return
  }

  // CORS 预检
  if (req.method === 'OPTIONS') {
    resp.setStatusCode(204)
    resp.setHeader('Access-Control-Allow-Origin', '*')
    resp.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    resp.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    resp.send('')
    return
  }

  try {
    // 解析请求体
    const body = JSON.parse(req.body || '{}')
    const { prompt } = body

    if (!prompt) {
      resp.setStatusCode(400)
      resp.setHeader('Content-Type', 'application/json')
      resp.send(JSON.stringify({ error: '缺少 prompt 参数' }))
      return
    }

    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
    const apiKey = process.env.OPENAI_API_KEY
    const model = process.env.IMAGE_MODEL || 'gpt-image-2'

    if (!apiKey) {
      resp.setStatusCode(500)
      resp.setHeader('Content-Type', 'application/json')
      resp.send(JSON.stringify({ error: '服务端未配置 OPENAI_API_KEY' }))
      return
    }

    // 调用 Responses API
    const apiResp = await new Promise((resolve, reject) => {
      const url = new URL(`${baseUrl}/responses`)
      const client = url.protocol === 'https:' ? https : http
      const requestBody = JSON.stringify({
        model,
        input: prompt,
        reasoning: { effort: 'high' },
        store: false,
        tools: [{ type: 'image_generation' }]
      })

      const request = client.request({
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'Content-Length': Buffer.byteLength(requestBody)
        },
        timeout: 550000 // 550 秒（接近 FC 600 秒上限，留 50 秒缓冲）
      }, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            const json = JSON.parse(data)
            resolve({ ok: res.statusCode < 400, status: res.statusCode, json })
          } catch {
            resolve({ ok: false, status: res.statusCode, json: { message: data } })
          }
        })
      })

      request.on('error', reject)
      request.on('timeout', () => {
        request.destroy()
        reject(new Error('API 请求超时（超过 550 秒）'))
      })

      request.write(requestBody)
      request.end()
    })

    if (!apiResp.ok) {
      resp.setStatusCode(apiResp.status)
      resp.setHeader('Content-Type', 'application/json')
      resp.send(JSON.stringify({
        error: apiResp.json.error?.message || apiResp.json.message || '图片生成失败',
        detail: apiResp.json
      }))
      return
    }

    const data = apiResp.json

    // 解析 Responses API 响应，提取图片
    let imageUrl = null
    let textContent = ''
    const output = Array.isArray(data.output) ? data.output : []

    for (const item of output) {
      if (!item || typeof item !== 'object') continue

      if (item.type === 'image_generation_call' && item.result) {
        imageUrl = `data:image/png;base64,${item.result}`
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

    const fallbackText = data.output_text || textContent
    if (!imageUrl && typeof fallbackText === 'string' && fallbackText) {
      const mdMatch = fallbackText.match(/!\[[^\]]*\]\(([^)]+)\)/)
      if (mdMatch) imageUrl = mdMatch[1]

      if (!imageUrl) {
        const dataMatch = fallbackText.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/)
        if (dataMatch) imageUrl = dataMatch[0]
      }

      if (!imageUrl) {
        const imgUrlMatch = fallbackText.match(/https?:\/\/[^\s)"'<>]+\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s)"'<>]*)?/i)
        if (imgUrlMatch) imageUrl = imgUrlMatch[0]
      }

      if (!imageUrl) {
        const anyUrl = fallbackText.match(/https?:\/\/[^\s)"'<>]+/)
        if (anyUrl) imageUrl = anyUrl[0]
      }
    }

    resp.setStatusCode(200)
    resp.setHeader('Content-Type', 'application/json')
    resp.setHeader('Access-Control-Allow-Origin', '*')

    if (imageUrl) {
      resp.send(JSON.stringify({ url: imageUrl }))
    } else {
      resp.send(JSON.stringify({
        error: '响应中未找到图片 URL',
        preview: (fallbackText || '').substring(0, 500),
        detail: data
      }))
    }
  } catch (err) {
    resp.setStatusCode(500)
    resp.setHeader('Content-Type', 'application/json')
    resp.setHeader('Access-Control-Allow-Origin', '*')
    resp.send(JSON.stringify({ error: err.message || '服务器内部错误' }))
  }
}
