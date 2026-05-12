#!/usr/bin/env node
/**
 * 47claude 调用日志本地查看器
 * 运行方式: node log-viewer/index.js
 * 访问地址: http://localhost:3333
 */

const http = require('http')
const https = require('https')
const fs = require('fs')
const path = require('path')

const PORT = 3333
const FC_LOGS_URL = 'https://model-gator-api-gmbhjzhwgo.cn-hangzhou.fcapp.run/logs'
const LOG_STORE_PATH = path.join(__dirname, 'logs-store.json')
const MAX_KEEP = 500   // 本地磁盘保留最多 500 条历史
const MAX_SHOW = 20    // 页面展示最近 20 条

// 启动时从磁盘加载历史
let LOCAL_LOGS = []
try {
  if (fs.existsSync(LOG_STORE_PATH)) {
    LOCAL_LOGS = JSON.parse(fs.readFileSync(LOG_STORE_PATH, 'utf8')) || []
    console.log(`  💾 已加载本地历史日志 ${LOCAL_LOGS.length} 条`)
  }
} catch (e) { LOCAL_LOGS = [] }

function mergeAndPersist(remoteLogs) {
  const map = new Map()
  for (const log of LOCAL_LOGS) {
    if (log && log.id != null) map.set(log.id, log)
  }
  for (const log of (remoteLogs || [])) {
    if (log && log.id != null) map.set(log.id, log)
  }
  LOCAL_LOGS = Array.from(map.values())
    .sort((a, b) => new Date(b.startTime || 0) - new Date(a.startTime || 0))
    .slice(0, MAX_KEEP)
  try {
    fs.writeFileSync(LOG_STORE_PATH, JSON.stringify(LOCAL_LOGS))
  } catch (e) {
    console.error('  ⚠️ 写入本地日志失败:', e.message)
  }
  return LOCAL_LOGS
}

function fetchLogs() {
  return new Promise((resolve) => {
    https.get(FC_LOGS_URL, (res) => {
      let data = ''
      res.on('data', chunk => { data += chunk })
      res.on('end', () => {
        let remote = { total: 0, logs: [], error: null }
        try { remote = JSON.parse(data) }
        catch { remote = { total: 0, logs: [], error: '解析失败: ' + data.substring(0, 200) } }
        const merged = mergeAndPersist(remote.logs || [])
        resolve({ total: merged.length, logs: merged.slice(0, MAX_SHOW), error: remote.error || null, remoteCount: (remote.logs || []).length })
      })
    }).on('error', (err) => {
      // 网络失败时回退到本地历史
      resolve({ total: LOCAL_LOGS.length, logs: LOCAL_LOGS.slice(0, MAX_SHOW), error: '请求FC失败(展示本地历史): ' + err.message, remoteCount: 0 })
    })
  })
}

