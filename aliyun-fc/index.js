'use strict'

const http = require('http')
const https = require('https')

// 安全的 JSON 解析
function safeJsonParse(str, fallback) {
  try { return JSON.parse(str) }
  catch (e) { return fallback }
}

// 发送响应的辅助函数
function sendJson(resp, status, data) {
  try {
    resp.setStatusCode(status)
    resp.setHeader('Content-Type', 'application/json')
    resp.setHeader('Access-Control-Allow-Origin', '*')
    resp.send(JSON.stringify(data))
  } catch (e) {
    try {
      resp.setStatusCode(500)
      resp.send(JSON.stringify({ error: '响应发送失败: ' + e.message }))
    } catch {
      // 最后的兜底
    }
  }
}

// 调用外部 API
function callApi(urlStr, apiKey, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr)
    const client = url.protocol === 'https:' ? https : http

    const requestBody = JSON.stringify(body)
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    }

    const request = client.request(options, (res) => {
      let data = ''
      res.setEncoding('utf8')
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        try {
          const json = safeJsonParse(data, { raw: data.substring(0, 500) })
          resolve({ ok: res.statusCode < 400, status: res.statusCode, json })
        } catch {
          resolve({ ok: false, status: res.statusCode, json: { message: data.substring(0, 500) } })
        }
      })
    })

    request.on('error', (err) => reject(new Error('请求失败: ' + err.message)))
    request.on('timeout', () => {
      request.destroy()
      reject(new Error('API 请求超时'))
    })

    request.write(requestBody)
    request.end()
  })
}

module.exports.handler = function (req, resp, context) {
  // ===== 顶层安全包裹 =====
  try {
    const method = req.method || ''

    // CORS 预检
    if (method === 'OPTIONS') {
      sendJson(resp, 204, {})
      return
    }

    // 只允许 POST
    if (method !== 'POST') {
      sendJson(resp, 405, { error: '仅支持 POST 请求' })
      return
    }

    // 读取请求体（兼容 Buffer / String / undefined）
    let rawBody = ''
    if (req.body) {
      if (Buffer.isBuffer(req.body)) {
        rawBody = req.body.toString('utf8')
      } else if (typeof req.body === 'string') {
        rawBody = req.body
      } else {
        rawBody = JSON.stringify(req.body)
      }
    }

    const body = safeJsonParse(rawBody || '{}', {})
    const { prompt } = body

    if (!prompt) {
      sendJson(resp, 400, { error: '缺少 prompt 参数', received: rawBody.substring(0, 200) })
      return
    }

    // 读取环境变量
    const baseUrl = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
    const apiKey = process.env.OPENAI_API_KEY
    const model = process.env.IMAGE_MODEL || 'gpt-image-2'

    if (!apiKey) {
      sendJson(resp, 500, { error: '服务端未配置 OPENAI_API_KEY 环境变量' })
      return
    }

    // 异步调用 API
    callApi(`${baseUrl}/responses`, apiKey, {
      model,
      input: prompt,
      reasoning: { effort: 'high' },
      store: false,
      tools: [{ type: 'image_generation' }]
    }).then((apiResp) => {
      if (!apiResp.ok) {
        sendJson(resp, apiResp.status, {
          error: apiResp.json.error?.message || apiResp.json.message || '图片生成失败',
          detail: apiResp.json
        })
        return
      }

      const data = apiResp.json
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

      if (imageUrl) {
        sendJson(resp, 200, { url: imageUrl })
      } else {
        sendJson(resp, 500, {
          error: '响应中未找到图片 URL',
          preview: (fallbackText || '').substring(0, 500),
          detail: data
        })
      }
    }).catch((err) => {
      sendJson(resp, 500, { error: err.message || 'API 调用失败' })
    })

  } catch (err) {
    // 最后的兜底
    try {
      sendJson(resp, 500, { error: '内部错误: ' + (err.message || String(err)) })
    } catch {
      // 真的没办法了
    }
  }
}
