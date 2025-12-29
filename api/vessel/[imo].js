module.exports = async (req, res) => {
  const { imo } = req.query || {}
  if (!imo) return res.status(400).json({ error: 'Missing IMO' })

  const url = `https://vms-data-processing-jgjm9r.5sc6y6-4.usa-e2.cloudhub.io/api/vessel/${encodeURIComponent(imo)}`

  try {
    // simple timeout to avoid hanging functions
    const controller = new AbortController()
    const timeoutMs = 8000
    const timeout = setTimeout(() => controller.abort(), timeoutMs)

    let r
    try {
      r = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    } catch (err) {
      clearTimeout(timeout)
      if (err && err.name === 'AbortError') {
        return res.status(504).json({ error: 'Upstream timeout', detail: `No response within ${timeoutMs}ms` })
      }
      console.error('[api/vessel] fetch error', err)
      return res.status(502).json({ error: 'Failed to fetch vessel data', detail: String(err) })
    } finally {
      clearTimeout(timeout)
    }

    const bodyText = await r.text()
    res.status(r.status)

    const contentType = r.headers.get('content-type') || 'application/json'
    res.setHeader('Content-Type', contentType)

    // Basic caching for successful responses (helps reduce upstream calls)
    if (r.ok) res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120')

    // Forward body as-is
    try {
      // If it's JSON, send parsed JSON to preserve type; otherwise send text
      if (contentType.includes('application/json')) {
        return res.json(JSON.parse(bodyText))
      }
    } catch (_) {
      // fall back to text
    }

    return res.type(contentType.split(';')[0]).send(bodyText)
  } catch (err) {
    console.error('[api/vessel] unexpected error', err)
    return res.status(502).json({ error: 'Proxy failure', detail: String(err) })
  }
}
