// Cloudflare Pages Function: POST /api/generate
// 47claude 的 gpt-image-2 使用 chat/completions 接口（对话式图像生成）

export async function onRequestPost(context) {
  const { request, env } = context

  try {
    const body = await request.json()
    const { prompt } = body

    if (!prompt) {
      return Response.json({ error: '缺少 prompt 参数' }, { status: 400 })
    }

    const baseUrl = env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
    const apiKey = env.OPENAI_API_KEY
    const model = env.IMAGE_MODEL || 'gpt-image-2'
    const apiGroup = env.API_GROUP || 'GPT'

    if (!apiKey) {
      return Response.json({ error: '服务端未配置 OPENAI_API_KEY' }, { status: 500 })
    }

    // 调用 chat/completions 接口
    const apiResp = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        // 指定分组（47claude / one-api / new-api 通用约定）
        'X-User-Group': apiGroup,
        'X-OpenAI-Group': apiGroup
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: prompt }
        ],
        stream: false
      })
    })

    const data = await apiResp.json()

    if (!apiResp.ok) {
      return Response.json({
        error: data.error?.message || data.message || '图片生成失败',
        detail: data
      }, { status: apiResp.status })
    }

    // 提取响应内容
    const message = data.choices?.[0]?.message || {}
    const content = typeof message.content === 'string' ? message.content : ''

    // 尝试多种格式解析图片 URL
    let imageUrl = null

    // 1. Markdown 图片格式：![alt](url)
    const mdMatch = content.match(/!\[[^\]]*\]\(([^)]+)\)/)
    if (mdMatch) imageUrl = mdMatch[1]

    // 2. data URI 格式（base64）
    if (!imageUrl) {
      const dataMatch = content.match(/data:image\/[^;]+;base64,[A-Za-z0-9+/=]+/)
      if (dataMatch) imageUrl = dataMatch[0]
    }

    // 3. 图片扩展名的 URL
    if (!imageUrl) {
      const imgUrlMatch = content.match(/https?:\/\/[^\s)"'<>]+\.(?:png|jpg|jpeg|webp|gif)(?:\?[^\s)"'<>]*)?/i)
      if (imgUrlMatch) imageUrl = imgUrlMatch[0]
    }

    // 4. message.images 字段（某些实现）
    if (!imageUrl && Array.isArray(message.images) && message.images[0]) {
      imageUrl = typeof message.images[0] === 'string' ? message.images[0] : message.images[0].url
    }

    // 5. 兜底：任意 URL
    if (!imageUrl) {
      const anyUrlMatch = content.match(/https?:\/\/[^\s)"'<>]+/)
      if (anyUrlMatch) imageUrl = anyUrlMatch[0]
    }

    if (imageUrl) {
      return Response.json({ url: imageUrl })
    }

    // 没解析到，返回原始 content 供排查
    return Response.json({
      error: '响应中未找到图片 URL',
      content: content.substring(0, 500),
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
