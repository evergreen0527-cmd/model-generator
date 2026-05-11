'use strict'
module.exports.handler = function (req, resp, context) {
  try {
    resp.setStatusCode(200)
    resp.setHeader('Content-Type', 'application/json')
    resp.setHeader('Access-Control-Allow-Origin', '*')
    resp.send(JSON.stringify({ 
      ok: true, 
      message: 'Hello from FC',
      env_check: {
        has_key: !!process.env.OPENAI_API_KEY,
        has_url: !!process.env.OPENAI_BASE_URL,
        has_model: !!process.env.IMAGE_MODEL
      }
    }))
  } catch (err) {
    resp.setStatusCode(500)
    resp.send(JSON.stringify({ error: err.message }))
  }
}
