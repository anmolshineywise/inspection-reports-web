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

// Save or update report (saves locally and forwards to external API). Supports POST (primary) and PUT (compat)
async function updateReportHandler(req, res) {
  const id = req.params.id
  if (!req.body) return res.status(400).json({ error: 'Missing body' })
  const payload = req.body

  // Save incoming payload to logs for audit
  const safeStamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `${id}_${safeStamp}.json`
  const outPath = path.join(__dirname, '..', 'logs', filename)
  try {
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8')
    console.log(`Saved report to ${outPath}`)
  } catch (err) {
    console.error('Error saving report log', err)
    // continue — we still attempt DB update and forwarding
  }

  try {
    // Ensure reportId matches the URL id (set it if missing)
    payload.reportId = payload.reportId || id
    if (payload.reportId !== id) return res.status(400).json({ error: 'reportId mismatch' })

    // Merge into in-memory DB
    db.reports = db.reports || {}
    db.reports[id] = payload

    // Upsert summary in results array
    db.results = db.results || []
    const idx = db.results.findIndex(r => r.reportId === id)
    const summary = {
      reportId: payload.reportId,
      imo: payload.imo,
      vesselName: payload.vesselName,
      flag: payload.flag,
      inspectionDate: payload.inspectionDate,
      overallRating: payload.overallRating,
      summary: payload.notes ? (typeof payload.notes === 'string' ? payload.notes.substring(0, 140) : undefined) : undefined,
      thumbnailUrl: (payload.documents && payload.documents[0] && payload.documents[0].url) || payload.thumbnailUrl
    }
    if (idx >= 0) {
      db.results[idx] = { ...db.results[idx], ...summary }
    } else {
      db.results.push(summary)
    }
    db.total = db.results.length

    // Persist DB to file
    try {
      fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2), 'utf-8')
      console.log(`Updated report ${id} in ${DATA_PATH}`)

      // Forward update to external API (optional override via EXTERNAL_UPDATE_URL env var)
      const externalUpdateUrl = process.env.EXTERNAL_UPDATE_URL || 'https://vms-data-processing-jgjm9r.5sc6y6-4.usa-e2.cloudhub.io/api/update'
      console.log('[external-update] forwarding to', externalUpdateUrl)

      // Normalize payload to expected Cloudhub format (support clients that send { report: ... })
      function normalizePayload(p) {
        const toStringRating = (v) => {
          if (v === undefined || v === null) return undefined
          if (typeof v === 'string') return v
          if (typeof v === 'number') return String(v)
          return undefined
        }

        let out = p && p.report ? { ...p.report, ...p } : { ...p }
        // Remove nested wrapper
        if (out.report) delete out.report
        // Prefer savedAt -> updated_at
        out.updated_at = out.updated_at || out.savedAt || new Date().toISOString()
        out.reportId = out.reportId || id

        // Ensure required top-level keys exist (set sensible defaults if missing)
        const overallRating = out.overallRating
        const topStatus = out.status || 'pending'

        const categories = (out.categories || []).map((cat, cidx) => {
          const rating = cat && (cat.rating !== undefined && cat.rating !== null) ? toStringRating(cat.rating) : undefined
          const status = (cat && cat.status) || 'pending'
          const subsections = (cat && cat.subsections || []).map((sub, sidx) => ({
            subsectionId: sub && sub.subsectionId || `sub-${cidx}-${sidx}`,
            name: sub && sub.name,
            rating: sub && (sub.rating !== undefined && sub.rating !== null) ? toStringRating(sub.rating) : undefined,
            status: (sub && sub.status) || 'pending',
            details: sub && sub.details,
            action: sub && sub.action,
            due_after_weeks: sub && sub.due_after_weeks,
            updated_at: sub && sub.updated_at
          }))
          return {
            categoryId: cat && cat.categoryId || `cat-${cidx}`,
            name: cat && cat.name,
            rating,
            status,
            subsections
          }
        })

        return {
          reportId: out.reportId,
          imo: out.imo,
          vesselName: out.vesselName,
          inspectionDate: out.inspectionDate,
          inspector: out.inspector,
          overallRating,
          status: topStatus,
          categories,
          updated_at: out.updated_at
        }
      }

      const forwardPayload = normalizePayload(payload)

      // Ensure logs directory exists
      try { fs.mkdirSync(path.join(__dirname, '..', 'logs'), { recursive: true }) } catch (_) {}

      const safeStamp2 = new Date().toISOString().replace(/[:.]/g, '-')
      const forwardLogFile = path.join(__dirname, '..', 'logs', `forward_${id}_${safeStamp2}.json`)
      fs.writeFileSync(forwardLogFile, JSON.stringify({ attemptedAt: new Date().toISOString(), url: externalUpdateUrl, payload: forwardPayload }, null, 2), 'utf-8')

      try {
        const controller = new AbortController()
        const timeoutMs = 8000
        const timeout = setTimeout(() => controller.abort(), timeoutMs)

        const upr = await fetch(externalUpdateUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(forwardPayload),
          signal: controller.signal
        })

        clearTimeout(timeout)

        let uprBody
        try { uprBody = await upr.json() } catch (_) { uprBody = await upr.text().catch(() => '') }

        // Append result to the forward log file
        try {
          const result = { completedAt: new Date().toISOString(), status: upr.status, body: uprBody }
          const existing = JSON.parse(fs.readFileSync(forwardLogFile, 'utf-8'))
          fs.writeFileSync(forwardLogFile, JSON.stringify({ ...existing, result }, null, 2), 'utf-8')
          fs.appendFileSync(path.join(__dirname, '..', 'logs', 'external_updates.log'), JSON.stringify({ timestamp: new Date().toISOString(), reportId: id, url: externalUpdateUrl, status: upr.status, success: upr.ok }) + '\n')
        } catch (logErr) {
          console.error('[external-update] failed to write forward log', String(logErr))
        }

        if (!upr.ok) {
          console.error('[external-update] non-ok status', upr.status, uprBody)
          return res.json({ success: true, report: payload, external: { success: false, status: upr.status, body: uprBody, payload: forwardPayload }, filename })
        }

        console.log('[external-update] success', upr.status)
        return res.json({ success: true, report: payload, external: { success: true, status: upr.status, body: uprBody, payload: forwardPayload }, filename })
      } catch (extErr) {
        console.error('[external-update] error', String(extErr))
        try { fs.appendFileSync(path.join(__dirname, '..', 'logs', 'external_updates.log'), JSON.stringify({ timestamp: new Date().toISOString(), reportId: id, url: externalUpdateUrl, error: String(extErr) }) + '\n') } catch (_) {}
        return res.json({ success: true, report: payload, external: { success: false, error: String(extErr), payload: forwardPayload }, filename })
      }
    } catch (err) {
      console.error('Error updating DB file', err)
      return res.status(500).json({ error: 'Failed to write DB file', detail: String(err) })
    }
  } catch (err) {
    console.error('Unexpected error in updateReportHandler', err)
    return res.status(500).json({ error: 'Internal error', detail: String(err) })
  }
}

