// Cloudflare Pages Function: POST /api/generate
// 调用 gpt-image2 生成图片

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

    if (!apiKey) {
      return Response.json({ error: '服务端未配置 OPENAI_API_KEY' }, { status: 500 })
    }

    const apiResp = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        prompt,
        n: 1,
        size: '1024x1024'
      })
    })

    const data = await apiResp.json()

    if (!apiResp.ok) {
      return Response.json({
        error: data.error?.message || '图片生成失败',
        detail: data
      }, { status: apiResp.status })
    }

    // gpt-image2 返回的 url 或 b64_json
    const imageUrl = data.data?.[0]?.url
    const b64 = data.data?.[0]?.b64_json

    if (imageUrl) {
      return Response.json({ url: imageUrl })
    }
    if (b64) {
      return Response.json({ url: `data:image/png;base64,${b64}` })
    }

    return Response.json({ error: '未获取到图片数据', detail: data }, { status: 500 })
  } catch (err) {
    return Response.json({ error: err.message || '服务器内部错误' }, { status: 500 })
  }
}

// CORS 预检（同域部署其实不需要，保留以备用）
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  })
}
