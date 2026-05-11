export const handler = async (event, context) => {
  // 返回完整的 event 信息用于诊断
  const info = {
    eventType: typeof event,
    isBuffer: Buffer.isBuffer(event),
    eventKeys: typeof event === 'object' && event !== null && !Buffer.isBuffer(event) ? Object.keys(event) : [],
  }
  
  // 尝试获取 body 的详细信息
  if (typeof event === 'object' && event !== null && !Buffer.isBuffer(event)) {
    info.hasBody = 'body' in event
    info.bodyType = typeof event.body
    info.bodyIsNull = event.body === null
    info.bodyIsUndefined = event.body === undefined
    if (event.body) {
      info.bodyLength = typeof event.body === 'string' ? event.body.length : -1
      info.bodyPreview = typeof event.body === 'string' ? event.body.substring(0, 300) : JSON.stringify(event.body).substring(0, 300)
    }
    info.httpMethod = event.httpMethod || event.method || ''
    info.rawPath = event.rawPath || ''
    info.isBase64Encoded = event.isBase64Encoded
  }
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify(info, null, 2)
  }
}
