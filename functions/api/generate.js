// Cloudflare Pages Function: POST /api/generate
// 47claude 的 gpt-image-2 使用 OpenAI Responses API (/v1/responses)

export async function onRequestPost(context) {
  const { request, env } = context

  try {
    const body = await request.json()
    const { prompt, images } = body

    if (!prompt && (!images || images.length === 0)) {
      return Response.json({ error: '缺少 prompt 或 images 参数' }, { status: 400 })
    }

    const baseUrl = (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '')
    const apiKey = env.OPENAI_API_KEY
    const model = env.IMAGE_MODEL || 'gpt-image-2'

    if (!apiKey) {
      return Response.json({ error: '服务端未配置 OPENAI_API_KEY' }, { status: 500 })
    }

    // 检查请求体大小（防止超大 base64 导致超时）
    const bodyText = JSON.stringify(body)
    if (bodyText.length > 5 * 1024 * 1024) {
      return Response.json({ error: '请求体过大（超过 5MB），请减少上传图片数量或压缩图片' }, { status: 413 })
    }

    // 构造 input：47claude 不支持多模态 input_image，只传纯文本
    // 如果用户传了图片，忽略图片仅用 prompt 文字生成
    const input = prompt || '生成一张图片'

    // 调用 Responses API 端点（不设超时，让 Cloudflare 100 秒自然切断）
    const apiResp = await fetch(`${baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        input,
        reasoning: { effort: 'high' },
        store: false,
        tools: [{ type: 'image_generation' }]
      })
    })

    const data = await apiResp.json()

    if (!apiResp.ok) {
      return Response.json({
        error: data.error?.message || data.message || '图片生成失败',
        detail: data
      }, { status: apiResp.status })
    }

    // 解析 Responses API 响应，提取图片
    let imageUrl = null
    let textContent = ''

    // Responses API 的 output 是一个数组
    const output = Array.isArray(data.output) ? data.output : []

    for (const item of output) {
      if (!item || typeof item !== 'object') continue

      // 1. image_generation_call 类型：result 是 base64
      if (item.type === 'image_generation_call' && item.result) {
        imageUrl = `data:image/png;base64,${item.result}`
        break
      }

      // 2. message 类型：遍历 content
      if (item.type === 'message' && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (!c) continue
          // output_image / image 类型
          if ((c.type === 'output_image' || c.type === 'image') && (c.image_url || c.url)) {
            imageUrl = c.image_url || c.url
            break
          }
          // image_url 可能是对象 { url: "..." }
          if (c.image_url && typeof c.image_url === 'object' && c.image_url.url) {
            imageUrl = c.image_url.url
            break
          }
          // 纯文本内容收集起来用于兜底解析
          if ((c.type === 'output_text' || c.type === 'text') && typeof c.text === 'string') {
            textContent += c.text + '\n'
          }
        }
        if (imageUrl) break
      }
    }

    // 兜底：从 output_text 或文本内容中正则解析图片
    const fallbackText = data.output_text || textContent
    if (!imageUrl && typeof fallbackText === 'string' && fallbackText) {
      // 1. Markdown 图片
      const mdMatch = fallbackText.match(/!\[[^\]]*\]\(([^)]+)\)/)
      if (mdMatch) imageUrl = mdMatch[1]

      // 2. data URI
      if (!imageUrl) {
        const dataMatch = fallbackText.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/)
        if (dataMatch) imageUrl = dataMatch[0]
      }

      // 3. 图片后缀的 URL
      if (!imageUrl) {
        const imgUrlMatch = fallbackText.match(/https?:\/\/[^\s)"'<>]+\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s)"'<>]*)?/i)
        if (imgUrlMatch) imageUrl = imgUrlMatch[0]
      }

      // 4. 任意 URL
      if (!imageUrl) {
        const anyUrl = fallbackText.match(/https?:\/\/[^\s)"'<>]+/)
        if (anyUrl) imageUrl = anyUrl[0]
      }
    }

    if (imageUrl) {
      return Response.json({ url: imageUrl })
    }

    return Response.json({
      error: '响应中未找到图片 URL',
      preview: (fallbackText || '').substring(0, 500),
      detail: data
    }, { status: 500 })
  } catch (err) {
    return Response.json({ error: err.message || '服务器内部错误' }, { status: 500 })
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  })
}
