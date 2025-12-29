const express = require('express')
const cors = require('cors')
const path = require('path')
const fs = require('fs')

const app = express()
app.use(cors())
app.use(express.json())

const DATA_PATH = path.join(__dirname, '..', 'data', 'sample_reports.json')
let db = { total:0, results: [], reports: {} }

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf-8')
    db = JSON.parse(raw)
  } catch (err) {
    console.error('Failed to load sample data', err)
  }
}

loadData()

// GET /reports?imo=1234567
app.get('/reports', (req, res) => {
  const { imo = '' } = req.query
  const q = (imo || '').toString().trim()
  if (!q) return res.json({ total: 0, limit: 0, offset: 0, results: [] })

  const results = (db.results || []).filter(r => r.imo.includes(q))
  return res.json({ total: results.length, limit: results.length, offset: 0, results })
})

// GET /reports/:reportId
app.get('/reports/:id', (req, res) => {
  const id = req.params.id
  const rep = (db.reports || {})[id]
  if (!rep) return res.status(404).json({ error: 'Report not found' })
  return res.json(rep)
})

// Proxy external VMS vessel API to avoid CORS issues in the browser
// GET /vessel/:imo -> fetches https://vms-data-processing-.../api/vessel/:imo server-side
app.get('/vessel/:imo', async (req, res) => {
  const imo = req.params.imo
  if (!imo) return res.status(400).json({ error: 'Missing IMO' })
  const url = `https://vms-data-processing-jgjm9r.5sc6y6-4.usa-e2.cloudhub.io/api/vessel/${encodeURIComponent(imo)}`
  console.log(`[proxy] /vessel/${imo} -> ${url}`)
  try {
    // add a timeout to avoid hanging if upstream is slow or unreachable
    const controller = new AbortController()
    const timeoutMs = 8000
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    let r
    try {
      r = await fetch(url, { signal: controller.signal })
    } catch (fetchErr) {
      if (fetchErr && fetchErr.name === 'AbortError') {
        console.error('[proxy] external fetch aborted (timeout)')
        return res.status(504).json({ error: 'Upstream timeout', detail: `No response within ${timeoutMs}ms` })
      }
      console.error('[proxy] fetch error', fetchErr)
      return res.status(502).json({ error: 'Failed to fetch vessel data', detail: String(fetchErr) })
    } finally {
      clearTimeout(timeout)
    }

    console.log('[proxy] external status:', r.status)
    const contentType = r.headers.get('content-type') || ''

    // Read body for debug; but avoid reading twice — read as text then try parse
    const bodyText = await r.text()
    console.log('[proxy] external body snippet:', bodyText.substring(0, 1000))

    if (!r.ok) {
      // forward status and body
      try {
        const parsed = JSON.parse(bodyText)
        return res.status(r.status).json(parsed)
      } catch (_) {
        return res.status(r.status).type('text').send(bodyText)
      }
    }

    // try parse JSON
    try {
      const json = JSON.parse(bodyText)
      return res.json(json)
    } catch (_) {
      return res.type('text').send(bodyText)
    }
  } catch (err) {
    console.error('Error proxying vessel request', err)
    return res.status(502).json({ error: 'Failed to fetch vessel data', detail: String(err) })
  }
})

// Save report as JSON to logs directory
app.post('/reports/:id', (req, res) => {
  const id = req.params.id
  if (!req.body) return res.status(400).json({ error: 'Missing body' })
  const payload = req.body
  const safeStamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `${id}_${safeStamp}.json`
  const outPath = path.join(__dirname, '..', 'logs', filename)
  try {
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8')
    console.log(`Saved report to ${outPath}`)
    return res.json({ success: true, filename })
  } catch (err) {
    console.error('Error saving report', err)
    return res.status(500).json({ error: 'Failed to save report', detail: String(err) })
  }
})

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`Mock API server listening on http://localhost:${port}`))
