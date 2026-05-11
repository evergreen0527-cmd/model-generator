export const handler = (event, context, callback) => {
  // 先测试 context.succeed 方式
  context.succeed({
    statusCode: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    body: JSON.stringify({ 
      ok: true, 
      message: 'context.succeed works!',
      eventType: typeof event,
      callbackType: typeof callback
    })
  })
}
