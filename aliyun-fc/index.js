export const handler = (req, resp, context) => {
  // 诊断：打印 resp 的类型和可用方法
  const respInfo = {
    type: typeof resp,
    isFunction: typeof resp === 'function',
    keys: typeof resp === 'object' && resp !== null ? Object.keys(resp) : [],
    protoMethods: typeof resp === 'object' && resp !== null ? Object.getOwnPropertyNames(Object.getPrototypeOf(resp)) : []
  }
  
  // 尝试各种可能的返回方式
  if (typeof resp === 'function') {
    // resp 是 callback 函数
    resp(null, {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ 
        ok: true, 
        message: 'resp is callback function',
        respInfo
      })
    })
    return
  }
  
  if (resp && typeof resp.end === 'function') {
    // Node.js 原生风格
    resp.statusCode = 200
    if (typeof resp.setHeader === 'function') {
      resp.setHeader('Content-Type', 'application/json')
      resp.setHeader('Access-Control-Allow-Origin', '*')
    }
    resp.end(JSON.stringify({ 
      ok: true, 
      message: 'resp has end() method',
      respInfo
    }))
    return
  }
  
  if (resp && typeof resp.send === 'function') {
    // Express 风格
    if (typeof resp.status === 'function') resp.status(200)
    else if (typeof resp.setStatusCode === 'function') resp.setStatusCode(200)
    else resp.statusCode = 200
    
    if (typeof resp.set === 'function') {
      resp.set('Content-Type', 'application/json')
      resp.set('Access-Control-Allow-Origin', '*')
    }
    resp.send(JSON.stringify({ 
      ok: true, 
      message: 'resp has send() method',
      respInfo
    }))
    return
  }
  
  // 兜底：直接返回对象
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ 
      ok: true, 
      message: 'fallback: returning object',
      respInfo
    })
  }
}
