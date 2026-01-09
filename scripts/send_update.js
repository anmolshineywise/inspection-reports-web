const url = 'https://vms-data-processing-jgjm9r.5sc6y6-4.usa-e2.cloudhub.io/api/update'
const timeoutMs = Number(process.env.TIMEOUT_MS) || 10000

const payload = {
  reportId: 'vms-9200671-2025-12-29',
  imo: '9200671',
  vesselName: 'MV Test Ship',
  inspectionDate: '2025-12-29',
  inspector: 'Inspector',
  categories: [
    {
      categoryId: 'cat-HULL-0',
      name: 'HULL',
      rating: 0,
      status: 'pending',
      subsections: [
        {
          subsectionId: 'vms-9200671-2025-12-29-cat-0-sub-0',
          name: 'Propeller',
          rating: 1,
          details: 'present condition is good update',
          action: 'not required',
          due_after_weeks: 2,
          updated_at: '2025-12-29T15:27:38.296367'
        }
      ]
    },
    {
      categoryId: 'cat-DECK-1',
      name: 'DECK',
      rating: 0,
      status: 'pending',
      subsections: [
        {
          subsectionId: 'vms-9200671-2025-12-29-cat-1-sub-0',
          name: 'PILOT LADDERS',
          rating: 3,
          details: 'pilot ladders are jammed',
          action: 'lubrication',
          due_after_weeks: 1,
          updated_at: '2025-12-29T15:27:50.329462'
        }
      ]
    }
  ]
}

async function sendUpdate(retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      console.log(`POST ${url} (attempt ${attempt + 1}/${retries + 1})`)
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      })
      clearTimeout(timeout)

      let body
      try { body = await res.json() } catch (_) { body = await res.text().catch(() => '') }

      if (!res.ok) {
        console.error(`Non-OK response: ${res.status}`)
        console.error('Response body:', body)
        if (attempt < retries) {
          console.log('Retrying...')
          continue
        }
        process.exitCode = 2
        return
      }

      console.log('Success:', res.status)
      console.log('Response body:', body)
      process.exitCode = 0
      return
    } catch (err) {
      clearTimeout(timeout)
      console.error('Error during fetch:', String(err))
      if (err && err.name === 'AbortError') console.error(`Request timed out after ${timeoutMs}ms`)
      if (attempt < retries) {
        console.log('Retrying...')
        await new Promise(r => setTimeout(r, 500))
        continue
      }
      process.exitCode = 1
      return
    }
  }
}

// Execute
sendUpdate().catch(err => {
  console.error('Fatal error', err)
  process.exitCode = 1
})