function renderHTML(result) {
  const logs = result.logs || []
  const error = result.error || null
  const total = result.total || 0
  const now = new Date().toLocaleString('zh-CN')

  const rows = logs.map(log => {
    const status = log.success
      ? `<span class="badge success">✅ 成功</span>`
      : `<span class="badge fail">❌ 失败${log.stage === 'early_return' ? ' (早退)' : log.stage === 'fetch_error' ? ' (上游)' : ''}</span>`
    const errorText = log.error ? `<div class="error-text">错误: ${escapeHtml(log.error)}</div>` : ''
    const startLocal = new Date(log.startTime).toLocaleString('zh-CN')
    const imageTypeText = log.imageType === 'base64' ? '🖼 base64' : log.imageType === 'url' ? '🔗 URL' : '-'
    const promptLenBadge = log.promptLen ? `<span class="dim">(${log.promptLen}字符)</span>` : ''
    const rawBodyKb = log.rawBodyLen ? (log.rawBodyLen / 1024).toFixed(1) + 'KB' : '-'
    const upMs = log.upstreamMs ? (log.upstreamMs / 1000).toFixed(1) + 's' : '-'
    const respKb = log.responseSizeKb != null ? (log.responseSizeKb >= 1024 ? (log.responseSizeKb/1024).toFixed(2) + 'MB' : log.responseSizeKb + 'KB') : '-'

    return `
    <tr>
      <td class="time">${startLocal}</td>
      <td>${status}${errorText}</td>
      <td class="duration ${log.durationMs > 60000 ? 'slow' : ''}">${log.durationStr}</td>
      <td class="duration">${upMs}</td>
      <td class="prompt" title="${escapeHtml(log.prompt)}">${escapeHtml(log.prompt)} ${promptLenBadge}</td>
      <td>${rawBodyKb}</td>
      <td>${respKb}</td>
      <td>${log.imagesCount > 0 ? `📷 ${log.imagesCount}张` : '-'}</td>
      <td>${imageTypeText}</td>
      <td class="model">${escapeHtml(log.model || '')}</td>
    </tr>`
  }).join('')

  const emptyRow = logs.length === 0
    ? `<tr><td colspan="10" class="empty">${error ? '⚠️ ' + escapeHtml(error) : '暂无调用记录'}</td></tr>`
    : ''

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>47claude 调用日志</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
    .header { background: linear-gradient(135deg, #1e293b, #0f172a); padding: 24px 32px; border-bottom: 1px solid #1e293b; }
    .header h1 { font-size: 22px; font-weight: 700; color: #f1f5f9; }
    .header .meta { font-size: 13px; color: #64748b; margin-top: 6px; }
    .header .meta span { margin-right: 20px; }
    .header .meta .online { color: #22c55e; }
    .container { padding: 24px 32px; }
    .stats { display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
    .stat-card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 16px 20px; min-width: 140px; }
    .stat-card .label { font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }
    .stat-card .value { font-size: 28px; font-weight: 700; margin-top: 4px; }
    .stat-card .value.green { color: #22c55e; }
    .stat-card .value.red { color: #ef4444; }
    .stat-card .value.blue { color: #60a5fa; }
    .table-wrap { background: #1e293b; border: 1px solid #334155; border-radius: 12px; overflow: hidden; }
    table { width: 100%; border-collapse: collapse; }
    thead th { background: #0f172a; padding: 12px 16px; text-align: left; font-size: 12px; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid #334155; }
    tbody tr { border-bottom: 1px solid #1e3a5f20; transition: background 0.15s; }
    tbody tr:hover { background: #334155; }
    tbody tr:last-child { border-bottom: none; }
    td { padding: 12px 16px; font-size: 13px; vertical-align: top; }
    td.time { color: #94a3b8; white-space: nowrap; font-size: 12px; }
    td.duration { font-weight: 600; color: #60a5fa; white-space: nowrap; }
    td.duration.slow { color: #fb923c; }
    td.prompt { max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #cbd5e1; }
    td.model { color: #94a3b8; font-size: 12px; }
    .dim { color: #64748b; font-size: 11px; margin-left: 4px; }
    .badge { display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 12px; font-weight: 600; }
    .badge.success { background: #14532d; color: #86efac; }
    .badge.fail { background: #450a0a; color: #fca5a5; }
    .error-text { font-size: 11px; color: #f87171; margin-top: 4px; }
    .empty { text-align: center; padding: 40px; color: #475569; }
    .refresh-bar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
    .refresh-btn { background: #3b82f6; color: white; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500; }
    .refresh-btn:hover { background: #2563eb; }
    .auto-tag { font-size: 12px; color: #64748b; }
    .countdown { color: #60a5fa; font-weight: 600; }
  </style>
</head>
<body>
  <div class="header">
    <h1>📊 47claude 调用日志查看器</h1>
    <div class="meta">
      <span>最后更新: ${now}</span>
      <span class="online">● 在线</span>
      <span>展示最近 ${logs.length} / 共本地 ${total} 条（FC实例重启不影响本地历史）</span>
      <span>本次拉到 ${result.remoteCount || 0} 条</span>
    </div>
  </div>
  <div class="container">
    ${buildStats(logs)}
    <div class="refresh-bar">
      <span class="auto-tag">⏱ 自动刷新: <span class="countdown" id="cd">30</span>s</span>
      <button class="refresh-btn" onclick="location.reload()">🔄 立即刷新</button>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>调用时间</th>
            <th>结果</th>
            <th>总耗时</th>
            <th>上游耗时</th>
            <th>Prompt</th>
            <th>请求大小</th>
            <th>响应大小</th>
            <th>图片数</th>
            <th>返回类型</th>
            <th>模型</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          ${emptyRow}
        </tbody>
      </table>
    </div>
  </div>
  <script>
    let sec = 30
    const cd = document.getElementById('cd')
    setInterval(() => {
      sec--
      if (cd) cd.textContent = sec
      if (sec <= 0) location.reload()
    }, 1000)
  </script>
</body>
</html>`
}

function buildStats(logs) {
  const total = logs.length
  const success = logs.filter(l => l.success).length
  const fail = total - success
  const avgDuration = total > 0
    ? Math.round(logs.reduce((s, l) => s + l.durationMs, 0) / total / 1000)
    : 0
  const maxDuration = total > 0
    ? Math.round(Math.max(...logs.map(l => l.durationMs)) / 1000)
    : 0

  return `<div class="stats">
    <div class="stat-card"><div class="label">总调用次数</div><div class="value blue">${total}</div></div>
    <div class="stat-card"><div class="label">成功</div><div class="value green">${success}</div></div>
    <div class="stat-card"><div class="label">失败</div><div class="value red">${fail}</div></div>
    <div class="stat-card"><div class="label">平均耗时</div><div class="value blue">${avgDuration}s</div></div>
    <div class="stat-card"><div class="label">最长耗时</div><div class="value ${maxDuration > 60 ? 'red' : 'blue'}">${maxDuration}s</div></div>
  </div>`
}

function escapeHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

const server = http.createServer(async (req, res) => {
  if (req.url === '/favicon.ico') {
    res.writeHead(204); res.end(); return
  }
  try {
    const result = await fetchLogs()
    const html = renderHTML(result)
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(html)
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain' })
    res.end('服务器错误: ' + err.message)
  }
})

server.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('  📊 47claude 调用日志查看器已启动')
  console.log(`  🔗 访问地址: http://localhost:${PORT}`)
  console.log('  🔄 页面每 30 秒自动刷新')
  console.log('  💡 数据来源: 阿里云 FC /logs 端点')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
})
