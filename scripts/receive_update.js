const http = require('http')

const server = http.createServer(async (req, res) => {
  if ((req.method === 'PUT' || req.method === 'POST') && req.url === '/api/update') {
    let body = ''
    for await (const chunk of req) body += chunk
    console.log(`[cloudhub-sim] Received ${req.method} /api/update`)
    try {
      const json = JSON.parse(body)
      console.log('[cloudhub-sim] Payload:', JSON.stringify(json, null, 2))
    } catch (e) {
      console.log('[cloudhub-sim] Non-JSON body:', body)
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ success: true }))
    return
  }
  res.writeHead(404)
  res.end()
})

const port = process.env.PORT || 4000
server.listen(port, () => console.log(`Cloudhub-sim listening on http://localhost:${port}`))