// Register routes
app.post('/reports/:id', updateReportHandler)
app.put('/reports/:id', updateReportHandler) // kept for backward compatibility

// Update report in DB (data/sample_reports.json)
app.put('/reports/:id', async (req, res) => {
  const id = req.params.id
  if (!req.body) return res.status(400).json({ error: 'Missing body' })
  const payload = req.body

  // Ensure reportId matches the URL id (set it if missing)
  payload.reportId = payload.reportId || id
  if (payload.reportId !== id) return res.status(400).json({ error: 'reportId mismatch' })

  // Merge into in-memory DB
  db.reports = db.reports || {}
  db.reports[id] = payload

  // Upsert summary in results array
  db.results = db.results || []
  const idx = db.results.findIndex(r => r.reportId === id)
  const summary = {
    reportId: payload.reportId,
    imo: payload.imo,
    vesselName: payload.vesselName,
    flag: payload.flag,
    inspectionDate: payload.inspectionDate,
    overallRating: payload.overallRating,
    summary: payload.notes ? (typeof payload.notes === 'string' ? payload.notes.substring(0, 140) : undefined) : undefined,
    thumbnailUrl: (payload.documents && payload.documents[0] && payload.documents[0].url) || payload.thumbnailUrl
  }
  if (idx >= 0) {
    db.results[idx] = { ...db.results[idx], ...summary }
  } else {
    db.results.push(summary)
  }
  db.total = db.results.length

  // Persist DB to file
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2), 'utf-8')
    console.log(`Updated report ${id} in ${DATA_PATH}`)

    // Forward update to external API (optional override via EXTERNAL_UPDATE_URL env var)
    const externalUpdateUrl =  'https://vms-data-processing-jgjm9r.5sc6y6-4.usa-e2.cloudhub.io/api/update'
    console.log('[external-update] forwarding to', externalUpdateUrl)

    // Normalize payload to expected Cloudhub format (support clients that send { report: ... })
    function normalizePayload(p) {
      const toStringRating = (v) => {
        if (v === undefined || v === null) return undefined
        if (typeof v === 'string') return v
        if (typeof v === 'number') return String(v)
        return undefined
      }

      let out = p && p.report ? { ...p.report, ...p } : { ...p }
      // Remove nested wrapper
      if (out.report) delete out.report
      // Prefer savedAt -> updated_at
      out.updated_at = out.updated_at || out.savedAt || new Date().toISOString()
      out.reportId = out.reportId || id

      // Ensure required top-level keys exist (set sensible defaults if missing)
      const overallRating = out.overallRating
      const topStatus = out.status || 'pending'

      const categories = (out.categories || []).map((cat, cidx) => {
        const rating = cat && (cat.rating !== undefined && cat.rating !== null) ? toStringRating(cat.rating) : undefined
        const status = (cat && cat.status) || 'pending'
        const subsections = (cat && cat.subsections || []).map((sub, sidx) => ({
          subsectionId: sub && sub.subsectionId || `sub-${cidx}-${sidx}`,
          name: sub && sub.name,
          rating: sub && (sub.rating !== undefined && sub.rating !== null) ? toStringRating(sub.rating) : undefined,
          status: (sub && sub.status) || 'pending',
          details: sub && sub.details,
          action: sub && sub.action,
          due_after_weeks: sub && sub.due_after_weeks,
          updated_at: sub && sub.updated_at
        }))
        return {
          categoryId: cat && cat.categoryId || `cat-${cidx}`,
          name: cat && cat.name,
          rating,
          status,
          subsections
        }
      })

      return {
        reportId: out.reportId,
        imo: out.imo,
        vesselName: out.vesselName,
        inspectionDate: out.inspectionDate,
        inspector: out.inspector,
        overallRating,
        status: topStatus,
        categories,
        updated_at: out.updated_at
      }
    }

    const forwardPayload = normalizePayload(payload)

    // Ensure logs directory exists
    try { fs.mkdirSync(path.join(__dirname, '..', 'logs'), { recursive: true }) } catch (_) {}

    const safeStamp = new Date().toISOString().replace(/[:.]/g, '-')
    const forwardLogFile = path.join(__dirname, '..', 'logs', `forward_${id}_${safeStamp}.json`)
    fs.writeFileSync(forwardLogFile, JSON.stringify({ attemptedAt: new Date().toISOString(), url: externalUpdateUrl, payload: forwardPayload }, null, 2), 'utf-8')

    try {
      const controller = new AbortController()
      const timeoutMs = 8000
      const timeout = setTimeout(() => controller.abort(), timeoutMs)

      const upr = await fetch(externalUpdateUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(forwardPayload),
        signal: controller.signal
      })

      clearTimeout(timeout)

      let uprBody
      try { uprBody = await upr.json() } catch (_) { uprBody = await upr.text().catch(() => '') }

      // Append result to the forward log file
      try {
        const result = { completedAt: new Date().toISOString(), status: upr.status, body: uprBody }
        const existing = JSON.parse(fs.readFileSync(forwardLogFile, 'utf-8'))
        fs.writeFileSync(forwardLogFile, JSON.stringify({ ...existing, result }, null, 2), 'utf-8')
        fs.appendFileSync(path.join(__dirname, '..', 'logs', 'external_updates.log'), JSON.stringify({ timestamp: new Date().toISOString(), reportId: id, url: externalUpdateUrl, status: upr.status, success: upr.ok }) + '\n')
      } catch (logErr) {
        console.error('[external-update] failed to write forward log', String(logErr))
      }

      if (!upr.ok) {
        console.error('[external-update] non-ok status', upr.status, uprBody)
        return res.json({ success: true, report: payload, external: { success: false, status: upr.status, body: uprBody, payload: forwardPayload } })
      }

      console.log('[external-update] success', upr.status)
      return res.json({ success: true, report: payload, external: { success: true, status: upr.status, body: uprBody, payload: forwardPayload } })
    } catch (extErr) {
      console.error('[external-update] error', String(extErr))
      try { fs.appendFileSync(path.join(__dirname, '..', 'logs', 'external_updates.log'), JSON.stringify({ timestamp: new Date().toISOString(), reportId: id, url: externalUpdateUrl, error: String(extErr) }) + '\n') } catch (_) {}
      return res.json({ success: true, report: payload, external: { success: false, error: String(extErr), payload: forwardPayload } })
    }
  } catch (err) {
    console.error('Error updating DB file', err)
    return res.status(500).json({ error: 'Failed to write DB file', detail: String(err) })
  }
})



const port = process.env.PORT || 3000
app.listen(port, () => console.log(`Mock API server listening on http://localhost:${port}`))
